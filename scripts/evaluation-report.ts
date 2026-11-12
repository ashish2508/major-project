import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { digest } from '../src/lib/digest';
import { evaluatePredictions, formatRate, metricsAreFinite } from '../src/lib/evaluation/summary';
import type { DetectionConfig, Method } from '../src/lib/detection/detector';
import type { PanMetrics } from '../src/lib/evaluation/pan';
import type { Inventory, DatasetSplit } from '../src/lib/dataset/types';
import type { Detection } from '../src/lib/detection/detector';

const sourceDir = 'reports/implementation';
const outputDir = 'reports/evaluation';
const methods = ['lexical', 'semantic', 'hybrid'] as const satisfies readonly Method[];
const names: Record<Method, string> = {
  lexical: 'TF-IDF',
  semantic: 'MiniLM',
  hybrid: 'Hybrid',
};
type TestResult = {
  config: DetectionConfig;
  metrics: PanMetrics;
  cleanQueries: number;
  cleanQueriesWithAlerts: number;
  postprocessingSeconds: number;
};
const [benchmarkText, frozenText, configText, splitText, predictionsText, inventoryText] =
  await Promise.all(
    [
      'benchmark-results.json',
      'frozen-parameters.json',
      'experiment-config.json',
      'split-manifest.json',
      'test-predictions.json',
      '../../.cache/research/inventory.json',
    ].map((file) => readFile(`${sourceDir}/${file}`, 'utf8')),
  );
const benchmark = JSON.parse(benchmarkText) as {
  runCompletedAt: string;
  corpusFingerprint: string;
  splitManifestSha256: string;
  experimentConfigSha256: string;
  scope: string;
  validation: Record<Method, PanMetrics>;
  test: Record<Method, TestResult>;
  timing: Record<string, unknown> & {
    testSharedScoreGenerationSeconds: number;
    totalWallSeconds: number;
    peakRssBytes: number;
  };
  passages: Record<string, number>;
  limitations: string[];
};
const frozen = JSON.parse(frozenText);
const experiment = JSON.parse(configText);
const split = JSON.parse(splitText) as DatasetSplit;
const inventory = JSON.parse(inventoryText) as Inventory;
const predictions = JSON.parse(predictionsText) as Record<Method, Detection[]>;
const annotationsById = new Map(
  inventory.annotations.map((annotation) => [annotation.id, annotation]),
);
const testCases = split.test.annotationIds.map((id) => {
  const annotation = annotationsById.get(id);
  assert(annotation, `Missing test annotation ${id}`);
  return annotation;
});
const splitHash = digest(splitText);
assert.equal(inventory.fingerprint, benchmark.corpusFingerprint);
assert.equal(benchmark.corpusFingerprint, experiment.corpusFingerprint);
assert.equal(benchmark.splitManifestSha256, splitHash);
assert.equal(frozen.splitManifestSha256, splitHash);
assert.equal(benchmark.experimentConfigSha256, digest(JSON.stringify(experiment)));
assert.equal(frozen.experimentConfigSha256, benchmark.experimentConfigSha256);
assert.equal(frozen.selectionPartition, 'validation');
assert.equal(split.scope, 'english-to-english');

const methodsOutput = Object.fromEntries(
  methods.map((method) => {
    const row = benchmark.test[method];
    assert.deepEqual(row.config, frozen.methods[method]);
    const calculated = evaluatePredictions(
      split.test.suspiciousReferences,
      testCases,
      predictions[method],
    );
    assert.equal(predictions[method].length, row.metrics.detections);
    assert.deepEqual(calculated.metrics, row.metrics, `${method} saved metric mismatch`);
    assert.equal(calculated.falsePositiveRate.cleanQueries, row.cleanQueries);
    assert.equal(calculated.falsePositiveRate.cleanQueriesWithAlerts, row.cleanQueriesWithAlerts);
    assert(metricsAreFinite(calculated.metrics), `Non-finite ${method} metrics`);
    return [
      method,
      {
        displayName: names[method],
        configuration: row.config,
        validation: benchmark.validation[method],
        heldOutTest: calculated.metrics,
        falsePositiveRate: {
          definition: 'clean query documents with >=1 alert / all clean query documents',
          ...calculated.falsePositiveRate,
        },
        missedAnnotationIds: calculated.missedAnnotationIds,
        unmatchedDetectionCount: calculated.unmatched.length,
        runtimeSeconds: {
          methodSpecificPostprocessing: row.postprocessingSeconds,
          sharedCandidateScoring: benchmark.timing.testSharedScoreGenerationSeconds,
          isolatedEndToEnd: null,
        },
      },
    ];
  }),
);

const output = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sourceRunCompletedAt: benchmark.runCompletedAt,
  corpusFingerprint: benchmark.corpusFingerprint,
  splitManifestSha256: splitHash,
  experimentConfigSha256: benchmark.experimentConfigSha256,
  scope: benchmark.scope,
  evaluation: {
    level: 'character-span macro evaluation using PAN performance-measures semantics',
    truePositiveRule:
      'A prediction contributes overlap only when suspicious and source references both match and both half-open character spans overlap; coverage is based on the union of intersecting characters.',
    falsePositiveRule:
      'A predicted span pair is unmatched when no annotated pair overlaps on both documents. Query-level false-positive rate is separately defined over suspicious documents with no annotations.',
    split: {
      algorithm: split.algorithm,
      seed: split.seed,
      scope: split.scope,
      trainQueries: split.train.suspiciousReferences.length,
      validationQueries: split.validation.suspiciousReferences.length,
      testQueries: split.test.suspiciousReferences.length,
      selectionPartition: frozen.selectionPartition,
      thresholdsFrozenBeforeTest: true,
    },
  },
  methods: methodsOutput,
  runtime: {
    totalBenchmarkWallSeconds: benchmark.timing.totalWallSeconds,
    peakRssBytes: benchmark.timing.peakRssBytes,
    sharedTestCandidateScoringSeconds: benchmark.timing.testSharedScoreGenerationSeconds,
    semanticEmbeddingComputeSeconds: {
      source: (benchmark.timing['test-sourcesEmbeddings'] as { computeSeconds: number })
        .computeSeconds,
      query: (benchmark.timing['test-queriesEmbeddings'] as { computeSeconds: number })
        .computeSeconds,
    },
    limitation:
      'Candidate scoring is shared across methods and embeddings are computed once; isolated end-to-end per-method wall time was not measured. Per-method postprocessing and shared work are reported separately.',
  },
  passages: benchmark.passages,
  limitations: [
    ...benchmark.limitations,
    'The held-out set is a bounded, family-disjoint subset; this is not a full PAN-PC-11 run.',
    'PAN-PC-11 consists of book texts, so these results do not establish performance on research papers.',
    'Semantic similarity is only a candidate similarity signal; annotations provide the plagiarism ground truth.',
    'Query-level false-positive rate is a document-level clean-query statistic, not a character-level specificity estimate.',
  ],
};

const rows = methods.map((method) => {
  const m = output.methods[method];
  return `| ${names[method]} | ${m.configuration.threshold} | ${m.configuration.alpha} | ${m.heldOutTest.precision.toFixed(4)} | ${m.heldOutTest.recall.toFixed(4)} | ${m.heldOutTest.f1.toFixed(4)} | ${formatRate(m.falsePositiveRate.rate)} (${m.falsePositiveRate.cleanQueriesWithAlerts}/${m.falsePositiveRate.cleanQueries}) | ${m.heldOutTest.falsePositiveDetections} | ${m.runtimeSeconds.methodSpecificPostprocessing.toFixed(6)} |`;
});
const markdown = `# PAN-PC-11 evaluation

Generated from the saved run completed at ${benchmark.runCompletedAt}. This report does not rerun detection or alter frozen parameters.

## Evaluation design

The evaluation is character-span macro evaluation using PAN-style interval coverage. A prediction overlaps a ground-truth plagiarism instance only when the suspicious-document reference and source-document reference match and both half-open character intervals overlap. Precision and recall average union coverage over predicted and annotated spans, respectively; F1 is their harmonic mean. The saved result also includes granularity and PlagDet.

Thresholds were selected on the validation partition and frozen before scoring the held-out test partition. Documents are assigned by connected document families so a suspicious/source family cannot cross train, validation, and test. This run uses the bounded English-to-English split, not the full corpus.

False-positive rate here means the fraction of suspicious query documents with no PAN annotations that received at least one alert. It is a clean-document rate, not span-level specificity. Unmatched detection count is separately taken from the PAN span-pair overlap rule.

## Held-out test results

| Method | Threshold | Lexical weight | Precision | Recall | F1 | Clean-query FPR | Unmatched spans | Method-specific postprocessing (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

Saved shared test candidate scoring took ${benchmark.timing.testSharedScoreGenerationSeconds.toFixed(3)} s. MiniLM source and query embedding compute took ${(output.runtime.semanticEmbeddingComputeSeconds.source + output.runtime.semanticEmbeddingComputeSeconds.query).toFixed(3)} s combined. The benchmark computed shared candidate scores and embeddings once for all methods, so isolated end-to-end per-method time was not measured. Per-method postprocessing times alone must not be read as end-to-end comparisons. Total recorded benchmark wall time was ${benchmark.timing.totalWallSeconds.toFixed(2)} s.

## Limits

- PAN-PC-11 is a book-text plagiarism corpus. Results do not establish accuracy on research-paper writing, terminology, citation conventions, or PDF extraction artifacts.
- The evaluation is a bounded subset with reduced source candidates; it is not a full-corpus search.
- Semantic similarity is not itself a plagiarism label. Ground truth comes from PAN annotations.
- The test partition contains only one simulated case, so its type-specific result is not a stable estimate.
- Clean-query FPR uses the 24 unannotated test queries as its denominator and should be interpreted with that small sample size.

Full saved measurements and configurations: [source benchmark](../implementation/benchmark-results.json), [frozen parameters](../implementation/frozen-parameters.json), [split manifest](../implementation/split-manifest.json), and [predictions](../implementation/test-predictions.json).
`;
await mkdir(outputDir, { recursive: true });
await writeFile(`${outputDir}/pan-pc-11-evaluation.json`, JSON.stringify(output, null, 2) + '\n');
await writeFile(
  `${outputDir}/pan-pc-11-evaluation.md`,
  await format(markdown, { parser: 'markdown' }),
);
console.log(`Wrote ${outputDir}/pan-pc-11-evaluation.{json,md}`);
