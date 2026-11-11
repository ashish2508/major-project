/**
 * External evaluation – body-only variant.
 *
 * Purpose
 * -------
 * Re-runs the same external evaluation used in `external-evaluation.ts` but
 * strips reference/bibliography sections from each paper before segmentation.
 * The intent is to investigate whether reference-list content inflates alert
 * counts by matching shared citation strings across papers.
 *
 * What this script does NOT do
 * ----------------------------
 * - It does NOT modify the production detection pipeline, calibrated
 *   thresholds, frozen model configuration, or any existing experiment
 *   artifact.
 * - It does NOT write to `external-evaluation.json` or `external-evaluation.md`.
 * - It does NOT touch the canonical TXT files on disk; normalisation and
 *   reference stripping happen in-memory only.
 * - It does NOT draw conclusions about accuracy.  Fewer alerts does not
 *   automatically mean better accuracy; we have no ground-truth labels for
 *   these 12 papers.
 *
 * Output
 * ------
 * `reports/external-evaluation/external-evaluation-body-only.json`
 *
 * Comparison
 * ----------
 * The script reads the original baseline from
 * `reports/external-evaluation/external-evaluation.json` and embeds a
 * comparison table (alert counts, stripped character fractions) in the JSON
 * output.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { getArtifacts } from '../src/lib/application/analysis';
import {
  detect,
  retrieveCandidates,
  scoreKey,
  type Candidate,
  type Detection,
  type Method,
} from '../src/lib/detection/detector';
import { filterInformativeEvidence } from '../src/lib/detection/informative-evidence';
import { segment, segmentParagraphs, type Passage } from '../src/lib/detection/segmentation';
import {
  describeStripResult,
  stripCanonicalReferences,
} from '../src/lib/detection/strip-references';
import {
  applicationDevice,
  embeddingProvider,
  embedTexts,
  MODEL_CONFIG,
  MODEL_DIRECTORY,
  tokenCounter,
} from '../src/lib/embeddings/model';
import { digest } from '../src/lib/digest';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const INPUT_DIRECTORY = resolve('data/external-evaluation/canonical');
const OUTPUT_DIRECTORY = resolve('reports/external-evaluation');
const BASELINE_PATH = resolve(OUTPUT_DIRECTORY, 'external-evaluation.json');
const OUTPUT_PATH = resolve(OUTPUT_DIRECTORY, 'external-evaluation-body-only-final.json');

const MINIMUM_INFORMATIVE_WORDS = 12;

// ---------------------------------------------------------------------------
// Types (mirrored from the original script to keep both scripts independent)
// ---------------------------------------------------------------------------

interface ExternalPaper {
  reference: string;
  title: string;
  /** Original normalized text – preserved for offset-based excerpts. */
  fullText: string;
  /** Body text with reference section removed (may equal fullText). */
  bodyText: string;
  bodyChars: number;
  /** Offset in fullText where the reference section starts, or null. */
  referenceOffset: number | null;
  /** Whether the reference-section detection was confident. */
  referenceConfident: boolean;
  /** The detected heading string, or null. */
  detectedHeading: string | null;
}

interface AlertRecord {
  suspiciousReference: string;
  sourceReference: string;
  score: number;
  lexical: number;
  semantic: number;
  evidenceWindows: number;
  suspiciousSpan: Detection['suspiciousSpan'];
  sourceSpan: Detection['sourceSpan'];
  suspiciousExcerpt: string;
  sourceExcerpt: string;
}

interface MethodResult {
  alertCount: number;
  alerts: AlertRecord[];
}

interface DirectionalComparison {
  queryPaper: string;
  sourcePaper: string;
  methods: Record<Method, MethodResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n\n')
    .replace(/[\u0000-\u0008\u000B\u000E-\u001F]/g, ' ');
}

async function loadPapers(): Promise<ExternalPaper[]> {
  const names = (await readdir(INPUT_DIRECTORY))
    .filter((name) => name.toLowerCase().endsWith('.txt'))
    .sort();

  if (names.length < 2)
    throw new Error(`Expected at least two canonical TXT files in ${INPUT_DIRECTORY}`);

  const papers: ExternalPaper[] = [];
  for (const name of names) {
    const reference = basename(name, '.txt');
    const fullText = normalizeExtractedText(await readFile(resolve(INPUT_DIRECTORY, name), 'utf8'));
    if (!fullText.trim()) throw new Error(`Extracted paper is empty: ${name}`);

    const stripResult = stripCanonicalReferences(reference, fullText);
    console.log(describeStripResult(reference, stripResult));

    papers.push({
      reference,
      title: reference.replaceAll('_', ' '),
      fullText,
      bodyText: stripResult.body,
      bodyChars: stripResult.body.length - (stripResult.maskedCharacters ?? 0),
      referenceOffset: stripResult.referenceOffset,
      referenceConfident: stripResult.confident,
      detectedHeading: stripResult.detectedHeading,
    });
  }
  return papers;
}

async function verifyLocalModel(): Promise<void> {
  const experiment = JSON.parse(
    await readFile('reports/implementation/experiment-config.json', 'utf8'),
  ) as { modelHashes?: Record<string, string> };

  if (!experiment.modelHashes || !Object.keys(experiment.modelHashes).length)
    throw new Error('The experiment configuration does not contain model hashes');

  for (const [file, expectedHash] of Object.entries(experiment.modelHashes)) {
    const actualHash = digest(await readFile(resolve(MODEL_DIRECTORY, file)));
    if (actualHash !== expectedHash)
      throw new Error(`Local model hash mismatch: ${file}. Use the calibrated model files.`);
  }
}

/**
 * Returns an excerpt from the FULL text of the paper (pre-stripping) so that
 * spans are always valid references to the original document.  The body-only
 * evaluation uses body offsets for segmentation but we still excerpt from
 * fullText so manual review is unambiguous.
 */
function excerpt(text: string, span: { offset: number; length: number }): string {
  return text
    .slice(span.offset, span.offset + span.length)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

function evaluateMethod(
  method: Method,
  candidates: Candidate[],
  config: { threshold: number; mergeGap: number },
  documents: ReadonlyMap<string, string>,
): MethodResult {
  const merged = detect(candidates, config.threshold, config.mergeGap, method !== 'lexical');
  const retained =
    method === 'lexical'
      ? merged
      : filterInformativeEvidence(merged, documents, MINIMUM_INFORMATIVE_WORDS);

  const alerts = retained.map((detection) => ({
    suspiciousReference: detection.suspiciousReference,
    sourceReference: detection.sourceReference,
    score: detection.score,
    lexical: detection.lexical,
    semantic: detection.semantic,
    evidenceWindows: detection.evidenceWindows,
    suspiciousSpan: detection.suspiciousSpan,
    sourceSpan: detection.sourceSpan,
    suspiciousExcerpt: excerpt(
      documents.get(detection.suspiciousReference)!,
      detection.suspiciousSpan,
    ),
    sourceExcerpt: excerpt(documents.get(detection.sourceReference)!, detection.sourceSpan),
  }));

  return { alertCount: alerts.length, alerts };
}

function summarize(comparisons: DirectionalComparison[]): Record<
  Method,
  {
    directionalComparisons: number;
    comparisonsWithAlerts: number;
    totalAlerts: number;
    papersReceivingAlerts: string[];
    highestScoringAlerts: {
      queryPaper: string;
      sourcePaper: string;
      score: number;
      suspiciousExcerpt: string;
      sourceExcerpt: string;
    }[];
  }
> {
  const methods: Method[] = ['lexical', 'semantic', 'hybrid'];
  return Object.fromEntries(
    methods.map((method) => {
      const alertRows = comparisons.flatMap((comparison) =>
        comparison.methods[method].alerts.map((alert) => ({
          queryPaper: comparison.queryPaper,
          sourcePaper: comparison.sourcePaper,
          score: alert.score,
          suspiciousExcerpt: alert.suspiciousExcerpt,
          sourceExcerpt: alert.sourceExcerpt,
        })),
      );
      return [
        method,
        {
          directionalComparisons: comparisons.length,
          comparisonsWithAlerts: comparisons.filter(
            (comparison) => comparison.methods[method].alertCount > 0,
          ).length,
          totalAlerts: alertRows.length,
          papersReceivingAlerts: [...new Set(alertRows.map((alert) => alert.queryPaper))].sort(),
          highestScoringAlerts: alertRows.sort((a, b) => b.score - a.score).slice(0, 20),
        },
      ];
    }),
  ) as ReturnType<typeof summarize>;
}

// ---------------------------------------------------------------------------
// Comparison with baseline
// ---------------------------------------------------------------------------

interface BaselineMethodSummary {
  totalAlerts: number;
  comparisonsWithAlerts: number;
}

interface BaselineResult {
  summary: Record<string, BaselineMethodSummary>;
}

async function loadBaseline(): Promise<BaselineResult | null> {
  try {
    const raw = await readFile(BASELINE_PATH, 'utf8');
    return JSON.parse(raw) as BaselineResult;
  } catch {
    console.warn('Warning: could not load baseline from', BASELINE_PATH, '– comparison skipped.');
    return null;
  }
}

function buildComparison(
  bodySummary: ReturnType<typeof summarize>,
  baseline: BaselineResult | null,
  papers: ExternalPaper[],
): {
  referenceDetection: {
    papersWithConfidentDetection: number;
    papersWithoutConfidentDetection: string[];
    detectionDetails: {
      reference: string;
      confident: boolean;
      heading: string | null;
      referenceOffset: number | null;
      fullTextChars: number;
      bodyChars: number;
      strippedFraction: number;
    }[];
  };
  alertComparison: Record<
    Method,
    {
      baselineAlerts: number | null;
      bodyOnlyAlerts: number;
      delta: number | null;
    }
  >;
} {
  const detectionDetails = papers.map((paper) => ({
    reference: paper.reference,
    confident: paper.referenceConfident,
    heading: paper.detectedHeading,
    referenceOffset: paper.referenceOffset,
    fullTextChars: paper.fullText.length,
    bodyChars: paper.bodyChars,
    strippedFraction:
      paper.fullText.length > 0
        ? (paper.fullText.length - paper.bodyChars) / paper.fullText.length
        : 0,
  }));

  const papersWithoutConfidentDetection = papers
    .filter((p) => !p.referenceConfident)
    .map((p) => p.reference);

  const methods: Method[] = ['lexical', 'semantic', 'hybrid'];
  const alertComparison = Object.fromEntries(
    methods.map((method) => {
      const bodyAlerts = bodySummary[method].totalAlerts;
      const baselineAlerts = baseline?.summary[method]?.totalAlerts ?? null;
      return [
        method,
        {
          baselineAlerts,
          bodyOnlyAlerts: bodyAlerts,
          delta: baselineAlerts !== null ? bodyAlerts - baselineAlerts : null,
        },
      ];
    }),
  ) as Record<
    Method,
    { baselineAlerts: number | null; bodyOnlyAlerts: number; delta: number | null }
  >;

  return {
    referenceDetection: {
      papersWithConfidentDetection: papers.filter((p) => p.referenceConfident).length,
      papersWithoutConfidentDetection,
      detectionDetails,
    },
    alertComparison,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Loading canonical research papers and stripping reference sections...');
  const papers = await loadPapers();
  const { tfidf, configs } = await getArtifacts();
  const countTokens = await tokenCounter();
  const device = applicationDevice();

  const confidentCount = papers.filter((p) => p.referenceConfident).length;
  const notConfident = papers.filter((p) => !p.referenceConfident).map((p) => p.reference);

  console.log(`\n=== Reference-section detection summary ===`);
  console.log(`Papers with confident reference detection: ${confidentCount}/${papers.length}`);
  if (notConfident.length) {
    console.log(`Papers without confident detection: ${notConfident.join(', ')}`);
    console.log('  → These papers are evaluated on their full text (no content removed).');
  }

  console.log('\nVerifying the calibrated local MiniLM model...');
  await verifyLocalModel();

  // Build passage sets from body text only.
  const lexicalByPaper = new Map<string, Passage[]>();
  const semanticByPaper = new Map<string, Passage[]>();

  // The document map used for excerpt generation uses full text so that
  // any span offsets from the original text remain valid.
  // The body-only evaluation uses bodyText for segmentation; offsets emitted
  // by the segmenter also apply to fullText because references are removed as
  // a suffix or masked in place.
  const documents = new Map(papers.map((paper) => [paper.reference, paper.bodyText]));

  for (const paper of papers) {
    lexicalByPaper.set(paper.reference, segment(paper.bodyText, paper.reference, { countTokens }));
    semanticByPaper.set(
      paper.reference,
      segmentParagraphs(paper.bodyText, paper.reference, { countTokens }),
    );
  }

  const allSemanticPassages = papers.flatMap((paper) => semanticByPaper.get(paper.reference)!);
  const uniqueTexts = [...new Set(allSemanticPassages.map((passage) => passage.text))];

  console.log(`Embedding ${uniqueTexts.length} unique semantic passages on ${device}...`);
  const vectors = await embedTexts(uniqueTexts, device);
  const vectorByText = new Map(uniqueTexts.map((text, index) => [text, vectors[index]]));
  const provider = await embeddingProvider(device);

  const semanticVectorsByPaper = new Map<string, number[][]>();
  for (const paper of papers) {
    semanticVectorsByPaper.set(
      paper.reference,
      semanticByPaper.get(paper.reference)!.map((passage) => {
        const vector = vectorByText.get(passage.text);
        if (!vector) throw new Error('An embedded semantic passage is missing');
        return vector;
      }),
    );
  }

  const comparisons: DirectionalComparison[] = [];
  const hybridAlpha = configs.hybrid.alpha;
  const totalDirections = papers.length * (papers.length - 1);
  let completed = 0;

  for (const queryPaper of papers) {
    for (const sourcePaper of papers) {
      if (queryPaper.reference === sourcePaper.reference) continue;

      const lexicalRows = retrieveCandidates(
        lexicalByPaper.get(queryPaper.reference)!,
        lexicalByPaper.get(sourcePaper.reference)!,
        tfidf,
      );

      const semanticRows = retrieveCandidates(
        semanticByPaper.get(queryPaper.reference)!,
        semanticByPaper.get(sourcePaper.reference)!,
        tfidf,
        semanticVectorsByPaper.get(queryPaper.reference)!,
        semanticVectorsByPaper.get(sourcePaper.reference)!,
        [hybridAlpha],
      );

      const methods: Record<Method, MethodResult> = {
        lexical: evaluateMethod('lexical', lexicalRows.lexical, configs.lexical, documents),
        semantic: evaluateMethod('semantic', semanticRows.semantic, configs.semantic, documents),
        hybrid: evaluateMethod(
          'hybrid',
          semanticRows[scoreKey('hybrid', hybridAlpha)],
          configs.hybrid,
          documents,
        ),
      };

      comparisons.push({
        queryPaper: queryPaper.reference,
        sourcePaper: sourcePaper.reference,
        methods,
      });

      completed++;
      console.log(
        `[${completed}/${totalDirections}] ${queryPaper.reference} -> ${sourcePaper.reference} | alerts L/S/H: ${methods.lexical.alertCount}/${methods.semantic.alertCount}/${methods.hybrid.alertCount}`,
      );
    }
  }

  const generatedAt = new Date().toISOString();
  const summary = summarize(comparisons);
  const baseline = await loadBaseline();
  const comparison = buildComparison(summary, baseline, papers);

  const result = {
    schemaVersion: 1,
    variant: 'body-only',
    generatedAt,
    description: [
      'Re-run of the external evaluation with reference/bibliography sections stripped',
      'from each paper before segmentation.',
      'Canonical files on disk are unchanged; stripping is performed in memory only.',
      'Alert counts are not accuracy measures. No ground-truth labels are available.',
      'Papers where reference-section detection was not confident are evaluated on',
      'their full text; no content is removed for those papers.',
    ].join(' '),
    dataset: {
      paperCount: papers.length,
      uniqueUnorderedPairs: (papers.length * (papers.length - 1)) / 2,
      directionalComparisons: comparisons.length,
      papers: papers.map((paper) => ({
        reference: paper.reference,
        title: paper.title,
        fullTextChars: paper.fullText.length,
        bodyChars: paper.bodyChars,
        strippedFraction:
          paper.fullText.length > 0
            ? Math.round(
                ((paper.fullText.length - paper.bodyChars) / paper.fullText.length) * 10000,
              ) / 10000
            : 0,
        words: paper.bodyText.match(/[\p{L}\p{N}]+/gu)?.length ?? 0,
        referenceDetectionConfident: paper.referenceConfident,
        detectedHeading: paper.detectedHeading,
        referenceOffset: paper.referenceOffset,
      })),
    },
    methodology: {
      referenceStripping: 'stripCanonicalReferences() from src/lib/detection/strip-references.ts',
      lexicalSegmentation: 'segment() applied to body text only',
      semanticSegmentation: 'segmentParagraphs() applied to body text only',
      informativeEvidenceMinimumWords: MINIMUM_INFORMATIVE_WORDS,
      model: MODEL_CONFIG.model,
      device,
      provider,
      uniqueSemanticPassages: uniqueTexts.length,
      configs,
      groundTruthAvailable: false,
      note: 'Body offsets also apply to fullText; excerpts are drawn from bodyText.',
    },
    comparison,
    summary,
    comparisons,
  };

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log('\n=== Body-only evaluation completed ===');
  console.log('\nReference detection:');
  console.log(
    `  Confident: ${comparison.referenceDetection.papersWithConfidentDetection}/${papers.length}`,
  );
  if (comparison.referenceDetection.papersWithoutConfidentDetection.length) {
    console.log(
      `  Not confident (full text used): ${comparison.referenceDetection.papersWithoutConfidentDetection.join(', ')}`,
    );
  }

  console.log('\nAlert comparison (body-only vs baseline):');
  for (const method of ['lexical', 'semantic', 'hybrid'] as const) {
    const c = comparison.alertComparison[method];
    const delta =
      c.delta !== null ? (c.delta > 0 ? `+${c.delta}` : String(c.delta)) : 'baseline N/A';
    console.log(
      `  ${method}: body-only=${c.bodyOnlyAlerts}, baseline=${c.baselineAlerts ?? 'N/A'}, delta=${delta}`,
    );
  }

  console.log('\nNote: Fewer alerts does not automatically mean better accuracy.');
  console.log('      No ground-truth labels are available for these 12 papers.');
  console.log(`\nOutput: ${OUTPUT_PATH}`);
}

main().catch((error: unknown) => {
  console.error('Body-only external evaluation failed:', error);
  process.exitCode = 1;
});
