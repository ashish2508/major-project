/**
 * Diagnostic: trace passage filtering from 631 segmented → 94 query passages.
 * Identify every filtering stage.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripCanonicalReferences } from '../src/lib/detection/strip-references';
import { extractFile } from '../src/lib/documents/extract';
import { segmentParagraphs, segment } from '../src/lib/detection/segmentation';
import { tokenCounter } from '../src/lib/embeddings/model';
import { retrieveCandidates } from '../src/lib/detection/detector';
import { Tfidf } from '../src/lib/detection/tfidf';

async function loadPdfAsFile(path: string): Promise<File> {
  const bytes = await readFile(path);
  const name = path.split(/[\\/]/).at(-1)!;
  return new File([bytes], name, { type: 'application/pdf' });
}

describe('Diagnose passage filtering', () => {
  it('traces every filtering stage from extraction to retrieval', async () => {
    const file = await loadPdfAsFile(resolve('.cache/quic-pdfs/QUIC_Delay_Control_2025.pdf'));
    const doc = await extractFile(file, 'QUIC_Delay_Control_2025');

    console.log(`\n=== STAGE 1: Extraction ===`);
    console.log(`Raw PDF.js extraction: ${doc.text.length} chars`);
    console.log(`Pages: ${doc.pages?.length}`);
    console.log(`Paragraph breaks detected: ${doc.paragraphBreaks?.length}`);

    // Stage 2: Reference stripping
    console.log(`\n=== STAGE 2: Reference stripping ===`);
    const stripped = stripCanonicalReferences('QUIC_Delay_Control_2025', doc.text);
    console.log(`Body after stripping: ${stripped.body.length} chars`);
    console.log(`Characters removed: ${doc.text.length - stripped.body.length}`);
    console.log(`Stripping confident: ${stripped.confident}`);
    console.log(`Detected heading: ${stripped.detectedHeading}`);

    // Stage 3a: Paragraph segmentation (non-token-aware)
    console.log(`\n=== STAGE 3a: Paragraph segmentation (segment function) ===`);
    const simpleSegments = segment(stripped.body, 'QUIC_Delay_Control_2025');
    console.log(`Simple segments: ${simpleSegments.length}`);
    if (simpleSegments.length > 0) {
      console.log(
        `  First: offset=${simpleSegments[0].offset}, len=${simpleSegments[0].length}, tokens≈${simpleSegments[0].text.split(/\s+/).length}`,
      );
      console.log(
        `  Last: offset=${simpleSegments[simpleSegments.length - 1].offset}, len=${simpleSegments[simpleSegments.length - 1].length}`,
      );
    }

    // Stage 3b: Paragraph-aware segmentation (token-aware)
    console.log(`\n=== STAGE 3b: Paragraph-aware segmentation (segmentParagraphs) ===`);
    const countTokens = await tokenCounter();
    const paraSegments = segmentParagraphs(
      stripped.body,
      'QUIC_Delay_Control_2025',
      { countTokens },
      doc.paragraphBreaks,
    );
    console.log(`Paragraph-aware passages: ${paraSegments.length}`);

    // Distribution
    const tokenCounts = paraSegments.map((p) => countTokens(p.text));
    const avgTokens = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
    const maxTokens = Math.max(...tokenCounts);
    const minTokens = Math.min(...tokenCounts);
    console.log(`  Avg tokens per passage: ${avgTokens.toFixed(1)}`);
    console.log(`  Min tokens: ${minTokens}, Max tokens: ${maxTokens}`);
    console.log(`  Passages exceeding 256 tokens: ${tokenCounts.filter((t) => t > 256).length}`);

    // Coverage by offset
    const coverage = new Set<number>();
    for (const p of paraSegments) {
      for (let i = p.offset; i < p.offset + p.length; i++) {
        coverage.add(i);
      }
    }
    console.log(
      `  Characters covered: ${coverage.size} / ${stripped.body.length} (${((coverage.size / stripped.body.length) * 100).toFixed(1)}%)`,
    );

    // Stage 4: TF-IDF candidate retrieval
    console.log(`\n=== STAGE 4: TF-IDF candidate retrieval ===`);

    // Need training TF-IDF
    const { getArtifacts } = await import('../src/lib/application/analysis');
    const { tfidf } = await getArtifacts();

    // Just run with the extracted passages to see how many candidates
    const candidates = retrieveCandidates(paraSegments, paraSegments, tfidf);
    console.log(`Query passages (input): ${paraSegments.length}`);
    console.log(`Candidate set 'lexical': ${candidates.lexical.length}`);
    console.log(`  These are best-match pairs; one per query passage`);

    // Stage 5: Detection (filtering by threshold)
    console.log(`\n=== STAGE 5: Detection (thresholding) ===`);
    const { detect } = await import('../src/lib/detection/detector');
    const mergedDetections = detect(candidates.lexical, 0.3, 120, false);
    console.log(`Detections above threshold 0.3: ${mergedDetections.length}`);
    if (mergedDetections.length > 0) {
      const scores = mergedDetections.map((d) => d.score);
      console.log(
        `  Score range: ${Math.min(...scores).toFixed(3)} – ${Math.max(...scores).toFixed(3)}`,
      );
    }

    // Detailed passage analysis
    console.log(`\n=== DETAILED: Passage coverage by document section ===`);
    const quarters = [
      { name: 'First quarter', start: 0, end: stripped.body.length / 4 },
      { name: 'Second quarter', start: stripped.body.length / 4, end: stripped.body.length / 2 },
      {
        name: 'Third quarter',
        start: stripped.body.length / 2,
        end: (stripped.body.length * 3) / 4,
      },
      { name: 'Final quarter', start: (stripped.body.length * 3) / 4, end: stripped.body.length },
    ];

    for (const q of quarters) {
      const passagesInQuarter = paraSegments.filter(
        (p) => p.offset + p.length > q.start && p.offset < q.end,
      );
      console.log(
        `${q.name} [${Math.round(q.start)}-${Math.round(q.end)}]: ${passagesInQuarter.length} passages`,
      );
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`631 segmented passages from paragraph-aware segmentation`);
    console.log(`In retrieval, all 631 are candidates (best match per query)`);
    console.log(`After thresholding at 0.3: ${mergedDetections.length} detections`);
    console.log(
      `Conclusion: The 94 in results likely comes from merging/deduplication, not early filtering`,
    );
  }, 120_000);
});
