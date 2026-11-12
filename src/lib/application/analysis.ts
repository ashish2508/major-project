import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import calibration from '../../../reports/implementation/alignment-fusion/frozen-parameters.json';
import {
  detect,
  retrieveCandidates,
  mutualBestMatchFilter,
  scoreKey,
  type Candidate,
  type DetectionConfig,
  type Method,
} from '../detection/detector';
import { filterInformativeEvidence } from '../detection/informative-evidence';
import { maskBoilerplate, isSuppressedPair, type SuppressedItem } from '../detection/boilerplate';
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
import {
  extractIdentifiers,
  intersectIdentifiers,
  type IdentifierMatch,
} from '../detection/identifiers';

// ---------------------------------------------------------------------------
// Coverage computation helpers
// ---------------------------------------------------------------------------

/**
 * Compute query character coverage for a list of detections.
 *
 * "Eligible chars" = total query chars minus chars masked by boilerplate.
 * Boilerplate chars are those replaced with spaces by maskBoilerplate().
 * We detect them by checking which character positions are still ' ' in the
 * masked query text at positions that were NOT already spaces in the input.
 *
 * Conservative approximation: eligible chars = total chars in masked text
 * that are NOT whitespace runs introduced by masking.  Because masking
 * replaces chars with spaces in-place and the original PDF text has
 * substantial non-space content, we approximate eligible chars as total
 * query chars minus the number of characters in boilerplate-suppressed
 * regions (from suppressedItems).
 *
 * @param queryText    The masked query text (post-boilerplate, post-reference-strip).
 * @param detections   Detection list (suspiciousSpan references this text).
 * @param suppressedItems  Items masked by boilerplate (each has startOffset/endOffset).
 * @returns Coverage object with covered/eligible/total char counts and ratio.
 */
export function computeCoverage(
  queryText: string,
  detections: Array<{ suspiciousSpan: { offset: number; length: number } }>,
  suppressedItems: Array<{ startOffset: number; endOffset: number }>,
): {
  coveredChars: number;
  eligibleChars: number;
  totalChars: number;
  ratio: number;
} {
  const totalChars = queryText.length;

  // Compute eligible chars: total minus suppressed (boilerplate) ranges.
  // Ranges may overlap; use a bit array to avoid double-counting.
  const suppressed = new Uint8Array(totalChars);
  for (const item of suppressedItems) {
    const start = Math.max(0, item.startOffset);
    const end = Math.min(totalChars, item.endOffset);
    if (start < end) suppressed.fill(1, start, end);
  }
  const eligibleChars = suppressed.reduce((sum, v) => sum + (1 - v), 0);

  // Compute covered chars (union of detection spans, excluding suppressed).
  const covered = new Uint8Array(totalChars);
  for (const d of detections) {
    const start = Math.max(0, d.suspiciousSpan.offset);
    const end = Math.min(totalChars, d.suspiciousSpan.offset + d.suspiciousSpan.length);
    if (start < end) covered.fill(1, start, end);
  }

  // Count covered chars that are also eligible (not suppressed).
  let coveredChars = 0;
  for (let i = 0; i < totalChars; i++) {
    if (covered[i] && !suppressed[i]) coveredChars++;
  }

  const ratio = eligibleChars > 0 ? coveredChars / eligibleChars : 0;

  return { coveredChars, eligibleChars, totalChars, ratio };
}

const configSchema = z.object({
  method: z.enum(['lexical', 'semantic', 'hybrid']),
  threshold: z.number().min(0).max(1),
  alpha: z.number().min(0).max(1),
  mergeGap: z.number().int().min(0).max(1000),
});

/**
 * Research-paper-mode parameters.  These are NOT the PAN benchmark frozen parameters;
 * they control the non-corpus analysis path (the interactive web tool).
 * The UI shows "research-paper-parameters" as the active config source.
 */
const RESEARCH_PAPER_PARAMS = {
  /** Top-K lexical candidates per query passage in research-paper mode. */
  topKLexical: 10,
  /** K for mutual-best-match filter: each side keeps its top-K counterparts. */
  mutualBestMatchK: 1,
} as const;

// ---------------------------------------------------------------------------
// Research-paper threshold config (non-corpus mode)
// ---------------------------------------------------------------------------

import researchPaperParameters from '../../../research-paper-parameters.json';

const researchPaperConfigSchema = z.object({
  configSource: z.string(),
  segmentation: z.string(),
  methods: z.object({
    lexical: z.object({
      method: z.literal('lexical'),
      threshold: z.number().min(0).max(1),
      alpha: z.number().min(0).max(1),
      mergeGap: z.number().int().min(0),
    }),
    semantic: z.object({
      method: z.literal('semantic'),
      threshold: z.number().min(0).max(1),
      alpha: z.number().min(0).max(1),
      mergeGap: z.number().int().min(0),
    }),
    hybrid: z.object({
      method: z.literal('hybrid'),
      threshold: z.number().min(0).max(1),
      alpha: z.number().min(0).max(1),
      mergeGap: z.number().int().min(0),
    }),
  }),
});

const _rpp = researchPaperConfigSchema.parse(researchPaperParameters);
export const RESEARCH_PAPER_CONFIG = {
  source: _rpp.configSource,
  segmentation: _rpp.segmentation,
  methods: _rpp.methods as Record<Method, DetectionConfig>,
} as const;
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
    { tfidf: panTfidf, configs, tfidfSha256 } = await getArtifacts();

  // In non-corpus (research-paper) mode use the research-paper-parameters.json config.
  // In corpus mode use the PAN frozen calibration to stay compatible with the PAN index.
  const config = useCorpus ? configs[method] : RESEARCH_PAPER_CONFIG.methods[method];
  const activeConfigSource = useCorpus
    ? 'alignment-fusion/frozen-parameters.json (PAN calibration)'
    : RESEARCH_PAPER_CONFIG.source;
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
      // Research-paper mode uses top-10 candidates per query; corpus mode keeps
      // the legacy single-best to stay compatible with the PAN lexical index.
      useCorpus ? 1 : RESEARCH_PAPER_PARAMS.topKLexical,
    );

    // Apply mutual-best-match filter in research-paper mode (non-corpus) to reduce
    // the false-positive pattern where one generic query passage matches many sources.
    let lexicalCandidates = rows[scoreKey(method, config.alpha)];
    if (!useCorpus) {
      const { kept } = mutualBestMatchFilter(
        lexicalCandidates,
        RESEARCH_PAPER_PARAMS.mutualBestMatchK,
      );
      lexicalCandidates = kept;
    }

    const mergedDetections = detect(
      lexicalCandidates,
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
      const sText =
        srcDoc?.text.slice(d.sourceSpan.offset, d.sourceSpan.offset + d.sourceSpan.length) ?? '';
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

    // Populate otherCandidates: for each kept detection, attach candidates for the
    // same query span that scored below top-1 (from the pre-mutual-filter pool).
    if (!useCorpus) {
      const allLexical = rows[scoreKey(method, config.alpha)];
      for (const d of detections) {
        const others = allLexical.filter(
          (c) =>
            c.suspiciousReference === d.suspiciousReference &&
            c.suspiciousSpan.offset === d.suspiciousSpan.offset &&
            c.suspiciousSpan.length === d.suspiciousSpan.length &&
            !(
              c.sourceReference === d.sourceReference &&
              c.sourceSpan.offset === d.sourceSpan.offset &&
              c.sourceSpan.length === d.sourceSpan.length
            ),
        );
        if (others.length > 0) {
          d.otherCandidates = others.sort((a, b) => b.score - a.score);
        }
      }
    }

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
      strippedQueryText: strippedQuery.text,
      activeConfigSource,
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
      const sText =
        srcDoc?.text.slice(d.sourceSpan.offset, d.sourceSpan.offset + d.sourceSpan.length) ?? '';
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
      strippedQueryText: strippedQuery.text,
      activeConfigSource,
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
  strippedQueryText,
  activeConfigSource,
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
  /** Masked query text (post-boilerplate, post-reference-strip) used for coverage computation. */
  strippedQueryText: string;
  /** Name of the config file / source that provided thresholds and alpha. */
  activeConfigSource: string;
}) {
  const mappedDetections = detections.map((d) => ({
    ...d,
    semantic: method === 'lexical' ? null : d.semantic,
  }));

  // --- Coverage ---
  const coverage = computeCoverage(strippedQueryText, mappedDetections, suppressedItems);

  // --- Shared identifiers ---
  // Extract from the masked query and each source, excluding the reference sections.
  // Pass the reference section text so identifiers that appear ONLY in references
  // (e.g. cited DOIs) are not counted as shared evidence.
  const queryRefSection =
    queryStripResult.referenceOffset !== null && queryStripResult.confident
      ? query.text.slice(queryStripResult.referenceOffset)
      : undefined;
  const queryIds = extractIdentifiers(strippedQueryText, queryRefSection);
  const sharedIdentifiersBySource: Array<{
    sourceReference: string;
    matches: IdentifierMatch[];
  }> = [];
  for (const src of sources) {
    const srcStripResult = sourceStripResults.find((s) => s.reference === src.reference);
    const srcRefSection =
      srcStripResult?.stripResult.referenceOffset !== null && srcStripResult?.stripResult.confident
        ? src.text.slice(srcStripResult.stripResult.referenceOffset!)
        : undefined;
    const srcIds = extractIdentifiers(src.text, srcRefSection);
    const shared = intersectIdentifiers(queryIds, srcIds);
    if (shared.length > 0) {
      sharedIdentifiersBySource.push({ sourceReference: src.reference, matches: shared });
    }
  }

  return {
    /** Role label: this is the document being examined for possible copying. */
    queryRole: 'Document under review (query)' as const,
    /** Role label: these are the possible originals. */
    sourceRole: 'Possible source (original)' as const,
    query,
    sources,
    method,
    config: { ...config, mergeGap },
    detections: mappedDetections,
    semanticReviewLeads,
    semanticReviewLead: semanticReviewLeads[0] ?? null,
    semanticReviewThreshold,
    passages: { query: queryPassageCount, sources: sourcePassageCount },
    /** Query character coverage after boilerplate masking. */
    coverage,
    /** Shared identifiers (trial IDs, DOIs, etc.) found in both query and source(s). */
    sharedIdentifiers: sharedIdentifiersBySource,
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
        /**
         * Offset note: character offsets in detections reference the MASKED text
         * (post-reference-strip, post-boilerplate-mask). For non-QUIC papers whose
         * references are truncated (not masked in-place), the offset of the
         * reference section and beyond in the original file will differ from the
         * offset in the masked text by (original_length - body_length) characters.
         * The UI highlights against the masked text, so highlights are always
         * internally consistent. For PDFs use page numbers for external navigation.
         */
        offsetNote:
          queryStripResult.maskedCharacters !== undefined
            ? 'offsets in masked text (invariant — in-place masking)'
            : queryStripResult.referenceOffset !== null && queryStripResult.confident
              ? 'offsets in stripped body; source-file offsets beyond the reference section differ'
              : 'offsets in original text (no stripping applied)',
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
          offsetNote:
            stripResult.maskedCharacters !== undefined
              ? 'offsets in masked text (invariant — in-place masking)'
              : stripResult.referenceOffset !== null && stripResult.confident
                ? 'offsets in stripped body; source-file offsets beyond the reference section differ'
                : 'offsets in original text (no stripping applied)',
        };
      }),
    },
    warning:
      'Similarity scores are uncalibrated evidence for human review, not probabilities or proof of plagiarism or misconduct. Only searched sources were evaluated. PAN-PC-11 calibration is book-based and does not establish CS-paper performance.',
    symmetryNote:
      'Matching is symmetric; direction of copying cannot be determined from similarity alone. Use publication dates and provenance to establish direction.',
    /** Config source name shown in the report header. */
    activeConfigSource,
    /** Segmentation type used (always paragraph windows for research-paper mode). */
    segmentationType: RESEARCH_PAPER_CONFIG.segmentation,
  };
}

export type AnalysisResult = Awaited<ReturnType<typeof analyzeDocuments>>;
