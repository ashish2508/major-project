import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLexicalPostings, resetLexicalIndexCache } from '../src/lib/corpus/lexical-index';
import { loadReadyCorpusVectors, resetSemanticIndexCache } from '../src/lib/corpus/semantic-index';
import { ingestDocumentFile, resetCorpus } from '../src/lib/corpus/service';
import { getCorpusStats, loadCatalog } from '../src/lib/corpus/store';
import * as model from '../src/lib/embeddings/model';

describe('persistent corpus reset', () => {
  let corpusDirectory: string;
  const originalCorpusDirectory = process.env.CORPUS_DIRECTORY;

  beforeEach(async () => {
    corpusDirectory = await mkdtemp(resolve(tmpdir(), 'corpus-reset-'));
    process.env.CORPUS_DIRECTORY = corpusDirectory;
    resetLexicalIndexCache();
    resetSemanticIndexCache();
  });

  afterEach(async () => {
    process.env.CORPUS_DIRECTORY = originalCorpusDirectory;
    resetLexicalIndexCache();
    resetSemanticIndexCache();
    vi.restoreAllMocks();
    await rm(corpusDirectory, { recursive: true, force: true });
  });

  it('removes imported papers and clears persistent lexical and semantic indexes', async () => {
    const embedding = Array.from({ length: 384 }, (_, index) => (index === 0 ? 1 : 0));
    vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) => texts.map(() => embedding));
    const text =
      'Distributed databases replicate committed writes across independent nodes to preserve durable transaction history.';
    const file = new File([text], 'distributed-database.txt', { type: 'text/plain' });

    const imported = await ingestDocumentFile(file);
    expect(imported.document.status).toBe('ready');
    expect((await getCorpusStats()).totalPassages).toBeGreaterThan(0);
    expect((await loadLexicalPostings()).size).toBeGreaterThan(0);
    expect((await loadReadyCorpusVectors()).has(imported.document.id)).toBe(true);

    const reset = await resetCorpus();

    expect(reset.removedDocuments).toBe(1);
    expect(await loadCatalog()).toMatchObject({
      documents: {},
      totalDocuments: 0,
      readyDocuments: 0,
    });
    expect(await getCorpusStats()).toMatchObject({
      totalDocuments: 0,
      readyDocuments: 0,
      totalPassages: 0,
    });
    expect(await readdir(resolve(corpusDirectory, 'documents'))).toEqual([]);
    expect(await loadLexicalPostings()).toEqual(new Map());
    expect(await loadReadyCorpusVectors()).toEqual(new Map());

    const lexicalManifest = JSON.parse(
      await readFile(resolve(corpusDirectory, 'indexes/lexical/manifest.json'), 'utf8'),
    );
    const semanticManifest = JSON.parse(
      await readFile(resolve(corpusDirectory, 'indexes/semantic/manifest.json'), 'utf8'),
    );
    expect(lexicalManifest).toMatchObject({ documentIds: [], totalPassages: 0 });
    expect(semanticManifest).toMatchObject({ documentIds: [], totalPassages: 0 });
  });
});
