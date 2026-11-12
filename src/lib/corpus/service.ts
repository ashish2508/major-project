import { digest } from '../digest';
import { segmentParagraphs, type Passage } from '../detection/segmentation';
import { stripReferences } from '../detection/strip-references';
import { extractFile, MAX_FILE_BYTES, type ExtractedDocument } from '../documents/extract';
import { applicationDevice, embedTexts, tokenCounter } from '../embeddings/model';
import {
  addDocumentToLexicalIndex,
  ensureLexicalIndex,
  removeDocumentFromLexicalIndex,
} from './lexical-index';
import { removeDocumentVectors, saveDocumentVectors } from './semantic-index';
import {
  deleteDocumentRecord,
  ensureCorpusDirectories,
  findDocumentBySha256,
  getDocumentBody,
  getDocumentMetadata,
  getDocumentPassages,
  getDocumentRawBytes,
  loadCatalog,
  saveDocumentRecord,
  updateDocumentStatus,
  updateDocumentMetadata,
} from './store';
import type { CorpusDocumentMetadata, CorpusPassage } from './types';

export interface IngestOptions {
  title?: string;
  reference?: string;
}

export interface IngestResult {
  document: CorpusDocumentMetadata;
  isDuplicate: boolean;
  message: string;
}

export function pageAtOffset(
  ranges: { page: number; start: number; end: number }[] | undefined,
  offset: number,
): number | undefined {
  return ranges?.find((range) => offset >= range.start && offset < range.end)?.page;
}

export function attachPassagePages<T extends Passage>(
  passages: T[],
  ranges: { page: number; start: number; end: number }[] | undefined,
): T[] {
  return passages.map((passage) => ({ ...passage, page: pageAtOffset(ranges, passage.offset) }));
}

function sanitizeReference(filename: string): string {
  const base = filename.replace(/\.[^/.]+$/, '');
  const clean = base
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return clean || `doc_${Date.now()}`;
}

export async function ingestDocumentFile(
  file: File,
  options?: IngestOptions,
): Promise<IngestResult> {
  await ensureCorpusDirectories();

  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    throw new Error(`Each file must be nonempty and at most ${MAX_FILE_BYTES / (1024 * 1024)} MB`);
  }

  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = digest(rawBytes);

  // Check for deduplication
  const existing = await findDocumentBySha256(sha256);
  if (existing && existing.status === 'ready') {
    return {
      document: existing,
      isDuplicate: true,
      message: `Document already exists in corpus as "${existing.title}" (${existing.reference})`,
    };
  }

  const filename = file.name;
  const docId = existing?.id ?? `doc_${sha256.slice(0, 16)}`;
  const reference = options?.reference ?? existing?.reference ?? sanitizeReference(filename);
  const title =
    options?.title ?? existing?.title ?? filename.replace(/[\r\n\0]/g, ' ').slice(0, 200);
  const format: 'pdf' | 'text' = /\.pdf$/i.test(filename) ? 'pdf' : 'text';

  // Create temporary in-progress metadata record
  const initialMetadata: CorpusDocumentMetadata = {
    id: docId,
    reference,
    title,
    filename,
    sha256,
    fileSize: file.size,
    format,
    characterCount: 0,
    passageCount: 0,
    status: 'processing',
    errorMessage: null,
    ingestedAt: existing?.ingestedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stripping: {
      confident: false,
      detectedHeading: null,
      charsRemoved: 0,
      referenceOffset: null,
    },
  };

  // Extract, strip references, segment, index
  try {
    const extracted = await extractFile(file, reference);
    initialMetadata.format = extracted.format;
    const stripResult = stripReferences(extracted.text);
    const countTokens = await tokenCounter();

    const rawPassages = segmentParagraphs(
      stripResult.body,
      reference,
      { countTokens },
      extracted.paragraphBreaks,
    );

    if (rawPassages.length === 0) {
      throw new Error('Document produced no extractable passages after segmentation');
    }

    const corpusPassages: CorpusPassage[] = rawPassages.map((p, idx) => ({
      id: `${docId}#p${idx}`,
      documentId: docId,
      documentReference: reference,
      passageIndex: idx,
      offset: p.offset,
      length: p.length,
      text: p.text,
      page: pageAtOffset(extracted.pages, p.offset),
    }));

    initialMetadata.characterCount = stripResult.body.length;
    initialMetadata.passageCount = corpusPassages.length;
    initialMetadata.pageCount = extracted.pages?.length;
    initialMetadata.pageRanges = extracted.pages;
    initialMetadata.stripping = {
      confident: stripResult.confident,
      detectedHeading: stripResult.detectedHeading,
      charsRemoved: extracted.text.length - stripResult.body.length,
      referenceOffset: stripResult.referenceOffset,
    };

    // Save record to store
    await saveDocumentRecord({
      metadata: initialMetadata,
      bodyText: stripResult.body,
      rawBytes,
      passages: corpusPassages,
    });

    // 1. Lexical Indexing
    const { getArtifacts } = await import('../application/analysis');
    const { tfidf, tfidfSha256 } = await getArtifacts();
    await ensureLexicalIndex(tfidf, tfidfSha256);
    await addDocumentToLexicalIndex(docId, corpusPassages, tfidf);

    // 2. Semantic Indexing (embed only this document's passages)
    const device = applicationDevice();
    const uniqueTexts = [...new Set(corpusPassages.map((p) => p.text))];
    const uniqueVectors = await embedTexts(uniqueTexts, device);
    const vectorByText = new Map(uniqueTexts.map((text, i) => [text, uniqueVectors[i]]));
    const passageVectors = corpusPassages.map((p) => vectorByText.get(p.text)!);

    await saveDocumentVectors(docId, reference, corpusPassages, passageVectors);

    // Mark ready
    const readyMetadata = await updateDocumentStatus(docId, 'ready', null, {
      characterCount: stripResult.body.length,
      passageCount: corpusPassages.length,
      stripping: initialMetadata.stripping,
    });
    const { updateSemanticManifest } = await import('./semantic-index');
    await updateSemanticManifest();

    return {
      document: readyMetadata!,
      isDuplicate: false,
      message: `Document "${title}" successfully ingested and indexed (${corpusPassages.length} passages).`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await updateDocumentStatus(docId, 'failed', errorMsg);
    throw new Error(`Failed to ingest document "${title}": ${errorMsg}`);
  }
}

export async function ingestBatchDocuments(files: File[]): Promise<{
  results: IngestResult[];
  failed: Array<{ filename: string; error: string }>;
}> {
  const results: IngestResult[] = [];
  const failed: Array<{ filename: string; error: string }> = [];

  for (const file of files) {
    try {
      const res = await ingestDocumentFile(file);
      results.push(res);
    } catch (e) {
      failed.push({
        filename: file.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { results, failed };
}

export async function retryDocumentIngestion(id: string): Promise<IngestResult> {
  const meta = await getDocumentMetadata(id);
  if (!meta) {
    throw new Error(`Document not found: ${id}`);
  }

  const rawBytes = await getDocumentRawBytes(id);
  if (!rawBytes) {
    throw new Error(`Raw document bytes missing for document: ${id}`);
  }

  const file = new File([rawBytes as unknown as BlobPart], meta.filename, {
    type: meta.format === 'pdf' ? 'application/pdf' : 'text/plain',
  });

  return ingestDocumentFile(file, {
    title: meta.title,
    reference: meta.reference,
  });
}

export async function deleteCorpusDocument(id: string): Promise<boolean> {
  await removeDocumentFromLexicalIndex(id);
  await removeDocumentVectors(id);
  const deleted = await deleteDocumentRecord(id);
  if (deleted) {
    const { updateSemanticManifest } = await import('./semantic-index');
    await updateSemanticManifest();
  }
  return deleted;
}

export async function getAllReadyPassages(): Promise<{
  passages: Passage[];
  documents: ExtractedDocument[];
}> {
  const catalog = await loadCatalog();
  const readyDocs = Object.values(catalog.documents).filter((d) => d.status === 'ready');

  const passages: Passage[] = [];
  const documents: ExtractedDocument[] = [];

  for (const meta of readyDocs) {
    const body = await getDocumentBody(meta.id);
    if (!body) continue;

    let pageRanges = meta.pageRanges;
    if (!pageRanges && meta.format === 'pdf') {
      const rawBytes = await getDocumentRawBytes(meta.id);
      if (rawBytes) {
        const file = new File([rawBytes as unknown as BlobPart], meta.filename, {
          type: 'application/pdf',
        });
        pageRanges = (await extractFile(file, meta.reference)).pages;
        if (pageRanges) await updateDocumentMetadata(meta.id, { pageRanges });
      }
    }
    documents.push({
      reference: meta.reference,
      title: meta.title,
      text: body,
      format: meta.format,
      pages: pageRanges,
    });

    const docPassages = await getDocumentPassages(meta.id);
    for (const dp of docPassages) {
      passages.push({
        id: dp.id,
        documentReference: dp.documentReference,
        offset: dp.offset,
        length: dp.length,
        text: dp.text,
        page: dp.page ?? pageAtOffset(pageRanges, dp.offset),
      });
    }
  }

  return { passages, documents };
}
