/**
 * Diagnostic: explain the discrepancy between TF-IDF (41) and Hybrid α=1.0 (108).
 * If α=1.0, hybrid should reduce to TF-IDF (S_hybrid = 1.0 * S_lexical + 0 * S_semantic).
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDocuments } from '../src/lib/application/analysis';
import {
  loadCanonicalCorpus,
  resetCanonicalCorpusCache,
} from '../src/lib/application/canonical-corpus';
import { extractFile } from '../src/lib/documents/extract';

async function loadPdfAsFile(path: string): Promise<File> {
  const bytes = await readFile(path);
  const name = path.split(/[\\/]/).at(-1)!;
  return new File([bytes], name, { type: 'application/pdf' });
}

describe('Diagnose Hybrid consistency', () => {
  it('compares TF-IDF vs Hybrid α=1.0 results', async () => {
    resetCanonicalCorpusCache();

    const file = await loadPdfAsFile(resolve('.cache/quic-pdfs/QUIC_Delay_Control_2025.pdf'));
    const queryDoc = await extractFile(file, 'QUIC_Delay_Control_2025');
    const canonicalSources = await loadCanonicalCorpus();

    console.log(`\n=== Query document ===`);
    console.log(`Text length: ${queryDoc.text.length}`);
    console.log(`Pages: ${queryDoc.pages?.length}`);

    // Run TF-IDF
    console.log(`\n=== Method: TF-IDF (lexical baseline) ===`);
    const tfidfResult = await analyzeDocuments(queryDoc, canonicalSources, 'lexical');
    console.log(`Method: ${tfidfResult.method}`);
    console.log(`Config threshold: ${tfidfResult.config.threshold}`);
    console.log(`Detections: ${tfidfResult.detections.length}`);
    if (tfidfResult.detections.length > 0) {
      const scores = tfidfResult.detections.map((d) => d.score);
      console.log(
        `  Score range: ${Math.min(...scores).toFixed(3)} – ${Math.max(...scores).toFixed(3)}`,
      );
      console.log(
        `  Top 5 scores: ${scores
          .sort((a, b) => b - a)
          .slice(0, 5)
          .map((s) => s.toFixed(3))
          .join(', ')}`,
      );
    }
    console.log(`Query passages: ${tfidfResult.passages.query}`);
    console.log(`Source passages: ${tfidfResult.passages.sources}`);

    // Run Hybrid
    console.log(`\n=== Method: Hybrid (should use α and threshold from calibration) ===`);
    const hybridResult = await analyzeDocuments(queryDoc, canonicalSources, 'hybrid');
    console.log(`Method: ${hybridResult.method}`);
    console.log(`Config alpha: ${hybridResult.config.alpha}`);
    console.log(`Config threshold: ${hybridResult.config.threshold}`);
    console.log(`Detections: ${hybridResult.detections.length}`);
    if (hybridResult.detections.length > 0) {
      const scores = hybridResult.detections.map((d) => d.score);
      console.log(
        `  Score range: ${Math.min(...scores).toFixed(3)} – ${Math.max(...scores).toFixed(3)}`,
      );
      console.log(
        `  Top 5 scores: ${scores
          .sort((a, b) => b - a)
          .slice(0, 5)
          .map((s) => s.toFixed(3))
          .join(', ')}`,
      );
    }
    console.log(`Query passages: ${hybridResult.passages.query}`);
    console.log(`Source passages: ${hybridResult.passages.sources}`);

    console.log(`\n=== Analysis ===`);
    console.log(`TF-IDF threshold: ${tfidfResult.config.threshold}`);
    console.log(`Hybrid threshold: ${hybridResult.config.threshold}`);
    console.log(`Hybrid alpha: ${hybridResult.config.alpha}`);

    if (hybridResult.config.alpha === 1.0) {
      console.log(`HYBRID REDUCES TO TF-IDF (α=1.0)`);
      console.log(`  Expected: hybrid should have same detections as TF-IDF if thresholds match`);
      console.log(`  Actual TF-IDF detections: ${tfidfResult.detections.length}`);
      console.log(`  Actual Hybrid detections: ${hybridResult.detections.length}`);

      if (
        tfidfResult.config.threshold === hybridResult.config.threshold &&
        tfidfResult.detections.length !== hybridResult.detections.length
      ) {
        console.log(`  ⚠️  DISCREPANCY: Same threshold but different detection counts`);
        console.log(`     Investigating why...`);

        // Check if the query/source passages differ
        if (
          tfidfResult.passages.query === hybridResult.passages.query &&
          tfidfResult.passages.sources === hybridResult.passages.sources
        ) {
          console.log(`     Passages are identical`);
          console.log(`     Possible cause: filtering by mergeGap or evidence windows`);
        } else {
          console.log(`     ⚠️  Passages differ!`);
          console.log(
            `        TF-IDF: ${tfidfResult.passages.query} query, ${tfidfResult.passages.sources} source`,
          );
          console.log(
            `        Hybrid: ${hybridResult.passages.query} query, ${hybridResult.passages.sources} source`,
          );
        }

        // Check if detections are actually the same, just differently merged
        const tfidfSources = new Set(tfidfResult.detections.map((d) => d.sourceReference));
        const hybridSources = new Set(hybridResult.detections.map((d) => d.sourceReference));
        console.log(`     TF-IDF sources matched: ${tfidfSources.size}`);
        console.log(`     Hybrid sources matched: ${hybridSources.size}`);
        const overlap = [...tfidfSources].filter((s) => hybridSources.has(s)).length;
        console.log(`     Overlap: ${overlap}`);
      }
    } else {
      console.log(`HYBRID USES FUSION (α=${hybridResult.config.alpha})`);
      console.log(
        `  Formula: S_hybrid = ${hybridResult.config.alpha} * S_lexical + ${1 - hybridResult.config.alpha} * S_semantic`,
      );
      console.log(
        `  Different count expected: ${hybridResult.detections.length} vs ${tfidfResult.detections.length}`,
      );
    }

    console.log(`\n=== Conclusion ===`);
    expect(hybridResult.method).toBe('hybrid');
    expect(tfidfResult.method).toBe('lexical');
  }, 180_000);
});
