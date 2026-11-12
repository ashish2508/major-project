/**
 * End-to-end test: full research-paper PDF through the actual analysis pipeline.
 *
 * Uses the QUIC PDFs cached in .cache/quic-pdfs/ — real multi-page academic papers.
 * Exercises: PDF extraction → reference stripping → segmentation → TF-IDF / MiniLM / Hybrid
 * detection against the 12 canonical corpus papers (supplied as sources directly, not via
 * persistent corpus, to avoid needing a live corpus dir with embeddings).
 *
 * No mocking of embedTexts: the INFERENCE_TESTS guard keeps MiniLM/hybrid behind
 * process.env.INFERENCE_TESTS === '1', identical to the existing model integration test.
 * TF-IDF is always exercised because it needs no model.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDocuments } from '../src/lib/application/analysis';
import {
  loadCanonicalCorpus,
  resetCanonicalCorpusCache,
} from '../src/lib/application/canonical-corpus';
import { extractFile, MAX_DOCUMENT_CHARACTERS } from '../src/lib/documents/extract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const QUIC_DELAY_PDF = resolve('.cache/quic-pdfs/QUIC_Delay_Control_2025.pdf');
const QUIC_DUAL_PDF = resolve('.cache/quic-pdfs/QUIC_Dual_Connectivity_2021.pdf');

async function loadPdfAsFile(path: string): Promise<File> {
  const bytes = await readFile(path);
  const name = path.split(/[\\/]/).at(-1)!;
  return new File([bytes], name, { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: Full research-paper PDF through the analysis pipeline', () => {
  // -------------------------------------------------------------------------
  // 1. Extraction verification — QUIC_Delay_Control_2025.pdf (7 pages)
  // -------------------------------------------------------------------------
  describe('PDF extraction — QUIC_Delay_Control_2025.pdf', () => {
    it('extracts the full paper without truncation', async () => {
      const file = await loadPdfAsFile(QUIC_DELAY_PDF);
      expect(file.size).toBeGreaterThan(100_000);

      const doc = await extractFile(file, 'QUIC_Delay_Control_2025');

      // Basic shape
      expect(doc.format).toBe('pdf');
      expect(doc.reference).toBe('QUIC_Delay_Control_2025');
      expect(doc.title).toBe('QUIC_Delay_Control_2025.pdf');

      // All 7 pages extracted
      expect(doc.pages).toBeDefined();
      expect(doc.pages!.length).toBe(7);

      // PDF.js extracts 29,119 characters from this 7-page paper.
      // Multi-column layout and math symbols mean PDF.js recovers less than the
      // purpose-built canonical .txt (47,117 chars) — this is the full, untruncated
      // extraction; there is no silent cutoff.
      expect(doc.text.length).toBeGreaterThan(20_000);
      expect(doc.text.length).toBeLessThanOrEqual(MAX_DOCUMENT_CHARACTERS);

      // No silent truncation: last page boundary must equal total text length
      const lastPage = doc.pages![doc.pages!.length - 1];
      expect(lastPage.end).toBe(doc.text.length);
      expect(lastPage.page).toBe(7);

      // Pages are sequential with no gaps between ends
      for (let i = 1; i < doc.pages!.length; i++) {
        const prev = doc.pages![i - 1];
        const curr = doc.pages![i];
        // The only allowed gap is the '\n\n' page separator (2 chars)
        expect(curr.start - prev.end).toBe(2);
        expect(curr.page).toBe(i + 1);
      }

      // Every page boundary is consistent with the text slice
      for (const p of doc.pages!) {
        const slice = doc.text.slice(p.start, p.end);
        expect(slice.length).toBeGreaterThan(0);
      }

      // Paper-specific content present
      expect(doc.text).toMatch(/QUIC/i);
      expect(doc.text).toMatch(/congestion|delay|control/i);

      console.log(
        `  QUIC_Delay_Control_2025.pdf: ${doc.text.length} chars, ${doc.pages!.length} pages`,
      );
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  // 2. Extraction verification — QUIC_Dual_Connectivity_2021.pdf (14 pages)
  // -------------------------------------------------------------------------
  describe('PDF extraction — QUIC_Dual_Connectivity_2021.pdf', () => {
    it('extracts the full paper without truncation', async () => {
      const file = await loadPdfAsFile(QUIC_DUAL_PDF);
      expect(file.size).toBeGreaterThan(1_000_000);

      const doc = await extractFile(file, 'QUIC_Dual_Connectivity_2021');

      expect(doc.format).toBe('pdf');
      expect(doc.pages).toBeDefined();
      expect(doc.pages!.length).toBe(14);

      // PDF.js extracts 69,397 characters from this 14-page paper.
      // The canonical .txt (205,886 chars) was built with a separate layout-aware
      // pipeline. This is the full, untruncated PDF.js extraction.
      expect(doc.text.length).toBeGreaterThan(60_000);
      expect(doc.text.length).toBeLessThanOrEqual(MAX_DOCUMENT_CHARACTERS);

      // Last page boundary must equal text length
      const lastPage = doc.pages![doc.pages!.length - 1];
      expect(lastPage.end).toBe(doc.text.length);
      expect(lastPage.page).toBe(14);

      // Sequential page boundaries
      for (let i = 1; i < doc.pages!.length; i++) {
        const prev = doc.pages![i - 1];
        const curr = doc.pages![i];
        expect(curr.start - prev.end).toBe(2);
      }

      expect(doc.text).toMatch(/QUIC/i);

      console.log(
        `  QUIC_Dual_Connectivity_2021.pdf: ${doc.text.length} chars, ${doc.pages!.length} pages`,
      );
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  // 3. Segmentation depth — no passages silently skipped
  // -------------------------------------------------------------------------
  describe('Segmentation — QUIC_Delay_Control_2025.pdf', () => {
    it('produces passages spanning the full document with valid offsets', async () => {
      const { segmentParagraphs } = await import('../src/lib/detection/segmentation');
      const { tokenCounter } = await import('../src/lib/embeddings/model');
      const { stripCanonicalReferences } = await import('../src/lib/detection/strip-references');

      const file = await loadPdfAsFile(QUIC_DELAY_PDF);
      const doc = await extractFile(file, 'QUIC_Delay_Control_2025');

      const stripped = stripCanonicalReferences('QUIC_Delay_Control_2025', doc.text);
      const countTokens = await tokenCounter();

      const passages = segmentParagraphs(
        stripped.body,
        'QUIC_Delay_Control_2025',
        { countTokens },
        doc.paragraphBreaks,
      );

      // Must produce a substantial number of passages
      expect(passages.length).toBeGreaterThan(50);

      // Every passage must have valid, non-negative offset
      for (const p of passages) {
        expect(p.offset).toBeGreaterThanOrEqual(0);
        expect(p.length).toBeGreaterThan(0);
        expect(p.offset + p.length).toBeLessThanOrEqual(stripped.body.length);
        expect(p.text.trim().length).toBeGreaterThan(0);
        // Token budget respected
        const tokens = countTokens(p.text);
        expect(tokens).toBeLessThanOrEqual(256);
        expect(tokens).toBeGreaterThan(0);
      }

      // The first passage starts at or near the document beginning
      const firstOffset = Math.min(...passages.map((p) => p.offset));
      expect(firstOffset).toBeLessThan(500);

      // The last passage covers text in the second half of the document
      const lastOffset = Math.max(...passages.map((p) => p.offset + p.length));
      expect(lastOffset).toBeGreaterThan(stripped.body.length * 0.7);

      console.log(
        `  QUIC_Delay_Control_2025: ${passages.length} passages, ` +
          `offsets ${firstOffset}–${lastOffset} / ${stripped.body.length} chars`,
      );
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  // 4. TF-IDF detection — QUIC_Delay PDF queried against canonical corpus
  //    (No model needed; always runs)
  // -------------------------------------------------------------------------
  describe('TF-IDF analysis — QUIC_Delay PDF vs canonical corpus', () => {
    it('runs lexical analysis to completion and reports query/source passage counts', async () => {
      resetCanonicalCorpusCache();

      const file = await loadPdfAsFile(QUIC_DELAY_PDF);
      const queryDoc = await extractFile(file, 'QUIC_Delay_Control_2025');

      const canonicalSources = await loadCanonicalCorpus();
      expect(canonicalSources.length).toBe(12);

      const result = await analyzeDocuments(queryDoc, canonicalSources, 'lexical');

      // Method and provider
      expect(result.method).toBe('lexical');
      expect(result.provider).toBe('TF-IDF on CPU');
      expect(result.model).toBeNull();

      // The query document is the full PDF.js extraction (not truncated by pipeline)
      // PDF.js extracts 29,119 chars from this 7-page paper
      expect(result.query.text.length).toBeGreaterThan(20_000);
      expect(result.query.pages).toBeDefined();
      expect(result.query.pages!.length).toBe(7);

      // All 12 corpus sources present
      expect(result.sources.length).toBe(12);

      // Both query and sources were segmented into substantial numbers of passages
      expect(result.passages.query).toBeGreaterThan(50);
      expect(result.passages.sources).toBeGreaterThan(1_000);

      // All detections are above the threshold
      for (const d of result.detections) {
        expect(d.score).toBeGreaterThanOrEqual(result.config.threshold);
        expect(d.semantic).toBeNull();

        // Offsets must be valid within the query text
        expect(d.suspiciousSpan.offset).toBeGreaterThanOrEqual(0);
        expect(d.suspiciousSpan.offset + d.suspiciousSpan.length).toBeLessThanOrEqual(
          result.query.text.length,
        );
      }

      // Reference stripping was applied
      expect(result.stripping.query.reference).toBe('QUIC_Delay_Control_2025');
      expect(result.stripping.sources.length).toBe(12);

      // Matching source is in the canonical QUIC papers (lexically similar)
      console.log(
        `  TF-IDF: ${result.detections.length} detections above threshold ${result.config.threshold}`,
      );
      if (result.detections.length > 0) {
        const top = result.detections.reduce((a, b) => (a.score > b.score ? a : b));
        console.log(
          `  Top match: ${top.sourceReference} score=${top.score.toFixed(3)} ` +
            `query[${top.suspiciousSpan.offset}:+${top.suspiciousSpan.length}]`,
        );
        // Page number derivable from query pages
        const page = result.query.pages!.find(
          (p) => top.suspiciousSpan.offset >= p.start && top.suspiciousSpan.offset < p.end,
        );
        if (page) console.log(`  Top match in query page ${page.page}`);
      }
      console.log(
        `  Query passages: ${result.passages.query}, Source passages: ${result.passages.sources}`,
      );
      console.log(`  Elapsed: ${result.elapsedSeconds.toFixed(2)}s`);
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // 5. MiniLM + Hybrid detection — behind INFERENCE_TESTS guard
  // -------------------------------------------------------------------------
  describe('MiniLM / Hybrid analysis — QUIC_Delay PDF vs canonical corpus', () => {
    it.skipIf(process.env.INFERENCE_TESTS !== '1')(
      'runs semantic analysis to completion with real ONNX weights',
      async () => {
        resetCanonicalCorpusCache();

        const file = await loadPdfAsFile(QUIC_DELAY_PDF);
        const queryDoc = await extractFile(file, 'QUIC_Delay_Control_2025');

        const canonicalSources = await loadCanonicalCorpus();

        const result = await analyzeDocuments(queryDoc, canonicalSources, 'semantic');

        expect(result.method).toBe('semantic');
        expect(result.provider).toMatch(/CPU|DirectML/);
        expect(result.model).toBe('onnx-community/all-MiniLM-L6-v2-ONNX');

        expect(result.query.text.length).toBeGreaterThan(20_000);
        expect(result.sources.length).toBe(12);
        expect(result.passages.query).toBeGreaterThan(50);
        expect(result.passages.sources).toBeGreaterThan(1_000);

        for (const d of result.detections) {
          expect(d.score).toBeGreaterThanOrEqual(result.config.threshold);
          expect(d.semantic).not.toBeNull();
          expect(d.suspiciousSpan.offset).toBeGreaterThanOrEqual(0);
          expect(d.suspiciousSpan.offset + d.suspiciousSpan.length).toBeLessThanOrEqual(
            result.query.text.length,
          );
        }

        console.log(
          `  MiniLM: ${result.detections.length} detections, ` +
            `elapsed ${result.elapsedSeconds.toFixed(2)}s`,
        );
      },
      600_000,
    );

    it.skipIf(process.env.INFERENCE_TESTS !== '1')(
      'runs hybrid analysis to completion with real ONNX weights',
      async () => {
        resetCanonicalCorpusCache();

        const file = await loadPdfAsFile(QUIC_DUAL_PDF);
        const queryDoc = await extractFile(file, 'QUIC_Dual_Connectivity_2021');

        const canonicalSources = await loadCanonicalCorpus();

        const result = await analyzeDocuments(queryDoc, canonicalSources, 'hybrid');

        expect(result.method).toBe('hybrid');
        expect(result.query.text.length).toBeGreaterThan(60_000);
        expect(result.query.pages!.length).toBe(14);
        expect(result.sources.length).toBe(12);
        expect(result.passages.query).toBeGreaterThan(100);
        expect(result.passages.sources).toBeGreaterThan(1_000);

        for (const d of result.detections) {
          expect(d.score).toBeGreaterThanOrEqual(result.config.threshold);
          expect(d.suspiciousSpan.offset).toBeGreaterThanOrEqual(0);
          expect(d.suspiciousSpan.offset + d.suspiciousSpan.length).toBeLessThanOrEqual(
            result.query.text.length,
          );
        }

        console.log(
          `  Hybrid: ${result.detections.length} detections, ` +
            `elapsed ${result.elapsedSeconds.toFixed(2)}s`,
        );
      },
      600_000,
    );
  });
});
