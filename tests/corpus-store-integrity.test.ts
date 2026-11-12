import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCatalog, saveDocumentRecord, updateCatalog } from '../src/lib/corpus/store';
import type { CorpusDocumentMetadata } from '../src/lib/corpus/types';

describe('corpus catalog integrity', () => {
  let corpusDirectory: string;
  const originalCorpusDirectory = process.env.CORPUS_DIRECTORY;

  beforeEach(async () => {
    corpusDirectory = await mkdtemp(resolve(tmpdir(), 'corpus-store-integrity-'));
    process.env.CORPUS_DIRECTORY = corpusDirectory;
  });

  afterEach(async () => {
    process.env.CORPUS_DIRECTORY = originalCorpusDirectory;
    await rm(corpusDirectory, { recursive: true, force: true });
  });

  it('treats only a missing catalog as an empty corpus', async () => {
    await expect(loadCatalog()).resolves.toMatchObject({
      documents: {},
      totalDocuments: 0,
    });
  });

  it('preserves a malformed catalog and refuses mutation instead of replacing it', async () => {
    const catalogPath = resolve(corpusDirectory, 'catalog.json');
    const malformedCatalog = '{"documents":';
    await writeFile(catalogPath, malformedCatalog);

    await expect(loadCatalog()).rejects.toThrow(/Unable to read corpus catalog/);
    await expect(
      updateCatalog((catalog) => {
        catalog.documents = {};
      }),
    ).rejects.toThrow(/Unable to read corpus catalog/);
    await expect(readFile(catalogPath, 'utf8')).resolves.toBe(malformedCatalog);
  });

  it('retains both records written by simultaneous imports', async () => {
    const metadata = (id: string): CorpusDocumentMetadata => {
      const now = new Date().toISOString();
      return {
        id,
        reference: id,
        title: `Paper ${id}`,
        filename: `${id}.txt`,
        sha256: id.padEnd(64, '0'),
        fileSize: 1,
        format: 'text',
        characterCount: 1,
        passageCount: 1,
        status: 'processing',
        errorMessage: null,
        ingestedAt: now,
        updatedAt: now,
        stripping: {
          confident: false,
          detectedHeading: null,
          charsRemoved: 0,
          referenceOffset: null,
        },
      };
    };

    await Promise.all(
      ['doc_first', 'doc_second'].map((id) =>
        saveDocumentRecord({
          metadata: metadata(id),
          bodyText: `Body for ${id}`,
          rawBytes: new Uint8Array([1]),
          passages: [],
        }),
      ),
    );

    const catalog = await loadCatalog();
    expect(Object.keys(catalog.documents).sort()).toEqual(['doc_first', 'doc_second']);
    expect(catalog.totalDocuments).toBe(2);
  });
});
