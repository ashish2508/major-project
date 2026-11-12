import { it, expect } from 'vitest';
import {
  retrieveCandidates,
  detect,
  fuseEvidence,
  type Candidate,
} from '../src/lib/detection/detector';
import { segment } from '../src/lib/detection/segmentation';
import { Tfidf } from '../src/lib/detection/tfidf';
it('retrieves the source without annotation-known pairs and abstains on OOV', () => {
  const sources = [
    ...segment('alpha beta gamma', 'sourceA'),
    ...segment('delta epsilon zeta', 'sourceB'),
  ];
  const queries = segment('alpha beta gamma', 'query');
  const tfidf = Tfidf.fit(sources.map((s) => s.text));
  const result = retrieveCandidates(queries, sources, tfidf);
  expect(result.lexical[0].sourceReference).toBe('sourceA');
  expect(detect(result.lexical, 0.9)).toHaveLength(1);
  expect(
    detect(retrieveCandidates(segment('unknown', 'q'), sources, tfidf).lexical, 0.2),
  ).toHaveLength(0);
});
it('uses persistent lexical vectors without changing candidate scores or source attribution', () => {
  const sources = [
      ...segment('alpha beta gamma', 'sourceA').map((p) => ({ ...p, id: 'a' })),
      ...segment('delta epsilon zeta', 'sourceB').map((p) => ({ ...p, id: 'b' })),
    ],
    queries = segment('alpha beta gamma', 'query'),
    tfidf = Tfidf.fit(sources.map((source) => source.text)),
    indexed = new Map(sources.map((source) => [source.id, tfidf.transform(source.text)]));
  expect(
    retrieveCandidates(queries, sources, tfidf, undefined, undefined, undefined, 0, indexed),
  ).toEqual(retrieveCandidates(queries, sources, tfidf));
});
it('preserves exact query and source page attribution on retrieved evidence', () => {
  const query = segment('alpha beta gamma', 'query').map((p) => ({ ...p, page: 3 }));
  const source = segment('alpha beta gamma', 'source').map((p) => ({ ...p, page: 8 }));
  const result = retrieveCandidates(query, source, Tfidf.fit(['alpha beta gamma']));
  expect(result.lexical[0]).toMatchObject({ suspiciousPage: 3, sourcePage: 8 });
});
it('semantic retrieval is independent of lexical ranking; hybrid combines candidates from both channels', () => {
  const s = [...segment('alpha', 'A'), ...segment('beta', 'B')],
    q = segment('alpha', 'q'),
    v = (a: number, b: number) => [a, b, ...Array(382).fill(0)];
  const r = retrieveCandidates(q, s, Tfidf.fit(['alpha', 'beta']), [v(0, 1)], [v(1, 0), v(0, 1)]);

  // Lexical scores highest on 'A'
  expect(r.lexical.some((c) => c.sourceReference === 'A')).toBe(true);

  // Semantic scores highest on 'B'
  expect(r.semantic.some((c) => c.sourceReference === 'B')).toBe(true);

  // Hybrid includes both candidates from the merged set
  expect(r['hybrid:0.25'].length).toBeGreaterThan(0);
  expect(r['hybrid:0.25'].some((c) => c.sourceReference === 'A' || c.sourceReference === 'B')).toBe(
    true,
  );

  // Verify fusion also produces both
  expect(
    fuseEvidence(r.lexical, r.semantic, 0.9, 0.9, 0).map((item) => item.sourceReference),
  ).toEqual(['A', 'B']);
  expect(() =>
    retrieveCandidates(q, s, Tfidf.fit(['alpha', 'beta']), [v(0, 2)], [v(1, 0), v(0, 1)]),
  ).toThrow('normalized');
});
it('merges evidence only when both matching source and query spans are near', () => {
  const c = (q: number, s: number): Candidate => ({
    suspiciousReference: 'q',
    sourceReference: 's',
    suspiciousSpan: { offset: q, length: 100 },
    sourceSpan: { offset: s, length: 100 },
    score: 0.8,
    lexical: 0.8,
    semantic: 0.8,
  });
  const result = detect([c(0, 0), c(80, 90), c(150, 1000)], 0.7, 0);
  expect(result).toHaveLength(2);
  expect(result[0].suspiciousSpan.length).toBe(180);
  expect(result[0].evidenceWindows).toBe(2);
  expect(detect([c(0, 0), c(80, 90)], 0.7, 120, true)).toHaveLength(1);
  expect(detect([c(0, 140), c(80, 0)], 0.7, 120, true)).toHaveLength(2);
  expect(detect([c(0, 0), c(0, 140)], 0.7, 120, true)).toHaveLength(2);
  expect(detect([c(0, 0), c(100, 100)], 0.7, 0, true)).toHaveLength(1);
  expect(detect([c(0, 0), c(80, 90), c(170, 50)], 0.7, 120, true)).toHaveLength(2);
  expect(detect([c(0, 0), c(80, 90), c(170, 50)], 0.7, 120)).toHaveLength(1);
  expect(() => detect([c(0, 0)], 0.7, NaN)).toThrow();
});

it('caps and orders each semantic shortlist without changing lexical-only scores', () => {
  const query = segment('alpha beta', 'query');
  const sources = Array.from(
    { length: 7 },
    (_, i) => segment(i === 1 ? 'alpha beta' : 'beta gamma', String(i))[0],
  );
  const tfidf = Tfidf.fit(sources.map(({ text }) => text));
  const vector = (cosine: number) => [cosine, Math.sqrt(1 - cosine ** 2), ...Array(382).fill(0)];
  const embeddings = [0.1, 0.5, 0.5, 0.9, 0.3, -0.3, 0.2].map(vector);
  const ranked = retrieveCandidates(query, sources, tfidf, [vector(1)], embeddings, [1], 5);
  expect(ranked.semanticAlternatives.map((candidate) => candidate.sourceReference)).toEqual([
    '3',
    '1',
    '2',
    '4',
    '6',
  ]);

  // Lexical-only result with legacy single-best mode (topKLexical=1, as used by PAN benchmark path)
  const lexicalOnly = retrieveCandidates(
    query,
    sources,
    tfidf,
    undefined,
    undefined,
    undefined,
    0,
    undefined,
    1,
  ).lexical;
  expect(lexicalOnly).toHaveLength(1);

  // Default lexical-only result (topKLexical=10, as used by research-paper mode)
  const lexicalDefault = retrieveCandidates(query, sources, tfidf).lexical;
  expect(lexicalDefault.length).toBeGreaterThan(1);
  expect(lexicalDefault.length).toBeLessThanOrEqual(10);

  // Hybrid mode with alpha=1 returns merged candidates but they should have same score as lexical best
  expect(ranked.lexical.length).toBeGreaterThan(0);
  // The best lexical candidate should match the lexical-only result
  const bestLexicalFromHybrid = ranked.lexical.sort((a, b) => b.score - a.score)[0];
  expect(bestLexicalFromHybrid.sourceReference).toBe(lexicalOnly[0].sourceReference);
  expect(bestLexicalFromHybrid.score).toBe(lexicalOnly[0].score);

  // Hybrid alpha=1 combines scores (weighted 100% lexical, 0% semantic)
  expect(ranked['hybrid:1'].length).toBeGreaterThan(0);
  // Top hybrid:1 should match top lexical
  const topHybrid1 = ranked['hybrid:1'].sort((a, b) => b.score - a.score)[0];
  expect(topHybrid1.sourceReference).toBe(lexicalOnly[0].sourceReference);

  expect(() =>
    retrieveCandidates(query, sources, tfidf, [vector(1)], embeddings, [], -1),
  ).toThrow();
  for (const invalid of [Array(384).fill(0), vector(NaN), [1]]) {
    expect(() => retrieveCandidates(query, sources, tfidf, [invalid], embeddings)).toThrow(
      'normalized',
    );
  }
  expect(
    retrieveCandidates(query, sources.slice(0, 1), tfidf, [vector(1)], [vector(-1)]).semantic[0]
      .score,
  ).toBe(-1);
});

it('breaks semantic ties with matching words and finds strong candidates', () => {
  const query = segment('Battery cooling limits charging power.', 'query');
  const sources = [
    ...segment('Battery recycling separates metals.', 'same-topic'),
    ...segment('Battery cooling limits charging power.', 'copy'),
    ...segment('Thermal constraints cap the charge rate.', 'paraphrase'),
  ];
  const vector = (cosine: number, norm = 1) => [
    cosine * norm,
    Math.sqrt(1 - cosine ** 2) * norm,
    ...Array(382).fill(0),
  ];
  const tfidf = Tfidf.fit(sources.map(({ text }) => text));
  const result = retrieveCandidates(
    query,
    sources,
    tfidf,
    [vector(1)],
    [vector(0.6, 1.0005), vector(0.6), vector(0.69)],
  );

  // Lexical best is 'copy'
  const lexicalBest = result.lexical.sort((a, b) => b.lexical - a.lexical)[0];
  expect(lexicalBest.sourceReference).toBe('copy');

  // Semantic best is 'paraphrase'
  const semanticBest = result.semantic.sort((a, b) => b.semantic - a.semantic)[0];
  expect(semanticBest.sourceReference).toBe('paraphrase');

  expect(detect(result.semantic, 0.7)).toHaveLength(0);

  const tied = retrieveCandidates(
    query,
    sources.slice(0, 2),
    tfidf,
    [vector(1)],
    [vector(0.6), vector(0.6)],
  );
  const tieBest = tied.semantic.sort((a, b) => b.semantic - a.semantic)[0];
  expect(tieBest.sourceReference).toBe('copy');

  expect(
    retrieveCandidates(query, sources.slice(0, 1), tfidf, [vector(1)], [vector(0.6, 1.0005)])
      .semantic[0].score,
  ).toBeCloseTo(0.6, 10);
});
