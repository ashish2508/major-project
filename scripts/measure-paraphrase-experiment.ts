#!/usr/bin/env bun
/**
 * measure-paraphrase-experiment.ts
 *
 * Phase-7 measurement script.
 *
 * Measures the effect of Approach 3 (evidence combination) on C4-light,
 * and when available N1/N2.
 *
 * Run (baseline, flag OFF):
 *   bun run scripts/measure-paraphrase-experiment.ts
 *
 * Run (experiment, flag ON):
 *   ENABLE_PARAPHRASE_EXPERIMENT=true bun run scripts/measure-paraphrase-experiment.ts
 *
 * This script loads each document pair, strips/segments/embeds them exactly
 * as analyzeDocuments does, builds the full query × source semantic similarity
 * matrix, then measures:
 *   (a) baseline — query passages whose best-match semantic score >= 0.6
 *   (b) experiment — query passages caught by filterParaphraseCandidates at
 *       lower threshold 0.4 with corroborating signal
 *   (c) net new = (b) − (a)   [passages caught only by the experiment]
 *
 * N1 / N2 are skipped if the PDFs are absent.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { stripCanonicalReferences } from '../src/lib/detection/strip-references';
import { maskBoilerplate } from '../src/lib/detection/boilerplate';
import { segmentParagraphs } from '../src/lib/detection/segmentation';
import { Tfidf } from '../src/lib/detection/tfidf';
import { applicationDevice, embedTexts, tokenCounter } from '../src/lib/embeddings/model';
import {
  computeIdfThreshold,
  filterParaphraseCandidates,
  isParaphraseExperimentEnabled,
  IDF_RARE_QUANTILE,
  LOWER_SEMANTIC_THRESHOLD,
  type ScoredPair,
} from '../src/lib/detection/paraphrase-evidence';
import { attachPassagePages } from '../src/lib/corpus/service';
import type { ExtractedDocument } from '../src/lib/documents/extract';

const ROOT = resolve(__dirname, '..');
const FIXTURES = join(ROOT, 'tests/fixtures/papers');

const STANDARD_THRESHOLD = 0.6;

function denseCosine(a: number[], b: number[]): number {
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? Math.min(1, Math.max(-1, dot / Math.sqrt(aa * bb))) : 0;
}

async function loadPdf(filename: string): Promise<ExtractedDocument> {
  const path = join(FIXTURES, filename);
  const bytes = new Uint8Array(await readFile(path));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true });
  let text = '';
  const pages: { page: number; start: number; end: number }[] = [];
  const paragraphBreaks: number[] = [];
  try {
    const pdf = await task.promise;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let part = '';
      paragraphBreaks.push(text.length);
      for (const item of content.items) {
        if (!('str' in item)) continue;
        part +=
          (item as { str: string }).str.replace(/\0/g, ' ') +
          ((item as { hasEOL: boolean }).hasEOL ? '\n' : ' ');
      }
      const start = text.length;
      text += part;
      pages.push({ page: n, start, end: text.length });
      if (n < pdf.numPages) text += '\n\n';
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return {
    reference: filename,
    title: filename,
    text,
    format: 'pdf',
    pages,
    paragraphBreaks,
  };
}

async function loadTxt(filename: string): Promise<ExtractedDocument> {
  const path = join(FIXTURES, filename);
  const text = await readFile(path, 'utf8');
  return {
    reference: filename,
    title: filename,
    text,
    format: 'text',
    pages: [],
    paragraphBreaks: [],
  };
}

async function loadDocument(filename: string): Promise<ExtractedDocument | null> {
  const path = join(FIXTURES, filename);
  if (!existsSync(path)) return null;
  return filename.endsWith('.pdf') ? loadPdf(filename) : loadTxt(filename);
}

function stripDoc(doc: ExtractedDocument): string {
  const stripResult = stripCanonicalReferences(doc.reference, doc.text);
  const { maskedText } = maskBoilerplate(stripResult.body, { pages: doc.pages });
  return maskedText;
}

interface MeasureResult {
  label: string;
  baselinePassages: number;
  experimentPassages: number;
  netNew: number;
}

async function measurePair(
  label: string,
  queryFile: string,
  sourceFile: string,
): Promise<MeasureResult | null> {
  const queryDoc = await loadDocument(queryFile);
  const sourceDoc = await loadDocument(sourceFile);
  if (!queryDoc || !sourceDoc) return null;

  const qText = stripDoc(queryDoc);
  const sText = stripDoc(sourceDoc);

  const countTokens = await tokenCounter();
  const queryPassages = attachPassagePages(
    segmentParagraphs(qText, queryFile, { countTokens }, queryDoc.paragraphBreaks),
    queryDoc.pages,
  );
  const sourcePassages = attachPassagePages(
    segmentParagraphs(sText, sourceFile, { countTokens }, sourceDoc.paragraphBreaks),
    sourceDoc.pages,
  );

  if (!queryPassages.length || !sourcePassages.length) return null;

  // Fit IDF on all passages (same as analyzeDocuments research-paper mode)
  const allTexts = [...queryPassages.map((p) => p.text), ...sourcePassages.map((p) => p.text)];
  const tfidf = Tfidf.fitOnPassages(allTexts, [], 2);
  const idfThreshold = computeIdfThreshold(tfidf.idf, IDF_RARE_QUANTILE);

  // Embed
  const device = applicationDevice();
  const qTexts = [...new Set(queryPassages.map((p) => p.text))];
  const sTexts = [...new Set(sourcePassages.map((p) => p.text))];
  const qVecs = await embedTexts(qTexts, device);
  const sVecs = await embedTexts(sTexts, device);
  const qVecMap = new Map(qTexts.map((t, i) => [t, qVecs[i]]));
  const sVecMap = new Map(sTexts.map((t, i) => [t, sVecs[i]]));

  // Build all pairs
  const allPairs: ScoredPair[] = [];
  for (let qi = 0; qi < queryPassages.length; qi++) {
    const qv = qVecMap.get(queryPassages[qi].text)!;
    for (let si = 0; si < sourcePassages.length; si++) {
      const sv = sVecMap.get(sourcePassages[si].text)!;
      allPairs.push({
        queryIndex: qi,
        sourceIndex: si,
        semanticScore: denseCosine(qv, sv),
        queryText: queryPassages[qi].text,
        sourceText: sourcePassages[si].text,
      });
    }
  }

  // Baseline: best-match per query passage >= standard threshold
  const baselineQis = new Set<number>();
  for (let qi = 0; qi < queryPassages.length; qi++) {
    const best = allPairs
      .filter((p) => p.queryIndex === qi)
      .reduce((a, b) => (b.semanticScore > a.semanticScore ? b : a));
    if (best.semanticScore >= STANDARD_THRESHOLD) baselineQis.add(qi);
  }

  // Experiment: filterParaphraseCandidates at lower threshold
  const experimentPairs = filterParaphraseCandidates(
    allPairs.filter((p) => p.semanticScore >= LOWER_SEMANTIC_THRESHOLD),
    tfidf.idf,
    idfThreshold,
  );
  const experimentQis = new Set(experimentPairs.map((p) => p.queryIndex));

  const netNew = [...experimentQis].filter((qi) => !baselineQis.has(qi)).length;

  return {
    label,
    baselinePassages: baselineQis.size,
    experimentPassages: new Set([...baselineQis, ...experimentQis]).size,
    netNew,
  };
}

async function main() {
  const experimentEnabled = isParaphraseExperimentEnabled();
  console.log(
    `\nPhase-7 Paraphrase Experiment Measurement\nENABLE_PARAPHRASE_EXPERIMENT=${experimentEnabled}\n`,
  );
  console.log('Measuring query passages caught at each threshold level...\n');

  const sourceFile = 'liu-2020-e21808.pdf';
  const pairs = [
    { label: 'C4-light', queryFile: 'c4-light-auto-paraphrase.txt' },
    { label: 'N1 (zhu-2020-e22356)', queryFile: 'zhu-2020-e22356.pdf' },
    { label: 'N2 (tanreqing-pmc7458256)', queryFile: 'tanreqing-2020-pmc7458256.pdf' },
  ];

  const results: MeasureResult[] = [];
  for (const { label, queryFile } of pairs) {
    process.stdout.write(`  ${label}: `);
    const r = await measurePair(label, queryFile, sourceFile);
    if (!r) {
      console.log('SKIPPED (file not found)');
      continue;
    }
    results.push(r);
    console.log(
      `baseline=${r.baselinePassages}  experiment=${r.experimentPassages}  net-new=${r.netNew}`,
    );
  }

  console.log('\nSummary table (distinct query passages caught):');
  console.log('| Pair     | Baseline (≥0.6) | Experiment (≥0.4+evidence) | Net-new |');
  console.log('|----------|-----------------|---------------------------|---------|');
  for (const r of results) {
    console.log(
      `| ${r.label.padEnd(8)} | ${String(r.baselinePassages).padEnd(15)} | ${String(r.experimentPassages).padEnd(25)} | ${r.netNew}       |`,
    );
  }

  console.log('\nNote: "Experiment" = baseline UNION evidence-combination-promoted passages.');
  console.log(
    '      A net-new > 0 on C4-light = improved recall; a net-new > 0 on N1/N2 = new false positives.',
  );
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
