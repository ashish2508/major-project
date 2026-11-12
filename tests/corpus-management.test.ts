import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeDocuments } from '../src/lib/application/analysis';
import { loadLexicalPostings, resetLexicalIndexCache } from '../src/lib/corpus/lexical-index';
import { loadReadyCorpusVectors, resetSemanticIndexCache } from '../src/lib/corpus/semantic-index';
import {
  deleteCorpusDocument,
  ingestBatchDocuments,
  ingestDocumentFile,
  retryDocumentIngestion,
} from '../src/lib/corpus/service';
import {
  findDocumentBySha256,
  getCorpusDir,
  getCorpusStats,
  getDocumentMetadata,
  getDocumentPassages,
  loadCatalog,
} from '../src/lib/corpus/store';
import * as model from '../src/lib/embeddings/model';
import { textPdf } from './pdf-fixture';

function mockUnitVector(axis = 0): number[] {
  const vec = new Array(384).fill(0);
  vec[axis % 384] = 1;
  return vec;
}

describe('General-Purpose Corpus Management & Independent Indexing', () => {
  let testCorpusDir: string;
  const originalCorpusEnv = process.env.CORPUS_DIRECTORY;

  beforeAll(async () => {
    testCorpusDir = await mkdtemp(resolve(tmpdir(), 'test-corpus-'));
    process.env.CORPUS_DIRECTORY = testCorpusDir;
  });

  afterAll(async () => {
    process.env.CORPUS_DIRECTORY = originalCorpusEnv;
    await rm(testCorpusDir, { recursive: true, force: true }).catch(() => {});
  });

  beforeEach(() => {
    resetLexicalIndexCache();
    resetSemanticIndexCache();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Individual & Batch Ingestion
  // -------------------------------------------------------------------------
  describe('Document Ingestion', () => {
    it('ingests an individual text paper, extracts passages, strips references, and indexes', async () => {
      const sampleText =
        'Recent advancements in deep learning have transformed artificial intelligence research.\n\n' +
        'Convolutional models excel at vision tasks while transformer models dominate natural language processing.\n\n' +
        'Empirical evaluations demonstrate substantial performance gains across standard benchmarks.\n\n' +
        'References\n\n' +
        '[1] Vaswani et al. Attention is all you need. NeurIPS 2017.\n' +
        '[2] LeCun et al. Deep learning. Nature 2015.';

      const file = new File([sampleText], 'deep_learning_survey.txt', { type: 'text/plain' });

      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) =>
        texts.map(() => mockUnitVector(0)),
      );

      const res = await ingestDocumentFile(file, {
        title: 'Deep Learning Survey',
        reference: 'deep_learning_survey',
      });

      expect(res.isDuplicate).toBe(false);
      expect(res.document.status).toBe('ready');
      expect(res.document.title).toBe('Deep Learning Survey');
      expect(res.document.reference).toBe('deep_learning_survey');
      expect(res.document.format).toBe('text');
      expect(res.document.passageCount).toBeGreaterThan(0);
      expect(res.document.stripping.charsRemoved).toBeGreaterThan(0);
      expect(res.document.stripping.detectedHeading).toBe('References');

      // Verify persistent store
      const meta = await getDocumentMetadata(res.document.id);
      expect(meta).not.toBeNull();
      expect(meta?.status).toBe('ready');

      const passages = await getDocumentPassages(res.document.id);
      expect(passages.length).toBe(res.document.passageCount);
      expect(passages[0].id).toContain('#p0');
      expect(passages[0].text).toContain('deep learning');

      // Verify lexical index
      const postings = await loadLexicalPostings();
      expect(postings.size).toBeGreaterThan(0);
      expect(postings.has('intelligence')).toBe(true);
      expect(postings.has('research')).toBe(true);

      // Verify semantic index
      const vectorMap = await loadReadyCorpusVectors();
      expect(vectorMap.has(res.document.id)).toBe(true);
      const docVecs = vectorMap.get(res.document.id)!;
      expect(docVecs.passageCount).toBe(passages.length);
      expect(docVecs.vectors.length).toBe(passages.length * 384);
    });

    it('ingests a multi-page PDF paper and preserves page metadata', async () => {
      const pdfBytes = textPdf(
        'Autonomous database query optimization using learned cost models achieves competitive execution times.',
      );
      const file = new File([pdfBytes as unknown as BlobPart], 'query_opt.pdf', {
        type: 'application/pdf',
      });

      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) =>
        texts.map(() => mockUnitVector(1)),
      );

      const res = await ingestDocumentFile(file);
      expect(res.document.format).toBe('pdf');
      expect(res.document.pageCount).toBe(1);
      expect(res.document.passageCount).toBeGreaterThan(0);
      expect(res.document.pageRanges).toHaveLength(1);
      expect((await getDocumentPassages(res.document.id))[0].page).toBe(1);
    });

    it('uses extracted MIME-aware file type when a PDF filename has no extension', async () => {
      const file = new File(
        [
          textPdf(
            'A database query planner compares estimated execution costs across alternative operators.',
          ),
        ],
        'uploaded-paper',
        { type: 'application/pdf' },
      );
      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) =>
        texts.map(() => mockUnitVector(3)),
      );
      const result = await ingestDocumentFile(file);
      expect(result.document.format).toBe('pdf');
      expect(result.document.pageCount).toBe(1);
      expect(result.document.status).toBe('ready');
    });

    it('ingests multiple research papers in a batch', async () => {
      const file1 = new File(
        ['First research paper discussing distributed systems and consensus protocols.'],
        'consensus.txt',
        { type: 'text/plain' },
      );
      const file2 = new File(
        ['Second research paper evaluating hardware acceleration and memory hierarchies.'],
        'hardware.txt',
        { type: 'text/plain' },
      );

      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) =>
        texts.map(() => mockUnitVector(2)),
      );

      const batchRes = await ingestBatchDocuments([file1, file2]);
      expect(batchRes.results.length).toBe(2);
      expect(batchRes.failed.length).toBe(0);
      expect(batchRes.results[0].document.status).toBe('ready');
      expect(batchRes.results[1].document.status).toBe('ready');

      const stats = await getCorpusStats();
      expect(stats.totalDocuments).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Deduplication & Fingerprinting
  // -------------------------------------------------------------------------
  describe('Fingerprinting & Deduplication', () => {
    it('detects duplicate document by SHA-256 and does not re-embed or re-index', async () => {
      const uniqueContent = 'Unique content for deduplication test: ' + Date.now();
      const file1 = new File([uniqueContent], 'unique1.txt', { type: 'text/plain' });
      const file2 = new File([uniqueContent], 'unique2_copy.txt', { type: 'text/plain' });

      let embedCalls = 0;
      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) => {
        embedCalls++;
        return texts.map(() => mockUnitVector(3));
      });

      const firstRes = await ingestDocumentFile(file1);
      expect(firstRes.isDuplicate).toBe(false);
      expect(embedCalls).toBeGreaterThan(0);

      const currentEmbedCalls = embedCalls;

      // Ingest duplicate
      const secondRes = await ingestDocumentFile(file2);
      expect(secondRes.isDuplicate).toBe(true);
      expect(secondRes.document.id).toBe(firstRes.document.id);
      expect(embedCalls).toBe(currentEmbedCalls); // Zero new embeddings!
    });
  });

  // -------------------------------------------------------------------------
  // 3. Document Deletion & Cascade Index Cleanup
  // -------------------------------------------------------------------------
  describe('Document Deletion', () => {
    it('deletes document and prunes its lexical postings and semantic vectors', async () => {
      const file = new File(
        ['Transient paper about quantum computing architectures and algorithms.'],
        'quantum_transient.txt',
        { type: 'text/plain' },
      );

      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) =>
        texts.map(() => mockUnitVector(4)),
      );

      const res = await ingestDocumentFile(file, { reference: 'quantum_transient' });
      const docId = res.document.id;

      // Ensure indexed
      let postings = await loadLexicalPostings();
      expect(postings.has('quantum')).toBe(true);
      let vectors = await loadReadyCorpusVectors();
      expect(vectors.has(docId)).toBe(true);

      // Delete document
      const deleted = await deleteCorpusDocument(docId);
      expect(deleted).toBe(true);

      // Verify removal
      const meta = await getDocumentMetadata(docId);
      expect(meta).toBeNull();

      postings = await loadLexicalPostings();
      expect(postings.has('quantum')).toBe(false);

      vectors = await loadReadyCorpusVectors();
      expect(vectors.has(docId)).toBe(false);
      const semanticManifest = JSON.parse(
        await readFile(resolve(getCorpusDir(), 'indexes/semantic/manifest.json'), 'utf8'),
      );
      expect(semanticManifest.documentIds).not.toContain(docId);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Retry Failed Ingestion
  // -------------------------------------------------------------------------
  describe('Retry Failed Ingestion', () => {
    it('retries a document whose initial indexing failed', async () => {
      const file = new File(
        ['Paper for retry testing with algorithmic complexity analysis.'],
        'retry_doc.txt',
        { type: 'text/plain' },
      );

      let shouldFail = true;
      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) => {
        if (shouldFail) throw new Error('Simulated embedding engine crash');
        return texts.map(() => mockUnitVector(5));
      });

      // First attempt fails
      await expect(ingestDocumentFile(file)).rejects.toThrow('Simulated embedding engine crash');

      const catalog = await loadCatalog();
      const failedDoc = Object.values(catalog.documents).find(
        (d) => d.filename === 'retry_doc.txt',
      );
      expect(failedDoc).toBeDefined();
      expect(failedDoc?.status).toBe('failed');
      expect(failedDoc?.errorMessage).toContain('Simulated embedding engine crash');

      // Now retry succeeds
      shouldFail = false;
      const retryRes = await retryDocumentIngestion(failedDoc!.id);
      expect(retryRes.document.status).toBe('ready');
      expect(retryRes.document.errorMessage).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Corpus-Wide Plagiarism Analysis (Lexical, Semantic, Hybrid)
  // -------------------------------------------------------------------------
  describe('Plagiarism Detection Against Corpus', () => {
    it('queries the persistent corpus in lexical mode without re-embedding source docs', async () => {
      // Ingest known source paper
      const sourceFile = new File(
        [
          'Security in computer networks depends fundamentally on robust encryption standards and authenticated handshakes.',
        ],
        'network_security.txt',
        { type: 'text/plain' },
      );

      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) =>
        texts.map(() => mockUnitVector(6)),
      );

      await ingestDocumentFile(sourceFile, { reference: 'network_security' });

      // Query document with matching wording
      const queryDoc = {
        reference: 'query_network',
        title: 'Query Network Paper',
        text: 'Security in computer networks depends fundamentally on robust encryption standards and authenticated handshakes.',
        format: 'text' as const,
      };

      const result = await analyzeDocuments(queryDoc, [], 'lexical', { useCorpus: true });

      expect(result.method).toBe('lexical');
      expect(result.detections.length).toBeGreaterThan(0);
      expect(result.detections[0].sourceReference).toBe('network_security');
      expect(result.detections[0].lexical).toBeGreaterThan(0.7);
    });

    it('queries the persistent corpus in semantic mode reusing on-disk float32 vectors', async () => {
      const sourceFile = new File(
        [
          'Neural machine translation models utilize deep recurrent networks equipped with attention mechanisms to translate complex natural language passages across distinct linguistic vocabularies effectively.',
        ],
        'nmt_source.txt',
        { type: 'text/plain' },
      );

      const targetVec = mockUnitVector(7);

      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) =>
        texts.map(() => [...targetVec]),
      );

      await ingestDocumentFile(sourceFile, { reference: 'nmt_source' });

      const queryDoc = {
        reference: 'query_nmt',
        title: 'Query NMT Paper',
        text: 'Sequence to sequence neural translation models employ deep attention mechanisms to process complex natural language text across multiple vocabularies with high semantic accuracy.',
        format: 'text' as const,
      };

      let queryEmbedCalls = 0;
      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) => {
        queryEmbedCalls++;
        return texts.map(() => [...targetVec]);
      });

      const result = await analyzeDocuments(queryDoc, [], 'semantic', { useCorpus: true });

      expect(queryEmbedCalls).toBe(1); // Only query was embedded, not corpus!
      expect(result.method).toBe('semantic');
      expect(result.detections.length).toBeGreaterThan(0);
      expect(result.detections[0].sourceReference).toBe('nmt_source');
      expect(result.detections[0].semantic).toBeCloseTo(1.0, 2);
    });

    it('queries the persistent corpus in hybrid mode fusing lexical and semantic scores', async () => {
      const queryDoc = {
        reference: 'query_hybrid',
        title: 'Query Hybrid Paper',
        text: 'Security in computer networks depends fundamentally on robust encryption standards and authenticated handshakes.',
        format: 'text' as const,
      };

      const vec = mockUnitVector(6);
      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) => texts.map(() => [...vec]));

      const result = await analyzeDocuments(queryDoc, [], 'hybrid', { useCorpus: true });

      expect(result.method).toBe('hybrid');
      expect(result.detections.length).toBeGreaterThan(0);
      expect(result.detections[0].sourceReference).toBe('network_security');
      expect(result.detections[0].score).toBeGreaterThan(0.7);
    });

    it('fails gracefully when searching an empty corpus', async () => {
      // Point to an empty directory
      const emptyDir = await mkdtemp(resolve(tmpdir(), 'empty-corpus-'));
      process.env.CORPUS_DIRECTORY = emptyDir;
      resetLexicalIndexCache();
      resetSemanticIndexCache();

      const queryDoc = {
        reference: 'query_empty',
        title: 'Query',
        text: 'Sample test text.',
        format: 'text' as const,
      };

      await expect(analyzeDocuments(queryDoc, [], 'lexical', { useCorpus: true })).rejects.toThrow(
        'Corpus contains no ready documents',
      );

      await rm(emptyDir, { recursive: true, force: true }).catch(() => {});
      process.env.CORPUS_DIRECTORY = testCorpusDir;
    });
  });
});
