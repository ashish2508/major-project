
import { pipeline, env } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";

// Store downloaded model files outside node_modules.
env.cacheDir = `${process.cwd()}/.cache/transformers`;

type FeatureExtractor = (
  texts: string[],
  options: {
    pooling: "mean";
    normalize: boolean;
  }
) => Promise<{
  tolist(): number[][];
}>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      MODEL_ID
    ) as Promise<FeatureExtractor>;
  }

  try {
    return await extractorPromise;
  } catch (error) {
    extractorPromise = null;
    throw error;
  }
}

export async function embedTexts(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  if (texts.some((text) => !text.trim())) {
    throw new Error("Input texts cannot be empty.");
  }

  const extractor = await getExtractor();

  const output = await extractor(texts, {
    pooling: "mean",
    normalize: true,
  });

  return output.tolist();
}
