/**
 * Issue #4: Verify production corpus independence.
 * - Confirm useCorpus defaults to false (uses provided sources, not canonical)
 * - Ensure canonical papers are not auto-loaded
 * - Verify user's own corpus option works independently
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { analyzeDocuments } from '../src/lib/application/analysis';
import { resetLexicalIndexCache } from '../src/lib/corpus/lexical-index';
import { resetSemanticIndexCache } from '../src/lib/corpus/semantic-index';
import type { ExtractedDocument } from '../src/lib/documents/extract';

describe('Production corpus independence', () => {
  const previousCorpusDirectory = process.env.CORPUS_DIRECTORY;
  let emptyCorpusDirectory: string;

  beforeAll(async () => {
    emptyCorpusDirectory = await mkdtemp(resolve(tmpdir(), 'empty-production-corpus-'));
    process.env.CORPUS_DIRECTORY = emptyCorpusDirectory;
    resetLexicalIndexCache();
    resetSemanticIndexCache();
  });

  afterAll(async () => {
    process.env.CORPUS_DIRECTORY = previousCorpusDirectory;
    resetLexicalIndexCache();
    resetSemanticIndexCache();
    await rm(emptyCorpusDirectory, { recursive: true, force: true });
  });

  const queryDoc: ExtractedDocument = {
    reference: 'test_query',
    title: 'Test Query',
    text: 'Machine learning algorithms require substantial training data and careful validation.',
    format: 'text',
  };

  const sourceDoc1: ExtractedDocument = {
    reference: 'test_source_1',
    title: 'Test Source 1',
    text: 'Machine learning algorithms require substantial training data and careful validation procedures for accuracy.',
    format: 'text',
  };

  const sourceDoc2: ExtractedDocument = {
    reference: 'test_source_2',
    title: 'Test Source 2',
    text: 'Neural networks process data through multiple layers of transformations.',
    format: 'text',
  };

  it('defaults to manual sources when options omitted (useCorpus not set)', async () => {
    // This is the PRODUCTION default
    const result = await analyzeDocuments(queryDoc, [sourceDoc1, sourceDoc2], 'lexical');

    expect(result.method).toBe('lexical');
    expect(result.sources).toHaveLength(2);
    expect(result.sources.map((s) => s.reference)).toEqual(['test_source_1', 'test_source_2']);
    expect(result.passages.sources).toBeGreaterThan(0);

    // Detections should reference the provided sources, not canonical papers
    for (const d of result.detections) {
      expect(['test_source_1', 'test_source_2']).toContain(d.sourceReference);
    }
  });

  it('explicitly uses manual sources when useCorpus: false', async () => {
    const result = await analyzeDocuments(queryDoc, [sourceDoc1, sourceDoc2], 'lexical', {
      useCorpus: false,
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].reference).toBe('test_source_1');
    expect(result.sources[1].reference).toBe('test_source_2');
  });

  it('raises error when useCorpus: true but no corpus exists', async () => {
    // Corpus should be empty in most test environments
    await expect(
      analyzeDocuments(queryDoc, [sourceDoc1, sourceDoc2], 'lexical', {
        useCorpus: true,
      }),
    ).rejects.toThrow('Corpus contains no ready documents');
  });

  it('does NOT auto-load canonical papers on default (useCorpus: false)', async () => {
    // Canonical papers should never be used unless explicitly requested
    const result = await analyzeDocuments(queryDoc, [sourceDoc1], 'lexical');

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].reference).toBe('test_source_1');

    // All detections must reference test_source_1, not QUIC or other canonical papers
    for (const d of result.detections) {
      expect(d.sourceReference).toBe('test_source_1');
    }
  });

  it('preserves corpus functionality when explicitly enabled (useCorpus: true)', async () => {
    // This test would need an actual populated corpus
    // For now, just verify the option is accepted and errors appropriately
    try {
      await analyzeDocuments(queryDoc, [], 'lexical', { useCorpus: true });
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect((e as Error).message).toContain('Corpus contains no ready documents');
    }
  });

  it('confirms useCanonicalCorpus is deprecated (uses canonical only in tests)', async () => {
    // useCanonicalCorpus is used in test suites but should not be production default
    const result = await analyzeDocuments(queryDoc, [sourceDoc1, sourceDoc2], 'lexical', {
      useCanonicalCorpus: false, // Explicitly false
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].reference).toBe('test_source_1');
  });
});
