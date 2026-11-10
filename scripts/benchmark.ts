import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import type { Inventory, DatasetSplit, PlagiarismAnnotation } from '../src/lib/dataset/types';
import { loadDocument, digest } from '../src/lib/dataset/inventory';
import { validateSplit } from '../src/lib/dataset/split';
import {
  tokenCounter,
  embedTexts,
  MODEL_CONFIG,
  MODEL_DIRECTORY,
} from '../src/lib/embeddings/model';
import { segment, type Passage } from '../src/lib/detection/segmentation';
import { Tfidf } from '../src/lib/detection/tfidf';
import {
  retrieveCandidates,
  detect,
  ALPHAS,
  THRESHOLDS,
  MERGE_GAP,
  scoreKey,
  type Candidate,
  type Method,
  type DetectionConfig,
} from '../src/lib/detection/detector';
import { evaluatePan, overlaps } from '../src/lib/evaluation/pan';

const dir = 'reports/implementation',
  cache = '.cache/research',
  runStart = performance.now();
await mkdir(cache, { recursive: true });
const inv: Inventory = JSON.parse(await readFile(`${cache}/inventory.json`, 'utf8'));
const manifestBytes = await readFile(`${dir}/split-manifest.json`),
  split: DatasetSplit = JSON.parse(manifestBytes.toString());
validateSplit(split, inv);
const leakage = JSON.parse(await readFile(`${dir}/leakage-check.json`, 'utf8'));
if (!leakage.passed) throw new Error('Leakage preflight failed');
const docs = new Map(inv.documents.map((d) => [d.reference, d])),
  annMap = new Map(inv.annotations.map((a) => [a.id, a]));
const countTokens = await tokenCounter();
const modelHashes: Record<string, string> = {};
for (const f of [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model.onnx',
  'onnx/model.onnx_data',
])
  modelHashes[f] = digest(await readFile(resolve(MODEL_DIRECTORY, f)));
async function sourceFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const list: string[] = [];
  for (const e of entries) {
    const p = `${folder}/${e.name}`;
    if (e.isDirectory()) list.push(...(await sourceFiles(p)));
    else if (p.endsWith('.ts')) list.push(p);
  }
  return list.sort();
}
const codeFiles = [
  ...(await sourceFiles('src/lib')),
  'scripts/benchmark.ts',
  'scripts/prepare-split.ts',
  'scripts/check-leakage.ts',
];
const codeHash = digest(
  (await Promise.all(codeFiles.map(async (p) => p + '\0' + digest(await readFile(p))))).join('\n'),
);
const preregistration = {
  version: 1,
  corpusFingerprint: inv.fingerprint,
  splitManifestSha256: digest(manifestBytes),
  codeHash,
  modelHashes,
  model: MODEL_CONFIG,
  segmentation: { words: 80, overlap: 20, maxTokens: 256, sentenceAndParagraphAware: true },
  alphas: ALPHAS,
  thresholds: THRESHOLDS,
  mergeGap: MERGE_GAP,
  selection: 'validation PlagDet, precision, higher threshold, fixed alpha order',
  candidateRetrieval:
    'exhaustive supplied collection, independent best source window per query window',
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  gitStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
  runtime: {
    bun: process.versions.bun,
    nodeCompatibility: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
};
await writeFile(`${dir}/experiment-config.json`, JSON.stringify(preregistration, null, 2) + '\n');
async function passages(refs: string[]): Promise<Passage[]> {
  const result: Passage[] = [];
  for (const r of refs) {
    const doc = docs.get(r);
    if (!doc) throw new Error(`Unknown reference ${r}`);
    const text = await loadDocument(inv.root, doc);
    result.push(...segment(text, r, { countTokens }));
  }
  return result;
}
console.log('Fitting TF-IDF using training windows only');
const trainStart = performance.now(),
  training = await passages([...split.train.sourceReferences, ...split.train.suspiciousReferences]);
const tfidf = Tfidf.fit(training.map((p) => p.text));
const tfidfRecord = {
  version: 1,
  trainingPassages: tfidf.trainingPassages,
  idf: tfidf.idf,
  splitManifestSha256: preregistration.splitManifestSha256,
};
await writeFile(`${cache}/tfidf.json`, JSON.stringify(tfidfRecord));
const fitSeconds = (performance.now() - trainStart) / 1000;
const timing: Record<string, unknown> = {
  tfidfFitSeconds: fitSeconds,
  trainingPassages: training.length,
  vocabularySize: Object.keys(tfidf.idf).length,
};
async function embeddings(name: string, items: Passage[]): Promise<number[][]> {
  const key = digest(
    JSON.stringify({
      modelHashes,
      config: MODEL_CONFIG,
      passages: items.map((p) => [p.id, digest(p.text)]),
    }),
  );
  const base = `${cache}/embeddings-${name}-${key}`;
  try {
    const meta = JSON.parse(await readFile(base + '.json', 'utf8')),
      bytes = await readFile(base + '.f32');
    if (
      meta.key !== key ||
      meta.sha256 !== digest(bytes) ||
      bytes.length !== items.length * 384 * 4
    )
      throw new Error('Embedding cache integrity failure');
    const flat = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    timing[`${name}Embeddings`] = {
      passages: items.length,
      cacheHit: true,
      originalComputeSeconds: meta.computeSeconds,
    };
    return items.map((_, i) => Array.from(flat.subarray(i * 384, (i + 1) * 384)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const start = performance.now(),
    all: number[][] = [];
  for (let i = 0; i < items.length; i += 128) {
    all.push(...(await embedTexts(items.slice(i, i + 128).map((p) => p.text))));
    if (i % 512 === 0)
      console.log(`Embedding ${name}: ${Math.min(i + 128, items.length)}/${items.length}`);
  }
  const computeSeconds = (performance.now() - start) / 1000,
    flat = new Float32Array(all.flat()),
    bytes = Buffer.from(flat.buffer);
  for (const vector of all) {
    const norm = vector.reduce((s, x) => s + x * x, 0);
    if (Math.abs(norm - 1) > 0.001) throw new Error('Non-normalized embedding');
  }
  await writeFile(base + '.f32.tmp', bytes);
  await rename(base + '.f32.tmp', base + '.f32');
  await writeFile(
    base + '.json',
    JSON.stringify({ key, sha256: digest(bytes), computeSeconds, passages: items.length }),
  );
  timing[`${name}Embeddings`] = { passages: items.length, cacheHit: false, computeSeconds };
  return all;
}
function selection(
  rows: Record<string, Candidate[]>,
  cases: PlagiarismAnnotation[],
  method: Method,
): { config: DetectionConfig; metrics: ReturnType<typeof evaluatePan>; search: unknown[] } {
  let best: { config: DetectionConfig; metrics: ReturnType<typeof evaluatePan> } | undefined;
  const search: unknown[] = [];
  for (const alpha of method === 'hybrid' ? ALPHAS : [method === 'lexical' ? 1 : 0])
    for (const threshold of THRESHOLDS) {
      const config = { method, threshold, alpha, mergeGap: MERGE_GAP },
        predictions = detect(rows[scoreKey(method, alpha)], threshold),
        metrics = evaluatePan(cases, predictions);
      search.push({ config, metrics });
      if (
        !best ||
        metrics.plagdet > best.metrics.plagdet ||
        (metrics.plagdet === best.metrics.plagdet &&
          (metrics.precision > best.metrics.precision ||
            (metrics.precision === best.metrics.precision && threshold > best.config.threshold)))
      )
        best = { config, metrics };
    }
  return { ...best!, search };
}
const validationSources = await passages(split.validation.sourceReferences),
  validationQueries = await passages(split.validation.suspiciousReferences),
  validationCases = split.validation.annotationIds.map((id) => annMap.get(id)!);
let start = performance.now();
const lexicalValidation = retrieveCandidates(validationQueries, validationSources, tfidf);
timing.validationLexicalRetrievalSeconds = (performance.now() - start) / 1000;
const lexicalSelection = selection(lexicalValidation, validationCases, 'lexical');
await writeFile(`${dir}/lexical-validation.json`, JSON.stringify(lexicalSelection, null, 2) + '\n');
console.log('Lexical validation selection', lexicalSelection.config);
const vs = await embeddings('validation-sources', validationSources),
  vq = await embeddings('validation-queries', validationQueries);
start = performance.now();
const validationRows = retrieveCandidates(validationQueries, validationSources, tfidf, vq, vs);
timing.validationSharedScoreGenerationSeconds = (performance.now() - start) / 1000;
const choices = {
  lexical: lexicalSelection,
  semantic: selection(validationRows, validationCases, 'semantic'),
  hybrid: selection(validationRows, validationCases, 'hybrid'),
};
await writeFile(`${dir}/validation-search.json`, JSON.stringify(choices, null, 2) + '\n');
const frozen = {
  experimentConfigSha256: digest(JSON.stringify(preregistration)),
  splitManifestSha256: preregistration.splitManifestSha256,
  tfidfSha256: digest(JSON.stringify(tfidfRecord)),
  selectedAt: new Date().toISOString(),
  selectionPartition: 'validation',
  methods: Object.fromEntries(Object.entries(choices).map(([k, v]) => [k, v.config])),
};
await writeFile(`${dir}/frozen-parameters.json`, JSON.stringify(frozen, null, 2) + '\n');
console.log('Parameters frozen before test scoring', frozen.methods);
// Held-out scoring begins only after writing the frozen parameter record. No subsequent selection.
const testSources = await passages(split.test.sourceReferences),
  testQueries = await passages(split.test.suspiciousReferences),
  testCases = split.test.annotationIds.map((id) => annMap.get(id)!);
const ts = await embeddings('test-sources', testSources),
  tq = await embeddings('test-queries', testQueries);
start = performance.now();
const testRows = retrieveCandidates(testQueries, testSources, tfidf, tq, ts, [
  choices.hybrid.config.alpha,
]);
timing.testSharedScoreGenerationSeconds = (performance.now() - start) / 1000;
const testResults: Record<string, unknown> = {},
  predictions: Record<string, unknown> = {},
  validationMetrics: Record<string, unknown> = {};
const positiveRefs = new Set(testCases.map((a) => a.suspiciousReference));
for (const method of ['lexical', 'semantic', 'hybrid'] as const) {
  const c = choices[method].config;
  start = performance.now();
  const detected = detect(testRows[scoreKey(method, c.alpha)], c.threshold, c.mergeGap);
  const postprocessingSeconds = (performance.now() - start) / 1000;
  const metrics = evaluatePan(testCases, detected);
  const groups: Record<string, unknown> = {};
  for (const type of ['artificial/none', 'artificial/low', 'artificial/high', 'simulated']) {
    const cases = testCases.filter(
      (a) =>
        (a.construction.type === 'artificial'
          ? `artificial/${a.construction.obfuscation}`
          : a.construction.type) === type,
    );
    const refs = new Set(cases.map((a) => a.suspiciousReference));
    const subsetDetections = detected.filter((d) => refs.has(d.suspiciousReference));
    groups[type] = {
      metrics: cases.length ? evaluatePan(cases, subsetDetections) : null,
      note: 'Predictions restricted to queries containing this stratum; other ground-truth strata within the same query can affect stratum precision.',
    };
  }
  const cleanAlerts = new Set(
    detected
      .filter((d) => !positiveRefs.has(d.suspiciousReference))
      .map((d) => d.suspiciousReference),
  );
  testResults[method] = {
    config: c,
    metrics,
    perType: groups,
    cleanQueries: split.test.suspiciousReferences.length - positiveRefs.size,
    cleanQueriesWithAlerts: cleanAlerts.size,
    postprocessingSeconds,
    missedAnnotationIds: testCases
      .filter((a) => !detected.some((d) => overlaps(a, d)))
      .map((a) => a.id),
    falsePositiveDetections: detected.filter((d) => !testCases.some((a) => overlaps(a, d))),
  };
  predictions[method] = detected;
  validationMetrics[method] = choices[method].metrics;
}
await writeFile(`${dir}/test-predictions.json`, JSON.stringify(predictions, null, 2) + '\n');
const result = {
  version: 1,
  runCompletedAt: new Date().toISOString(),
  corpusFingerprint: inv.fingerprint,
  splitManifestSha256: preregistration.splitManifestSha256,
  experimentConfigSha256: frozen.experimentConfigSha256,
  scope:
    'bounded English PAN-PC-11 external detection; reduced candidate collection; not full-corpus or CS performance',
  validation: validationMetrics,
  test: testResults,
  timing: {
    ...timing,
    totalWallSeconds: (performance.now() - runStart) / 1000,
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
    cpuUsageMicroseconds: process.cpuUsage(),
  },
  passages: {
    validationSources: validationSources.length,
    validationQueries: validationQueries.length,
    testSources: testSources.length,
    testQueries: testQueries.length,
  },
  limitations: [
    'Size-limited, quarantine-selected subset with reduced candidate collection',
    'Only one held-out simulated case',
    'Translations excluded',
    'No confidence calibration or significance claim',
    'Metrics implemented from official definitions/reference fixtures; Python reference not executed',
  ],
};
await writeFile(`${dir}/benchmark-results.json`, JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(testResults).map(([k, v]) => [k, (v as { metrics: unknown }).metrics]),
    ),
    null,
    2,
  ),
);
