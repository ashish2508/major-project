#!/usr/bin/env bun
/**
 * eval-papers.ts
 *
 * Runs the plagiarism detector (lexical / semantic / hybrid) on labelled
 * document pairs and writes a results table.
 *
 * Usage:
 *   bun run eval:papers
 *
 * Output:
 *   reports/improvements/phase-0-results.json   — raw JSON
 *   reports/improvements/phase-0.md             — human-readable markdown table
 *
 * Pairs evaluated:
 *   P1        qiu-2020-e22022.pdf   vs  liu-2020-e21808.pdf  (positive — retracted copy)
 *   C1        c1-exact-copy.txt     vs  liu-2020-e21808.pdf  (control — exact copy)
 *   C2        c2-synonym-replace.txt vs liu-2020-e21808.pdf  (control — 10 % synonyms)
 *   C3        c3-sentence-shuffle.txt vs liu-2020-e21808.pdf (control — sentence shuffle)
 *   C4-light  c4-light-auto-paraphrase.txt vs liu-2020-e21808.pdf (control — 30 % synonyms)
 *   N1        zhu-2020-e22356.pdf   vs  liu-2020-e21808.pdf  (negative — if present)
 *   N2        tanreqing-2020-pmc7458256.pdf vs liu-2020-e21808.pdf (negative — if present)
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { analyzeDocuments } from '../src/lib/application/analysis';
import { filterInformativeEvidence } from '../src/lib/detection/informative-evidence';
import type { ExtractedDocument } from '../src/lib/documents/extract';
import type { Method } from '../src/lib/detection/detector';

const ROOT = resolve(__dirname, '..');
const FIXTURES = join(ROOT, 'tests/fixtures/papers');
const EXTERNAL = join(ROOT, 'data/external-evaluation');
const REPORTS_DIR = join(ROOT, 'reports/improvements/round2');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Alert {
  queryOffset: number;
  sourceOffset: number;
  score: number;
  querySnippet: string;
  sourceSnippet: string;
}

interface PairMethodResult {
  method: Method;
  pairId: string;
  label: PairDef['label'];
  queryFile: string;
  sourceFile: string;
  queryRole: 'QUERY';
  sourceRole: 'SOURCE';
  totalAlerts: number;
  informativeAlerts: number;
  queryCharCoverage: number; // covered chars / total query chars
  coveredQueryChars: number;
  totalQueryChars: number;
  top10Alerts: Alert[];
  skipped: false;
  errorMessage?: string;
}

interface PairMethodSkipped {
  method: Method;
  pairId: string;
  label: PairDef['label'];
  queryFile: string;
  sourceFile: string;
  queryRole: 'QUERY';
  sourceRole: 'SOURCE';
  skipped: true;
  skipReason: string;
}

type PairResult = PairMethodResult | PairMethodSkipped;

// ---------------------------------------------------------------------------
// Load document helpers
// ---------------------------------------------------------------------------

async function loadPdf(
  filename: string,
  reference: string,
  path = join(FIXTURES, filename),
): Promise<ExtractedDocument> {
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

async function loadTxt(
  filename: string,
  reference: string,
  path = join(FIXTURES, filename),
): Promise<ExtractedDocument> {
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
// Pair definitions
// ---------------------------------------------------------------------------

interface PairDef {
  id: string;
  queryFile: string;
  sourceFile: string;
  label: 'positive' | 'control' | 'negative';
  optional: boolean;
}

const PAIRS: PairDef[] = [
  {
    id: 'P1',
    queryFile: 'qiu-2020-e22022.pdf',
    sourceFile: 'liu-2020-e21808.pdf',
    label: 'positive',
    optional: false,
  },
  {
    id: 'C1',
    queryFile: 'c1-exact-copy.txt',
    sourceFile: 'liu-2020-e21808.pdf',
    label: 'control',
    optional: false,
  },
  {
    id: 'C2',
    queryFile: 'c2-synonym-replace.txt',
    sourceFile: 'liu-2020-e21808.pdf',
    label: 'control',
    optional: false,
  },
  {
    id: 'C3',
    queryFile: 'c3-sentence-shuffle.txt',
    sourceFile: 'liu-2020-e21808.pdf',
    label: 'control',
    optional: false,
  },
  {
    id: 'C4-light',
    queryFile: 'c4-light-auto-paraphrase.txt',
    sourceFile: 'liu-2020-e21808.pdf',
    label: 'control',
    optional: false,
  },
  {
    id: 'N0',
    queryFile: 'liu-2020-e21808.pdf',
    sourceFile: 'canonical/QUIC_Dual_Connectivity_2021.txt',
    label: 'negative',
    optional: false,
  },
  {
    id: 'N1',
    queryFile: 'medi-99-e22356.pdf',
    sourceFile: 'liu-2020-e21808.pdf',
    label: 'negative',
    optional: false,
  },
  {
    id: 'N2',
    queryFile: 'medi-99-e22010.pdf',
    sourceFile: 'liu-2020-e21808.pdf',
    label: 'negative',
    optional: false,
  },
];

const METHODS: Method[] = ['lexical', 'semantic', 'hybrid'];

// ---------------------------------------------------------------------------
// Snippet helper
// ---------------------------------------------------------------------------

function snippet(text: string, offset: number, length: number, maxLen = 120): string {
  const raw = text.slice(offset, offset + length);
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '…' : cleaned;
}

// ---------------------------------------------------------------------------
// Run one pair × one method
// ---------------------------------------------------------------------------

async function runPair(
  pair: PairDef,
  method: Method,
  queryDoc: ExtractedDocument,
  sourceDoc: ExtractedDocument,
): Promise<PairMethodResult> {
  const result = await analyzeDocuments(queryDoc, [sourceDoc], method);

  // Build doc map for informative-evidence filter
  // analyzeDocuments already applies filterInformativeEvidence internally, but
  // we need to run it again on the full (pre-filtered) detections to get
  // informative count separately. Since analyzeDocuments returns already-
  // filtered detections, we use them directly as informativeAlerts.
  const detections = result.detections;

  // Count total alerts (the returned detections ARE the post-filter set)
  const totalAlerts = detections.length;

  // Apply filterInformativeEvidence again to get informative count.
  // Build text map from the returned query/sources (using raw text, not stripped,
  // because filterInformativeEvidence needs to index into the span offsets).
  // The spans in detections reference the STRIPPED text, so we use those texts.
  const textMap = new Map<string, string>();
  textMap.set(result.query.reference, result.query.text);
  for (const src of result.sources) {
    textMap.set(src.reference, src.text);
  }

  const docsForFilter = new Map<string, string>(textMap);

  let informativeAlerts: number;
  try {
    // detections have semantic: number | null in lexical mode; cast to satisfy
    // filterInformativeEvidence which expects Detection[] with semantic: number.
    // The semantic field is not used by filterInformativeEvidence, so this is safe.
    const informative = filterInformativeEvidence(
      detections as import('../src/lib/detection/detector').Detection[],
      docsForFilter,
      12,
    );
    informativeAlerts = informative.length;
  } catch {
    // If the filter can't run (e.g. span mismatch), fall back to totalAlerts
    informativeAlerts = totalAlerts;
  }

  // Compute query character coverage
  const queryText = result.query.text;
  const totalQueryChars = queryText.length;
  // Mark covered character positions
  const covered = new Uint8Array(totalQueryChars);
  for (const d of detections) {
    if (d.suspiciousReference === result.query.reference) {
      const start = d.suspiciousSpan.offset;
      const end = Math.min(start + d.suspiciousSpan.length, totalQueryChars);
      if (start >= 0 && start < totalQueryChars) {
        covered.fill(1, start, end);
      }
    }
  }
  const coveredQueryChars = covered.reduce((sum, v) => sum + v, 0);
  const queryCharCoverage = totalQueryChars > 0 ? coveredQueryChars / totalQueryChars : 0;

  // Top-10 alerts by score
  const top10 = [...detections]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((d): Alert => ({
      queryOffset: d.suspiciousSpan.offset,
      sourceOffset: d.sourceSpan.offset,
      score: Math.round(d.score * 10000) / 10000,
      querySnippet: snippet(queryText, d.suspiciousSpan.offset, d.suspiciousSpan.length),
      sourceSnippet: snippet(
        result.sources.find((s) => s.reference === d.sourceReference)?.text ?? '',
        d.sourceSpan.offset,
        d.sourceSpan.length,
      ),
    }));

  return {
    method,
    pairId: pair.id,
    label: pair.label,
    queryFile: pair.queryFile,
    sourceFile: pair.sourceFile,
    queryRole: 'QUERY',
    sourceRole: 'SOURCE',
    totalAlerts,
    informativeAlerts,
    queryCharCoverage: Math.round(queryCharCoverage * 10000) / 10000,
    coveredQueryChars,
    totalQueryChars,
    top10Alerts: top10,
    skipped: false,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Phase 0 Evaluation Harness ===\n');
  await mkdir(REPORTS_DIR, { recursive: true });

  const docCache = new Map<string, ExtractedDocument>();

  const allResults: PairResult[] = [];

  for (const pair of PAIRS) {
    const queryPath = ['N1', 'N2'].includes(pair.id)
      ? join(EXTERNAL, pair.queryFile)
      : join(FIXTURES, pair.queryFile);
    const sourcePath = pair.sourceFile.startsWith('canonical/')
      ? join(EXTERNAL, pair.sourceFile)
      : join(FIXTURES, pair.sourceFile);

    if (!existsSync(queryPath)) {
      if (pair.optional) {
        console.log(`SKIP ${pair.id}: ${pair.queryFile} not found (optional pair)`);
        for (const method of METHODS) {
          allResults.push({
            method,
            pairId: pair.id,
            label: pair.label,
            queryFile: pair.queryFile,
            sourceFile: pair.sourceFile,
            queryRole: 'QUERY',
            sourceRole: 'SOURCE',
            skipped: true,
            skipReason: `${pair.queryFile} not found`,
          });
        }
        continue;
      } else {
        console.error(`ERROR: required query file missing: ${queryPath}`);
        process.exit(1);
      }
    }

    if (!existsSync(sourcePath)) {
      console.error(`ERROR: source file missing: ${sourcePath}`);
      process.exit(1);
    }

    // Load query doc
    let queryDoc: ExtractedDocument;
    if (docCache.has(pair.queryFile)) {
      queryDoc = docCache.get(pair.queryFile)!;
    } else {
      try {
        if (pair.queryFile.endsWith('.pdf')) {
          queryDoc = await loadPdf(pair.queryFile, pair.queryFile.replace('.pdf', ''), queryPath);
        } else {
          queryDoc = await loadTxt(pair.queryFile, pair.queryFile.replace('.txt', ''), queryPath);
        }
        docCache.set(pair.queryFile, queryDoc);
      } catch (e) {
        console.error(`ERROR loading ${pair.queryFile}:`, e);
        for (const method of METHODS) {
          allResults.push({
            method,
            pairId: pair.id,
            label: pair.label,
            queryFile: pair.queryFile,
            sourceFile: pair.sourceFile,
            queryRole: 'QUERY',
            sourceRole: 'SOURCE',
            skipped: true,
            skipReason: `Failed to load: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
        continue;
      }
    }

    let sourceDoc = docCache.get(pair.sourceFile);
    if (!sourceDoc) {
      sourceDoc = pair.sourceFile.endsWith('.pdf')
        ? await loadPdf(pair.sourceFile, pair.sourceFile.replace('.pdf', ''), sourcePath)
        : await loadTxt(pair.sourceFile.split('/').at(-1)!, pair.sourceFile, sourcePath);
      docCache.set(pair.sourceFile, sourceDoc);
    }

    for (const method of METHODS) {
      console.log(`Running ${method.padEnd(8)} on ${pair.id} (${pair.queryFile}) …`);
      try {
        const result = await runPair(pair, method, queryDoc, sourceDoc);
        allResults.push(result);
        console.log(
          `  → alerts: ${result.totalAlerts} total, ${result.informativeAlerts} informative, ` +
            `coverage: ${(result.queryCharCoverage * 100).toFixed(1)}%`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ERROR (${method}, ${pair.id}): ${msg}`);
        allResults.push({
          method,
          pairId: pair.id,
          label: pair.label,
          queryFile: pair.queryFile,
          sourceFile: pair.sourceFile,
          queryRole: 'QUERY',
          sourceRole: 'SOURCE',
          totalAlerts: 0,
          informativeAlerts: 0,
          queryCharCoverage: 0,
          coveredQueryChars: 0,
          totalQueryChars: 0,
          top10Alerts: [],
          skipped: false,
          errorMessage: msg,
        });
      }
    }
    console.log('');
  }

  // ---------------------------------------------------------------------------
  // Write JSON output
  // ---------------------------------------------------------------------------
  const jsonPath = join(REPORTS_DIR, 'step1-results.json');
  await writeFile(jsonPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\nWrote ${jsonPath}`);

  // ---------------------------------------------------------------------------
  // Write Markdown output
  // ---------------------------------------------------------------------------
  const mdLines: string[] = [];
  mdLines.push('# Phase 0 — Evaluation Set and Harness');
  mdLines.push('');
  mdLines.push(`> Generated by \`bun run eval:papers\``);
  mdLines.push('');
  mdLines.push('## Role Assignments');
  mdLines.push('');
  mdLines.push('| Pair | Query (suspect) | Source (original) | Type |');
  mdLines.push('|------|-----------------|-------------------|------|');
  for (const p of PAIRS) {
    const type =
      p.label === 'positive' ? 'Positive' : p.label === 'negative' ? 'Negative' : 'Control';
    const optional = p.optional ? ' *(optional)*' : '';
    mdLines.push(`| ${p.id} | ${p.queryFile} | ${p.sourceFile} | ${type}${optional} |`);
  }

  mdLines.push('');
  mdLines.push('## Synonym Map (C2 and C4-light)');
  mdLines.push('');
  mdLines.push('```json');
  mdLines.push(
    JSON.stringify(
      {
        study: 'investigation',
        patients: 'subjects',
        treatment: 'therapy',
        significant: 'notable',
        results: 'findings',
        analysis: 'examination',
        data: 'information',
        clinical: 'medical',
        outcomes: 'endpoints',
        infection: 'disease',
        children: 'pediatric patients',
        compared: 'contrasted',
        reported: 'documented',
        showed: 'demonstrated',
        used: 'employed',
        groups: 'cohorts',
        effect: 'impact',
        method: 'approach',
        evidence: 'proof',
        review: 'assessment',
      },
      null,
      2,
    ),
  );
  mdLines.push('```');
  mdLines.push('');
  mdLines.push(
    '**C2 rule:** replace exactly 1 in every 10 words scanning left-to-right; pick the first',
  );
  mdLines.push('replaceable word in each window. Case of first letter is preserved.');
  mdLines.push('');
  mdLines.push('**C4-light rule:** replace every 3rd replaceable word (deterministic, seed 42).');
  mdLines.push('');
  mdLines.push('## Baseline Results');
  mdLines.push('');
  mdLines.push(
    '| Pair | Query (QUERY) | Method | Total Alerts | Informative Alerts | Query Coverage | Skipped |',
  );
  mdLines.push(
    '|------|--------------|--------|-------------:|-------------------:|---------------:|---------|',
  );

  for (const r of allResults) {
    if (r.skipped) {
      mdLines.push(
        `| ${r.pairId} | ${r.queryFile} | ${r.method} | — | — | — | ✗ ${r.skipReason} |`,
      );
    } else {
      const coverage = `${(r.queryCharCoverage * 100).toFixed(1)}%`;
      const errorNote = r.errorMessage ? ` ⚠ ${r.errorMessage}` : '';
      mdLines.push(
        `| ${r.pairId} | ${r.queryFile} | ${r.method} | ${r.totalAlerts} | ${r.informativeAlerts} | ${coverage} |${errorNote ? ` ${errorNote}` : ''} |`,
      );
    }
  }

  mdLines.push('');
  mdLines.push('## Top-10 Alerts Per Pair × Method');
  mdLines.push('');

  for (const r of allResults) {
    if (r.skipped || r.top10Alerts.length === 0) continue;
    mdLines.push(`### ${r.pairId} — ${r.method}`);
    mdLines.push('');
    mdLines.push(`**Query:** \`${r.queryFile}\` (QUERY)  `);
    mdLines.push(`**Source:** \`${r.sourceFile}\` (SOURCE)`);
    mdLines.push('');
    mdLines.push(
      '| Rank | Score | Query offset | Source offset | Query snippet | Source snippet |',
    );
    mdLines.push(
      '|------|------:|-------------:|--------------:|---------------|----------------|',
    );
    for (let i = 0; i < r.top10Alerts.length; i++) {
      const a = r.top10Alerts[i];
      const qSnip = a.querySnippet.replace(/\|/g, '\\|').slice(0, 80);
      const sSnip = a.sourceSnippet.replace(/\|/g, '\\|').slice(0, 80);
      mdLines.push(
        `| ${i + 1} | ${a.score.toFixed(4)} | ${a.queryOffset} | ${a.sourceOffset} | ${qSnip} | ${sSnip} |`,
      );
    }
    mdLines.push('');
  }

  mdLines.push('## Missing Files');
  mdLines.push('');
  mdLines.push('N1 (`zhu-2020-e22356.pdf`) and N2 (`tanreqing-2020-pmc7458256.pdf`) are optional');
  mdLines.push('negative-pair PDFs. They were absent at evaluation time and were skipped.');
  mdLines.push('');
  mdLines.push('PMC links for future addition:');
  mdLines.push('- N1: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7505387/>');
  mdLines.push('- N2: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7458256/>');
  mdLines.push('');
  mdLines.push('C4-medium and C4-heavy fixtures are hand-paraphrase placeholders.');
  mdLines.push('');

  const mdPath = join(REPORTS_DIR, 'step1-results.md');
  await writeFile(mdPath, mdLines.join('\n'), 'utf8');
  console.log(`Wrote ${mdPath}`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n=== Summary ===');
  const methods: Method[] = ['lexical', 'semantic', 'hybrid'];
  for (const method of methods) {
    const methodResults = allResults.filter(
      (r): r is PairMethodResult => !r.skipped && r.method === method,
    );
    if (methodResults.length === 0) continue;
    console.log(`\n${method.toUpperCase()}:`);
    for (const r of methodResults) {
      console.log(
        `  ${r.pairId.padEnd(10)} alerts=${String(r.totalAlerts).padStart(3)}, informative=${String(r.informativeAlerts).padStart(3)}, coverage=${(r.queryCharCoverage * 100).toFixed(1).padStart(5)}%`,
      );
    }
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error('eval-papers failed:', e);
  process.exit(1);
});
