import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getArtifacts } from '../src/lib/application/analysis';
import { pageAtOffset } from '../src/lib/corpus/service';
import {
  addDocumentToLexicalIndex,
  ensureLexicalIndex,
  getIndexedPassageVectors,
  resetLexicalIndexCache,
} from '../src/lib/corpus/lexical-index';
import { ensureCorpusDirectories } from '../src/lib/corpus/store';
import type { CorpusPassage } from '../src/lib/corpus/types';
import { Tfidf } from '../src/lib/detection/tfidf';

const originalCorpusDirectory = process.env.CORPUS_DIRECTORY;
let temporaryCorpus: string | undefined;

afterEach(async () => {
  process.env.CORPUS_DIRECTORY = originalCorpusDirectory;
  resetLexicalIndexCache();
  if (temporaryCorpus) await rm(temporaryCorpus, { recursive: true, force: true });
  temporaryCorpus = undefined;
});

describe('production calibration and page provenance', () => {
  it('loads the matching validation-selected non-degenerate hybrid artifact', async () => {
    const { configs, tfidfSha256 } = await getArtifacts();
    expect(configs.lexical).toMatchObject({ method: 'lexical', threshold: 0.6, alpha: 1 });
    expect(configs.semantic).toMatchObject({ method: 'semantic', threshold: 0.7, alpha: 0 });
    expect(configs.hybrid).toMatchObject({ method: 'hybrid', threshold: 0.7, alpha: 0.25 });
    expect(tfidfSha256).toBe('6a85a777e42444b6efc4bd50973fb8ecdbe0a54f18b1f11c26b6d0afd8c4c5b8');
  });

  it('maps half-open extracted-text ranges to the correct one-based PDF page', () => {
    const pages = [
      { page: 1, start: 0, end: 100 },
      { page: 2, start: 102, end: 180 },
    ];
    expect(pageAtOffset(pages, 0)).toBe(1);
    expect(pageAtOffset(pages, 99)).toBe(1);
    expect(pageAtOffset(pages, 100)).toBeUndefined();
    expect(pageAtOffset(pages, 102)).toBe(2);
    expect(pageAtOffset(undefined, 3)).toBeUndefined();
  });

  it('rebuilds an incompatible persistent lexical index and serves indexed vectors', async () => {
    temporaryCorpus = await mkdtemp(resolve(tmpdir(), 'calibrated-lexical-index-'));
    process.env.CORPUS_DIRECTORY = temporaryCorpus;
    resetLexicalIndexCache();
    await ensureCorpusDirectories();
    const tfidf = Tfidf.fit(['distributed systems preserve committed transactions']);
    const passage: CorpusPassage = {
      id: 'doc#p0',
      documentId: 'doc',
      documentReference: 'source',
      passageIndex: 0,
      offset: 0,
      length: 54,
      text: 'distributed systems preserve committed transactions',
    };
    await ensureLexicalIndex(tfidf, 'selected-validation-idf');
    await addDocumentToLexicalIndex('doc', [passage], tfidf);
    const indexed = await getIndexedPassageVectors([passage]);
    expect(indexed.get(passage.id)).toEqual(tfidf.transform(passage.text));
  });
});
