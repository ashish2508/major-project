import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import calibration from '../../../reports/implementation/alignment-fusion/frozen-parameters.json';
import {
  detect,
  retrieveCandidates,
  scoreKey,
  type Candidate,
  type DetectionConfig,
  type Method,
} from '../detection/detector';
import { filterInformativeEvidence } from '../detection/informative-evidence';
import {
  maskBoilerplate,
  isSuppressedPair,
  type SuppressedItem,
} from '../detection/boilerplate';
import { segmentParagraphs } from '../detection/segmentation';
import { contextualReviewLeads } from '../detection/semantic-review';
import { stripCanonicalReferences, type StripResult } from '../detection/strip-references';
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
import { attachPassagePages, getAllReadyPassages } from '../corpus/service';
import { ensureLexicalIndex, getIndexedPassageVectors } from '../corpus/lexical-index';
import { getCorpusPassagesAndVectors } from '../corpus/semantic-index';

const configSchema = z.object({
  method: z.enum(['lexical', 'semantic', 'hybrid']),
  threshold: z.number().min(0).max(1),
  alpha: z.number().min(0).max(1),
  mergeGap: z.number().int().min(0).max(1000),
});
let artifactsPromise: Promise<{
  tfidf: Tfidf;
  configs: Record<Method, DetectionConfig>;
  tfidfSha256: string;
}> | null = null;
let modelVerified: Promise<void> | null = null;
export async function getArtifacts() {
  if (!artifactsPromise)
    artifactsPromise = (async () => {
      const raw = await readFile(
          resolve('reports/implementation/alignment-fusion/cache/tfidf.json'),
        ),
        frozen = calibration;
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
        .parse(frozen.methods);
      for (const key of ['lexical', 'semantic', 'hybrid'] as const)
        if (configs[key].method !== key) throw new Error('Invalid calibrated method mapping');
      return {
        tfidf: new Tfidf(record.idf, record.trainingPassages),
        configs,
        tfidfSha256: frozen.tfidfSha256,
      };
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
// Background corpus directory (populated by bun run fetch:background)
// ---------------------------------------------------------------------------

const BACKGROUND_DIR = resolve('src/lib/detection/background');

/**
 * Fit a fresh TF-IDF vocabulary on research-paper passages.
 *
 * Uses the passages extracted from the query and source documents, optionally
 * augmented by pre-fetched background corpus files from BACKGROUND_DIR.
 * This avoids the OOV problem caused by using the PAN book vocabulary for
 * research-paper-specific terminology.
 *
 * @param allPassages  Passage texts from query + source documents.
 * @param documentCount Number of distinct source documents (for logging/metadata).
 * @returns A Tfidf instance fitted on the supplied passages.
 */
async function fitResearchTfidf(allPassages: string[], documentCount: number): Promise<Tfidf> {
  let backgroundPassages: string[] = [];
  let useBackground = false;

  if (existsSync(BACKGROUND_DIR)) {
    let txtFiles: string[] = [];
    try {
      const entries = await readdir(BACKGROUND_DIR);
      txtFiles = entries.filter((f) => f.endsWith('.txt'));
    } catch {
      // directory unreadable — treat as empty
    }

    if (txtFiles.length > 0) {
      useBackground = true;
      for (const fname of txtFiles) {
        try {
          const content = await readFile(join(BACKGROUND_DIR, fname), 'utf8');
          const lines = content.split('\n').filter((l) => l.trim().length > 0);
          backgroundPassages.push(...lines);
        } catch {
          // skip unreadable file
        }
      }
    }
  }

  if (!useBackground) {
    console.warn(
      'IDF is document-local (no background corpus). Run bun run fetch:background to populate one.',
    );
  }

  const tfidf = Tfidf.fitOnPassages(allPassages, backgroundPassages, documentCount);

  console.log(
    `IDF fitted on ${allPassages.length} passages from ${documentCount} documents (background: ${backgroundPassages.length} passages)`,
  );

  return tfidf;
}

function stripDocument(doc: ExtractedDocument): {
  strippedDoc: ExtractedDocument;
  stripResult: StripResult;
  suppressedItems: SuppressedItem[];
} {
  const stripResult = stripCanonicalReferences(doc.reference, doc.text);
  // Apply boilerplate masking after reference stripping.
  // maskBoilerplate is offset-preserving (spaces replace characters in-place),
  // so detection span offsets remain valid against the stripped body.
  const { maskedText, suppressedItems } = maskBoilerplate(stripResult.body, {
    pages: doc.pages,
  });
  const strippedDoc: ExtractedDocument = {
    ...doc,
    text: maskedText,
  };
  return { strippedDoc, stripResult, suppressedItems };
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
    { tfidf: panTfidf, configs, tfidfSha256 } = await getArtifacts(),
    config = configs[method];
  const countTokens = await tokenCounter();
  const alignSemantically = method === 'semantic' || (method === 'hybrid' && config.alpha < 1);
  // The active validation calibration fitted every method on paragraph-bounded windows.
  const split = segmentParagraphs;

  // --- Reference stripping + boilerplate masking ---
  const {
    strippedDoc: strippedQuery,
    stripResult: queryStripResult,
    suppressedItems: querySuppressedItems,
  } = stripDocument(query);

  // --- Segmentation of Query ---
  const queries = attachPassagePages(
    split(
      strippedQuery.text,
      strippedQuery.reference,
      { countTokens },
      strippedQuery.paragraphBreaks,
    ),
    strippedQuery.pages,
  );

  const mergeGap = config.mergeGap;
  if (!queries.length) throw new Error('Documents need extractable words');

  let rows;
  let provider = 'TF-IDF on CPU';
  let effectiveSources: ExtractedDocument[] = [];
  const sourceStripResults: Array<{ reference: string; stripResult: StripResult }> = [];
  const allSuppressedItems: SuppressedItem[] = [...querySuppressedItems];

  if (method === 'lexical') {
    let sourcePassages;
    // tfidf used for lexical scoring; corpus mode keeps PAN vocabulary for the index
    let tfidf: Tfidf;

    if (useCorpus) {
      await ensureLexicalIndex(panTfidf, tfidfSha256);
      const corpusData = await getAllReadyPassages();
      if (!corpusData.passages.length) {
        throw new Error(
          'Corpus contains no ready documents or passages. Ingest research papers first.',
        );
      }
      sourcePassages = corpusData.passages;
      effectiveSources = corpusData.documents;
      // Corpus mode: the index was built with PAN vocabulary; keep it for compatibility
      tfidf = panTfidf;
    } else {
      effectiveSources = sources;
      const strippedSources: ExtractedDocument[] = effectiveSources.map((src) => {
        const { strippedDoc, stripResult, suppressedItems } = stripDocument(src);
        sourceStripResults.push({ reference: src.reference, stripResult });
        allSuppressedItems.push(...suppressedItems);
        return strippedDoc;
      });

      sourcePassages = strippedSources.flatMap((source) =>
        attachPassagePages(
          split(source.text, source.reference, { countTokens }, source.paragraphBreaks),
          source.pages,
        ),
      );

      // Research-paper mode: fit IDF on the actual documents being analysed so
      // domain-specific terms are not out-of-vocabulary.
      const allPassageTexts = [...queries.map((p) => p.text), ...sourcePassages.map((p) => p.text)];
      tfidf = await fitResearchTfidf(allPassageTexts, effectiveSources.length);
    }

    if (!sourcePassages.length) throw new Error('Documents need extractable words');

    const lexicalVectors = useCorpus ? await getIndexedPassageVectors(sourcePassages) : undefined;
    rows = retrieveCandidates(
      queries,
      sourcePassages,
      tfidf,
      undefined,
      undefined,
      undefined,
      0,
      lexicalVectors,
    );

    const mergedDetections = detect(
      rows[scoreKey(method, config.alpha)],
      config.threshold,
      mergeGap,
      alignSemantically,
    );

    // Apply evidence filtering to lexical detections to remove uninformative fragments
    const allDocsForFilter = new Map(
      [strippedQuery, ...effectiveSources].map(({ reference, text }) => [reference, text]),
    );
    const filteredDetections = filterInformativeEvidence(mergedDetections, allDocsForFilter, 12);

    // Apply pair-level boilerplate filter: if both sides of a detection match
    // a boilerplate pattern, suppress the detection.
    const suppressedDetections: typeof filteredDetections = [];
    const detections = filteredDetections.filter((d) => {
      const qText = strippedQuery.text.slice(
        d.suspiciousSpan.offset,
        d.suspiciousSpan.offset + d.suspiciousSpan.length,
      );
      const srcDoc = effectiveSources.find((s) => s.reference === d.sourceReference);
      const sText = srcDoc?.text.slice(
        d.sourceSpan.offset,
        d.sourceSpan.offset + d.sourceSpan.length,
      ) ?? '';
      if (isSuppressedPair(qText, sText)) {
        suppressedDetections.push(d);
        allSuppressedItems.push({
          name: 'suppressed_pair',
          matchedText: qText.slice(0, 100),
          startOffset: d.suspiciousSpan.offset,
          endOffset: d.suspiciousSpan.offset + d.suspiciousSpan.length,
          reason: 'Both query and source spans match a boilerplate pattern',
        });
        return false;
      }
      return true;
    });

    const semanticReviewThreshold = configs.semantic.threshold;

    return buildResult({
      query,
      sources: effectiveSources,
      method,
      config,
      mergeGap,
      detections,
      semanticReviewLeads: [],
      semanticReviewThreshold,
      queryPassageCount: queries.length,
      sourcePassageCount: sourcePassages.length,
      elapsedSeconds: (performance.now() - start) / 1000,
      provider,
      queryStripResult,
      sourceStripResults,
      query_ref: query.reference,
      researchMode: !useCorpus,
      suppressedItems: allSuppressedItems,
    });
  } else {
    await verifyModel();
    const device = applicationDevice();

    let sourcePassages;
    let sourceVectors: number[][];
    let tfidf: Tfidf;

    if (useCorpus) {
      await ensureLexicalIndex(panTfidf, tfidfSha256);
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
      tfidf = panTfidf;
    } else {
      effectiveSources = sources;
      const strippedSources: ExtractedDocument[] = effectiveSources.map((src) => {
        const { strippedDoc, stripResult, suppressedItems } = stripDocument(src);
        sourceStripResults.push({ reference: src.reference, stripResult });
        allSuppressedItems.push(...suppressedItems);
        return strippedDoc;
      });

      sourcePassages = strippedSources.flatMap((source) =>
        attachPassagePages(
          split(source.text, source.reference, { countTokens }, source.paragraphBreaks),
          source.pages,
        ),
      );
      sourceVectors = [];

      // Research-paper mode: fit IDF on the actual documents being analysed.
      const allPassageTexts = [...queries.map((p) => p.text), ...sourcePassages.map((p) => p.text)];
      tfidf = await fitResearchTfidf(allPassageTexts, effectiveSources.length);
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

    const lexicalVectors = useCorpus ? await getIndexedPassageVectors(sourcePassages) : undefined;
    rows = retrieveCandidates(
      queries,
      sourcePassages,
      tfidf,
      queryVectors,
      sourceVectors,
      [config.alpha],
      0,
      lexicalVectors,
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
    const filteredDetections = alignSemantically
      ? filterInformativeEvidence(mergedDetections, allDocsForFilter, 12)
      : mergedDetections;

    // Apply pair-level boilerplate filter: if both sides of a detection match
    // a boilerplate pattern, suppress the detection.
    const suppressedDetections: typeof filteredDetections = [];
    const detections = filteredDetections.filter((d) => {
      const qText = strippedQuery.text.slice(
        d.suspiciousSpan.offset,
        d.suspiciousSpan.offset + d.suspiciousSpan.length,
      );
      const srcDoc = effectiveSources.find((s) => s.reference === d.sourceReference);
      const sText = srcDoc?.text.slice(
        d.sourceSpan.offset,
        d.sourceSpan.offset + d.sourceSpan.length,
      ) ?? '';
      if (isSuppressedPair(qText, sText)) {
        suppressedDetections.push(d);
        allSuppressedItems.push({
          name: 'suppressed_pair',
          matchedText: qText.slice(0, 100),
          startOffset: d.suspiciousSpan.offset,
          endOffset: d.suspiciousSpan.offset + d.suspiciousSpan.length,
          reason: 'Both query and source spans match a boilerplate pattern',
        });
        return false;
      }
      return true;
    });

    const semanticReviewThreshold = configs.semantic.threshold;
    const reviewDocuments = new Map(allDocsForFilter);
    const seenReferences = new Set([query.reference]);
    for (const source of effectiveSources) {
      // An ambiguous source reference cannot reliably identify highlighted text.
      if (seenReferences.has(source.reference)) reviewDocuments.delete(source.reference);
      seenReferences.add(source.reference);
    }
    const semanticReviewLeads = contextualReviewLeads(
      queries,
      sourcePassages,
      queryVectors,
      sourceVectors,
      reviewDocuments,
      tfidf,
      12,
      5,
      detections,
    );

    return buildResult({
      query,
      sources: effectiveSources,
      method,
      config,
      mergeGap,
      detections,
      semanticReviewLeads,
      semanticReviewThreshold,
      queryPassageCount: queries.length,
      sourcePassageCount: sourcePassages.length,
      elapsedSeconds: (performance.now() - start) / 1000,
      provider,
      queryStripResult,
      sourceStripResults,
      query_ref: query.reference,
      researchMode: !useCorpus,
      suppressedItems: allSuppressedItems,
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
  semanticReviewLeads,
  semanticReviewThreshold,
  queryPassageCount,
  sourcePassageCount,
  elapsedSeconds,
  provider,
  queryStripResult,
  sourceStripResults,
  query_ref,
  researchMode,
  suppressedItems,
}: {
  query: ExtractedDocument;
  sources: ExtractedDocument[];
  method: Method;
  config: { threshold: number; alpha: number; mergeGap: number; method: Method };
  mergeGap: number;
  detections: ReturnType<typeof detect>;
  semanticReviewLeads: Candidate[];
  semanticReviewThreshold: number;
  queryPassageCount: number;
  sourcePassageCount: number;
  elapsedSeconds: number;
  provider: string;
  queryStripResult: StripResult;
  sourceStripResults: Array<{ reference: string; stripResult: StripResult }>;
  query_ref: string;
  researchMode: boolean;
  suppressedItems: SuppressedItem[];
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
    semanticReviewLeads,
    semanticReviewLead: semanticReviewLeads[0] ?? null,
    semanticReviewThreshold,
    passages: { query: queryPassageCount, sources: sourcePassageCount },
    elapsedSeconds,
    provider,
    model: method === 'lexical' ? null : MODEL_CONFIG.model,
    researchMode,
    suppressedItems,
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
