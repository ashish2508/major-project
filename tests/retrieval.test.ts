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
it('semantic retrieval is independent of lexical ranking; hybrid combines the same pair scores', () => {
  const s = [...segment('alpha', 'A'), ...segment('beta', 'B')],
    q = segment('alpha', 'q'),
    v = (a: number, b: number) => [a, b, ...Array(382).fill(0)];
  const r = retrieveCandidates(q, s, Tfidf.fit(['alpha', 'beta']), [v(0, 1)], [v(1, 0), v(0, 1)]);
  expect(r.lexical[0].sourceReference).toBe('A');
  expect(r.semantic[0].sourceReference).toBe('B');
  expect(r['hybrid:0.25'][0].sourceReference).toBe('B');
  expect(r['hybrid:0.25'][0].score).toBe(0.75);
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

it('caps and orders each semantic shortlist without changing lexical results', () => {
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
  const lexical = retrieveCandidates(query, sources, tfidf).lexical;
  expect(ranked.lexical.map((candidate) => ({ ...candidate, semantic: 0 }))).toEqual(lexical);
  expect(ranked['hybrid:1']).toEqual(ranked.lexical);
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

it('breaks semantic ties with matching words and keeps weaker same-topic candidates below the alert threshold', () => {
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
  expect(result.lexical[0].sourceReference).toBe('copy');
  expect(result.semantic[0].sourceReference).toBe('paraphrase');
  expect(detect(result.semantic, 0.7)).toHaveLength(0);
  const tied = retrieveCandidates(
    query,
    sources.slice(0, 2),
    tfidf,
    [vector(1)],
    [vector(0.6), vector(0.6)],
  );
  expect(tied.semantic[0].sourceReference).toBe('copy');
  expect(
    retrieveCandidates(query, sources.slice(0, 1), tfidf, [vector(1)], [vector(0.6, 1.0005)])
      .semantic[0].score,
  ).toBeCloseTo(0.6, 10);
});
