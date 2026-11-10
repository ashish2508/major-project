import { readFile, writeFile } from 'node:fs/promises';
import type { Inventory } from '../src/lib/dataset/types';
import {
  documentFamilies,
  annotationIndex,
  eligiblePartition,
  SPLIT_SEED,
} from '../src/lib/dataset/split';
import { cacheDirectory, reportDirectory } from './research-paths';
const inv: Inventory = JSON.parse(await readFile(`${cacheDirectory}/inventory.json`, 'utf8'));
const families = documentFamilies(inv.documents),
  byDoc = annotationIndex(inv.annotations),
  docs = new Map(inv.documents.map((d) => [d.reference, d]));
const summary: Record<string, Record<string, number>> = {};
const eligible = [];
for (const d of inv.documents.filter((d) => d.role === 'suspicious')) {
  const anns = byDoc.get(d.reference) ?? [],
    p = eligiblePartition(d, anns, families);
  if (!p) continue;
  eligible.push({
    reference: d.reference,
    partition: p,
    type: anns[0]?.construction.type ?? 'clean',
    length: d.textLength,
    maxSource: Math.max(0, ...anns.map((a) => docs.get(a.sourceReference)!.textLength)),
    annotations: anns.length,
  });
  for (const cap of [20000, 50000, 100000, 250000, 1000000, Infinity])
    if (d.textLength <= cap && anns.every((a) => docs.get(a.sourceReference)!.textLength <= cap)) {
      const k = String(cap),
        s = (summary[k] ??= {});
      const key = `${p}:${anns[0]?.construction.type ?? 'clean'}`;
      s[key] = (s[key] ?? 0) + 1;
    }
}
await writeFile(`${cacheDirectory}/eligible.json`, JSON.stringify({ families, eligible }));
await writeFile(
  `${reportDirectory}/split-feasibility.json`,
  JSON.stringify(
    { seed: SPLIT_SEED, families: new Set(Object.values(families)).size, summary },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(summary, null, 2));
