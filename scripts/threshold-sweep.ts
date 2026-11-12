#!/usr/bin/env bun
/**
 * threshold-sweep.ts
 *
 * Phase-6 threshold tuning for research-paper mode.
 *
 * Sweeps lexical, semantic, and hybrid thresholds (and hybrid alpha) on the
 * Phase-0 evaluation fixtures.  Prints a table for each method.
 *
 * Usage:
 *   bun run scripts/threshold-sweep.ts
 *
 * Fixtures required (tests/fixtures/papers/):
 *   liu-2020-e21808.pdf     — source document
 *   qiu-2020-e22022.pdf     — P1 query (positive pair, retracted copy)
 *   c1-exact-copy.txt       — C1 query (exact copy control)
 *   c4-light-auto-paraphrase.txt — C4-light query (light paraphrase control)
 *   zhu-2020-e22356.pdf     — N1 query (negative, optional)
 *   tanreqing-2020-pmc7458256.pdf — N2 query (negative, optional)
 *
 * N1 and N2 are optional: if the PDFs are absent they are skipped and noted.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { analyzeDocuments } from '../src/lib/application/analysis';
import type { ExtractedDocument } from '../src/lib/documents/extract';
import type { Method } from '../src/lib/detection/detector';

const ROOT = resolve(__dirname, '..');
const FIXTURES = join(ROOT, 'tests/fixtures/papers');

// ---------------------------------------------------------------------------
// Document loading helpers (copied from eval-papers.ts to keep sweep self-contained)
// ---------------------------------------------------------------------------

async function loadPdf(filename: string, reference: string): Promise<ExtractedDocument> {
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
      let previous: { y: number; height: number } | undefined;
      let part = '';
      paragraphBreaks.push(text.length);
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = (item as { transform: number[] }).transform[5];
        if (previous && Math.abs(y - previous.y) > Math.max(previous.height, item.height) * 1.6) {
          paragraphBreaks.push(text.length + part.length);
        }
        part +=
          (item as { str: string }).str.replace(/\0/g, ' ') +
          ((item as { hasEOL: boolean }).hasEOL ? '\n' : ' ');
        if ((item as { str: string }).str.trim())
          previous = { y, height: (item as { height: number }).height };
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
  return { reference, title: filename, text, format: 'pdf', pages, paragraphBreaks };
}

async function loadTxt(filename: string, reference: string): Promise<ExtractedDocument> {
  const path = join(FIXTURES, filename);
  const text = await readFile(path, 'utf8');
  return {
    reference,
    title: filename,
    text,
    format: 'text',
    pages: [],
    paragraphBreaks: [],
  };
}

// ---------------------------------------------------------------------------
// Patch research-paper-parameters on the fly for the sweep
// ---------------------------------------------------------------------------

/**
 * Temporarily patch the methods config in the loaded research-paper-parameters
 * module by writing a modified JSON, re-importing, running the analysis, then
 * restoring the original. Because bun caches imports, we instead override the
 * threshold directly in the RESEARCH_PAPER_CONFIG after import.
 *
 * Since RESEARCH_PAPER_CONFIG is a `const` object but its nested values are
 * `Record<Method, DetectionConfig>` (not deeply frozen), we can mutate the
 * threshold and alpha fields for the duration of a single call.
 */
import { RESEARCH_PAPER_CONFIG } from '../src/lib/application/analysis';

function overrideConfig(method: Method, threshold: number, alpha?: number): void {
  const cfg = RESEARCH_PAPER_CONFIG.methods[method] as {
    threshold: number;
    alpha: number;
    mergeGap: number;
    method: Method;
  };
  cfg.threshold = threshold;
  if (alpha !== undefined) cfg.alpha = alpha;
}

function restoreConfig(method: Method, threshold: number, alpha?: number): void {
  overrideConfig(method, threshold, alpha);
}

// ---------------------------------------------------------------------------
// Run analysis and return informative alert count
// ---------------------------------------------------------------------------

async function countAlerts(
  queryDoc: ExtractedDocument,
  sourceDoc: ExtractedDocument,
  method: Method,
): Promise<number> {
  const result = await analyzeDocuments(queryDoc, [sourceDoc], method);
  return result.detections.length;
}

// ---------------------------------------------------------------------------
// Main sweep
// ---------------------------------------------------------------------------

interface SweepRow {
  threshold: number;
  alpha?: number;
  c1Alerts: number;
  p1Alerts: number;
  c4LightAlerts: number;
  n1Alerts: number | null;
  n2Alerts: number | null;
}

async function main(): Promise<void> {
  console.log('=== Phase-6 Threshold Sweep ===\n');

  // Load documents
  console.log('Loading documents…');
  const sourceDoc = await loadPdf('liu-2020-e21808.pdf', 'liu-2020-e21808');
  const c1Doc = await loadTxt('c1-exact-copy.txt', 'c1-exact-copy');
  const p1Doc = await loadPdf('qiu-2020-e22022.pdf', 'qiu-2020-e22022');
  const c4LightDoc = await loadTxt('c4-light-auto-paraphrase.txt', 'c4-light-auto-paraphrase');

  const n1Path = join(FIXTURES, 'zhu-2020-e22356.pdf');
  const n2Path = join(FIXTURES, 'tanreqing-2020-pmc7458256.pdf');
  const n1Available = existsSync(n1Path);
  const n2Available = existsSync(n2Path);

  let n1Doc: ExtractedDocument | null = null;
  let n2Doc: ExtractedDocument | null = null;
  if (n1Available) {
    console.log('N1 (zhu-2020-e22356.pdf) found — including in sweep');
    n1Doc = await loadPdf('zhu-2020-e22356.pdf', 'zhu-2020-e22356');
  } else {
    console.log('N1 (zhu-2020-e22356.pdf) NOT found — sweep will note absence');
  }
  if (n2Available) {
    console.log('N2 (tanreqing-2020-pmc7458256.pdf) found — including in sweep');
    n2Doc = await loadPdf('tanreqing-2020-pmc7458256.pdf', 'tanreqing-2020-pmc7458256');
  } else {
    console.log('N2 (tanreqing-2020-pmc7458256.pdf) NOT found — sweep will note absence');
  }
  console.log('');

  // Store original config values so we can restore them
  const origLexicalThreshold = RESEARCH_PAPER_CONFIG.methods.lexical.threshold;
  const origLexicalAlpha = RESEARCH_PAPER_CONFIG.methods.lexical.alpha;
  const origSemanticThreshold = RESEARCH_PAPER_CONFIG.methods.semantic.threshold;
  const origSemanticAlpha = RESEARCH_PAPER_CONFIG.methods.semantic.alpha;
  const origHybridThreshold = RESEARCH_PAPER_CONFIG.methods.hybrid.threshold;
  const origHybridAlpha = RESEARCH_PAPER_CONFIG.methods.hybrid.alpha;

  // -------------------------------------------------------------------------
  // LEXICAL SWEEP
  // -------------------------------------------------------------------------
  const lexicalThresholds = [0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7];
  console.log('--- LEXICAL SWEEP ---');
  console.log('threshold | C1 alerts | P1 alerts | C4-light alerts | N1 alerts | N2 alerts');
  console.log('-'.repeat(80));

  const lexicalRows: SweepRow[] = [];
  for (const threshold of lexicalThresholds) {
    overrideConfig('lexical', threshold, origLexicalAlpha);
    const c1Alerts = await countAlerts(c1Doc, sourceDoc, 'lexical');
    const p1Alerts = await countAlerts(p1Doc, sourceDoc, 'lexical');
    const c4LightAlerts = await countAlerts(c4LightDoc, sourceDoc, 'lexical');
    const n1Alerts = n1Doc ? await countAlerts(n1Doc, sourceDoc, 'lexical') : null;
    const n2Alerts = n2Doc ? await countAlerts(n2Doc, sourceDoc, 'lexical') : null;

    lexicalRows.push({ threshold, c1Alerts, p1Alerts, c4LightAlerts, n1Alerts, n2Alerts });

    const n1Str = n1Alerts !== null ? String(n1Alerts).padStart(9) : '    n/a';
    const n2Str = n2Alerts !== null ? String(n2Alerts).padStart(9) : '    n/a';
    console.log(
      `  ${String(threshold).padEnd(7)} | ${String(c1Alerts).padStart(9)} | ${String(p1Alerts).padStart(9)} | ${String(c4LightAlerts).padStart(15)} | ${n1Str} | ${n2Str}`,
    );
  }

  // Restore lexical config
  restoreConfig('lexical', origLexicalThreshold, origLexicalAlpha);

  // -------------------------------------------------------------------------
  // SEMANTIC SWEEP
  // -------------------------------------------------------------------------
  const semanticThresholds = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75];
  console.log('\n--- SEMANTIC SWEEP ---');
  console.log('threshold | C1 alerts | P1 alerts | C4-light alerts | N1 alerts | N2 alerts');
  console.log('-'.repeat(80));

  const semanticRows: SweepRow[] = [];
  for (const threshold of semanticThresholds) {
    overrideConfig('semantic', threshold, origSemanticAlpha);
    const c1Alerts = await countAlerts(c1Doc, sourceDoc, 'semantic');
    const p1Alerts = await countAlerts(p1Doc, sourceDoc, 'semantic');
    const c4LightAlerts = await countAlerts(c4LightDoc, sourceDoc, 'semantic');
    const n1Alerts = n1Doc ? await countAlerts(n1Doc, sourceDoc, 'semantic') : null;
    const n2Alerts = n2Doc ? await countAlerts(n2Doc, sourceDoc, 'semantic') : null;

    semanticRows.push({ threshold, c1Alerts, p1Alerts, c4LightAlerts, n1Alerts, n2Alerts });

    const n1Str = n1Alerts !== null ? String(n1Alerts).padStart(9) : '    n/a';
    const n2Str = n2Alerts !== null ? String(n2Alerts).padStart(9) : '    n/a';
    console.log(
      `  ${String(threshold).padEnd(7)} | ${String(c1Alerts).padStart(9)} | ${String(p1Alerts).padStart(9)} | ${String(c4LightAlerts).padStart(15)} | ${n1Str} | ${n2Str}`,
    );
  }

  // Restore semantic config
  restoreConfig('semantic', origSemanticThreshold, origSemanticAlpha);

  // -------------------------------------------------------------------------
  // HYBRID SWEEP (threshold × alpha)
  // -------------------------------------------------------------------------
  const hybridThresholds = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
  const hybridAlphas = [0.15, 0.25, 0.35];
  console.log('\n--- HYBRID SWEEP ---');
  console.log(
    'threshold | alpha | C1 alerts | P1 alerts | C4-light alerts | N1 alerts | N2 alerts',
  );
  console.log('-'.repeat(90));

  const hybridRows: SweepRow[] = [];
  for (const alpha of hybridAlphas) {
    for (const threshold of hybridThresholds) {
      overrideConfig('hybrid', threshold, alpha);
      const c1Alerts = await countAlerts(c1Doc, sourceDoc, 'hybrid');
      const p1Alerts = await countAlerts(p1Doc, sourceDoc, 'hybrid');
      const c4LightAlerts = await countAlerts(c4LightDoc, sourceDoc, 'hybrid');
      const n1Alerts = n1Doc ? await countAlerts(n1Doc, sourceDoc, 'hybrid') : null;
      const n2Alerts = n2Doc ? await countAlerts(n2Doc, sourceDoc, 'hybrid') : null;

      hybridRows.push({
        threshold,
        alpha,
        c1Alerts,
        p1Alerts,
        c4LightAlerts,
        n1Alerts,
        n2Alerts,
      });

      const n1Str = n1Alerts !== null ? String(n1Alerts).padStart(9) : '    n/a';
      const n2Str = n2Alerts !== null ? String(n2Alerts).padStart(9) : '    n/a';
      console.log(
        `  ${String(threshold).padEnd(7)} | ${String(alpha).padEnd(5)} | ${String(c1Alerts).padStart(9)} | ${String(p1Alerts).padStart(9)} | ${String(c4LightAlerts).padStart(15)} | ${n1Str} | ${n2Str}`,
      );
    }
  }

  // Restore hybrid config
  restoreConfig('hybrid', origHybridThreshold, origHybridAlpha);

  // -------------------------------------------------------------------------
  // Summary and recommendation
  // -------------------------------------------------------------------------
  console.log('\n=== Sweep complete ===');
  console.log(
    `N1 available: ${n1Available ? 'YES' : 'NO'}, N2 available: ${n2Available ? 'YES' : 'NO'}`,
  );

  // Find best lexical threshold: highest threshold where C1 stays at max
  const c1MaxLexical = Math.max(...lexicalRows.map((r) => r.c1Alerts));
  const lexicalCandidates = lexicalRows.filter((r) => r.c1Alerts === c1MaxLexical);
  const bestLexical = lexicalCandidates[lexicalCandidates.length - 1]; // highest threshold
  console.log(
    `\nLEXICAL — C1 max alerts: ${c1MaxLexical}. Highest threshold keeping C1 at max: ${bestLexical?.threshold ?? 'n/a'} (C1=${bestLexical?.c1Alerts}, P1=${bestLexical?.p1Alerts})`,
  );

  // Find best semantic threshold: highest threshold where C4-light stays at max
  const c4MaxSemantic = Math.max(...semanticRows.map((r) => r.c4LightAlerts));
  const semanticCandidates = semanticRows.filter((r) => r.c4LightAlerts === c4MaxSemantic);
  const bestSemantic = semanticCandidates[semanticCandidates.length - 1]; // highest threshold
  console.log(
    `SEMANTIC — C4-light max alerts: ${c4MaxSemantic}. Highest threshold keeping C4-light at max: ${bestSemantic?.threshold ?? 'n/a'} (C1=${bestSemantic?.c1Alerts}, P1=${bestSemantic?.p1Alerts}, C4-light=${bestSemantic?.c4LightAlerts})`,
  );

  // Find best hybrid: for each alpha, highest threshold where C1 stays at max
  for (const alpha of hybridAlphas) {
    const rows = hybridRows.filter((r) => r.alpha === alpha);
    const c1Max = Math.max(...rows.map((r) => r.c1Alerts));
    const candidates = rows.filter((r) => r.c1Alerts === c1Max);
    const best = candidates[candidates.length - 1];
    console.log(
      `HYBRID alpha=${alpha} — C1 max alerts: ${c1Max}. Highest threshold keeping C1 at max: ${best?.threshold ?? 'n/a'} (C1=${best?.c1Alerts}, P1=${best?.p1Alerts}, C4-light=${best?.c4LightAlerts})`,
    );
  }

  // Emit machine-readable JSON for the phase-6 report
  const sweepData = { lexicalRows, semanticRows, hybridRows, n1Available, n2Available };
  const { writeFile } = await import('node:fs/promises');
  const outPath = join(ROOT, 'reports/improvements/phase-6-sweep-raw.json');
  await writeFile(outPath, JSON.stringify(sweepData, null, 2), 'utf8');
  console.log(`\nRaw sweep data written to ${outPath}`);
}

main().catch((e) => {
  console.error('threshold-sweep failed:', e);
  process.exit(1);
});
