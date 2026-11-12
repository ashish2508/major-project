#!/usr/bin/env bun
/**
 * gen-final-runs.ts
 *
 * Runs all three detection methods (lexical, semantic, hybrid) on the
 * research-paper evaluation fixtures using the FINAL post-Phase-6 thresholds
 * from research-paper-parameters.json and writes raw analysis results as JSON.
 *
 * Output files are written to reports/improvements/final/:
 *   P1-lexical.json   P1-semantic.json   P1-hybrid.json
 *   N1-lexical.json   N1-semantic.json   N1-hybrid.json  (skipped if PDF absent)
 *   N2-lexical.json   N2-semantic.json   N2-hybrid.json  (skipped if PDF absent)
 *
 * Usage:
 *   bun run scripts/gen-final-runs.ts
 *
 * Constraints:
 *   - ENABLE_PARAPHRASE_EXPERIMENT is NOT set (standard pipeline).
 *   - PAN benchmark code and frozen-parameters.json are NOT modified.
 *   - Thresholds come from research-paper-parameters.json (loaded by analyzeDocuments).
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { analyzeDocuments } from '../src/lib/application/analysis';
import type { ExtractedDocument } from '../src/lib/documents/extract';
import type { Method } from '../src/lib/detection/detector';

// Ensure the paraphrase experiment is off (standard pipeline).
delete process.env['ENABLE_PARAPHRASE_EXPERIMENT'];

const ROOT = resolve(__dirname, '..');
const FIXTURES = join(ROOT, 'tests/fixtures/papers');
const OUTPUT_DIR = join(ROOT, 'reports/improvements/final');

// ---------------------------------------------------------------------------
// Pair definitions for P1, N1, N2
// ---------------------------------------------------------------------------

interface PairDef {
  id: 'P1' | 'N1' | 'N2';
  queryFile: string;
  sourceFile: string;
  optional: boolean;
}

const PAIRS: PairDef[] = [
  {
    id: 'P1',
    queryFile: 'qiu-2020-e22022.pdf',
    sourceFile: 'liu-2020-e21808.pdf',
    optional: false,
  },
  {
    id: 'N1',
    queryFile: 'zhu-2020-e22356.pdf',
    sourceFile: 'liu-2020-e21808.pdf',
    optional: true,
  },
  {
    id: 'N2',
    queryFile: 'tanreqing-2020-pmc7458256.pdf',
    sourceFile: 'liu-2020-e21808.pdf',
    optional: true,
  },
];

const METHODS: Method[] = ['lexical', 'semantic', 'hybrid'];

// ---------------------------------------------------------------------------
// PDF loader (reused from eval-papers.ts)
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

// ---------------------------------------------------------------------------
// Serialiser: convert AnalysisResult to a plain JSON-safe object
// ---------------------------------------------------------------------------

type AnalysisResult = Awaited<ReturnType<typeof analyzeDocuments>>;

function serialise(result: AnalysisResult): object {
  return {
    method: result.method,
    activeConfigSource: result.activeConfigSource,
    config: result.config,
    queryRole: result.queryRole,
    sourceRole: result.sourceRole,
    symmetryNote: result.symmetryNote,
    queryFile: result.query.title,
    sourceFiles: result.sources.map((s) => s.title),
    passages: result.passages,
    coverage: result.coverage,
    detectionCount: result.detections.length,
    semanticReviewLeadsCount: result.semanticReviewLeads.length,
    suppressedItemsCount: result.suppressedItems.length,
    elapsedSeconds: result.elapsedSeconds,
    provider: result.provider,
    model: result.model,
    researchMode: result.researchMode,
    segmentationType: result.segmentationType,
    warning: result.warning,
    // Top-20 detections by score for review (full detection objects, text snippets trimmed)
    top20Detections: [...result.detections]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((d) => ({
        score: Math.round(d.score * 10000) / 10000,
        sourceReference: d.sourceReference,
        suspiciousSpan: d.suspiciousSpan,
        sourceSpan: d.sourceSpan,
        suspiciousPage: d.suspiciousPage,
        sourcePage: d.sourcePage,
        querySnippet: result.query.text
          .slice(d.suspiciousSpan.offset, d.suspiciousSpan.offset + d.suspiciousSpan.length)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 150),
        sourceSnippet: (result.sources.find((s) => s.reference === d.sourceReference)?.text ?? '')
          .slice(d.sourceSpan.offset, d.sourceSpan.offset + d.sourceSpan.length)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 150),
      })),
    stripping: result.stripping,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== gen-final-runs.ts: Final JSON Runs ===\n');
  console.log('Config: research-paper-parameters.json (post-Phase-6 thresholds)');
  console.log('ENABLE_PARAPHRASE_EXPERIMENT: not set (standard pipeline)\n');

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Load the shared source document once.
  console.log('Loading source document: liu-2020-e21808.pdf …');
  const sourceDoc = await loadPdf('liu-2020-e21808.pdf', 'liu-2020-e21808');
  console.log(`  Loaded: ${sourceDoc.text.length} chars\n`);

  const docCache = new Map<string, ExtractedDocument>();
  docCache.set('liu-2020-e21808.pdf', sourceDoc);

  for (const pair of PAIRS) {
    const queryPath = join(FIXTURES, pair.queryFile);

    if (!existsSync(queryPath)) {
      if (pair.optional) {
        console.log(`SKIP ${pair.id}: ${pair.queryFile} not found (optional)`);
        for (const method of METHODS) {
          const outPath = join(OUTPUT_DIR, `${pair.id}-${method}.json`);
          const placeholder = {
            skipped: true,
            reason: 'PDF file absent',
            pairId: pair.id,
            method,
            queryFile: pair.queryFile,
            sourceFile: pair.sourceFile,
          };
          await writeFile(outPath, JSON.stringify(placeholder, null, 2), 'utf8');
          console.log(`  Wrote placeholder: ${outPath}`);
        }
        console.log('');
        continue;
      } else {
        console.error(`FATAL: required query file missing: ${queryPath}`);
        process.exit(1);
      }
    }

    // Load query document.
    let queryDoc: ExtractedDocument;
    if (docCache.has(pair.queryFile)) {
      queryDoc = docCache.get(pair.queryFile)!;
    } else {
      console.log(`Loading query: ${pair.queryFile} …`);
      queryDoc = await loadPdf(pair.queryFile, pair.queryFile.replace('.pdf', ''));
      docCache.set(pair.queryFile, queryDoc);
      console.log(`  Loaded: ${queryDoc.text.length} chars`);
    }

    for (const method of METHODS) {
      const outPath = join(OUTPUT_DIR, `${pair.id}-${method}.json`);
      console.log(`Running ${pair.id} × ${method} …`);
      try {
        const result = await analyzeDocuments(queryDoc, [sourceDoc], method);
        const payload = serialise(result);
        await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
        const cov = result.coverage ? `${(result.coverage.ratio * 100).toFixed(1)}%` : 'n/a';
        console.log(`  → ${result.detections.length} detections, coverage ${cov} → ${outPath}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ERROR (${pair.id} × ${method}): ${msg}`);
        // Write an error placeholder so the output file always exists.
        const errPayload = {
          error: true,
          message: msg,
          pairId: pair.id,
          method,
          queryFile: pair.queryFile,
          sourceFile: pair.sourceFile,
        };
        await writeFile(outPath, JSON.stringify(errPayload, null, 2), 'utf8');
      }
    }
    console.log('');
  }

  console.log(`All outputs written to: ${OUTPUT_DIR}`);
  console.log('Done.');
}

main().catch((e) => {
  console.error('gen-final-runs failed:', e);
  process.exit(1);
});
