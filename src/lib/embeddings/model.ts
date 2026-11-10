import {
  pipeline,
  AutoTokenizer,
  env,
  type FeatureExtractionPipeline,
  type PreTrainedTokenizer,
} from '@huggingface/transformers';
import { resolve } from 'node:path';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

export const MODEL_ID = 'onnx-community/all-MiniLM-L6-v2-ONNX';
export const MODEL_DIRECTORY = resolve(
  /* turbopackIgnore: true */
  process.env.MINILM_DIRECTORY ?? '.cache/transformers/onnx-community/all-MiniLM-L6-v2-ONNX',
);
export const MODEL_CONFIG = {
  model: MODEL_ID,
  device: 'cpu',
  dtype: 'fp32',
  dimensions: 384,
  maxTokens: 256,
  pooling: 'mean',
  normalize: true,
  batchSize: 16,
  intraOpNumThreads: 4,
} as const;
env.allowRemoteModels = false;
type Device = 'cpu' | 'dml';
const extractors = new Map<
  Device,
  Promise<{ extractor: FeatureExtractionPipeline; provider: string }>
>();
let tokenizerPromise: Promise<PreTrainedTokenizer> | null = null;
export async function getTokenizer(): Promise<PreTrainedTokenizer> {
  if (!tokenizerPromise)
    tokenizerPromise = AutoTokenizer.from_pretrained(MODEL_DIRECTORY, {
      local_files_only: true,
    }).catch((e) => {
      tokenizerPromise = null;
      throw new Error(`Local MiniLM tokenizer unavailable at ${MODEL_DIRECTORY}: ${String(e)}`);
    });
  return tokenizerPromise;
}
export async function tokenCounter(): Promise<(s: string) => number> {
  const tokenizer = await getTokenizer();
  return (s: string) => tokenizer(s, { truncation: false, padding: false }).input_ids.size;
}
export function applicationDevice(): Device {
  const value = process.env.MINILM_DEVICE ?? 'cpu';
  if (value !== 'cpu' && value !== 'dml') throw new Error('MINILM_DEVICE must be cpu or dml');
  return value;
}
async function loadExtractor(device: Device) {
  const gpu = device === 'dml';
  const adapter = Number(process.env.MINILM_DML_ADAPTER ?? 0);
  if (gpu && (process.platform !== 'win32' || !Number.isSafeInteger(adapter) || adapter < 0))
    throw new Error('DirectML requires native Windows and a nonnegative adapter index');
  const profileDirectory = gpu ? await mkdtemp(resolve(tmpdir(), 'minilm-dml-')) : undefined;
  const extractor = await pipeline('feature-extraction', MODEL_DIRECTORY, {
    device,
    dtype: 'fp32',
    local_files_only: true,
    session_options: {
      executionProviders: gpu ? [{ name: 'dml', deviceId: adapter }] : ['cpu'],
      executionMode: 'sequential',
      enableMemPattern: !gpu,
      intraOpNumThreads: 4,
      interOpNumThreads: 1,
      ...(profileDirectory && {
        enableProfiling: true,
        profileFilePrefix: resolve(profileDirectory, 'session'),
      }),
    },
  });
  if (!profileDirectory) return { extractor, provider: 'CPUExecutionProvider' };
  try {
    await extractor('Verify local MiniLM execution.', { pooling: 'mean', normalize: true });
    extractor.model.sessions.model.endProfiling();
    const profile = (await readdir(profileDirectory)).find((file) => file.endsWith('.json'));
    if (!profile) throw new Error('ONNX Runtime did not produce a DirectML profile');
    const events = JSON.parse(await readFile(resolve(profileDirectory, profile), 'utf8')) as {
      cat?: string;
      args?: { provider?: string };
    }[];
    const providers = new Set(
      events.filter((event) => event.cat === 'Node').map((event) => event.args?.provider),
    );
    if (!providers.has('DmlExecutionProvider'))
      throw new Error('No MiniLM operator ran on DirectML');
    return {
      extractor,
      provider: providers.has('CPUExecutionProvider')
        ? 'DmlExecutionProvider + CPUExecutionProvider'
        : 'DmlExecutionProvider',
    };
  } catch (error) {
    await extractor.dispose();
    throw error;
  }
}
function getExtractor(device: Device) {
  let pending = extractors.get(device);
  if (!pending) {
    pending = loadExtractor(device).catch((error) => {
      extractors.delete(device);
      throw new Error(`Local MiniLM ${device} initialization failed: ${String(error)}`);
    });
    extractors.set(device, pending);
  }
  return pending;
}
export async function embeddingProvider(device: Device) {
  return (await getExtractor(device)).provider;
}
/** The caller must segment first. Long passages are rejected rather than silently truncated. */
export async function embedTexts(texts: string[], device: Device = 'cpu'): Promise<number[][]> {
  if (!texts.length) return [];
  const count = await tokenCounter();
  for (const text of texts)
    if (!text.trim() || count(text) > 256)
      throw new Error(
        'Embedding input must contain text and fit within 256 tokens including special tokens',
      );
  const { extractor } = await getExtractor(device),
    result: number[][] = [];
  for (let start = 0; start < texts.length; start += MODEL_CONFIG.batchSize) {
    const output = await extractor(texts.slice(start, start + MODEL_CONFIG.batchSize), {
      pooling: 'mean',
      normalize: true,
    });
    const rows = output.tolist() as number[][];
    if (rows.some((row) => row.length !== 384 || row.some((v) => !Number.isFinite(v))))
      throw new Error('Invalid MiniLM output');
    result.push(...rows);
  }
  return result;
}
