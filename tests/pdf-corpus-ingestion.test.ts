import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ingestBatchDocuments, ingestDocumentFile } from '../src/lib/corpus/service';
import { loadLexicalPostings, resetLexicalIndexCache } from '../src/lib/corpus/lexical-index';
import { loadReadyCorpusVectors, resetSemanticIndexCache } from '../src/lib/corpus/semantic-index';
import { getDocumentBody, getDocumentPassages } from '../src/lib/corpus/store';

const pdfPaths = [process.env.PDF_INGESTION_WORKING, process.env.PDF_INGESTION_NUL_GLYPH];
const suppliedPdfsAvailable = pdfPaths.every((path) => path && path.length > 0);
const execFileAsync = promisify(execFile);

async function asPdf(path: string, name: string): Promise<File> {
  const bytes = await readFile(path);
  return new File([Uint8Array.from(bytes)], name, { type: 'application/pdf' });
}

describe('user-provided PDF corpus ingestion regression', () => {
  it.skipIf(!suppliedPdfsAvailable)(
    'ingests both PDFs, persists both indexes, handles batch and duplicate uploads',
    async () => {
      const priorCorpusDirectory = process.env.CORPUS_DIRECTORY;
      const corpusDirectory = await mkdtemp(resolve(tmpdir(), 'pdf-ingestion-regression-'));
      let batchDirectory: string | undefined;
      process.env.CORPUS_DIRECTORY = corpusDirectory;
      resetLexicalIndexCache();
      resetSemanticIndexCache();

      try {
        const workingPdf = await asPdf(pdfPaths[0]!, '1.pdf');
        const nulGlyphPdf = await asPdf(pdfPaths[1]!, '2.pdf');

        const first = await ingestDocumentFile(workingPdf);
        const second = await ingestDocumentFile(nulGlyphPdf);
        for (const { document } of [first, second]) {
          expect(document.status).toBe('ready');
          expect(document.passageCount).toBeGreaterThan(0);
          expect((await getDocumentBody(document.id))?.trim().length).toBeGreaterThan(0);
          expect(await getDocumentPassages(document.id)).toHaveLength(document.passageCount);
        }

        const postings = await loadLexicalPostings();
        expect(
          [...postings.values()].flat().some((entry) => entry.documentId === first.document.id),
        ).toBe(true);
        expect(
          [...postings.values()].flat().some((entry) => entry.documentId === second.document.id),
        ).toBe(true);
        const vectors = await loadReadyCorpusVectors();
        expect(vectors.get(first.document.id)?.vectors.length).toBe(
          first.document.passageCount * 384,
        );
        expect(vectors.get(second.document.id)?.vectors.length).toBe(
          second.document.passageCount * 384,
        );

        const repeated = await ingestDocumentFile(nulGlyphPdf);
        expect(repeated.isDuplicate).toBe(true);
        expect(repeated.document.id).toBe(second.document.id);

        // Start a new Bun process and verify the catalog and indexes survive restart.
        const restartCheck = await execFileAsync(
          'bun',
          [
            '-e',
            `import { loadCatalog } from './src/lib/corpus/store.ts';
             import { loadLexicalPostings } from './src/lib/corpus/lexical-index.ts';
             import { loadReadyCorpusVectors } from './src/lib/corpus/semantic-index.ts';
             const catalog = await loadCatalog();
             const lexical = await loadLexicalPostings();
             const semantic = await loadReadyCorpusVectors();
             const report = {
               documents: Object.values(catalog.documents).map(({ id, filename, status, passageCount }) => ({ id, filename, status, passageCount })),
               lexicalIds: [...new Set([...lexical.values()].flat().map(({ documentId }) => documentId))],
               semantic: [...semantic.values()].map(({ documentId, passageCount, vectors }) => ({ documentId, passageCount, dimensions: vectors.length })),
             };
             console.log(JSON.stringify(report));`,
          ],
          {
            cwd: process.cwd(),
            env: { ...process.env, CORPUS_DIRECTORY: corpusDirectory },
            windowsHide: true,
          },
        );
        const persisted = JSON.parse(restartCheck.stdout.trim()) as {
          documents: Array<{ id: string; filename: string; status: string; passageCount: number }>;
          lexicalIds: string[];
          semantic: Array<{ documentId: string; passageCount: number; dimensions: number }>;
        };
        for (const { document } of [first, second]) {
          expect(persisted.documents.find((record) => record.id === document.id)?.status).toBe(
            'ready',
          );
          expect(persisted.lexicalIds).toContain(document.id);
          const semantic = persisted.semantic.find((record) => record.documentId === document.id);
          expect(semantic?.passageCount).toBe(document.passageCount);
          expect(semantic?.dimensions).toBe(document.passageCount * 384);
        }

        // Exercise the batch route's service operation in a fresh corpus.
        batchDirectory = await mkdtemp(resolve(tmpdir(), 'pdf-ingestion-batch-'));
        process.env.CORPUS_DIRECTORY = batchDirectory;
        resetLexicalIndexCache();
        resetSemanticIndexCache();
        const batch = await ingestBatchDocuments([workingPdf, nulGlyphPdf]);
        expect(batch.failed).toEqual([]);
        expect(batch.results).toHaveLength(2);
        expect(batch.results.every((result) => result.document.status === 'ready')).toBe(true);
        expect(batch.results.every((result) => result.document.passageCount > 0)).toBe(true);
      } finally {
        process.env.CORPUS_DIRECTORY = priorCorpusDirectory;
        resetLexicalIndexCache();
        resetSemanticIndexCache();
        await rm(corpusDirectory, { recursive: true, force: true });
        if (batchDirectory) await rm(batchDirectory, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
