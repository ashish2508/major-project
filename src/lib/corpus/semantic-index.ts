import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MODEL_CONFIG } from '../embeddings/model';
import { getCorpusDir } from './store';
import type { CorpusPassage } from './types';

export interface SemanticIndexManifest {
  model: string;
  dimension: number;
  documentIds: string[];
  totalPassages: number;
  lastUpdated: string;
}

export interface DocumentVectors {
  documentId: string;
  documentReference: string;
  passageCount: number;
  vectors: Float32Array; // length: passageCount * 384
  passages: CorpusPassage[];
}

function getSemanticDir(): string {
  return resolve(getCorpusDir(), 'indexes', 'semantic');
}

function getManifestPath(): string {
  return resolve(getSemanticDir(), 'manifest.json');
}

function getDocumentVectorPath(documentId: string): string {
  return resolve(getCorpusDir(), 'documents', documentId, 'vectors.f32');
}

async function atomicWrite(filePath: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmpPath, data);
  const { rename } = await import('node:fs/promises');
  try {
    await rename(tmpPath, filePath);
  } catch {
    await writeFile(filePath, data);
    await rm(tmpPath, { force: true }).catch(() => {});
  }
}

// In-memory read-through cache for fast query execution, invalidated if manifest timestamp changes
let cachedVectors: Map<string, DocumentVectors> | null = null;
let cachedManifestTimestamp: string | null = null;

export async function saveDocumentVectors(
  documentId: string,
  documentReference: string,
  passages: CorpusPassage[],
  embeddings: number[][],
): Promise<void> {
  if (passages.length !== embeddings.length) {
    throw new Error('Passage count and embedding count must match');
  }

  const dimension = MODEL_CONFIG.dimensions; // 384
  const flat = new Float32Array(passages.length * dimension);
  for (let i = 0; i < embeddings.length; i++) {
    const vec = embeddings[i];
    if (vec.length !== dimension) {
      throw new Error(`Embedding dimension mismatch: expected ${dimension}, got ${vec.length}`);
    }
    flat.set(vec, i * dimension);
  }

  const vectorPath = getDocumentVectorPath(documentId);
  await atomicWrite(vectorPath, Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength));

  // Update manifest
  await updateSemanticManifest();
}

export async function removeDocumentVectors(documentId: string): Promise<void> {
  const vectorPath = getDocumentVectorPath(documentId);
  await rm(vectorPath, { force: true }).catch(() => {});
  if (cachedVectors) {
    cachedVectors.delete(documentId);
  }
  await updateSemanticManifest();
}

export async function updateSemanticManifest(): Promise<void> {
  const { loadCatalog } = await import('./store');
  const catalog = await loadCatalog();
  const readyDocIds: string[] = [];
  let totalPassages = 0;

  for (const doc of Object.values(catalog.documents)) {
    if (doc.status === 'ready') {
      readyDocIds.push(doc.id);
      totalPassages += doc.passageCount;
    }
  }

  const now = new Date().toISOString();
  const manifest: SemanticIndexManifest = {
    model: MODEL_CONFIG.model,
    dimension: MODEL_CONFIG.dimensions,
    documentIds: readyDocIds,
    totalPassages,
    lastUpdated: now,
  };

  await atomicWrite(getManifestPath(), JSON.stringify(manifest, null, 2));
  cachedManifestTimestamp = now;
}

export async function loadReadyCorpusVectors(): Promise<Map<string, DocumentVectors>> {
  let manifestTimestamp: string | null = null;
  let readyDocIds: string[] = [];
  try {
    const raw = await readFile(getManifestPath(), 'utf8');
    const manifest = JSON.parse(raw) as SemanticIndexManifest;
    manifestTimestamp = manifest.lastUpdated;
    readyDocIds = manifest.documentIds;
  } catch {
    // No manifest yet
    return new Map();
  }

  if (cachedVectors && cachedManifestTimestamp && cachedManifestTimestamp === manifestTimestamp) {
    return cachedVectors;
  }

  const { getDocumentMetadata, getDocumentPassages } = await import('./store');
  const map = new Map<string, DocumentVectors>();

  for (const docId of readyDocIds) {
    const meta = await getDocumentMetadata(docId);
    if (!meta || meta.status !== 'ready') continue;

    const vectorPath = getDocumentVectorPath(docId);
    try {
      const buf = await readFile(vectorPath);
      // Ensure aligned Float32Array from buffer
      const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      const passages = await getDocumentPassages(docId);
      map.set(docId, {
        documentId: docId,
        documentReference: meta.reference,
        passageCount: passages.length,
        vectors: f32,
        passages,
      });
    } catch {
      // Vector file missing or unreadable
    }
  }

  cachedVectors = map;
  cachedManifestTimestamp = manifestTimestamp;
  return map;
}

export async function getCorpusPassagesAndVectors(): Promise<{
  passages: CorpusPassage[];
  vectors: number[][];
  documents: Array<{ reference: string; title: string; text: string; format: 'text' | 'pdf' }>;
}> {
  const docMap = await loadReadyCorpusVectors();
  const passages: CorpusPassage[] = [];
  const vectors: number[][] = [];
  const documents: Array<{
    reference: string;
    title: string;
    text: string;
    format: 'text' | 'pdf';
  }> = [];
  const { getDocumentBody, getDocumentMetadata } = await import('./store');

  for (const doc of docMap.values()) {
    const meta = await getDocumentMetadata(doc.documentId);
    const body = (await getDocumentBody(doc.documentId)) ?? '';
    documents.push({
      reference: doc.documentReference,
      title: meta?.title ?? doc.documentReference.replaceAll('_', ' '),
      text: body,
      format: meta?.format ?? 'text',
    });

    const dim = MODEL_CONFIG.dimensions;
    for (let i = 0; i < doc.passages.length; i++) {
      passages.push(doc.passages[i]);
      const slice = Array.from(doc.vectors.subarray(i * dim, (i + 1) * dim));
      vectors.push(slice);
    }
  }

  return { passages, vectors, documents };
}

export function resetSemanticIndexCache(): void {
  cachedVectors = null;
  cachedManifestTimestamp = null;
}
