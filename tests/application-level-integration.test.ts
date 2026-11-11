/**
 * APPLICATION-LEVEL INTEGRATION TEST
 *
 * End-to-end verification that the production application handles PDF uploads,
 * extracts content, performs detection, and displays results correctly.
 *
 * This test simulates the actual user workflow:
 * 1. Upload a PDF file via the upload interface
 * 2. Select detection method (TF-IDF / MiniLM / Hybrid)
 * 3. Choose to search against manual sources
 * 4. Receive detection results with proper metadata
 * 5. Verify passages, offsets, page numbers, and source evidence
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDocuments } from '../src/lib/application/analysis';
import { extractFile } from '../src/lib/documents/extract';

async function loadPdfAsFile(path: string): Promise<File> {
  const bytes = await readFile(path);
  const name = path.split(/[\\/]/).at(-1)!;
  return new File([bytes], name, { type: 'application/pdf' });
}

describe('APPLICATION: PDF plagiarism analysis workflow', () => {
  it('completes a full TF-IDF analysis workflow with PDF upload and multiple sources', async () => {
    // Simulate: User uploads a PDF file
    console.log('\n=== USER ACTION: Upload PDF ===');
    const queryFile = await loadPdfAsFile(resolve('.cache/quic-pdfs/QUIC_Delay_Control_2025.pdf'));
    console.log(`Uploaded: ${queryFile.name} (${(queryFile.size / 1024).toFixed(0)} KB)`);

    // Extract document
    const queryDoc = await extractFile(queryFile, 'user-upload-query');
    expect(queryDoc.format).toBe('pdf');
    expect(queryDoc.pages).toBeDefined();
    console.log(
      `Extracted: ${queryDoc.text.length} chars, ${queryDoc.pages!.length} pages, ${queryDoc.text.split(/\s+/).length} words`,
    );

    // Simulate: User provides 2 source documents (manually uploaded)
    console.log('\n=== USER ACTION: Upload sources ===');
    const sourceText1 = `
QUIC Protocol Implementation: Congestion Control
The QUIC transport protocol implements multiple congestion control algorithms
including delay-based and loss-based approaches. Modern implementations use
sender-side congestion control to adapt packet transmission rates based on
network conditions and delay feedback from receivers.
      `;
    const sourceText2 = `
Network Performance: Packet Scheduling and Rate Control
Network protocols require careful management of packet transmission rates.
This paper evaluates scheduling algorithms and their impact on latency.
      `;

    const sources = [
      {
        reference: 'user-source-1',
        title: 'QUIC Congestion Control Paper',
        text: sourceText1,
        format: 'text' as const,
      },
      {
        reference: 'user-source-2',
        title: 'Network Performance Paper',
        text: sourceText2,
        format: 'text' as const,
      },
    ];

    console.log(`Source 1: ${sourceText1.length} chars`);
    console.log(`Source 2: ${sourceText2.length} chars`);

    // Simulate: User selects TF-IDF method and clicks "Analyze"
    console.log('\n=== USER ACTION: Select method & analyze ===');
    console.log('Method: TF-IDF (Lexical similarity)');
    console.log('Target: Manual sources (2 papers)');

    const result = await analyzeDocuments(queryDoc, sources, 'lexical');

    // Verify result structure matches API contract
    expect(result.method).toBe('lexical');
    expect(result.query.text.length).toBeGreaterThan(0);
    expect(result.query.pages).toBeDefined();
    expect(result.query.reference).toBe('user-upload-query');

    expect(result.sources).toHaveLength(2);
    expect(result.sources.map((s) => s.reference)).toEqual(['user-source-1', 'user-source-2']);

    // Verify passage counts for display
    console.log('\n=== RESULTS METADATA ===');
    console.log(`Query passages: ${result.passages.query}`);
    console.log(`Source passages: ${result.passages.sources}`);
    console.log(`Detections: ${result.detections.length}`);
    console.log(`Method: ${result.method}`);
    console.log(`Threshold: ${result.config.threshold}`);
    console.log(`Execution time: ${result.elapsedSeconds.toFixed(2)}s`);

    expect(result.passages.query).toBeGreaterThan(0);
    expect(result.passages.sources).toBeGreaterThan(0);
    expect(typeof result.elapsedSeconds).toBe('number');
    expect(result.elapsedSeconds).toBeGreaterThan(0);

    // Verify all detections have required fields for UI display
    console.log('\n=== DETECTION STRUCTURE VALIDATION ===');
    for (const detection of result.detections) {
      // Passage location in query document
      expect(detection.suspiciousSpan.offset).toBeGreaterThanOrEqual(0);
      expect(detection.suspiciousSpan.length).toBeGreaterThan(0);
      expect(detection.suspiciousSpan.offset + detection.suspiciousSpan.length).toBeLessThanOrEqual(
        result.query.text.length,
      );

      // Passage location in source document
      expect(detection.sourceSpan.offset).toBeGreaterThanOrEqual(0);
      expect(detection.sourceSpan.length).toBeGreaterThan(0);

      // Source identification
      expect(detection.sourceReference).toBeTruthy();
      expect(['user-source-1', 'user-source-2']).toContain(detection.sourceReference);

      // Scores
      expect(detection.lexical).toBeGreaterThanOrEqual(0);
      expect(detection.lexical).toBeLessThanOrEqual(1);
      expect(detection.semantic).toBeNull(); // Lexical mode doesn't compute semantic

      // Similarity score above threshold
      expect(detection.score).toBeGreaterThanOrEqual(result.config.threshold);

      // UI metadata
      expect(detection.evidenceWindows).toBeGreaterThanOrEqual(1);
    }

    if (result.detections.length > 0) {
      console.log(`Top detection:`);
      const top = result.detections.reduce((a, b) => (a.score > b.score ? a : b));
      console.log(`  Source: ${top.sourceReference}`);
      console.log(`  Score: ${top.score.toFixed(3)}`);
      console.log(
        `  Query span: ${top.suspiciousSpan.offset}-${top.suspiciousSpan.offset + top.suspiciousSpan.length}`,
      );
      console.log(
        `  Source span: ${top.sourceSpan.offset}-${top.sourceSpan.offset + top.sourceSpan.length}`,
      );

      // Verify excerpt extraction works
      const queryExcerpt = result.query.text.slice(
        top.suspiciousSpan.offset,
        top.suspiciousSpan.offset + Math.min(top.suspiciousSpan.length, 100),
      );
      expect(queryExcerpt.trim().length).toBeGreaterThan(0);
      console.log(`  Query excerpt: "${queryExcerpt.trim()}..."`);
    }

    // Verify page metadata for multi-page PDFs
    console.log('\n=== PAGE METADATA VALIDATION ===');
    if (result.query.pages && result.query.pages.length > 1) {
      console.log(`Pages: ${result.query.pages.length}`);
      for (let i = 0; i < result.query.pages.length; i++) {
        const p = result.query.pages[i];
        expect(p.page).toBe(i + 1);
        expect(p.start).toBeGreaterThanOrEqual(0);
        expect(p.end).toBeGreaterThan(p.start);
        if (i < result.query.pages.length - 1) {
          const next = result.query.pages[i + 1];
          expect(next.start).toBe(p.end + 2); // \n\n separator
        }
      }
      console.log(`  Page boundaries correctly sequential ✓`);

      // Verify detection can map to page numbers
      for (const d of result.detections.slice(0, 3)) {
        const pageNum = result.query.pages.find(
          (p) => d.suspiciousSpan.offset >= p.start && d.suspiciousSpan.offset < p.end,
        )?.page;
        if (pageNum) {
          console.log(`  Detection at offset ${d.suspiciousSpan.offset} → Page ${pageNum}`);
        }
      }
    }

    // Verify reference stripping metadata
    console.log('\n=== REFERENCE STRIPPING METADATA ===');
    expect(result.stripping).toBeDefined();
    expect(result.stripping.query).toBeDefined();
    expect(result.stripping.sources).toHaveLength(2);
    console.log(
      `Query: ${result.stripping.query.charsRemoved} chars removed (confident: ${result.stripping.query.confident})`,
    );
    console.log(
      `Sources stripped: ${result.stripping.sources.filter((s) => s.charsRemoved > 0).length} of 2`,
    );

    // Verify disclaimer is present (required by project spec)
    expect(result.warning).toContain('Similarity scores are uncalibrated evidence');

    console.log('\n=== RESULT: PASS ===');
    console.log('All UI requirements met for production display');
  }, 180_000);

  it('handles corpus option correctly without loading canonical papers', async () => {
    // Verify default behavior: manual sources only
    const queryFile = await loadPdfAsFile(resolve('.cache/quic-pdfs/QUIC_Delay_Control_2025.pdf'));
    const queryDoc = await extractFile(queryFile, 'test-query');

    const manualSources = [
      {
        reference: 'manual-source-1',
        title: 'Manual Source',
        text: 'This is a test source document.',
        format: 'text' as const,
      },
    ];

    // Default call: no useCorpus
    const result1 = await analyzeDocuments(queryDoc, manualSources, 'lexical');
    expect(result1.sources).toHaveLength(1);
    expect(result1.sources[0].reference).toBe('manual-source-1');

    // Explicit useCorpus: false
    const result2 = await analyzeDocuments(queryDoc, manualSources, 'lexical', {
      useCorpus: false,
    });
    expect(result2.sources).toHaveLength(1);
    expect(result2.sources[0].reference).toBe('manual-source-1');

    // Explicit useCorpus: true should fail (no corpus)
    await expect(
      analyzeDocuments(queryDoc, manualSources, 'lexical', { useCorpus: true }),
    ).rejects.toThrow('Corpus contains no ready documents');

    console.log('✓ Corpus independence verified: manual sources default, no canonical auto-load');
  }, 120_000);
});
