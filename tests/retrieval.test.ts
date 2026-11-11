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
});
