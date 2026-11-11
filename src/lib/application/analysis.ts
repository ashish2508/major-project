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
import { filterInformativeEvidence } from '../detection/informative-evidence';
import { segment, segmentParagraphs } from '../detection/segmentation';
import { stripCanonicalReferences, type StripResult } from '../detection/strip-references';
import { Tfidf } from '../detection/tfidf';
import { digest } from '../digest';
import type { ExtractedDocument } from '../documents/extract';
import { overlaps } from '../evaluation/pan';
import {
  applicationDevice,
  embeddingProvider,
  embedTexts,
  MODEL_CONFIG,
  MODEL_DIRECTORY,
  tokenCounter,
} from '../embeddings/model';
import { getAllReadyPassages } from '../corpus/service';
import { getCorpusPassagesAndVectors } from '../corpus/semantic-index';

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

// ---------------------------------------------------------------------------
// Reference stripping helper
// ---------------------------------------------------------------------------

function stripDocument(doc: ExtractedDocument): {
  strippedDoc: ExtractedDocument;
  stripResult: StripResult;
} {
  const stripResult = stripCanonicalReferences(doc.reference, doc.text);
  const strippedDoc: ExtractedDocument = {
    ...doc,
    text: stripResult.body,
  };
  return { strippedDoc, stripResult };
}

// ---------------------------------------------------------------------------
// Main analysis entry point
// ---------------------------------------------------------------------------

export async function analyzeDocuments(
  query: ExtractedDocument,
  sources: ExtractedDocument[],
  method: Method,
  options?: { useCorpus?: boolean; useCanonicalCorpus?: boolean },
) {
  const useCorpus = options?.useCorpus ?? options?.useCanonicalCorpus ?? false;
  const start = performance.now(),
    { tfidf, configs } = await getArtifacts(),
    config = configs[method];
  const countTokens = await tokenCounter();
  const alignSemantically = method === 'semantic' || (method === 'hybrid' && config.alpha < 1);
  const split = alignSemantically ? segmentParagraphs : segment;

  // --- Reference stripping ---
  const { strippedDoc: strippedQuery, stripResult: queryStripResult } = stripDocument(query);

  // --- Segmentation of Query ---
  const queries = split(
    strippedQuery.text,
    strippedQuery.reference,
    { countTokens },
    strippedQuery.paragraphBreaks,
  );

  const mergeGap = config.mergeGap;
  if (!queries.length) throw new Error('Documents need extractable words');

  let rows;
  let provider = 'TF-IDF on CPU';
  let effectiveSources: ExtractedDocument[] = [];
  const sourceStripResults: Array<{ reference: string; stripResult: StripResult }> = [];

  if (method === 'lexical') {
    let sourcePassages;

    if (useCorpus) {
      const corpusData = await getAllReadyPassages();
      if (!corpusData.passages.length) {
        throw new Error(
          'Corpus contains no ready documents or passages. Ingest research papers first.',
        );
      }
      sourcePassages = corpusData.passages;
      effectiveSources = corpusData.documents;
    } else {
      effectiveSources = sources;
      const strippedSources: ExtractedDocument[] = effectiveSources.map((src) => {
        const { strippedDoc, stripResult } = stripDocument(src);
        sourceStripResults.push({ reference: src.reference, stripResult });
        return strippedDoc;
      });

      sourcePassages = strippedSources.flatMap((source) =>
        split(source.text, source.reference, { countTokens }, source.paragraphBreaks),
      );
    }

    if (!sourcePassages.length) throw new Error('Documents need extractable words');

    rows = retrieveCandidates(queries, sourcePassages, tfidf);

    const mergedDetections = detect(
      rows[scoreKey(method, config.alpha)],
      config.threshold,
      mergeGap,
      alignSemantically,
    );
    const detections = mergedDetections;
    const semanticReviewThreshold = configs.semantic.threshold;

    return buildResult({
      query,
      sources: effectiveSources,
      method,
      config,
      mergeGap,
      detections,
      semanticReviewLead: null,
      semanticReviewThreshold,
      queryPassageCount: queries.length,
      sourcePassageCount: sourcePassages.length,
      elapsedSeconds: (performance.now() - start) / 1000,
      provider,
      queryStripResult,
      sourceStripResults,
      query_ref: query.reference,
    });
  } else {
    await verifyModel();
    const device = applicationDevice();

    let sourcePassages;
    let sourceVectors: number[][];

    if (useCorpus) {
      // Load pre-indexed passages and persistent vectors from disk
      const corpusData = await getCorpusPassagesAndVectors();
      if (!corpusData.passages.length) {
        throw new Error(
          'Corpus contains no ready documents or passages. Ingest research papers first.',
        );
      }
      sourcePassages = corpusData.passages;
      sourceVectors = corpusData.vectors;
      effectiveSources = corpusData.documents;
    } else {
      effectiveSources = sources;
      const strippedSources: ExtractedDocument[] = effectiveSources.map((src) => {
        const { strippedDoc, stripResult } = stripDocument(src);
        sourceStripResults.push({ reference: src.reference, stripResult });
        return strippedDoc;
      });

      sourcePassages = strippedSources.flatMap((source) =>
        split(source.text, source.reference, { countTokens }, source.paragraphBreaks),
      );
      sourceVectors = [];
    }

    if (!sourcePassages.length) throw new Error('Documents need extractable words');

    // Embed only query passages (much smaller set)
    const queryTexts = [...new Set(queries.map((p) => p.text))];
    const queryUniqueVectors = await embedTexts(queryTexts, device);
    const queryVectorByText = new Map(queryTexts.map((t, i) => [t, queryUniqueVectors[i]]));
    const queryVectors = queries.map((p) => queryVectorByText.get(p.text)!);

    if (!useCorpus) {
      // Need to embed ad-hoc source passages on the fly
      const sourceTexts = [...new Set(sourcePassages.map((p) => p.text))];
      const sourceUniqueVectors = await embedTexts(sourceTexts, device);
      const sourceVectorByText = new Map(sourceTexts.map((t, i) => [t, sourceUniqueVectors[i]]));
      sourceVectors = sourcePassages.map((p) => sourceVectorByText.get(p.text)!);
    }

    provider = await embeddingProvider(device);

    rows = retrieveCandidates(
      queries,
      sourcePassages,
      tfidf,
      queryVectors,
      sourceVectors,
      [config.alpha],
      5,
    );

    const mergedDetections = detect(
      rows[scoreKey(method, config.alpha)],
      config.threshold,
      mergeGap,
      alignSemantically,
    );

    const allDocsForFilter = new Map(
      [strippedQuery, ...effectiveSources].map(({ reference, text }) => [reference, text]),
    );
    const detections = alignSemantically
      ? filterInformativeEvidence(mergedDetections, allDocsForFilter, 12)
      : mergedDetections;

    const semanticReviewThreshold = configs.semantic.threshold;
    const semanticReviewLead = !rows.semanticAlternatives
      ? null
      : selectSemanticReviewLead(
          rows.semanticAlternatives.filter(
            (candidate) =>
              candidate.semantic < semanticReviewThreshold &&
              !detections.some((detection) => overlaps(candidate, detection)),
          ),
          semanticReviewThreshold,
        );

    return buildResult({
      query,
      sources: effectiveSources,
      method,
      config,
      mergeGap,
      detections,
      semanticReviewLead,
      semanticReviewThreshold,
      queryPassageCount: queries.length,
      sourcePassageCount: sourcePassages.length,
      elapsedSeconds: (performance.now() - start) / 1000,
      provider,
      queryStripResult,
      sourceStripResults,
      query_ref: query.reference,
    });
  }
}

// ---------------------------------------------------------------------------
// Result builder (shared between lexical and semantic/hybrid paths)
// ---------------------------------------------------------------------------

function buildResult({
  query,
  sources,
  method,
  config,
  mergeGap,
  detections,
  semanticReviewLead,
  semanticReviewThreshold,
  queryPassageCount,
  sourcePassageCount,
  elapsedSeconds,
  provider,
  queryStripResult,
  sourceStripResults,
  query_ref,
}: {
  query: ExtractedDocument;
  sources: ExtractedDocument[];
  method: Method;
  config: { threshold: number; alpha: number; mergeGap: number; method: Method };
  mergeGap: number;
  detections: ReturnType<typeof detect>;
  semanticReviewLead: ReturnType<typeof selectSemanticReviewLead>;
  semanticReviewThreshold: number;
  queryPassageCount: number;
  sourcePassageCount: number;
  elapsedSeconds: number;
  provider: string;
  queryStripResult: StripResult;
  sourceStripResults: Array<{ reference: string; stripResult: StripResult }>;
  query_ref: string;
}) {
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
    passages: { query: queryPassageCount, sources: sourcePassageCount },
    elapsedSeconds,
    provider,
    model: method === 'lexical' ? null : MODEL_CONFIG.model,
    stripping: {
      query: {
        reference: query_ref,
        confident: queryStripResult.confident,
        detectedHeading: queryStripResult.detectedHeading,
        offsetStripped: queryStripResult.referenceOffset,
        charsRemoved: query.text.length - queryStripResult.body.length,
      },
      sources: sourceStripResults.map(({ reference, stripResult }) => {
        const originalSource = sources.find((s) => s.reference === reference);
        const originalLen = originalSource?.text.length ?? stripResult.body.length;
        return {
          reference,
          confident: stripResult.confident,
          detectedHeading: stripResult.detectedHeading,
          offsetStripped: stripResult.referenceOffset,
          charsRemoved: originalLen - stripResult.body.length,
        };
      }),
    },
    warning:
      'Similarity scores are uncalibrated evidence for human review, not probabilities or proof of plagiarism or misconduct. Only searched sources were evaluated. PAN-PC-11 calibration is book-based and does not establish CS-paper performance.',
  };
}

export type AnalysisResult = Awaited<ReturnType<typeof analyzeDocuments>>;
