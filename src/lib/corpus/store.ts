import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  CorpusCatalog,
  CorpusDocumentMetadata,
  CorpusPassage,
  CorpusStats,
  DocumentStatus,
} from './types';

export const DEFAULT_CORPUS_DIR = resolve('data/corpus');

export function getCorpusDir(): string {
  return resolve(process.env.CORPUS_DIRECTORY ?? DEFAULT_CORPUS_DIR);
}

function getCatalogPath(): string {
  return resolve(getCorpusDir(), 'catalog.json');
}

function getDocumentDir(id: string): string {
  return resolve(getCorpusDir(), 'documents', id);
}

async function atomicWrite(filePath: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmpPath, data);
  // On Windows, writeFile with rename can collide if destination is open; Node's rename handles atomic replace.
  const { rename } = await import('node:fs/promises');
  try {
    await rename(tmpPath, filePath);
  } catch {
    // Fallback if atomic rename fails on locked file
    await writeFile(filePath, data);
    await rm(tmpPath, { force: true }).catch(() => {});
  }
}

export async function ensureCorpusDirectories(): Promise<void> {
  const base = getCorpusDir();
  await mkdir(resolve(base, 'documents'), { recursive: true });
  await mkdir(resolve(base, 'indexes', 'lexical'), { recursive: true });
  await mkdir(resolve(base, 'indexes', 'semantic'), { recursive: true });
}

export async function loadCatalog(): Promise<CorpusCatalog> {
  const path = getCatalogPath();
  try {
    const raw = await readFile(path, 'utf8');
    const catalog = JSON.parse(raw) as CorpusCatalog;
    return catalog;
  } catch {
    return {
      documents: {},
      totalDocuments: 0,
      readyDocuments: 0,
      totalPassages: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export async function saveCatalog(catalog: CorpusCatalog): Promise<void> {
  catalog.totalDocuments = Object.keys(catalog.documents).length;
  catalog.readyDocuments = Object.values(catalog.documents).filter(
    (d) => d.status === 'ready',
  ).length;
  catalog.totalPassages = Object.values(catalog.documents).reduce(
    (sum, d) => sum + (d.status === 'ready' ? d.passageCount : 0),
    0,
  );
  catalog.lastUpdated = new Date().toISOString();
  await atomicWrite(getCatalogPath(), JSON.stringify(catalog, null, 2));
}

export async function findDocumentBySha256(
  sha256: string,
): Promise<CorpusDocumentMetadata | undefined> {
  const catalog = await loadCatalog();
  return Object.values(catalog.documents).find((doc) => doc.sha256 === sha256);
}

export async function getDocumentMetadata(id: string): Promise<CorpusDocumentMetadata | null> {
  const catalog = await loadCatalog();
  return catalog.documents[id] ?? null;
}

export async function getDocumentPassages(id: string): Promise<CorpusPassage[]> {
  const path = resolve(getDocumentDir(id), 'passages.json');
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as CorpusPassage[];
  } catch {
    return [];
  }
}

export async function getDocumentBody(id: string): Promise<string | null> {
  const path = resolve(getDocumentDir(id), 'body.txt');
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

export async function getDocumentRawBytes(id: string): Promise<Uint8Array | null> {
  const path = resolve(getDocumentDir(id), 'raw.bin');
  try {
    const buf = await readFile(path);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch {
    return null;
  }
}

export async function saveDocumentRecord(params: {
  metadata: CorpusDocumentMetadata;
  bodyText: string;
  rawBytes: Uint8Array;
  passages: CorpusPassage[];
}): Promise<void> {
  const dir = getDocumentDir(params.metadata.id);
  await mkdir(dir, { recursive: true });

  await atomicWrite(resolve(dir, 'metadata.json'), JSON.stringify(params.metadata, null, 2));
  await atomicWrite(resolve(dir, 'body.txt'), params.bodyText);
  await atomicWrite(resolve(dir, 'raw.bin'), params.rawBytes);
  await atomicWrite(resolve(dir, 'passages.json'), JSON.stringify(params.passages, null, 2));

  const catalog = await loadCatalog();
  catalog.documents[params.metadata.id] = params.metadata;
  await saveCatalog(catalog);
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentStatus,
  errorMessage: string | null = null,
  extraUpdates?: Partial<CorpusDocumentMetadata>,
): Promise<CorpusDocumentMetadata | null> {
  const catalog = await loadCatalog();
  const existing = catalog.documents[id];
  if (!existing) return null;

  existing.status = status;
  existing.errorMessage = errorMessage;
  existing.updatedAt = new Date().toISOString();
  if (extraUpdates) {
    Object.assign(existing, extraUpdates);
  }

  const metaPath = resolve(getDocumentDir(id), 'metadata.json');
  await atomicWrite(metaPath, JSON.stringify(existing, null, 2)).catch(() => {});
  await saveCatalog(catalog);
  return existing;
}

export async function deleteDocumentRecord(id: string): Promise<boolean> {
  const catalog = await loadCatalog();
  if (!catalog.documents[id]) return false;

  delete catalog.documents[id];
  await saveCatalog(catalog);

  const dir = getDocumentDir(id);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  return true;
}

export async function getCorpusStats(): Promise<CorpusStats> {
  const catalog = await loadCatalog();
  const docs = Object.values(catalog.documents);

  let storageBytes = 0;
  for (const doc of docs) {
    storageBytes += doc.fileSize;
  }

  return {
    totalDocuments: docs.length,
    readyDocuments: docs.filter((d) => d.status === 'ready').length,
    processingDocuments: docs.filter((d) => d.status === 'processing').length,
    failedDocuments: docs.filter((d) => d.status === 'failed').length,
    totalPassages: docs.reduce((acc, d) => acc + (d.status === 'ready' ? d.passageCount : 0), 0),
    storageBytes,
    lastUpdated: catalog.lastUpdated,
  };
}
