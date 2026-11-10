// Explicit setup-only download. Application and experiments remain offline.
import { pipeline, env } from '@huggingface/transformers';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { digest } from '../src/lib/dataset/inventory';
env.cacheDir = resolve('.cache/transformers');
env.allowRemoteModels = true;
const model = await pipeline('feature-extraction', 'onnx-community/all-MiniLM-L6-v2-ONNX', {
  device: 'cpu',
  dtype: 'fp32',
  session_options: { executionProviders: ['cpu'], intraOpNumThreads: 4 },
});
const result = await model('Local model setup verification.', { pooling: 'mean', normalize: true });
if (result.dims[1] !== 384) throw new Error('Unexpected model dimension');
await model.dispose();
const files = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model.onnx',
  'onnx/model.onnx_data',
];
const hashes: Record<string, string> = {};
for (const file of files)
  hashes[file] = digest(
    await readFile(resolve(env.cacheDir, 'onnx-community/all-MiniLM-L6-v2-ONNX', file)),
  );
let expected: Record<string, string> | undefined;
try {
  expected = JSON.parse(
    await readFile('reports/implementation/experiment-config.json', 'utf8'),
  ).modelHashes;
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}
await mkdir('.cache/research', { recursive: true });
await writeFile(
  '.cache/research/model-setup.json',
  JSON.stringify(
    {
      hashes,
      matchesRecordedExperiment: expected
        ? Object.keys(hashes).every((k) => hashes[k] === expected![k])
        : null,
    },
    null,
    2,
  ),
);
if (expected && Object.keys(hashes).some((k) => hashes[k] !== expected![k]))
  throw new Error(
    'Downloaded model/config differs from recorded experiment hashes. Do not claim exact reproduction with changed files.',
  );
console.log(
  'Local MiniLM ready; 384 dimensions; model hashes verified when a recorded experiment exists.',
);
