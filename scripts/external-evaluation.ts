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
  applicationDevice,
  embeddingProvider,
  embedTexts,
  MODEL_CONFIG,
  MODEL_DIRECTORY,
  tokenCounter,
} from '../src/lib/embeddings/model';
import { digest } from '../src/lib/digest';

const INPUT_DIRECTORY = resolve('data/external-evaluation/canonical');
const OUTPUT_DIRECTORY = resolve('reports/external-evaluation');
const MINIMUM_INFORMATIVE_WORDS = 12;

interface ExternalPaper {
  reference: string;
  title: string;
  text: string;
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

function normalizeExtractedText(text: string): string {
  // Poppler's form-feed page separators become paragraph boundaries.
  // Offsets are measured against this normalized in-memory text.
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
    const text = normalizeExtractedText(
      await readFile(resolve(INPUT_DIRECTORY, name), 'utf8'),
    );
    if (!text.trim()) throw new Error(`Extracted paper is empty: ${name}`);
    papers.push({ reference, title: reference.replaceAll('_', ' '), text });
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
  const merged = detect(
    candidates,
    config.threshold,
    config.mergeGap,
    method !== 'lexical',
  );
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
    sourceExcerpt: excerpt(
      documents.get(detection.sourceReference)!,
      detection.sourceSpan,
    ),
  }));

  return { alertCount: alerts.length, alerts };
}

function summarize(
  comparisons: DirectionalComparison[],
): Record<
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
          papersReceivingAlerts: [
            ...new Set(alertRows.map((alert) => alert.queryPaper)),
          ].sort(),
          highestScoringAlerts: alertRows
            .sort((a, b) => b.score - a.score)
            .slice(0, 20),
        },
      ];
    }),
  ) as ReturnType<typeof summarize>;
}

function createMarkdownReport(data: {
  generatedAt: string;
  papers: ExternalPaper[];
  comparisons: DirectionalComparison[];
  summary: ReturnType<typeof summarize>;
  device: string;
  provider: string;
  uniqueSemanticPassages: number;
  configs: Record<Method, { method: Method; threshold: number; alpha: number; mergeGap: number }>;
}): string {
  const lines = [
    '# External Research-Paper Evaluation',
    '',
    `Generated: ${data.generatedAt}`,
    '',
    '## Scope',
    '',
    `- Papers: ${data.papers.length}`,
    `- Unique unordered paper pairs: ${(data.papers.length * (data.papers.length - 1)) / 2}`,
    `- Directional comparisons: ${data.comparisons.length}`,
    '- Methods: lexical (TF-IDF), semantic (MiniLM), and hybrid',
    `- Semantic model: ${MODEL_CONFIG.model}`,
    `- Execution device: ${data.device}`,
    `- Verified execution provider: ${data.provider}`,
    `- Unique semantic passages embedded: ${data.uniqueSemanticPassages}`,
    `- Informative-evidence minimum: ${MINIMUM_INFORMATIVE_WORDS} distinct letter-containing words on each side`,
    '',
    '## Frozen operating points',
    '',
    '| Method | Threshold | Alpha | Merge gap |',
    '| --- | ---: | ---: | ---: |',
    ...(['lexical', 'semantic', 'hybrid'] as const).map((method) => {
      const config = data.configs[method];
      return `| ${method} | ${config.threshold} | ${config.alpha} | ${config.mergeGap} |`;
    }),
    '',
    '## Observed alerts',
    '',
    '| Method | Directional comparisons with alerts | Total alerts | Papers receiving alerts |',
    '| --- | ---: | ---: | ---: |',
    ...(['lexical', 'semantic', 'hybrid'] as const).map((method) => {
      const result = data.summary[method];
      return `| ${method} | ${result.comparisonsWithAlerts}/${result.directionalComparisons} | ${result.totalAlerts} | ${result.papersReceivingAlerts.length} |`;
    }),
    '',
    '## Interpretation and limitations',
    '',
    '- These are real research papers, but no verified plagiarism ground truth is available for the cross-paper comparisons.',
    '- Alert counts measure review workload; they are not false-positive counts.',
    '- Precision, recall, F1, PlagDet, and accuracy cannot be calculated from this experiment.',
    '- Shared terminology, standard definitions, citations, references, equations, and common academic phrasing may generate legitimate matches.',
    '- A high similarity score is evidence for human review, not proof of plagiarism or misconduct.',
    '- This experiment evaluates only the supplied 12-paper collection. It does not establish performance on the wider research-paper population.',
    '- Text was extracted separately with Poppler and normalized in memory. Page boundaries are represented as paragraph breaks; the original canonical TXT files remain unchanged.',
    '',
    '## Paper inventory',
    '',
    '| Paper | Extracted words | Characters |',
    '| --- | ---: | ---: |',
    ...data.papers.map((paper) => {
      const words = paper.text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
      return `| ${paper.title} | ${words} | ${paper.text.length} |`;
    }),
    '',
    '## Highest-scoring alerts',
    '',
  ];

  for (const method of ['lexical', 'semantic', 'hybrid'] as const) {
    lines.push(`### ${method}`, '');
    const alerts = data.summary[method].highestScoringAlerts;
    if (!alerts.length) {
      lines.push('No alerts were produced.', '');
      continue;
    }
    for (const [index, alert] of alerts.entries()) {
      lines.push(
        `${index + 1}. ${alert.queryPaper} → ${alert.sourcePaper} (score ${alert.score.toFixed(4)})`,
        `   - Query: ${alert.suspiciousExcerpt}`,
        `   - Source: ${alert.sourceExcerpt}`,
        '',
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  console.log('Loading canonical research papers...');
  const papers = await loadPapers();
  const { tfidf, configs } = await getArtifacts();
  const countTokens = await tokenCounter();
  const device = applicationDevice();

  console.log(`Loaded ${papers.length} papers.`);
  console.log('Verifying the calibrated local MiniLM model...');
  await verifyLocalModel();

  const lexicalByPaper = new Map<string, Passage[]>();
  const semanticByPaper = new Map<string, Passage[]>();
  const documents = new Map(papers.map((paper) => [paper.reference, paper.text]));

  for (const paper of papers) {
    lexicalByPaper.set(
      paper.reference,
      segment(paper.text, paper.reference, { countTokens }),
    );
    semanticByPaper.set(
      paper.reference,
      segmentParagraphs(paper.text, paper.reference, { countTokens }),
    );
  }

  const allSemanticPassages = papers.flatMap(
    (paper) => semanticByPaper.get(paper.reference)!,
  );
  const uniqueTexts = [...new Set(allSemanticPassages.map((passage) => passage.text))];

  console.log(`Embedding ${uniqueTexts.length} unique semantic passages on ${device}...`);
  const vectors = await embedTexts(uniqueTexts, device);
  const vectorByText = new Map(uniqueTexts.map((text, index) => [text, vectors[index]]));
  const provider = await embeddingProvider(device);

  const semanticVectorsByPaper = new Map<string, number[][]>();
  for (const paper of papers) {
    semanticVectorsByPaper.set(
      paper.reference,
      semanticByPaper
        .get(paper.reference)!
        .map((passage) => {
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
        lexical: evaluateMethod(
          'lexical',
          lexicalRows.lexical,
          configs.lexical,
          documents,
        ),
        semantic: evaluateMethod(
          'semantic',
          semanticRows.semantic,
          configs.semantic,
          documents,
        ),
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
  const result = {
    schemaVersion: 1,
    generatedAt,
    dataset: {
      paperCount: papers.length,
      uniqueUnorderedPairs: (papers.length * (papers.length - 1)) / 2,
      directionalComparisons: comparisons.length,
      papers: papers.map((paper) => ({
        reference: paper.reference,
        title: paper.title,
        characters: paper.text.length,
        words: paper.text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0,
      })),
    },
    methodology: {
      lexicalSegmentation: 'segment() with existing defaults',
      semanticSegmentation: 'segmentParagraphs() with existing defaults',
      informativeEvidenceMinimumWords: MINIMUM_INFORMATIVE_WORDS,
      model: MODEL_CONFIG.model,
      device,
      provider,
      uniqueSemanticPassages: uniqueTexts.length,
      configs,
      groundTruthAvailable: false,
    },
    summary,
    comparisons,
  };

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(
    resolve(OUTPUT_DIRECTORY, 'external-evaluation.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    resolve(OUTPUT_DIRECTORY, 'external-evaluation.md'),
    createMarkdownReport({
      generatedAt,
      papers,
      comparisons,
      summary,
      device,
      provider,
      uniqueSemanticPassages: uniqueTexts.length,
      configs,
    }),
    'utf8',
  );

  console.log('\nExternal evaluation completed.');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`JSON: ${resolve(OUTPUT_DIRECTORY, 'external-evaluation.json')}`);
  console.log(`Report: ${resolve(OUTPUT_DIRECTORY, 'external-evaluation.md')}`);
}

main().catch((error: unknown) => {
  console.error('External evaluation failed:', error);
  process.exitCode = 1;
});
