import { mkdir, writeFile } from 'node:fs/promises';
import { buildInventory } from '../src/lib/dataset/inventory';
import { cacheDirectory, reportDirectory } from './research-paths';
const start = performance.now();
const inventory = await buildInventory(process.argv[2]);
await mkdir(cacheDirectory, { recursive: true });
await mkdir(reportDirectory, { recursive: true });
await writeFile(`${cacheDirectory}/inventory.json`, JSON.stringify(inventory));
await writeFile(
  `${reportDirectory}/dataset-validation.json`,
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
