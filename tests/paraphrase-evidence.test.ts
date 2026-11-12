/**
 * Tests for src/lib/detection/paraphrase-evidence.ts (Phase 7).
 *
 * Covers:
 *   - computeIdfThreshold
 *   - hasSharedRareTokens
 *   - extractNumericIdentifiers
 *   - hasSharedNumbers
 *   - areConsecutivePassages
 *   - isParaphraseCandidate (main predicate)
 *   - filterParaphraseCandidates (bulk helper)
 *   - isParaphraseExperimentEnabled (env flag)
 */

import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import {
  computeIdfThreshold,
  hasSharedRareTokens,
  extractNumericIdentifiers,
  hasSharedNumbers,
  areConsecutivePassages,
  isParaphraseCandidate,
  filterParaphraseCandidates,
  isParaphraseExperimentEnabled,
  LOWER_SEMANTIC_THRESHOLD,
  IDF_RARE_QUANTILE,
  type ScoredPair,
} from '../src/lib/detection/paraphrase-evidence';

// ---------------------------------------------------------------------------
// computeIdfThreshold
// ---------------------------------------------------------------------------

describe('computeIdfThreshold', () => {
  it('throws for quantile <= 0', () => {
    expect(() => computeIdfThreshold({}, 0)).toThrow('quantile');
    expect(() => computeIdfThreshold({}, -0.1)).toThrow('quantile');
  });

  it('throws for quantile > 1', () => {
    expect(() => computeIdfThreshold({}, 1.1)).toThrow('quantile');
  });

  it('returns Infinity for an empty IDF', () => {
    expect(computeIdfThreshold({}, 0.1)).toBe(Infinity);
  });

  it('returns the single value for a single-term IDF with any quantile', () => {
    const idf = { foo: 3.5 };
    expect(computeIdfThreshold(idf, 0.1)).toBe(3.5);
    expect(computeIdfThreshold(idf, 1.0)).toBe(3.5);
  });

  it('top-10% threshold separates the highest values', () => {
    // 10 terms with IDF values 1..10; top 10 % = top 1 = value 10
    const idf = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`t${i}`, i + 1]));
    const threshold = computeIdfThreshold(idf, 0.1);
    // Values 10 and above are in the top decile
    expect(threshold).toBeGreaterThanOrEqual(9);
    expect(threshold).toBeLessThanOrEqual(10);
  });

  it('top-100% threshold equals the minimum IDF value', () => {
    const idf = { a: 1, b: 2, c: 3 };
    const threshold = computeIdfThreshold(idf, 1.0);
    expect(threshold).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// hasSharedRareTokens
// ---------------------------------------------------------------------------

describe('hasSharedRareTokens', () => {
  const idf = { randomized: 5.0, viral: 4.9, the: 1.1, a: 1.0, pneumonia: 4.5 };
  const threshold = 4.8; // only 'randomized' and 'viral' qualify

  it('returns true when both texts share a rare token', () => {
    expect(
      hasSharedRareTokens(
        'randomized controlled trial',
        'this was a randomized study',
        idf,
        threshold,
      ),
    ).toBe(true);
  });

  it('returns false when only the query has rare tokens', () => {
    expect(
      hasSharedRareTokens('randomized controlled trial', 'the common words here', idf, threshold),
    ).toBe(false);
  });

  it('returns false when only the source has rare tokens', () => {
    expect(
      hasSharedRareTokens('the common words here', 'viral infection study', idf, threshold),
    ).toBe(false);
  });

  it('returns false when neither has rare tokens', () => {
    expect(hasSharedRareTokens('the a', 'a the', idf, threshold)).toBe(false);
  });

  it('returns false when query text is empty', () => {
    expect(hasSharedRareTokens('', 'randomized controlled', idf, threshold)).toBe(false);
  });

  it('returns false for unknown tokens (not in IDF)', () => {
    // 'xyz' is not in idf; default idf[t] ?? 0 < threshold
    expect(hasSharedRareTokens('xyz study', 'xyz analysis', idf, threshold)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractNumericIdentifiers
// ---------------------------------------------------------------------------

describe('extractNumericIdentifiers', () => {
  it('extracts a ClinicalTrials NCT number', () => {
    const result = extractNumericIdentifiers('registered as NCT12345678 in 2020');
    expect(result.has('nct12345678')).toBe(true);
  });

  it('extracts a PROSPERO CRD number', () => {
    const result = extractNumericIdentifiers('PROSPERO CRD42020164164');
    expect(result.has('crd42020164164')).toBe(true);
  });

  it('extracts an ISRCTN number', () => {
    const result = extractNumericIdentifiers('ISRCTN12345678 trial');
    expect(result.has('isrctn12345678')).toBe(true);
  });

  it('extracts a DOI', () => {
    const result = extractNumericIdentifiers('doi:10.1097/MD.0000000000021808');
    // DOI part starting with 10.
    expect([...result].some((v) => v.startsWith('10.1097'))).toBe(true);
  });

  it('extracts plain two-digit+ numbers', () => {
    const result = extractNumericIdentifiers('95% confidence interval with 300 patients');
    expect(result.has('95')).toBe(true);
    expect(result.has('300')).toBe(true);
  });

  it('does not extract single-digit numbers', () => {
    const result = extractNumericIdentifiers('1 2 3 short');
    expect(result.size).toBe(0);
  });

  it('normalises to lower-case', () => {
    const result = extractNumericIdentifiers('NCT12345678');
    expect(result.has('nct12345678')).toBe(true);
    expect(result.has('NCT12345678')).toBe(false);
  });

  it('returns empty set for text with no numbers or identifiers', () => {
    expect(extractNumericIdentifiers('no numbers here at all').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hasSharedNumbers
// ---------------------------------------------------------------------------

describe('hasSharedNumbers', () => {
  it('returns true for two passages sharing a plain number', () => {
    expect(hasSharedNumbers('enrolled 300 patients', 'included 300 participants')).toBe(true);
  });

  it('returns false when numbers are different', () => {
    expect(hasSharedNumbers('enrolled 300 patients', 'included 450 participants')).toBe(false);
  });

  it('returns true for a shared NCT identifier', () => {
    expect(hasSharedNumbers('registered as NCT12345678', 'trial NCT12345678 was included')).toBe(
      true,
    );
  });

  it('returns false when query has no numbers', () => {
    expect(hasSharedNumbers('no numbers here', 'also none here')).toBe(false);
  });

  it('returns false when only the source has numbers', () => {
    expect(hasSharedNumbers('no numbers here', 'has 300 patients')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// areConsecutivePassages
// ---------------------------------------------------------------------------

describe('areConsecutivePassages', () => {
  it('returns true for query diff=1 and source diff=1', () => {
    expect(
      areConsecutivePassages({ queryIndex: 2, sourceIndex: 5 }, { queryIndex: 3, sourceIndex: 6 }),
    ).toBe(true);
  });

  it('returns true for query diff=1 and source diff=2 (one source skipped)', () => {
    expect(
      areConsecutivePassages({ queryIndex: 2, sourceIndex: 5 }, { queryIndex: 3, sourceIndex: 7 }),
    ).toBe(true);
  });

  it('returns false for query diff=1 and source diff=3', () => {
    expect(
      areConsecutivePassages({ queryIndex: 2, sourceIndex: 5 }, { queryIndex: 3, sourceIndex: 8 }),
    ).toBe(false);
  });

  it('returns false for query diff=2 (non-adjacent)', () => {
    expect(
      areConsecutivePassages({ queryIndex: 2, sourceIndex: 5 }, { queryIndex: 4, sourceIndex: 6 }),
    ).toBe(false);
  });

  it('returns false for query diff=0 (same passage)', () => {
    expect(
      areConsecutivePassages({ queryIndex: 2, sourceIndex: 5 }, { queryIndex: 2, sourceIndex: 5 }),
    ).toBe(false);
  });

  it('returns false when order is reversed (source decreases)', () => {
    expect(
      areConsecutivePassages({ queryIndex: 2, sourceIndex: 5 }, { queryIndex: 3, sourceIndex: 4 }),
    ).toBe(false);
  });

  it('returns false when query goes backwards', () => {
    expect(
      areConsecutivePassages({ queryIndex: 3, sourceIndex: 5 }, { queryIndex: 2, sourceIndex: 6 }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isParaphraseCandidate
// ---------------------------------------------------------------------------

describe('isParaphraseCandidate', () => {
  const idf = {
    randomized: 5.0,
    controlled: 4.9,
    pneumonia: 4.8,
    viral: 4.7,
    injection: 4.6,
    the: 1.2,
    a: 1.0,
    of: 1.1,
    was: 1.15,
  };
  // top 10 % of 9 values ≥ position 8 → threshold = 5.0 (top 1 = 'randomized')
  const idfThreshold = computeIdfThreshold(idf, IDF_RARE_QUANTILE);

  it('returns false when semantic score is below the lower threshold', () => {
    expect(
      isParaphraseCandidate(
        LOWER_SEMANTIC_THRESHOLD - 0.01,
        idf,
        'randomized controlled trial for viral pneumonia',
        'randomized controlled trial for viral pneumonia',
        false,
        idfThreshold,
      ),
    ).toBe(false);
  });

  it('returns true at exactly the lower threshold with shared rare token', () => {
    expect(
      isParaphraseCandidate(
        LOWER_SEMANTIC_THRESHOLD,
        idf,
        'randomized trial design',
        'used a randomized approach',
        false,
        idfThreshold,
      ),
    ).toBe(true);
  });

  it('returns true when semantic >= threshold and passages share a rare token', () => {
    expect(
      isParaphraseCandidate(
        0.45,
        idf,
        'randomized controlled trial',
        'this was a randomized study',
        false,
        idfThreshold,
      ),
    ).toBe(true);
  });

  it('returns true when semantic >= threshold and passages share a number', () => {
    expect(
      isParaphraseCandidate(
        0.45,
        idf,
        'enrolled 300 patients in the study',
        'included 300 participants',
        false,
        idfThreshold,
      ),
    ).toBe(true);
  });

  it('returns true when semantic >= threshold and consecutiveMatch is true', () => {
    expect(
      isParaphraseCandidate(
        0.45,
        idf,
        'completely different words here',
        'totally unrelated content',
        true, // consecutive match provided from adjacent passage
        idfThreshold,
      ),
    ).toBe(true);
  });

  it('returns false when semantic >= threshold but no corroborating signal', () => {
    // No shared rare tokens, no shared numbers, no consecutive match
    expect(
      isParaphraseCandidate(
        0.45,
        idf,
        'the method was applied to a sample',
        'the approach was used on a group',
        false,
        idfThreshold,
      ),
    ).toBe(false);
  });

  it('returns false when only common words are shared (IDF below threshold)', () => {
    expect(
      isParaphraseCandidate(0.5, idf, 'the of a was', 'the of a was', false, idfThreshold),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterParaphraseCandidates
// ---------------------------------------------------------------------------

describe('filterParaphraseCandidates', () => {
  const idf = {
    randomized: 5.0,
    pneumonia: 4.9,
    viral: 4.8,
    controlled: 4.7,
    trial: 4.6,
    the: 1.1,
    a: 1.0,
  };
  const idfThreshold = computeIdfThreshold(idf, IDF_RARE_QUANTILE);

  const makePair = (qi: number, si: number, sem: number, q = '', s = ''): ScoredPair => ({
    queryIndex: qi,
    sourceIndex: si,
    semanticScore: sem,
    queryText: q,
    sourceText: s,
  });

  it('returns empty for empty input', () => {
    expect(filterParaphraseCandidates([], idf, idfThreshold)).toEqual([]);
  });

  it('filters out pairs below the semantic floor', () => {
    const pairs = [makePair(0, 0, LOWER_SEMANTIC_THRESHOLD - 0.01, 'randomized', 'randomized')];
    expect(filterParaphraseCandidates(pairs, idf, idfThreshold)).toHaveLength(0);
  });

  it('keeps pairs that share a rare token at or above the floor', () => {
    const pairs = [makePair(0, 0, 0.45, 'randomized trial', 'randomized study')];
    expect(filterParaphraseCandidates(pairs, idf, idfThreshold)).toHaveLength(1);
  });

  it('keeps pairs that share a number at or above the floor', () => {
    const pairs = [makePair(0, 0, 0.45, 'enrolled 300 patients', 'included 300 participants')];
    expect(filterParaphraseCandidates(pairs, idf, idfThreshold)).toHaveLength(1);
  });

  it('promotes a second pair via consecutive-passage alignment', () => {
    // Pair A: has shared rare token → passes on its own → promoted
    const pairA = makePair(0, 0, 0.45, 'randomized trial design', 'randomized study');
    // Pair B: no shared tokens, no numbers, but consecutive with A → should pass
    const pairB = makePair(1, 1, 0.45, 'the method was applied', 'the approach was used');
    const result = filterParaphraseCandidates([pairA, pairB], idf, idfThreshold);
    expect(result).toHaveLength(2);
  });

  it('does NOT promote a pair that is non-consecutive even if the previous passed', () => {
    const pairA = makePair(0, 0, 0.45, 'randomized trial design', 'randomized study');
    // Pair at queryIndex=5 is NOT consecutive with A (diff > 1)
    const pairB = makePair(5, 6, 0.45, 'the method was applied', 'the approach was used');
    const result = filterParaphraseCandidates([pairA, pairB], idf, idfThreshold);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(pairA);
  });

  it('sorts by queryIndex before processing', () => {
    // Supply in reverse order; pairB (qi=1) should still be recognised as consecutive with pairA (qi=0)
    const pairA = makePair(0, 0, 0.45, 'randomized trial design', 'randomized study');
    const pairB = makePair(1, 1, 0.45, 'the method was applied', 'the approach was used');
    const result = filterParaphraseCandidates([pairB, pairA], idf, idfThreshold);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// isParaphraseExperimentEnabled
// ---------------------------------------------------------------------------

describe('isParaphraseExperimentEnabled', () => {
  const originalEnv = process.env['ENABLE_PARAPHRASE_EXPERIMENT'];

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['ENABLE_PARAPHRASE_EXPERIMENT'];
    else process.env['ENABLE_PARAPHRASE_EXPERIMENT'] = originalEnv;
  });

  it('returns true when ENABLE_PARAPHRASE_EXPERIMENT=true', () => {
    process.env['ENABLE_PARAPHRASE_EXPERIMENT'] = 'true';
    expect(isParaphraseExperimentEnabled()).toBe(true);
  });

  it('returns false when ENABLE_PARAPHRASE_EXPERIMENT is unset', () => {
    delete process.env['ENABLE_PARAPHRASE_EXPERIMENT'];
    expect(isParaphraseExperimentEnabled()).toBe(false);
  });

  it('returns false when ENABLE_PARAPHRASE_EXPERIMENT=false', () => {
    process.env['ENABLE_PARAPHRASE_EXPERIMENT'] = 'false';
    expect(isParaphraseExperimentEnabled()).toBe(false);
  });

  it('returns false for an arbitrary non-true value', () => {
    process.env['ENABLE_PARAPHRASE_EXPERIMENT'] = '1';
    expect(isParaphraseExperimentEnabled()).toBe(false);
  });
});
