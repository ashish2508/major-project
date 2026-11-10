import { mkdir, writeFile } from 'node:fs/promises';
import { buildInventory } from '../src/lib/dataset/inventory';
const start = performance.now();
const inventory = await buildInventory(process.argv[2]);
await mkdir('.cache/research', { recursive: true });
await mkdir('reports/implementation', { recursive: true });
await writeFile('.cache/research/inventory.json', JSON.stringify(inventory));
await writeFile(
  'reports/implementation/dataset-validation.json',
  JSON.stringify(
    {
      fingerprint: inventory.fingerprint,
      statistics: inventory.statistics,
      elapsedSeconds: (performance.now() - start) / 1000,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(inventory.statistics));
