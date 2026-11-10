import { readFile, writeFile } from 'node:fs/promises';
import type { Inventory, DatasetSplit } from '../src/lib/dataset/types';
import { digest, loadDocument } from '../src/lib/dataset/inventory';
import { validateSplit } from '../src/lib/dataset/split';
import { lexicalTokens } from '../src/lib/detection/tfidf';
import { cacheDirectory, reportDirectory } from './research-paths';
const inv: Inventory = JSON.parse(await readFile(`${cacheDirectory}/inventory.json`, 'utf8'));
const manifestBytes = await readFile(`${reportDirectory}/split-manifest.json`);
const split: DatasetSplit = JSON.parse(manifestBytes.toString('utf8'));
validateSplit(split, inv);
const docs = new Map(inv.documents.map((d) => [d.reference, d]));
const selected = (['train', 'validation', 'test'] as const).flatMap((p) =>
  [...split[p].sourceReferences, ...split[p].suspiciousReferences].map((ref) => ({
    ref,
    partition: p,
  })),
);
const postings = new Map<string, number[]>(),
  counts: number[] = [];
for (const [i, { ref }] of selected.entries()) {
  const words = lexicalTokens(await loadDocument(inv.root, docs.get(ref)!));
  const shingles = new Set<string>();
  for (let k = 0; k + 5 <= words.length; k++) shingles.add(words.slice(k, k + 5).join(' '));
  counts.push(shingles.size);
  for (const shingle of shingles) {
    const list = postings.get(shingle) ?? [];
    list.push(i);
    postings.set(shingle, list);
  }
}
const intersections = new Map<string, number>();
for (const list of postings.values())
  for (let a = 0; a < list.length; a++)
    for (let b = a + 1; b < list.length; b++) {
      const i = list[a],
        j = list[b];
      if (selected[i].partition === selected[j].partition) continue;
      const key = `${i}:${j}`;
      intersections.set(key, (intersections.get(key) ?? 0) + 1);
    }
const largest = [...intersections]
  .map(([k, count]) => {
    const [a, b] = k.split(':').map(Number);
    return {
      a: selected[a],
      b: selected[b],
      intersection: count,
      containment: count / Math.min(counts[a], counts[b]),
      jaccard: count / (counts[a] + counts[b] - count),
    };
  })
  .sort((a, b) => b.containment - a.containment);
const violations = largest.filter((p) => p.intersection >= 20 && p.containment >= 0.2);
const result = {
  splitManifestSha256: digest(manifestBytes),
  algorithm: 'all-selected-document normalized 5-word shingle cross-partition containment',
  minimumSharedShingles: 20,
  maximumAllowedContainment: 0.2,
  documentsChecked: selected.length,
  uniqueShingles: postings.size,
  crossPartitionPairsWithOverlap: intersections.size,
  violations,
  largestOverlaps: largest.slice(0, 20),
  passed: violations.length === 0,
  limitation:
    'This detects substantial textual sharing, not all shared ancestry, author aliases, quotations or semantic dependence. Conservative author/title grouping is checked separately.',
};
await writeFile(`${reportDirectory}/leakage-check.json`, JSON.stringify(result, null, 2) + '\n');
console.log({
  documents: selected.length,
  violations: violations.length,
  largestContainment: largest[0]?.containment,
});
if (violations.length) process.exit(1);
