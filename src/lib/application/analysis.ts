import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import alignmentCalibration from '../../../reports/implementation/alignment-fusion/frozen-parameters.json';
import {
  detect,
  retrieveCandidates,
  scoreKey,
  selectSemanticReviewLead,
  type DetectionConfig,
  type Method,
} from '../detection/detector';
import { segment, segmentParagraphs } from '../detection/segmentation';
import { Tfidf } from '../detection/tfidf';
import { digest } from '../digest';
import type { ExtractedDocument } from '../documents/extract';
import {
  applicationDevice,
  embeddingProvider,
  embedTexts,
  MODEL_CONFIG,
  MODEL_DIRECTORY,
  tokenCounter,
} from '../embeddings/model';

const configSchema = z.object({
  method: z.enum(['lexical', 'semantic', 'hybrid']),
  threshold: z.number().min(0).max(1),
  alpha: z.number().min(0).max(1),
  mergeGap: z.number().int().min(0).max(1000),
});
let artifactsPromise: Promise<{ tfidf: Tfidf; configs: Record<Method, DetectionConfig> }> | null =
  null;
let modelVerified: Promise<void> | null = null;
export async function getArtifacts() {
  if (!artifactsPromise)
    artifactsPromise = (async () => {
      const raw = await readFile(resolve('.cache/research/tfidf.json')),
        frozen = JSON.parse(
          await readFile(resolve('reports/implementation/frozen-parameters.json'), 'utf8'),
        );
      if (digest(raw) !== frozen.tfidfSha256)
        throw new Error(
          'Training vocabulary checksum differs from the calibrated experiment. Run bun run reproduce.',
        );
      const record = z
        .object({
          trainingPassages: z.number().int().positive(),
          idf: z.record(z.string(), z.number().positive()),
        })
        .parse(JSON.parse(raw.toString('utf8')));
      const configs = z
        .object({ lexical: configSchema, semantic: configSchema, hybrid: configSchema })
        .parse({ ...frozen.methods, semantic: alignmentCalibration.methods.semantic });
      for (const key of ['lexical', 'semantic', 'hybrid'] as const)
        if (configs[key].method !== key) throw new Error('Invalid calibrated method mapping');
      return { tfidf: new Tfidf(record.idf, record.trainingPassages), configs };
    })().catch((e) => {
      artifactsPromise = null;
      throw new Error(
        `Calibrated research artifacts unavailable: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  return artifactsPromise;
}
async function verifyModel() {
  if (!modelVerified)
    modelVerified = (async () => {
      const expected = JSON.parse(
        await readFile('reports/implementation/experiment-config.json', 'utf8'),
      ).modelHashes as Record<string, string>;
      for (const [file, sha] of Object.entries(expected))
        if (digest(await readFile(resolve(MODEL_DIRECTORY, file))) !== sha)
          throw new Error('Local model differs from recorded calibration hashes');
    })().catch((e) => {
      modelVerified = null;
      throw e;
    });
  return modelVerified;
}
export async function analyzeDocuments(
  query: ExtractedDocument,
  sources: ExtractedDocument[],
  method: Method,
) {
  const start = performance.now(),
    { tfidf, configs } = await getArtifacts(),
    config = configs[method];
  const countTokens = await tokenCounter();
  const alignSemantically = method === 'semantic' || (method === 'hybrid' && config.alpha < 1);
  const split = alignSemantically ? segmentParagraphs : segment;
  const queries = split(query.text, query.reference, { countTokens }, query.paragraphBreaks);
  const sourcePassages = sources.flatMap((source) =>
    split(source.text, source.reference, { countTokens }, source.paragraphBreaks),
  );
  const mergeGap = config.mergeGap;
  if (!queries.length || !sourcePassages.length)
    throw new Error('Documents need extractable words');
  let rows;
  let provider = 'TF-IDF on CPU';
  if (method === 'lexical') rows = retrieveCandidates(queries, sourcePassages, tfidf);
  else {
    await verifyModel();
    const device = applicationDevice();
    const passages = [...queries, ...sourcePassages],
      uniqueTexts = [...new Set(passages.map((passage) => passage.text))],
      uniqueVectors = await embedTexts(uniqueTexts, device),
      vectorByText = new Map(uniqueTexts.map((text, index) => [text, uniqueVectors[index]])),
      vectors = passages.map((passage) => vectorByText.get(passage.text)!);
    provider = await embeddingProvider(device);
    rows = retrieveCandidates(
      queries,
      sourcePassages,
      tfidf,
      vectors.slice(0, queries.length),
      vectors.slice(queries.length),
      [config.alpha],
    );
  }
  const detections = detect(rows[scoreKey(method, config.alpha)], config.threshold, mergeGap);
  const semanticReviewThreshold = configs.semantic.threshold;
  const semanticReviewLead =
    method === 'lexical' || !rows.semantic
      ? null
      : selectSemanticReviewLead(rows.semantic, semanticReviewThreshold);
  return {
    query,
    sources,
    method,
    config: { ...config, mergeGap },
    detections: detections.map((d) => ({
      ...d,
      semantic: method === 'lexical' ? null : d.semantic,
    })),
    semanticReviewLead,
    semanticReviewThreshold,
    passages: { query: queries.length, sources: sourcePassages.length },
    elapsedSeconds: (performance.now() - start) / 1000,
    provider,
    model: method === 'lexical' ? null : MODEL_CONFIG.model,
    warning:
      'Similarity scores are uncalibrated evidence for human review, not probabilities or proof of plagiarism or misconduct. Only supplied sources were searched. PAN-PC-11 calibration is book-based and does not establish CS-paper performance.',
  };
}
export type AnalysisResult = Awaited<ReturnType<typeof analyzeDocuments>>;
