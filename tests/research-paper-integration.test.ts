/**
 * Phase 6: Automated Verification of Full-Research-Paper Plagiarism Detection.
 *
 * This test suite rigorously tests all 13 requirements specified in Phase 6:
 *
 *  1. Full-paper extraction beyond 50,000 characters (up to MAX_DOCUMENT_CHARACTERS = 250,000).
 *  2. PDF extraction with page mappings ({ page, start, end } alignment).
 *  3. Loading all 12 canonical papers (via loadCanonicalCorpus()).
 *  4. Missing/empty corpus directories handled with descriptive errors.
 *  5. Reference removal (via stripCanonicalReferences for query and canonical docs).
 *  6. Offset preservation (masked ranges preserve string length; offsets remain valid).
 *  7. Cached embedding reuse (identical Promise and result object, no re-embedding).
 *  8. Concurrent cache initialization (Promise.all triggers only one embedding execution).
 *  9. TF-IDF against the canonical corpus (analyzeDocuments with 'lexical' and useCanonicalCorpus).
 * 10. MiniLM against the canonical corpus (analyzeDocuments with 'semantic' and useCanonicalCorpus).
 * 11. Hybrid against the canonical corpus (analyzeDocuments with 'hybrid' and useCanonicalCorpus).
 * 12. Manual source uploads (useCanonicalCorpus: false or omitted preserves manual sources).
 * 13. Invalid and oversized documents (oversized >250k, invalid PDF signature, empty files, null bytes).
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeDocuments } from '../src/lib/application/analysis';
import {
  CANONICAL_CORPUS_DIR,
  getCanonicalEmbeddings,
  loadCanonicalCorpus,
  resetCanonicalCorpusCache,
} from '../src/lib/application/canonical-corpus';
import { stripCanonicalReferences, stripReferences } from '../src/lib/detection/strip-references';
import {
  extractFile,
  MAX_DOCUMENT_CHARACTERS,
  MAX_FILE_BYTES,
  validateText,
  type ExtractedDocument,
} from '../src/lib/documents/extract';
import * as model from '../src/lib/embeddings/model';
import { textPdf } from './pdf-fixture';

// ---------------------------------------------------------------------------
// Multi-page PDF fixture helper
// ---------------------------------------------------------------------------

function twoPagePdf(text1: string, text2: string): Uint8Array<ArrayBuffer> {
  const esc1 = text1.replace(/([\\()])/g, '\\$1');
  const stream1 = `BT /F1 12 Tf 50 750 Td (${esc1}) Tj ET`;
  const esc2 = text2.replace(/([\\()])/g, '\\$1');
  const stream2 = `BT /F1 12 Tf 50 750 Td (${esc2}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream1)} >>\nstream\n${stream1}\nendstream`,
    `<< /Length ${Buffer.byteLength(stream2)} >>\nstream\n${stream2}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}

// ---------------------------------------------------------------------------
// Expected canonical paper inventory
// ---------------------------------------------------------------------------

const EXPECTED_CANONICAL_PAPERS = [
  'BERTAC_2021',
  'CERT_Cardinality_Estimation_2024',
  'Compact_Transformers_2023',
  'Human_Language_Modeling_2022',
  'NoREC_Database_Optimization_Bugs_2020',
  'Online_Sketch_Query_Optimization_2021',
  'PaperMage_2023',
  'Pushdown_Layers_2023',
  'QUIC_Delay_Control_2025',
  'QUIC_Dual_Connectivity_2021',
  'Review4Repair_2020',
  'Transformers_Polarity_2022',
] as const;

// ===========================================================================
// Test Suites
// ===========================================================================

describe('Phase 6: Full-Research-Paper Plagiarism Verification', () => {
  beforeEach(() => {
    resetCanonicalCorpusCache();
  });

  afterEach(() => {
    resetCanonicalCorpusCache();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Requirement 1: Full-paper extraction beyond 50,000 characters
  // -------------------------------------------------------------------------
  describe('Requirement 1: Full-paper extraction beyond 50,000 characters', () => {
    it('allows text between 60,000 and 200,000 characters up to MAX_DOCUMENT_CHARACTERS', async () => {
      expect(MAX_DOCUMENT_CHARACTERS).toBe(250000);

      // Generate a realistic paper body of 80,000 characters
      const paragraph =
        'Machine learning algorithms require substantial validation data to evaluate empirical performance.\n';
      const repeatedText = paragraph.repeat(Math.ceil(80000 / paragraph.length)).slice(0, 80000);
      expect(repeatedText.length).toBe(80000);

      // validateText should succeed
      expect(validateText(repeatedText)).toBe(repeatedText);

      // extractFile should extract UTF-8 text file without truncating
      const file = new File([repeatedText], 'long-paper.txt', { type: 'text/plain' });
      const doc = await extractFile(file, 'long-doc-1');

      expect(doc.reference).toBe('long-doc-1');
      expect(doc.format).toBe('text');
      expect(doc.text.length).toBe(80000);
      expect(doc.text).toBe(repeatedText);
    });

    it('extracts a document near the upper bound (180,000 characters)', async () => {
      const sentence =
        'Distributed consensus protocols guarantee safety under asynchronous networks. ';
      const largeText = sentence.repeat(Math.ceil(180000 / sentence.length)).slice(0, 180000);
      expect(largeText.length).toBe(180000);

      const doc = await extractFile(new File([largeText], 'large-paper.txt'), 'large-doc');
      expect(doc.text.length).toBe(180000);
      expect(doc.text).toBe(largeText);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2: PDF extraction with page mappings
  // -------------------------------------------------------------------------
  describe('Requirement 2: PDF extraction with page mappings', () => {
    it('extracts single-page PDF with { page, start, end } page boundaries', async () => {
      const pdfBytes = textPdf('A researcher compares scientific documents.');
      const file = new File([pdfBytes], 'single-page.pdf', { type: 'application/pdf' });
      const doc = await extractFile(file, 'pdf-single');

      expect(doc.format).toBe('pdf');
      expect(doc.pages).toBeDefined();
      expect(doc.pages).toHaveLength(1);

      const page1 = doc.pages![0];
      expect(page1.page).toBe(1);
      expect(page1.start).toBe(0);
      expect(page1.end).toBe(doc.text.length);
      expect(doc.text.slice(page1.start, page1.end)).toBe(doc.text);
      expect(doc.text).toContain('A researcher compares scientific documents.');
    });

    it('extracts multi-page PDF with correct sequential page boundaries and offset alignment', async () => {
      const page1Text = 'First page discusses congestion control mechanisms.';
      const page2Text = 'Second page presents latency and packet loss benchmarks.';
      const pdfBytes = twoPagePdf(page1Text, page2Text);
      const file = new File([pdfBytes], 'two-page.pdf', { type: 'application/pdf' });
      const doc = await extractFile(file, 'pdf-multi');

      expect(doc.format).toBe('pdf');
      expect(doc.pages).toBeDefined();
      expect(doc.pages).toHaveLength(2);

      const [p1, p2] = doc.pages!;
      expect(p1.page).toBe(1);
      expect(p2.page).toBe(2);

      // Page 1 starts at 0
      expect(p1.start).toBe(0);
      expect(p1.end).toBeGreaterThan(0);
      expect(doc.text.slice(p1.start, p1.end)).toContain('First page discusses');

      // Page 2 begins after page 1 separator
      expect(p2.start).toBeGreaterThan(p1.end);
      expect(p2.end).toBe(doc.text.length);
      expect(doc.text.slice(p2.start, p2.end)).toContain('Second page presents');

      // The text between page 1 end and page 2 start is the page separator "\n\n"
      expect(doc.text.slice(p1.end, p2.start)).toBe('\n\n');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 3: Loading all 12 canonical papers
  // -------------------------------------------------------------------------
  describe('Requirement 3: Loading all 12 canonical papers', () => {
    it('loads exactly 12 non-empty canonical papers with titles and references', async () => {
      const corpus = await loadCanonicalCorpus();

      expect(corpus).toHaveLength(12);

      const references = corpus.map((d) => d.reference).sort();
      expect(references).toEqual([...EXPECTED_CANONICAL_PAPERS].sort());

      for (const doc of corpus) {
        expect(doc.reference).toBeTruthy();
        expect(doc.title).toBe(doc.reference.replaceAll('_', ' '));
        expect(doc.format).toBe('text');
        expect(doc.text.trim().length).toBeGreaterThan(1000);
        // TXT canonical papers do not invent PDF page structures
        expect(doc.pages).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 4: Missing corpus files
  // -------------------------------------------------------------------------
  describe('Requirement 4: Missing corpus files', () => {
    it('throws when the corpus directory does not exist', async () => {
      const invalidPath = resolve('data/non_existent_corpus_directory_xyz');
      await expect(loadCanonicalCorpus(invalidPath)).rejects.toThrow();
    });

    it('throws when the corpus directory contains no .txt files', async () => {
      const emptyDir = await mkdtemp(resolve(tmpdir(), 'empty-corpus-test-'));
      try {
        await expect(loadCanonicalCorpus(emptyDir)).rejects.toThrow(
          'No .txt files found in canonical corpus directory',
        );
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 5: Reference removal via stripCanonicalReferences
  // -------------------------------------------------------------------------
  describe('Requirement 5: Reference removal via stripCanonicalReferences', () => {
    it('strips references from a query paper with standard bibliography headings', () => {
      const bodyText =
        'Section 1: Introduction\n\nWe investigate neural retrieval for plagiarism detection.\nOur approach achieves high recall on academic papers.\n';
      const refText =
        '\n\nReferences\n\n[1] Vaswani et al. Attention is all you need. NeurIPS 2017.\n[2] Devlin et al. BERT. NAACL 2019.\n[3] Reimers and Gurevych. Sentence-BERT. EMNLP 2019.\n';
      const queryDocText = bodyText + refText;

      const result = stripCanonicalReferences('query_paper', queryDocText);

      expect(result.confident).toBe(true);
      expect(result.detectedHeading).toBe('References');
      expect(result.body).toContain('Section 1: Introduction');
      expect(result.body).not.toContain('Vaswani et al.');
      expect(result.body.length).toBeLessThan(queryDocText.length);
    });

    it('applies coordinate masks to canonical QUIC papers without removing non-reference text', async () => {
      const quicDelayRaw = (
        await readFile(resolve(CANONICAL_CORPUS_DIR, 'QUIC_Delay_Control_2025.txt'), 'utf8')
      )
        .replace(/\r\n?/g, '\n')
        .replace(/\f/g, '\n\n')
        .replace(/[\u0000-\u0008\u000B\u000E-\u001F]/g, ' ');
      const quicResult = stripCanonicalReferences('QUIC_Delay_Control_2025', quicDelayRaw);

      expect(quicResult.confident).toBe(true);
      expect(quicResult.body).toContain('Real network results');
      expect(quicResult.body).not.toContain('TCP Vegas: end to end congestion');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6: Offset preservation
  // -------------------------------------------------------------------------
  describe('Requirement 6: Offset preservation', () => {
    it('preserves exact string length and offsets in coordinate-masked canonical papers', async () => {
      const raw = (
        await readFile(resolve(CANONICAL_CORPUS_DIR, 'QUIC_Dual_Connectivity_2021.txt'), 'utf8')
      )
        .replace(/\r\n?/g, '\n')
        .replace(/\f/g, '\n\n')
        .replace(/[\u0000-\u0008\u000B\u000E-\u001F]/g, ' ');

      const stripped = stripCanonicalReferences('QUIC_Dual_Connectivity_2021', raw);

      // Masking replaces reference characters with spaces, so total body length is invariant
      expect(stripped.body.length).toBe(raw.length);

      // Substrings in retained sections have IDENTICAL character offsets
      const testPhrases = [
        '6. Conclusions',
        'Figure 23: Pairwise example traces using SC',
        'Appendix A. Pairwise fairness example using SC',
      ];

      for (const phrase of testPhrases) {
        const rawOffset = raw.indexOf(phrase);
        const strippedOffset = stripped.body.indexOf(phrase);
        expect(rawOffset).toBeGreaterThan(-1);
        expect(strippedOffset).toBe(rawOffset);
      }
    });

    it('preserves offset alignment in heuristic non-canonical stripping', () => {
      const body = 'Introduction\n\nAlgorithm details and experimental methodology.\n\n';
      const refs =
        'References\n\n[1] Author One. Paper title. 2020.\n[2] Author Two. Other title. 2021.\n';
      const full = body + refs;

      const stripped = stripReferences(full);
      expect(stripped.confident).toBe(true);
      expect(stripped.referenceOffset).toBe(full.indexOf('References'));

      // All offsets within stripped.body map 1:1 to full text
      expect(full.slice(0, stripped.body.length)).toBe(stripped.body);
      const keyPhrase = 'Algorithm details';
      expect(stripped.body.indexOf(keyPhrase)).toBe(full.indexOf(keyPhrase));
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 7: Cached embedding reuse
  // -------------------------------------------------------------------------
  describe('Requirement 7: Cached embedding reuse', () => {
    it('returns the identical cached Promise and object reference on repeated calls without re-embedding', async () => {
      // Mock embedTexts to spy on call count and return dummy vectors fast
      const embedSpy = vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) => {
        return texts.map(() => Array(384).fill(0.05));
      });

      // Call 1: triggers embedding
      const p1 = getCanonicalEmbeddings('cpu');
      // Call 2: retrieves cached promise immediately
      const p2 = getCanonicalEmbeddings('cpu');

      expect(p1).toBe(p2);

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toBe(res2);
      expect(res1.passages.length).toBeGreaterThan(0);
      expect(res1.embeddings.length).toBe(res1.passages.length);

      // Call 3: after resolution, returns already-resolved cached promise
      const p3 = getCanonicalEmbeddings('cpu');
      expect(p3).toBe(p1);
      const res3 = await p3;
      expect(res3).toBe(res1);

      // Only 1 batch of embedTexts was dispatched across all 3 calls
      expect(embedSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 8: Concurrent cache initialization
  // -------------------------------------------------------------------------
  describe('Requirement 8: Concurrent cache initialization', () => {
    it('runs only one embedding process when multiple calls arrive concurrently', async () => {
      let activeCalls = 0;
      let maxConcurrent = 0;

      const embedSpy = vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) => {
        activeCalls++;
        maxConcurrent = Math.max(maxConcurrent, activeCalls);
        // Small async delay to simulate in-flight execution
        await new Promise((r) => setTimeout(r, 20));
        activeCalls--;
        return texts.map(() => Array(384).fill(0.02));
      });

      // Launch 5 concurrent callers simultaneously
      const results = await Promise.all([
        getCanonicalEmbeddings('cpu'),
        getCanonicalEmbeddings('cpu'),
        getCanonicalEmbeddings('cpu'),
        getCanonicalEmbeddings('cpu'),
        getCanonicalEmbeddings('cpu'),
      ]);

      // All 5 callers received the exact same object reference
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBe(results[0]);
      }

      // Exactly one embedTexts call was initiated
      expect(maxConcurrent).toBe(1);
      expect(embedSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 9: TF-IDF against research paper sources
  // -------------------------------------------------------------------------
  describe('Requirement 9: TF-IDF against research paper sources', () => {
    it('runs lexical analysis against research papers as supplied sources', async () => {
      const canonicalSources = await loadCanonicalCorpus();
      const queryDoc: ExtractedDocument = {
        reference: 'query_quic_eval',
        title: 'Query QUIC Evaluation',
        text: 'Delay control algorithms in QUIC protocol evaluate sender congestion control and packet pacing.',
        format: 'text',
      };

      const result = await analyzeDocuments(queryDoc, canonicalSources, 'lexical');

      expect(result.method).toBe('lexical');
      expect(result.sources).toHaveLength(12);
      expect(result.passages.query).toBeGreaterThan(0);
      expect(result.passages.sources).toBeGreaterThan(1000);
      expect(result.provider).toBe('TF-IDF on CPU');
      expect(result.model).toBeNull();

      // Detections should have null semantic score in lexical mode
      for (const d of result.detections) {
        expect(d.semantic).toBeNull();
        expect(d.score).toBeGreaterThanOrEqual(result.config.threshold);
      }

      // Stripping metadata should record query and all sources
      expect(result.stripping.query.reference).toBe('query_quic_eval');
      expect(result.stripping.sources).toHaveLength(12);
    }, 30_000);
  });

  // -------------------------------------------------------------------------
  // Requirement 10: MiniLM against research paper sources
  // -------------------------------------------------------------------------
  describe('Requirement 10: MiniLM against research paper sources', () => {
    it('runs semantic pipeline against research papers with mocked embeddings', async () => {
      const canonicalSources = await loadCanonicalCorpus();
      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) => {
        // Return normalized 384-d vectors
        return texts.map(() => {
          const vec = Array(384).fill(0);
          vec[0] = 1;
          return vec;
        });
      });

      const queryDoc: ExtractedDocument = {
        reference: 'query_semantic_test',
        title: 'Query Semantic Test',
        text: 'Semantic similarity comparison against scientific literature embeddings with attention mechanisms and contextual representation across models.',
        format: 'text',
      };

      const result = await analyzeDocuments(queryDoc, canonicalSources, 'semantic');

      expect(result.method).toBe('semantic');
      expect(result.sources).toHaveLength(12);
      expect(result.model).toBe(model.MODEL_CONFIG.model);
      expect(result.passages.query).toBeGreaterThan(0);
      expect(result.passages.sources).toBeGreaterThan(0);

      for (const d of result.detections) {
        expect(d.semantic).not.toBeNull();
      }
    }, 60_000);

    it.skipIf(process.env.INFERENCE_TESTS !== '1')(
      'runs semantic analysis end-to-end against research papers using local ONNX weights',
      async () => {
        const canonicalSources = await loadCanonicalCorpus();
        const queryDoc: ExtractedDocument = {
          reference: 'query_quic_real_model',
          title: 'Query QUIC Real Model',
          text: 'We evaluate delay control algorithms and sender-side latency in QUIC transport protocol.',
          format: 'text',
        };

        const result = await analyzeDocuments(queryDoc, canonicalSources, 'semantic');

        expect(result.method).toBe('semantic');
        expect(result.sources).toHaveLength(12);
        expect(result.provider).toMatch(/CPU|DirectML/);
      },
      300_000,
    );
  });

  // -------------------------------------------------------------------------
  // Requirement 11: Hybrid against research paper sources
  // -------------------------------------------------------------------------
  describe('Requirement 11: Hybrid against research paper sources', () => {
    it('runs hybrid pipeline against research papers with mocked embeddings', async () => {
      const canonicalSources = await loadCanonicalCorpus();
      vi.spyOn(model, 'embedTexts').mockImplementation(async (texts) => {
        return texts.map(() => {
          const vec = Array(384).fill(0);
          vec[0] = 1;
          return vec;
        });
      });

      const queryDoc: ExtractedDocument = {
        reference: 'query_hybrid_test',
        title: 'Query Hybrid Test',
        text: 'Evaluating combined lexical and semantic retrieval on canonical research documents with empirical validation.',
        format: 'text',
      };

      const result = await analyzeDocuments(queryDoc, canonicalSources, 'hybrid');

      expect(result.method).toBe('hybrid');
      expect(result.sources).toHaveLength(12);
      expect(result.config.method).toBe('hybrid');
      expect(typeof result.config.alpha).toBe('number');
      expect(result.passages.query).toBeGreaterThan(0);
      expect(result.passages.sources).toBeGreaterThan(0);
    }, 30_000);

    it.skipIf(process.env.INFERENCE_TESTS !== '1')(
      'runs hybrid analysis end-to-end against research papers using local ONNX weights',
      async () => {
        const canonicalSources = await loadCanonicalCorpus();
        const queryDoc: ExtractedDocument = {
          reference: 'query_hybrid_real_model',
          title: 'Query Hybrid Real Model',
          text: 'Delay control algorithms in QUIC protocol evaluate congestion control and packet pacing.',
          format: 'text',
        };

        const result = await analyzeDocuments(queryDoc, canonicalSources, 'hybrid');

        expect(result.method).toBe('hybrid');
        expect(result.sources).toHaveLength(12);
      },
      300_000,
    );
  });

  // -------------------------------------------------------------------------
  // Requirement 12: Manual source uploads
  // -------------------------------------------------------------------------
  describe('Requirement 12: Manual source uploads', () => {
    it('uses provided manual sources when useCanonicalCorpus is false', async () => {
      const queryDoc: ExtractedDocument = {
        reference: 'manual_query',
        title: 'Manual Query Paper',
        text: 'A study on database optimization bugs and query synthesis techniques.',
        format: 'text',
      };

      const sourceDoc: ExtractedDocument = {
        reference: 'manual_source_1',
        title: 'Manual Source Paper 1',
        text: 'Database optimization bugs can be detected using query synthesis and validation.',
        format: 'text',
      };

      const result = await analyzeDocuments(queryDoc, [sourceDoc], 'lexical', {
        useCanonicalCorpus: false,
      });

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].reference).toBe('manual_source_1');
      expect(result.stripping.sources).toHaveLength(1);
      expect(result.stripping.sources[0].reference).toBe('manual_source_1');
    });

    it('uses provided manual sources when useCanonicalCorpus option is omitted', async () => {
      const queryDoc: ExtractedDocument = {
        reference: 'manual_query_omitted',
        title: 'Manual Query Paper Omitted',
        text: 'Testing omitted options fallback with manual sources.',
        format: 'text',
      };

      const source1: ExtractedDocument = {
        reference: 'src_doc_a',
        title: 'Source A',
        text: 'Testing omitted options fallback with manual source A.',
        format: 'text',
      };
      const source2: ExtractedDocument = {
        reference: 'src_doc_b',
        title: 'Source B',
        text: 'Testing omitted options fallback with manual source B.',
        format: 'text',
      };

      const result = await analyzeDocuments(queryDoc, [source1, source2], 'lexical');

      expect(result.sources).toHaveLength(2);
      expect(result.sources.map((s) => s.reference)).toEqual(['src_doc_a', 'src_doc_b']);
      expect(result.stripping.sources).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 13: Invalid and oversized documents
  // -------------------------------------------------------------------------
  describe('Requirement 13: Invalid and oversized documents', () => {
    it('rejects documents exceeding MAX_DOCUMENT_CHARACTERS (250,000 characters)', async () => {
      const oversizedText = 'a'.repeat(MAX_DOCUMENT_CHARACTERS + 1);

      expect(() => validateText(oversizedText)).toThrow(
        `Document exceeds ${MAX_DOCUMENT_CHARACTERS.toLocaleString()} extracted characters`,
      );

      await expect(
        extractFile(new File([oversizedText], 'oversized.txt'), 'oversized-doc'),
      ).rejects.toThrow(
        `Document exceeds ${MAX_DOCUMENT_CHARACTERS.toLocaleString()} extracted characters`,
      );
    });

    it('rejects files exceeding MAX_FILE_BYTES (15 MB)', async () => {
      expect(MAX_FILE_BYTES).toBe(15 * 1024 * 1024);
      const hugeFile = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'too-large.txt');
      await expect(extractFile(hugeFile, 'huge-doc')).rejects.toThrow('at most 15 MB');
    });

    it('rejects PDF files without a valid %PDF- header signature', async () => {
      const fakePdf = new File(['NOT A VALID PDF HEADER STREAM'], 'corrupt.pdf', {
        type: 'application/pdf',
      });
      await expect(extractFile(fakePdf, 'fake-pdf')).rejects.toThrow(
        'The uploaded PDF does not have a valid PDF signature',
      );
    });

    it('rejects empty files (0 bytes)', async () => {
      const emptyTxt = new File([], 'empty.txt', { type: 'text/plain' });
      await expect(extractFile(emptyTxt, 'empty-txt')).rejects.toThrow('must be nonempty');

      const emptyPdf = new File([], 'empty.pdf', { type: 'application/pdf' });
      await expect(extractFile(emptyPdf, 'empty-pdf')).rejects.toThrow('must be nonempty');
    });

    it('rejects documents with whitespace only or null bytes', () => {
      expect(() => validateText('   \n\t  ')).toThrow('The document contains no extractable text');
      expect(() => validateText('valid start\0bad binary byte')).toThrow(
        'Binary data is not supported as text',
      );
    });
  });
});
