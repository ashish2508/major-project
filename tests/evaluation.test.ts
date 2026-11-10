import { it, expect } from 'vitest';
import { evaluatePan, unionLength, type PassagePair } from '../src/lib/evaluation/pan';
const pair = (offset = 0, length = 100, ref = 'q', source = 's'): PassagePair => ({
  suspiciousReference: ref,
  sourceReference: source,
  suspiciousSpan: { offset, length },
  sourceSpan: { offset, length },
});
it('matches official external-reference empty and perfect cases', () => {
  expect(evaluatePan([], []).plagdet).toBe(1);
  expect(evaluatePan([pair()], []).plagdet).toBe(0);
  expect(evaluatePan([], [pair()]).precision).toBe(0);
  expect(evaluatePan([pair()], [pair()]).plagdet).toBe(1);
});
it('matches reference macro recall .5 and precision 1 across documents', () => {
  const m = evaluatePan([pair(), pair(0, 100, 'q2', 's2')], [pair()]);
  expect(m.recall).toBe(0.5);
  expect(m.precision).toBe(1);
  expect(m.f1).toBeCloseTo(2 / 3);
});
it('matches reference partial union recall .75 rather than double counting', () => {
  const m = evaluatePan([pair(0, 100)], [pair(50, 100), pair(25, 75)]);
  expect(m.recall).toBe(0.75);
  expect(m.precision).toBe(0.75);
  expect(m.granularity).toBe(2);
  expect(m.plagdet).toBeCloseTo(0.75 / Math.log2(3));
});
it('requires both sides and correct source identity', () => {
  const wrong = pair();
  wrong.sourceSpan = { offset: 100, length: 10 };
  expect(evaluatePan([pair()], [wrong]).recall).toBe(0);
  expect(evaluatePan([pair()], [pair(0, 100, 'q', 'other')]).falsePositiveDetections).toBe(1);
  expect(evaluatePan([pair()], [pair(100, 100)]).recall).toBe(0);
});
it('uses independent lengths in the coverage denominator', () => {
  const a = pair();
  a.sourceSpan.length = 300;
  const m = evaluatePan([a], [pair()]);
  expect(m.recall).toBe(0.5);
  expect(m.precision).toBe(1);
});
it('penalizes fragmentation exactly as PAN', () => {
  const m = evaluatePan([pair()], [pair(0, 50), pair(50, 50)]);
  expect(m.precision).toBe(1);
  expect(m.recall).toBe(1);
  expect(m.plagdet).toBeCloseTo(0.6309297536);
});
it('does not penalize a clean document without detections', () =>
  expect(evaluatePan([pair()], [pair()]).falsePositiveDetections).toBe(0));
it('rejects zero spans under the explicit exclusion policy', () =>
  expect(() => evaluatePan([pair(0, 0)], [])).toThrow());
it('computes nested and touching interval unions', () =>
  expect(
    unionLength([
      { offset: 0, length: 100 },
      { offset: 20, length: 20 },
      { offset: 100, length: 10 },
    ]),
  ).toBe(110));
