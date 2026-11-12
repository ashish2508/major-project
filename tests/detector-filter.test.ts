/**
 * Tests for Phase 4: mutual-best-match filter and lexical top-K candidates.
 */
import { it, expect, describe } from 'vitest';
import { mutualBestMatchFilter, type Candidate } from '../src/lib/detection/detector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(
  queryOffset: number,
  queryLen: number,
  sourceRef: string,
  sourceOffset: number,
  sourceLen: number,
  score: number,
): Candidate {
  return {
    suspiciousReference: 'query-doc',
    sourceReference: sourceRef,
    suspiciousSpan: { offset: queryOffset, length: queryLen },
    sourceSpan: { offset: sourceOffset, length: sourceLen },
    score,
    lexical: score,
    semantic: score,
  };
}

// ---------------------------------------------------------------------------
// 1. K=1: q1→s1 (score 0.9) survives; q1→s2 (score 0.8) is removed
//    because s1 also picks q1 as its best query counterpart.
// ---------------------------------------------------------------------------

describe('mutualBestMatchFilter K=1', () => {
  it('keeps q1→s1 when both sides mutually rank each other first', () => {
    // q1 at offset 0, length 100
    // s1 at offset 0 in source-1, length 50
    // s2 at offset 0 in source-2, length 50
    // For q1: best source is s1 (0.9 > 0.8)
    // For s1: its only query candidate is q1  → mutual
    // For s2: its only query candidate is q1  → but q1 did NOT pick s2 as top-1 → NOT mutual
    const c1 = makeCandidate(0, 100, 'source-1', 0, 50, 0.9); // q1 → s1
    const c2 = makeCandidate(0, 100, 'source-2', 0, 50, 0.8); // q1 → s2

    const { kept, removed } = mutualBestMatchFilter([c1, c2], 1);

    expect(kept).toHaveLength(1);
    expect(kept[0].sourceReference).toBe('source-1');
    expect(kept[0].score).toBe(0.9);
    expect(removed).toBe(1);
  });

  it('removes q1→s2 when q1 already ranked s1 higher', () => {
    const c1 = makeCandidate(0, 100, 'source-1', 0, 50, 0.9);
    const c2 = makeCandidate(0, 100, 'source-2', 0, 50, 0.8);

    const { kept } = mutualBestMatchFilter([c1, c2], 1);

    const sourceRefs = kept.map((c) => c.sourceReference);
    expect(sourceRefs).not.toContain('source-2');
  });
});

// ---------------------------------------------------------------------------
// 2. K=2: q1→s1 and q1→s2 both survive because K=2 allows two top sources.
// ---------------------------------------------------------------------------

describe('mutualBestMatchFilter K=2', () => {
  it('keeps both q1→s1 and q1→s2 when K=2', () => {
    const c1 = makeCandidate(0, 100, 'source-1', 0, 50, 0.9);
    const c2 = makeCandidate(0, 100, 'source-2', 0, 50, 0.8);

    const { kept, removed } = mutualBestMatchFilter([c1, c2], 2);

    expect(kept).toHaveLength(2);
    expect(removed).toBe(0);
    const sourceRefs = kept.map((c) => c.sourceReference);
    expect(sourceRefs).toContain('source-1');
    expect(sourceRefs).toContain('source-2');
  });

  it('keeps all three candidates when K=3 and three sources compete for one query', () => {
    const c1 = makeCandidate(0, 100, 'source-1', 0, 50, 0.9);
    const c2 = makeCandidate(0, 100, 'source-2', 0, 50, 0.8);
    const c3 = makeCandidate(0, 100, 'source-3', 0, 50, 0.7);

    const { kept } = mutualBestMatchFilter([c1, c2, c3], 3);
    expect(kept).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 3. High-score self-matches (C1 exact copy pattern) survive with K=1.
//    A single query passage matched by a single source passage at score ~1.0
//    is a mutual best match and must not be removed.
// ---------------------------------------------------------------------------

describe('mutualBestMatchFilter exact-copy survival', () => {
  it('does not remove a 1-to-1 high-score match (C1 exact copy)', () => {
    // One query passage, one source passage, score 0.999
    const c = makeCandidate(500, 300, 'source-doc', 1000, 300, 0.999);

    const { kept, removed } = mutualBestMatchFilter([c], 1);

    expect(kept).toHaveLength(1);
    expect(removed).toBe(0);
    expect(kept[0].score).toBeCloseTo(0.999);
  });

  it('keeps all mutual high-score matches when multiple distinct passages copy', () => {
    // Two independent query passages each matching a distinct source passage
    const c1 = makeCandidate(0, 200, 'source-doc', 0, 200, 0.98);
    const c2 = makeCandidate(300, 200, 'source-doc', 300, 200, 0.97);

    const { kept, removed } = mutualBestMatchFilter([c1, c2], 1);

    expect(kept).toHaveLength(2);
    expect(removed).toBe(0);
  });

  it('throws for invalid K values', () => {
    const c = makeCandidate(0, 100, 'src', 0, 100, 0.9);
    expect(() => mutualBestMatchFilter([c], 0)).toThrow();
    expect(() => mutualBestMatchFilter([c], -1)).toThrow();
    expect(() => mutualBestMatchFilter([c], 1.5)).toThrow();
  });

  it('returns empty kept for empty candidate list', () => {
    const { kept, removed } = mutualBestMatchFilter([], 1);
    expect(kept).toHaveLength(0);
    expect(removed).toBe(0);
  });
});
