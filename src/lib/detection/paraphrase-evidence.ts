/**
 * paraphrase-evidence.ts
 *
 * Evidence-combination heuristic for catching paraphrased passages that the
 * embedding model scores below the standard similarity threshold.
 *
 * GATED by the ENABLE_PARAPHRASE_EXPERIMENT environment variable:
 *   ENABLE_PARAPHRASE_EXPERIMENT=true  → active
 *   unset / any other value           → module still exports its functions,
 *                                       but analyzeDocuments will NOT call them.
 *
 * The gate is enforced at the call site (analysis.ts) so this module's pure
 * functions remain fully testable in isolation without env-variable surgery.
 *
 * ---
 *
 * `isParaphraseCandidate` returns true when ALL of the following hold:
 *   1. semanticScore >= LOWER_SEMANTIC_THRESHOLD  (default 0.4)
 *   2. At least one corroborating signal is present:
 *      a) Shared rare tokens   — both query and source passage contain ≥1 token
 *         whose IDF value is in the top decile (highest 10 %) of all IDF values.
 *      b) Shared numbers / identifiers — both passages contain the same number,
 *         NCT ID, DOI, PROSPERO CRD number, ISRCTN number, or similar.
 *      c) Consecutive-passage alignment — passage i in the query was matched to
 *         source passage j, AND passage i+1 is matched to source passage j+1 or
 *         j+2 (or j-1 / j-2 counting backwards), i.e. the two pairs are
 *         consecutive and in the same order.
 *
 * This deliberately requires at LEAST the lower semantic floor (signal 1) to be
 * met before ANY corroborating signal can promote a candidate, so a purely
 * unrelated passage that happens to share a number cannot create a false alert.
 */

import { lexicalTokens } from './tfidf';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum cosine similarity required before evidence combination can promote a candidate. */
export const LOWER_SEMANTIC_THRESHOLD = 0.4;

/**
 * Top fraction of IDF values considered "rare".
 * 0.1 = top-10 % of IDF values (terms that appear in very few documents
 * and therefore carry more discriminative weight).
 */
export const IDF_RARE_QUANTILE = 0.1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal passage descriptor for consecutive-alignment checks.
 * Both `queryIndex` and `sourceIndex` are the integer ordinal positions of the
 * passage within their respective document's passage array (0-based).
 */
export interface PassagePosition {
  queryIndex: number;
  sourceIndex: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the IDF threshold that separates the top `quantile` fraction of all
 * IDF values in a fitted vocabulary.
 *
 * Example: quantile=0.1 → threshold T such that ~10 % of terms have IDF ≥ T.
 *
 * @param idf      Record mapping token → IDF weight.
 * @param quantile Fraction in (0, 1] — 0.1 = top 10 %.
 * @returns        The IDF threshold value.
 */
export function computeIdfThreshold(idf: Record<string, number>, quantile: number): number {
  if (quantile <= 0 || quantile > 1) throw new Error('quantile must be in (0, 1]');
  const values = Object.values(idf).sort((a, b) => a - b);
  if (values.length === 0) return Infinity;
  // Top-quantile = values at or above the (1 − quantile) percentile.
  const index = Math.floor((1 - quantile) * values.length);
  return values[Math.max(0, index)];
}

/**
 * Returns `true` when queryText and sourceText share at least one token whose
 * IDF is at or above `idfThreshold`.
 */
export function hasSharedRareTokens(
  queryText: string,
  sourceText: string,
  idf: Record<string, number>,
  idfThreshold: number,
): boolean {
  const qTokens = new Set(lexicalTokens(queryText).filter((t) => (idf[t] ?? 0) >= idfThreshold));
  if (qTokens.size === 0) return false;
  for (const t of lexicalTokens(sourceText)) {
    if (qTokens.has(t)) return true;
  }
  return false;
}

/**
 * Patterns for numbers and research identifiers that serve as strong evidence
 * when shared between two passages.
 *
 * Covers:
 *   - ClinicalTrials.gov NCT numbers (NCT\d{8})
 *   - PROSPERO CRD numbers (CRD\d{11})
 *   - ISRCTN numbers (ISRCTN\d+)
 *   - DOI prefixes (10.\d{4,}/...)
 *   - Any plain decimal or integer number ≥ 2 digits (e.g., percentages, p-values,
 *     sample sizes, page counts) — intentionally broad so trial-specific statistics
 *     and counts act as corroborating evidence.
 */
const NUMERIC_IDENTIFIER_PATTERN =
  /\bNCT\d{8}\b|\bCRD\d{11}\b|\bISRCTN\d+\b|10\.\d{4,}\/\S+|\b\d{2,}(?:\.\d+)?\b/g;

/**
 * Extract the set of numeric/identifier strings from a text passage.
 * Returns a `Set<string>` of lower-cased normalised values.
 */
export function extractNumericIdentifiers(text: string): Set<string> {
  const result = new Set<string>();
  NUMERIC_IDENTIFIER_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUMERIC_IDENTIFIER_PATTERN.exec(text)) !== null) {
    result.add(m[0].toLowerCase());
  }
  return result;
}

/**
 * Returns `true` when queryText and sourceText share at least one number or
 * identifier token (see NUMERIC_IDENTIFIER_PATTERN).
 */
export function hasSharedNumbers(queryText: string, sourceText: string): boolean {
  const qNums = extractNumericIdentifiers(queryText);
  if (qNums.size === 0) return false;
  const sNums = extractNumericIdentifiers(sourceText);
  for (const n of qNums) {
    if (sNums.has(n)) return true;
  }
  return false;
}

/**
 * Returns `true` when two (queryIndex, sourceIndex) pairs represent consecutive
 * passages in the same order.
 *
 * "Consecutive" means:
 *   - Query indices differ by exactly 1 (passages are adjacent in the query).
 *   - Source indices differ by 1 or 2 (passages are close in the source; allow
 *     one source passage to be skipped, e.g. a figure caption between paragraphs).
 *   - Both differences have the same sign (order is preserved — no reversal).
 *
 * @param a  Position of the earlier passage pair (lower queryIndex).
 * @param b  Position of the candidate next passage pair (higher queryIndex).
 */
export function areConsecutivePassages(a: PassagePosition, b: PassagePosition): boolean {
  const queryDiff = b.queryIndex - a.queryIndex;
  const sourceDiff = b.sourceIndex - a.sourceIndex;
  // Query passages must be adjacent (diff = 1) and in the same order as source (same sign).
  if (queryDiff !== 1) return false;
  // Source indices may advance 1 or 2 steps (allow for one interleaved source passage).
  if (sourceDiff < 1 || sourceDiff > 2) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Main predicate
// ---------------------------------------------------------------------------

/**
 * Decide whether a candidate should be promoted as a paraphrase candidate.
 *
 * Returns `true` when:
 *   1. `semanticScore >= LOWER_SEMANTIC_THRESHOLD`
 *   2. At least one of:
 *      (a) hasSharedRareTokens(queryText, sourceText, idf, idfThreshold)
 *      (b) hasSharedNumbers(queryText, sourceText)
 *      (c) the candidate is part of a consecutive sequence (passagePosition.prev != null
 *          and areConsecutivePassages(prev, current) is true)
 *
 * @param semanticScore    Cosine similarity from the embedding model (0–1).
 * @param idf              Fitted IDF vocabulary (token → weight).
 * @param queryText        Text of the query passage.
 * @param sourceText       Text of the source passage.
 * @param consecutiveMatch True when a preceding passage pair was consecutively aligned.
 * @param idfThreshold     Pre-computed IDF threshold (from computeIdfThreshold).
 *                         If not supplied it is derived at call time (slow for bulk use).
 */
export function isParaphraseCandidate(
  semanticScore: number,
  idf: Record<string, number>,
  queryText: string,
  sourceText: string,
  consecutiveMatch: boolean = false,
  idfThreshold?: number,
): boolean {
  // Gate 1: semantic floor — must have at least a weak signal.
  if (semanticScore < LOWER_SEMANTIC_THRESHOLD) return false;

  // Compute the IDF threshold lazily when not supplied.
  const threshold = idfThreshold ?? computeIdfThreshold(idf, IDF_RARE_QUANTILE);

  // Gate 2: at least one corroborating signal.
  if (hasSharedRareTokens(queryText, sourceText, idf, threshold)) return true;
  if (hasSharedNumbers(queryText, sourceText)) return true;
  if (consecutiveMatch) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Bulk helper: apply isParaphraseCandidate across a list of scored pairs
// ---------------------------------------------------------------------------

/**
 * Candidate with enough information to run the evidence combination check.
 */
export interface ScoredPair {
  /** Integer ordinal of the query passage in the query passage array (0-based). */
  queryIndex: number;
  /** Integer ordinal of the source passage in the source passage array (0-based). */
  sourceIndex: number;
  /** Cosine similarity from the embedding model. */
  semanticScore: number;
  /** Raw query passage text. */
  queryText: string;
  /** Raw source passage text. */
  sourceText: string;
}

/**
 * Filter `pairs` to those that pass `isParaphraseCandidate`.
 *
 * - Sorts by queryIndex to enable the consecutive-passage check in a single pass.
 * - Two pairs are "consecutive" if `areConsecutivePassages(prev, current)` is
 *   true for the immediately preceding pair that also passed the filter.
 *
 * @param pairs         Array of scored passage pairs.
 * @param idf           Fitted IDF vocabulary.
 * @param idfThreshold  Pre-computed IDF threshold (re-used for efficiency).
 * @returns             Array of pairs that pass the evidence combination check.
 */
export function filterParaphraseCandidates(
  pairs: ScoredPair[],
  idf: Record<string, number>,
  idfThreshold: number,
): ScoredPair[] {
  // Sort by queryIndex ascending for consecutive-passage detection.
  const sorted = [...pairs].sort(
    (a, b) => a.queryIndex - b.queryIndex || a.sourceIndex - b.sourceIndex,
  );

  const passed: ScoredPair[] = [];
  let lastPassed: PassagePosition | null = null;

  for (const pair of sorted) {
    const consecutive =
      lastPassed !== null &&
      areConsecutivePassages(lastPassed, {
        queryIndex: pair.queryIndex,
        sourceIndex: pair.sourceIndex,
      });

    if (
      isParaphraseCandidate(
        pair.semanticScore,
        idf,
        pair.queryText,
        pair.sourceText,
        consecutive,
        idfThreshold,
      )
    ) {
      passed.push(pair);
      lastPassed = { queryIndex: pair.queryIndex, sourceIndex: pair.sourceIndex };
    }
  }

  return passed;
}

// ---------------------------------------------------------------------------
// Environment flag check (pure — no side effects)
// ---------------------------------------------------------------------------

/**
 * Returns true when the ENABLE_PARAPHRASE_EXPERIMENT flag is set.
 * Exported so analysis.ts can gate the feature without importing the whole module.
 */
export function isParaphraseExperimentEnabled(): boolean {
  return process.env['ENABLE_PARAPHRASE_EXPERIMENT'] === 'true';
}
