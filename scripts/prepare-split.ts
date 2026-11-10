import { readFile, writeFile } from 'node:fs/promises';
import type { DatasetSplit, Inventory, DocumentRecord } from '../src/lib/dataset/types';
import {
  annotationIndex,
  documentFamilies,
  partitionFor,
  SPLIT_SEED,
  emptyPartition,
  validateSplit,
  type PartitionName,
} from '../src/lib/dataset/split';
import { digest } from '../src/lib/dataset/inventory';
const inv: Inventory = JSON.parse(await readFile('.cache/research/inventory.json', 'utf8'));
const families = documentFamilies(inv.documents),
  byDoc = annotationIndex(inv.annotations),
  docs = new Map(inv.documents.map((d) => [d.reference, d]));
const assignments = new Map<string, PartitionName>(),
  reserved: Record<'validation' | 'test', string[]> = { validation: [], test: [] };
const config = {
  maxQueryCharacters: 50000,
  maxSourceCharacters: 100000,
  rareSimulatedSourceMaxCharacters: 500000,
  positiveQueriesPerEvaluation: 24,
  cleanQueriesPerEvaluation: 24,
  trainingQueriesPerClass: 40,
  distractorSourcesPerPartition: 12,
};
const related = (d: DocumentRecord) => [
  d.reference,
  ...new Set((byDoc.get(d.reference) ?? []).map((a) => a.sourceReference)),
];
const suitable = (d: DocumentRecord) =>
  d.role === 'suspicious' &&
  d.language === 'en' &&
  d.textLength <= config.maxQueryCharacters &&
  (byDoc.get(d.reference) ?? []).every(
    (a) =>
      !a.issues.length &&
      a.construction.type !== 'translation' &&
      docs.get(a.sourceReference)!.textLength <=
        (a.construction.type === 'simulated'
          ? config.rareSimulatedSourceMaxCharacters
          : config.maxSourceCharacters),
  );
const cost = (d: DocumentRecord) => related(d).reduce((s, r) => s + docs.get(r)!.textLength, 0);
// Deterministic label stratification before any model outputs: reserve disjoint family bundles
// for the rare manually paraphrased and verbatim categories, then hash the remaining families.
for (const category of ['simulated', 'none']) {
  const candidates = inv.documents
    .filter(
      (d) =>
        suitable(d) &&
        (byDoc.get(d.reference) ?? []).some((a) =>
          category === 'simulated'
            ? a.construction.type === 'simulated'
            : a.construction.type === 'artificial' && a.construction.obfuscation === 'none',
        ),
    )
    .sort((a, b) => cost(a) - cost(b) || a.reference.localeCompare(b.reference));
  for (const p of ['validation', 'test'] as const) {
    const candidate = candidates.find(
      (d) =>
        !Object.values(reserved).flat().includes(d.reference) &&
        related(d).every(
          (r) => !assignments.has(families[r]) || assignments.get(families[r]) === p,
        ),
    );
    if (candidate) {
      reserved[p].push(candidate.reference);
      for (const r of related(candidate)) assignments.set(families[r], p);
    }
  }
}
const assigned = (r: string) => assignments.get(families[r]) ?? partitionFor(families[r]);
const split: DatasetSplit = {
  version: 1,
  seed: SPLIT_SEED,
  corpusFingerprint: inv.fingerprint,
  scope: 'english-to-english',
  algorithm: 'family-bundle-stratified-quarantine-v1',
  config,
  train: emptyPartition(),
  validation: emptyPartition(),
  test: emptyPartition(),
  familyByReference: families,
  excluded: [],
};
const exclusions = new Map<string, string>();
const positives: Record<PartitionName, DocumentRecord[]> = { train: [], validation: [], test: [] },
  clean: typeof positives = { train: [], validation: [], test: [] };
for (const d of inv.documents.filter((d) => d.role === 'suspicious')) {
  const anns = byDoc.get(d.reference) ?? [];
  if (!suitable(d)) {
    exclusions.set(
      d.reference,
      anns.some((a) => a.issues.length)
        ? 'annotation-anomaly'
        : anns.some((a) => a.construction.type === 'translation')
          ? 'translation-scope'
          : 'predeclared-document-size-budget',
    );
    continue;
  }
  const p = assigned(d.reference);
  if (related(d).some((r) => assigned(r) !== p)) {
    exclusions.set(d.reference, 'cross-partition-document-family-or-source');
    continue;
  }
  (anns.length ? positives : clean)[p].push(d);
}
for (const p of ['train', 'validation', 'test'] as const) {
  const order = (a: DocumentRecord, b: DocumentRecord) =>
    digest(SPLIT_SEED + a.reference).localeCompare(digest(SPLIT_SEED + b.reference));
  const forced = p === 'train' ? [] : reserved[p];
  const pos = [
    ...positives[p].filter((d) => forced.includes(d.reference)),
    ...positives[p].filter((d) => !forced.includes(d.reference)).sort(order),
  ].slice(0, p === 'train' ? config.trainingQueriesPerClass : config.positiveQueriesPerEvaluation);
  const neg = clean[p]
    .sort(order)
    .slice(0, p === 'train' ? config.trainingQueriesPerClass : config.cleanQueriesPerEvaluation);
  const selected = [...pos, ...neg],
    selectedSet = new Set(selected.map((d) => d.reference));
  for (const d of [...positives[p], ...clean[p]])
    if (!selectedSet.has(d.reference))
      exclusions.set(d.reference, 'predeclared-query-count-budget');
  split[p].suspiciousReferences = selected.map((d) => d.reference).sort();
  const anns = selected.flatMap((d) => byDoc.get(d.reference) ?? []);
  split[p].annotationIds = anns.map((a) => a.id).sort();
  const sourceRefs = new Set(anns.map((a) => a.sourceReference));
  const globallyUsed = new Set(inv.annotations.map((a) => a.sourceReference));
  const distractors = inv.documents
    .filter(
      (d) =>
        d.role === 'source' &&
        d.language === 'en' &&
        d.textLength <= config.maxSourceCharacters &&
        !globallyUsed.has(d.reference) &&
        assigned(d.reference) === p,
    )
    .sort(order)
    .slice(0, config.distractorSourcesPerPartition);
  for (const d of distractors) sourceRefs.add(d.reference);
  split[p].sourceReferences = [...sourceRefs].sort();
}
for (const d of inv.documents)
  if (
    ![
      ...split.train.sourceReferences,
      ...split.validation.sourceReferences,
      ...split.test.sourceReferences,
      ...split.train.suspiciousReferences,
      ...split.validation.suspiciousReferences,
      ...split.test.suspiciousReferences,
    ].includes(d.reference)
  )
    split.excluded.push({
      reference: d.reference,
      reason:
        exclusions.get(d.reference) ??
        (d.language !== 'en'
          ? 'non-english-source'
          : 'unused-source-outside-bounded-candidate-collection'),
    });
validateSplit(split, inv);
await writeFile(
  'reports/implementation/split-manifest.json',
  JSON.stringify(split, null, 2) + '\n',
);
const summary: Record<string, unknown> = { seed: SPLIT_SEED, reserved, config };
for (const p of ['train', 'validation', 'test'] as const) {
  const anns = split[p].annotationIds.map((id) => inv.annotations.find((a) => a.id === id)!);
  const byType: Record<string, number> = {};
  for (const a of anns) {
    const k =
      a.construction.type === 'artificial'
        ? `artificial/${a.construction.obfuscation}`
        : a.construction.type;
    byType[k] = (byType[k] ?? 0) + 1;
  }
  summary[p] = {
    queries: split[p].suspiciousReferences.length,
    sources: split[p].sourceReferences.length,
    annotations: anns.length,
    byType,
    totalCharacters: [...split[p].sourceReferences, ...split[p].suspiciousReferences].reduce(
      (s, r) => s + docs.get(r)!.textLength,
      0,
    ),
  };
}
const reasons: Record<string, number> = {};
for (const d of split.excluded) reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
summary.exclusions = reasons;
await writeFile(
  'reports/implementation/split-summary.json',
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(JSON.stringify(summary, null, 2));
