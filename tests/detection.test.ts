import { it, expect } from 'vitest';
import { segment } from '../src/lib/detection/segmentation';
import { Tfidf, sparseCosine, denseCosine } from '../src/lib/detection/tfidf';
it('segments original Unicode/newlines with covering, overlapping windows', () => {
  const text = 'Élan 😀\r\n' + Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
  const p = segment(text, 'q');
  expect(p.length).toBeGreaterThan(1);
  for (const s of p) expect(text.slice(s.offset, s.offset + s.length)).toBe(s.text);
  const cover = new Set(p.flatMap((s) => Array.from({ length: s.length }, (_, i) => s.offset + i)));
  for (const m of text.matchAll(/\S/gu)) expect(cover.has(m.index!)).toBe(true);
});
it('adapts windows to actual token budgets without dropping content', () => {
  const text = Array(30).fill('word').join(' ');
  const p = segment(text, 'q', {
    words: 20,
    overlap: 2,
    maxTokens: 12,
    countTokens: (t) => t.split(' ').length * 2 + 2,
  });
  expect(p.every((s) => s.text.split(' ').length <= 5)).toBe(true);
  expect(p.at(-1)!.offset + p.at(-1)!.length).toBe(text.length);
});
it('rejects invalid windows and pathological indivisible tokens', () => {
  expect(() => segment('x', 'q', { words: 2, overlap: 2 })).toThrow();
  expect(() => segment('x', 'q', { maxTokens: 2, countTokens: () => 3 })).toThrow();
});
it('fits TF-IDF only on supplied training texts and treats OOV as zero', () => {
  const model = Tfidf.fit(['alpha beta', 'alpha gamma']);
  expect(model.idf.beta).toBeGreaterThan(model.idf.alpha);
  expect(model.transform('testonly').size).toBe(0);
  expect(sparseCosine(model.transform('alpha beta'), model.transform('alpha beta'))).toBeCloseTo(1);
  expect(sparseCosine(model.transform('beta'), model.transform('gamma'))).toBe(0);
  expect(sparseCosine(new Map(), new Map())).toBe(0);
});
it('computes dense cosine and rejects invalid vectors', () => {
  expect(denseCosine([1, 2], [2, 4])).toBeCloseTo(1);
  expect(denseCosine([1, 0], [0, 1])).toBe(0);
  expect(() => denseCosine([1], [1, 2])).toThrow();
  expect(() => denseCosine([NaN], [1])).toThrow();
});
