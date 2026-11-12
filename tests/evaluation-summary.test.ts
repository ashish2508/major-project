import { describe, expect, it } from 'vitest';
import {
  evaluatePredictions,
  formatRate,
  metricsAreFinite,
  queryFalsePositiveRate,
} from '../src/lib/evaluation/summary';
import type { PlagiarismAnnotation } from '../src/lib/dataset/types';
import type { Detection } from '../src/lib/detection/detector';

describe('evaluation summary metrics', () => {
  it('calculates clean-query false-positive rate, not span-level precision', () => {
    expect(queryFalsePositiveRate(24, 3)).toEqual({
      cleanQueries: 24,
      cleanQueriesWithAlerts: 3,
      rate: 0.125,
    });
  });

  it('returns zero when there are no clean queries', () => {
    expect(queryFalsePositiveRate(0, 0).rate).toBe(0);
  });

  it('rejects impossible counts', () => {
    expect(() => queryFalsePositiveRate(3, 4)).toThrow('Invalid clean-query counts');
    expect(() => queryFalsePositiveRate(-1, 0)).toThrow('Invalid clean-query counts');
  });

  it('formats rates as percentages', () => {
    expect(formatRate(0.125)).toBe('12.50%');
  });

  it('detects non-finite PAN metrics', () => {
    expect(
      metricsAreFinite({
        precision: 1,
        recall: 1,
        f1: 1,
        granularity: 1,
        plagdet: Number.NaN,
        cases: 1,
        detections: 1,
        detectedCases: 1,
        missedCases: 0,
        falsePositiveDetections: 0,
      }),
    ).toBe(false);
  });

  it('recomputes span metrics, missed annotations, unmatched alerts and clean-query FPR', () => {
    const annotation: PlagiarismAnnotation = {
      id: 'q1#1',
      suspiciousReference: 'q1',
      sourceReference: 's1',
      suspiciousLanguage: 'en',
      sourceLanguage: 'en',
      suspiciousSpan: { offset: 10, length: 20 },
      sourceSpan: { offset: 30, length: 20 },
      construction: { type: 'artificial', obfuscation: 'none' },
      rawAttributes: {},
      issues: [],
    };
    const detection = (
      query: string,
      source: string,
      queryOffset: number,
      sourceOffset: number,
    ): Detection => ({
      suspiciousReference: query,
      sourceReference: source,
      suspiciousSpan: { offset: queryOffset, length: 20 },
      sourceSpan: { offset: sourceOffset, length: 20 },
      lexical: 1,
      semantic: 1,
      score: 1,
      evidenceWindows: 1,
    });
    const summary = evaluatePredictions(
      ['q1', 'clean-with-alert', 'clean-without-alert'],
      [annotation],
      [detection('q1', 's1', 10, 30), detection('clean-with-alert', 's2', 0, 0)],
    );
    expect(summary.metrics.precision).toBeCloseTo(0.5);
    expect(summary.metrics.recall).toBe(1);
    expect(summary.metrics.plagdet).toBeCloseTo(2 / 3);
    expect(summary.falsePositiveRate).toEqual({
      cleanQueries: 2,
      cleanQueriesWithAlerts: 1,
      rate: 0.5,
    });
    expect(summary.unmatched).toHaveLength(1);
    expect(summary.missedAnnotationIds).toEqual([]);
  });
});
