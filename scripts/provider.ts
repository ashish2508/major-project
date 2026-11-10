import * as ort from 'onnxruntime-node';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getTokenizer, MODEL_DIRECTORY, MODEL_CONFIG } from '../src/lib/embeddings/model';
import { cacheDirectory, reportDirectory } from './research-paths';
const profileDirectory = `${cacheDirectory}/profiling`;
await mkdir(profileDirectory, { recursive: true });
const tokenizer = await getTokenizer();
const inputs = tokenizer('A local research document similarity check.', {
  padding: true,
  truncation: true,
});
const session = await ort.InferenceSession.create(resolve(MODEL_DIRECTORY, 'onnx/model.onnx'), {
  executionProviders: ['cpu'],
  intraOpNumThreads: 4,
  enableProfiling: true,
  profileFilePrefix: resolve(profileDirectory, 'cpu'),
});
const feeds: Record<string, ort.Tensor> = {};
for (const name of session.inputNames) {
  const t = inputs[name as keyof typeof inputs];
  if (!t || typeof t !== 'object' || !('data' in t)) throw new Error(`Missing ONNX input ${name}`);
  feeds[name] = new ort.Tensor('int64', t.data as BigInt64Array, t.dims as number[]);
}
const start = performance.now();
const result = await session.run(feeds);
const elapsedMs = performance.now() - start;
session.endProfiling();
await session.release();
const profiles = (await readdir(profileDirectory)).filter((f) => f.endsWith('.json')).sort();
const events = JSON.parse(await readFile(resolve(profileDirectory, profiles.at(-1)!), 'utf8')) as {
  args?: { provider?: string };
}[];
const providers = [...new Set(events.map((e) => e.args?.provider).filter(Boolean))];
if (providers.length !== 1 || providers[0] !== 'CPUExecutionProvider')
  throw new Error(`Unexpected actual providers: ${providers}`);
const output = {
  requested: MODEL_CONFIG,
  availableBackends: ort.listSupportedBackends(),
  profileObservedProviders: providers,
  elapsedMs,
  outputs: Object.fromEntries(Object.entries(result).map(([k, t]) => [k, t.dims])),
  note: 'CPU was explicitly selected and verified from native profiling.',
};
await writeFile(
  `${reportDirectory}/inference-provider.json`,
  JSON.stringify(output, null, 2) + '\n',
);
console.log(JSON.stringify(output, null, 2));
