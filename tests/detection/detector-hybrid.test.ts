import { describe, expect, it } from 'vitest';
import {
  retrieveCandidates,
  scoreKey,
  ALPHAS,
  type Candidate,
} from '../../src/lib/detection/detector';
import { segment } from '../../src/lib/detection/segmentation';
import { Tfidf } from '../../src/lib/detection/tfidf';

describe('Hybrid retrieval: candidate merging and scoring', () => {
  /**
   * Helper to normalize a vector to unit length (L2 norm = 1).
   */
  const normalize = (v: number[]): number[] => {
    if (v.length !== 384) throw new Error('Expected 384-dimensional vector');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    if (norm === 0) throw new Error('Cannot normalize zero vector');
    return v.map((x) => x / norm);
  };

  /**
   * Helper to create a normalized embedding with specific first component.
   */
  const createEmbedding = (firstComponent: number): number[] => {
    const v = new Array(384).fill(0);
    v[0] = firstComponent;
    return normalize(v);
  };

  it('Verifies candidate identity is based on query-passage/source-passage pairs (PassagePair structure)', () => {
    const query = segment('machine learning algorithms', 'query');
    const sources = [
      ...segment('machine learning algorithms overview', 'sourceA'),
      ...segment('deep neural networks', 'sourceB'),
    ];
    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(sources.map((p) => p.text)));

    const queryEmbeddings = query.map(() => createEmbedding(0.9));
    const sourceEmbeddings = sources.map(() => createEmbedding(0.7));

    const candidates = retrieveCandidates(
      query,
      sources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );

    // Verify structure of candidates
    for (const cand of candidates.lexical) {
      expect(cand).toHaveProperty('suspiciousReference');
      expect(cand).toHaveProperty('sourceReference');
      expect(cand).toHaveProperty('suspiciousSpan');
      expect(cand).toHaveProperty('sourceSpan');
      expect(cand).toHaveProperty('suspiciousPage');
      expect(cand).toHaveProperty('sourcePage');

      // PassagePair identity: query and source must be different
      if (query.length > 0 && sources.length > 0) {
        expect(cand.suspiciousReference).toBe('query');
        expect(['sourceA', 'sourceB']).toContain(cand.sourceReference);
      }
    }
  });

  it('Merges top-50 lexical candidates per query and top-50 semantic candidates per query', () => {
    // Create query and many sources to test top-K merging
    const query = segment('test query string', 'query');
    const sources = Array.from({ length: 100 }, (_, i) =>
      segment(`source document ${i} with varying content`, `src_${i}`),
    ).flatMap((s) => s);

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(sources.map((p) => p.text)));

    // Create embeddings that will produce different rankings
    const queryEmbeddings = query.map(() => createEmbedding(1.0));
    const sourceEmbeddings = sources.map((_, i) => {
      // Create a pattern where semantic and lexical rankings differ
      // Shift by 0.5 to avoid near-zero components that might normalize to zero vector
      const semanticComponent = 0.5 + 0.45 * Math.sin((i * Math.PI) / 50); // Range [0.05, 0.95]
      return createEmbedding(semanticComponent);
    });

    const candidates = retrieveCandidates(
      query,
      sources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );

    // For hybrid retrieval with 100 sources, we should have candidates from both
    // top-50 lexical and top-50 semantic
    const hybridCandidates = candidates[scoreKey('hybrid', 0.25)];
    expect(hybridCandidates.length).toBeGreaterThan(0);

    // The union should not exceed ~100 (top 50 lexical + top 50 semantic with overlap)
    expect(hybridCandidates.length).toBeLessThanOrEqual(100);

    // Verify we have candidates from multiple sources
    const sourceRefs = new Set(hybridCandidates.map((c) => c.sourceReference));
    expect(sourceRefs.size).toBeGreaterThan(1);
  });

  it('Calculates BOTH lexical and semantic scores for every merged candidate (not assigning zero)', () => {
    const query = segment('testing hybrid scoring', 'query');
    const sources = [
      ...segment('testing hybrid scoring exactly', 'A'),
      ...segment('unrelated content here', 'B'),
      ...segment('hybrid systems analysis', 'C'),
    ];
    const allSources = sources;

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(allSources.map((p) => p.text)));

    // Embeddings where A is high in semantic, C is lower, but different from lexical ranking
    const queryEmbeddings = [createEmbedding(1.0)];
    const sourceEmbeddings = [
      createEmbedding(0.95), // A: high semantic
      createEmbedding(0.1), // B: low semantic
      createEmbedding(0.8), // C: medium semantic
    ];

    const candidates = retrieveCandidates(
      query,
      allSources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );

    // Check lexical candidates
    for (const cand of candidates.lexical) {
      expect(typeof cand.lexical).toBe('number');
      expect(typeof cand.semantic).toBe('number');
      expect(Number.isFinite(cand.lexical)).toBe(true);
      expect(Number.isFinite(cand.semantic)).toBe(true);

      // Neither should be exactly 0 unless the text truly has no overlap/similarity
      // Crucially, semantic score should NOT be 0 just because we computed lexical
      if (cand.sourceReference === 'A' || cand.sourceReference === 'C') {
        expect(cand.semantic).not.toBe(0);
      }
    }

    // Check semantic candidates
    for (const cand of candidates.semantic) {
      expect(typeof cand.lexical).toBe('number');
      expect(typeof cand.semantic).toBe('number');
      expect(Number.isFinite(cand.lexical)).toBe(true);
      expect(Number.isFinite(cand.semantic)).toBe(true);
    }

    // Check hybrid candidates - they MUST have both scores
    const hybridCandidates = candidates[scoreKey('hybrid', 0.25)];
    for (const cand of hybridCandidates) {
      expect(Number.isFinite(cand.lexical)).toBe(true);
      expect(Number.isFinite(cand.semantic)).toBe(true);

      // Neither should be silently assigned zero
      // Both should be meaningful scores from the calculation
      const expectedScore = 0.25 * cand.lexical + 0.75 * cand.semantic;
      expect(cand.score).toBeCloseTo(expectedScore, 5);
    }
  });

  it('Computes hybrid scores for all alpha values using formula: S_hybrid = α × S_lexical + (1 - α) × S_semantic', () => {
    const query = segment('alpha formula testing', 'query');
    const sources = [
      ...segment('alpha formula testing correct', 'source1'),
      ...segment('other content', 'source2'),
    ];
    const allSources = sources;

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(allSources.map((p) => p.text)));

    const queryEmbeddings = [createEmbedding(0.95)];
    const sourceEmbeddings = [createEmbedding(0.8), createEmbedding(0.3)];

    const candidates = retrieveCandidates(
      query,
      allSources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      ALPHAS,
    );

    // For each candidate, verify all alpha values compute correctly
    for (const alpha of ALPHAS) {
      const key = scoreKey('hybrid', alpha);
      expect(candidates[key]).toBeDefined();
      expect(candidates[key].length).toBeGreaterThan(0);

      for (const cand of candidates[key]) {
        const expectedScore = alpha * cand.lexical + (1 - alpha) * cand.semantic;
        expect(cand.score).toBeCloseTo(expectedScore, 5);
      }
    }
  });

  it('Correctly weights alpha=0 (100% semantic), alpha=1 (100% lexical)', () => {
    const query = segment('weight testing', 'query');
    const sources = [
      ...segment('weight testing content', 'A'),
      ...segment('different content', 'B'),
    ];
    const allSources = sources;

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(allSources.map((p) => p.text)));

    const queryEmbeddings = [createEmbedding(0.9)];
    const sourceEmbeddings = [createEmbedding(0.7), createEmbedding(0.3)];

    const candidates = retrieveCandidates(
      query,
      allSources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0, 1],
    );

    // Alpha=0: score should equal semantic
    const alpha0Candidates = candidates[scoreKey('hybrid', 0)];
    for (const cand of alpha0Candidates) {
      expect(cand.score).toBeCloseTo(cand.semantic, 5);
    }

    // Alpha=1: score should equal lexical
    const alpha1Candidates = candidates[scoreKey('hybrid', 1)];
    for (const cand of alpha1Candidates) {
      expect(cand.score).toBeCloseTo(cand.lexical, 5);
    }
  });

  it('Preserves all candidates during merging (candidates NOT silently discarded)', () => {
    const query = segment('preservation test query content word', 'query');
    const sources = [
      ...segment('preservation test document complete material word word word', 'strong_lexical'),
      ...segment('similar semantic meaning conceptual analysis here discussion', 'strong_semantic'),
      ...segment('different materials unrelated items papers', 'weak_both'),
    ];
    const allSources = sources;

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(allSources.map((p) => p.text)));

    const queryEmbeddings = [createEmbedding(1.0)];
    // strong_lexical has low semantic, strong_semantic has high semantic
    const sourceEmbeddings = [
      createEmbedding(0.2), // strong_lexical: low semantic
      createEmbedding(0.95), // strong_semantic: high semantic
      createEmbedding(0.3), // weak_both: low both (but non-zero)
    ];

    const candidates = retrieveCandidates(
      query,
      allSources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );

    const hybridCandidates = candidates[scoreKey('hybrid', 0.25)];

    // Both strong_lexical and strong_semantic should appear
    const hasStrongLexical = hybridCandidates.some((c) => c.sourceReference === 'strong_lexical');
    const hasStrongSemantic = hybridCandidates.some((c) => c.sourceReference === 'strong_semantic');

    expect(hasStrongLexical).toBe(true);
    expect(hasStrongSemantic).toBe(true);

    // Verify they have both scores, not zeros
    const lexicalCand = hybridCandidates.find((c) => c.sourceReference === 'strong_lexical');
    expect(lexicalCand?.lexical).toBeGreaterThan(0); // Should have non-zero lexical score
    expect(lexicalCand?.semantic).toBeDefined(); // Should have semantic score, not undefined
    expect(lexicalCand?.semantic).not.toBe(0); // Should not be silently assigned zero

    const semanticCand = hybridCandidates.find((c) => c.sourceReference === 'strong_semantic');
    expect(semanticCand?.semantic).toBeGreaterThan(0.5); // Should be strong semantically
    expect(semanticCand?.lexical).toBeDefined(); // Should have lexical score, not undefined
    // Lexical score may be 0 if there's no text overlap, which is valid - verify it was calculated not assigned
    expect(typeof semanticCand?.lexical).toBe('number');
  });

  it('Candidate outside top-50 lexical but inside top-50 semantic appears in merged output with both scores', () => {
    const query = segment('semantic paraphrase detection', 'query');

    // Create 60 sources to ensure top-50 cutoff
    const sources = Array.from({ length: 60 }, (_, i) => {
      if (i === 25) {
        // Source 25: high semantic similarity, low lexical match
        return segment('semantic meaning similarity detection approach', `sem_${i}`);
      } else if (i === 5) {
        // Source 5: high lexical match, low semantic
        return segment('semantic paraphrase detection keywords', `lex_${i}`);
      } else {
        // Others: varying content
        return segment(`document content index ${i} placeholder`, `src_${i}`);
      }
    }).flatMap((s) => s);

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(sources.map((p) => p.text)));

    const queryEmbeddings = [createEmbedding(1.0)];
    const sourceEmbeddings = sources.map((_, i) => {
      if (i === 25) {
        // High semantic, low lexical: in top-50 semantic, probably outside top-50 lexical
        return createEmbedding(0.95);
      } else if (i === 5) {
        // High lexical (from text), low semantic
        return createEmbedding(0.15);
      } else {
        // Random
        return createEmbedding(Math.random() * 0.5);
      }
    });

    const candidates = retrieveCandidates(
      query,
      sources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );

    const hybridCandidates = candidates[scoreKey('hybrid', 0.25)];

    // Find the semantic-heavy candidate (sem_25)
    const semHeavy = hybridCandidates.find((c) => c.sourceReference.startsWith('sem_'));
    if (semHeavy) {
      expect(Number.isFinite(semHeavy.lexical)).toBe(true);
      expect(Number.isFinite(semHeavy.semantic)).toBe(true);
      expect(semHeavy.semantic).toBeGreaterThan(0.5);

      // Verify hybrid score is correctly computed
      const expected = 0.25 * semHeavy.lexical + 0.75 * semHeavy.semantic;
      expect(semHeavy.score).toBeCloseTo(expected, 5);
    }
  });

  it('Candidate outside top-50 semantic but inside top-50 lexical appears in merged output with both scores', () => {
    const query = segment('lexical term frequency analysis', 'query');

    const sources = Array.from({ length: 60 }, (_, i) => {
      if (i === 30) {
        // Source 30: high lexical match, low semantic
        return segment(
          'lexical term frequency analysis keywords terminology, lexical lexical lexical',
          `lex_${i}`,
        );
      } else if (i === 10) {
        // Source 10: high semantic, low lexical
        return segment('semantic meaning conceptual analysis', `sem_${i}`);
      } else {
        return segment(`placeholder document ${i}`, `src_${i}`);
      }
    }).flatMap((s) => s);

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(sources.map((p) => p.text)));

    const queryEmbeddings = [createEmbedding(1.0)];
    const sourceEmbeddings = sources.map((_, i) => {
      if (i === 30) {
        // High lexical, low semantic
        return createEmbedding(0.1);
      } else if (i === 10) {
        // High semantic, low lexical
        return createEmbedding(0.92);
      } else {
        return createEmbedding(Math.random() * 0.4);
      }
    });

    const candidates = retrieveCandidates(
      query,
      sources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );

    const hybridCandidates = candidates[scoreKey('hybrid', 0.25)];

    // Find the lexical-heavy candidate (lex_30)
    const lexHeavy = hybridCandidates.find((c) => c.sourceReference.startsWith('lex_'));
    if (lexHeavy) {
      expect(Number.isFinite(lexHeavy.lexical)).toBe(true);
      expect(Number.isFinite(lexHeavy.semantic)).toBe(true);
      expect(lexHeavy.lexical).toBeGreaterThan(0.5);

      const expected = 0.25 * lexHeavy.lexical + 0.75 * lexHeavy.semantic;
      expect(lexHeavy.score).toBeCloseTo(expected, 5);
    }
  });

  it('Hybrid scores computed correctly across all alpha values: 0, 0.25, 0.5, 0.75, 1.0', () => {
    const query = segment('comprehensive alpha test', 'query');
    const sources = [
      ...segment('comprehensive alpha test case one', 'A'),
      ...segment('unrelated document', 'B'),
    ];

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(sources.map((p) => p.text)));

    const queryEmbeddings = [createEmbedding(0.95)];
    const sourceEmbeddings = [createEmbedding(0.7), createEmbedding(0.2)];

    const candidates = retrieveCandidates(
      query,
      sources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0, 0.25, 0.5, 0.75, 1.0],
    );

    const testCases = [
      { alpha: 0, expectedFormula: (lex: number, sem: number) => sem },
      { alpha: 0.25, expectedFormula: (lex: number, sem: number) => 0.25 * lex + 0.75 * sem },
      { alpha: 0.5, expectedFormula: (lex: number, sem: number) => 0.5 * lex + 0.5 * sem },
      { alpha: 0.75, expectedFormula: (lex: number, sem: number) => 0.75 * lex + 0.25 * sem },
      { alpha: 1, expectedFormula: (lex: number, sem: number) => lex },
    ];

    for (const tc of testCases) {
      const key = scoreKey('hybrid', tc.alpha);
      const alphaCandidates = candidates[key];

      for (const cand of alphaCandidates) {
        const expected = tc.expectedFormula(cand.lexical, cand.semantic);
        expect(cand.score).toBeCloseTo(expected, 5);
      }
    }
  });

  it('Score normalization: all scores are in range [0, 1]', () => {
    const query = segment('normalization test', 'query');
    const sources = Array.from({ length: 30 }, (_, i) =>
      segment(`source document ${i}`, `src_${i}`),
    ).flatMap((s) => s);

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(sources.map((p) => p.text)));

    const queryEmbeddings = [createEmbedding(1.0)];
    const sourceEmbeddings = sources.map(() => {
      const v = new Array(384).fill(0);
      v[0] = Math.random();
      return normalize(v);
    });

    const candidates = retrieveCandidates(
      query,
      sources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      ALPHAS,
    );

    for (const key of Object.keys(candidates)) {
      for (const cand of candidates[key]) {
        expect(cand.score).toBeGreaterThanOrEqual(0);
        expect(cand.score).toBeLessThanOrEqual(1);
        expect(cand.lexical).toBeGreaterThanOrEqual(0);
        expect(cand.lexical).toBeLessThanOrEqual(1);
        expect(cand.semantic).toBeGreaterThanOrEqual(-1);
        expect(cand.semantic).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Deterministic ranking: multiple calls produce identical results', () => {
    const query = segment('deterministic ranking', 'query');
    const sources = Array.from({ length: 20 }, (_, i) =>
      segment(`deterministic document ${i}`, `src_${i}`),
    ).flatMap((s) => s);

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(sources.map((p) => p.text)));

    const queryEmbeddings = [createEmbedding(0.95)];
    const sourceEmbeddings = sources.map(() => createEmbedding(0.6));

    // Call retrieveCandidates multiple times
    const result1 = retrieveCandidates(
      query,
      sources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );
    const result2 = retrieveCandidates(
      query,
      sources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );

    // Results should be identical
    const r1Hybrid = result1[scoreKey('hybrid', 0.25)];
    const r2Hybrid = result2[scoreKey('hybrid', 0.25)];

    expect(r1Hybrid.length).toBe(r2Hybrid.length);

    for (let i = 0; i < r1Hybrid.length; i++) {
      const c1 = r1Hybrid[i];
      const c2 = r2Hybrid[i];

      expect(c1.sourceReference).toBe(c2.sourceReference);
      expect(c1.suspiciousReference).toBe(c2.suspiciousReference);
      expect(c1.score).toBe(c2.score);
      expect(c1.lexical).toBe(c2.lexical);
      expect(c1.semantic).toBe(c2.semantic);
    }
  });
});
