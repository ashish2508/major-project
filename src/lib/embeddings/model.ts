import {
  pipeline,
  AutoTokenizer,
  env,
  type FeatureExtractionPipeline,
  type PreTrainedTokenizer,
} from '@huggingface/transformers';
import { resolve } from 'node:path';

export const MODEL_ID = 'onnx-community/all-MiniLM-L6-v2-ONNX';
export const MODEL_DIRECTORY = resolve(
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
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
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
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise)
    extractorPromise = pipeline('feature-extraction', MODEL_DIRECTORY, {
      device: 'cpu',
      dtype: 'fp32',
      local_files_only: true,
      session_options: { executionProviders: ['cpu'], intraOpNumThreads: 4, interOpNumThreads: 1 },
    }).catch((e) => {
      extractorPromise = null;
      throw new Error(`Local MiniLM loading failed: ${String(e)}`);
    });
  return extractorPromise;
}
/** The caller must segment first. Long passages are rejected rather than silently truncated. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const count = await tokenCounter();
  for (const text of texts)
    if (!text.trim() || count(text) > 256)
      throw new Error(
        'Embedding input must contain text and fit within 256 tokens including special tokens',
      );
  const extractor = await getExtractor(),
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
