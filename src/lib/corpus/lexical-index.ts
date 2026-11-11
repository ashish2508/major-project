import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Tfidf } from '../detection/tfidf';
import { getCorpusDir } from './store';
import type { CorpusPassage, LexicalPosting } from './types';

export interface LexicalIndexEntry {
  passageId: string;
  documentId: string;
  documentReference: string;
  passageIndex: number;
  offset: number;
  length: number;
  weight: number;
}

export interface LexicalIndexManifest {
  documentIds: string[];
  totalPassages: number;
  lastUpdated: string;
}

function getLexicalDir(): string {
  return resolve(getCorpusDir(), 'indexes', 'lexical');
}

function getPostingsPath(): string {
  return resolve(getLexicalDir(), 'postings.json');
}

function getManifestPath(): string {
  return resolve(getLexicalDir(), 'manifest.json');
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmpPath, data, 'utf8');
  const { rename } = await import('node:fs/promises');
  try {
    await rename(tmpPath, filePath);
  } catch {
    await writeFile(filePath, data, 'utf8');
    await rm(tmpPath, { force: true }).catch(() => {});
  }
}

// In-memory cached representation for fast read queries, validated against manifest timestamp
let cachedPostings: Map<string, LexicalIndexEntry[]> | null = null;
let cachedManifestTimestamp: string | null = null;

export async function loadLexicalPostings(): Promise<Map<string, LexicalIndexEntry[]>> {
  let manifestTimestamp: string | null = null;
  try {
    const manifestRaw = await readFile(getManifestPath(), 'utf8');
    const manifest = JSON.parse(manifestRaw) as LexicalIndexManifest;
    manifestTimestamp = manifest.lastUpdated;
  } catch {
    // No manifest yet
  }

  if (cachedPostings && cachedManifestTimestamp && cachedManifestTimestamp === manifestTimestamp) {
    return cachedPostings;
  }

  try {
    const raw = await readFile(getPostingsPath(), 'utf8');
    const record = JSON.parse(raw) as Record<string, LexicalIndexEntry[]>;
    const map = new Map<string, LexicalIndexEntry[]>();
    for (const [term, entries] of Object.entries(record)) {
      map.set(term, entries);
    }
    cachedPostings = map;
    cachedManifestTimestamp = manifestTimestamp;
    return map;
  } catch {
    cachedPostings = new Map();
    cachedManifestTimestamp = manifestTimestamp;
    return cachedPostings;
  }
}

export async function addDocumentToLexicalIndex(
  documentId: string,
  passages: CorpusPassage[],
  tfidf: Tfidf,
): Promise<void> {
  const postingsMap = await loadLexicalPostings();

  // First prune any previous entries for this document
  for (const [term, entries] of postingsMap.entries()) {
    const filtered = entries.filter((e) => e.documentId !== documentId);
    if (filtered.length === 0) {
      postingsMap.delete(term);
    } else {
      postingsMap.set(term, filtered);
    }
  }

  // Index new passages
  for (const passage of passages) {
    const sparseVec = tfidf.transform(passage.text);
    for (const [term, weight] of sparseVec.entries()) {
      let list = postingsMap.get(term);
      if (!list) {
        list = [];
        postingsMap.set(term, list);
      }
      list.push({
        passageId: passage.id,
        documentId: passage.documentId,
        documentReference: passage.documentReference,
        passageIndex: passage.passageIndex,
        offset: passage.offset,
        length: passage.length,
        weight,
      });
    }
  }

  // Persist to disk
  await saveLexicalIndex(postingsMap);
}

export async function removeDocumentFromLexicalIndex(documentId: string): Promise<void> {
  const postingsMap = await loadLexicalPostings();
  let modified = false;

  for (const [term, entries] of postingsMap.entries()) {
    const filtered = entries.filter((e) => e.documentId !== documentId);
    if (filtered.length !== entries.length) {
      modified = true;
      if (filtered.length === 0) {
        postingsMap.delete(term);
      } else {
        postingsMap.set(term, filtered);
      }
    }
  }

  if (modified) {
    await saveLexicalIndex(postingsMap);
  }
}

async function saveLexicalIndex(postingsMap: Map<string, LexicalIndexEntry[]>): Promise<void> {
  const record: Record<string, LexicalIndexEntry[]> = {};
  const docSet = new Set<string>();
  const passageSet = new Set<string>();

  for (const [term, entries] of postingsMap.entries()) {
    record[term] = entries;
    for (const e of entries) {
      docSet.add(e.documentId);
      passageSet.add(e.passageId);
    }
  }

  const now = new Date().toISOString();
  const manifest: LexicalIndexManifest = {
    documentIds: Array.from(docSet),
    totalPassages: passageSet.size,
    lastUpdated: now,
  };

  await atomicWrite(getPostingsPath(), JSON.stringify(record));
  await atomicWrite(getManifestPath(), JSON.stringify(manifest, null, 2));

  cachedPostings = postingsMap;
  cachedManifestTimestamp = now;
}

export function resetLexicalIndexCache(): void {
  cachedPostings = null;
  cachedManifestTimestamp = null;
}
