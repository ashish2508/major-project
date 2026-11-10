import type { CharacterSpan } from '../dataset/types';
export interface PassagePair {
  suspiciousReference: string;
  sourceReference: string;
  suspiciousSpan: CharacterSpan;
  sourceSpan: CharacterSpan;
}
export interface PanMetrics {
  precision: number;
  recall: number;
  f1: number;
  granularity: number;
  plagdet: number;
  cases: number;
  detections: number;
  detectedCases: number;
  missedCases: number;
  falsePositiveDetections: number;
}
export function intersection(a: CharacterSpan, b: CharacterSpan): CharacterSpan {
  const start = Math.max(a.offset, b.offset);
  return {
    offset: start,
    length: Math.max(0, Math.min(a.offset + a.length, b.offset + b.length) - start),
  };
}
export function overlaps(a: PassagePair, b: PassagePair): boolean {
  return (
    a.suspiciousReference === b.suspiciousReference &&
    a.sourceReference === b.sourceReference &&
    intersection(a.suspiciousSpan, b.suspiciousSpan).length > 0 &&
    intersection(a.sourceSpan, b.sourceSpan).length > 0
  );
}
export function unionLength(spans: CharacterSpan[]): number {
  const sorted = spans.filter((s) => s.length > 0).sort((a, b) => a.offset - b.offset);
  let total = 0,
    end = -1;
  for (const s of sorted) {
    const next = s.offset + s.length;
    total += Math.max(0, next - Math.max(s.offset, end));
    end = Math.max(end, next);
  }
  return total;
}
function coverage(a: PassagePair, others: PassagePair[]): number {
  const matches = others.filter((b) => overlaps(a, b));
  return (
    (unionLength(matches.map((b) => intersection(a.suspiciousSpan, b.suspiciousSpan))) +
      unionLength(matches.map((b) => intersection(a.sourceSpan, b.sourceSpan)))) /
    (a.suspiciousSpan.length + a.sourceSpan.length)
  );
}
/** External PAN macro character coverage, independently implemented from the published definition.
 * Reference: pan-webis-de/pan-code, sepln09, performance-measures v1.3.
 * Overlaps must occur on BOTH documents; intervals are half-open; union prevents double counting.
 */
export function evaluatePan(cases: PassagePair[], detections: PassagePair[]): PanMetrics {
  for (const a of [...cases, ...detections])
    for (const span of [a.suspiciousSpan, a.sourceSpan])
      if (
        !Number.isSafeInteger(span.offset) ||
        span.offset < 0 ||
        !Number.isSafeInteger(span.length) ||
        span.length <= 0
      )
        throw new Error('PAN evaluation requires positive, valid spans');
  const empty = !cases.length && !detections.length;
  const recall = empty
    ? 1
    : cases.length
      ? cases.reduce((s, a) => s + coverage(a, detections), 0) / cases.length
      : 0;
  const precision = empty
    ? 1
    : detections.length
      ? detections.reduce((s, a) => s + coverage(a, cases), 0) / detections.length
      : 0;
  const counts = cases.map((a) => detections.filter((b) => overlaps(a, b)).length),
    detectedCases = counts.filter((n) => n > 0).length;
  const granularity = detectedCases ? counts.reduce((a, b) => a + b, 0) / detectedCases : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    precision,
    recall,
    f1,
    granularity,
    plagdet: f1 / Math.log2(1 + granularity),
    cases: cases.length,
    detections: detections.length,
    detectedCases,
    missedCases: cases.length - detectedCases,
    falsePositiveDetections: detections.filter((d) => !cases.some((a) => overlaps(a, d))).length,
  };
}
