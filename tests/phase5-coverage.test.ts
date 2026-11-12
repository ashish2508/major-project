/** Phase 5 coverage computation tests. */

import { describe, expect, it } from 'vitest';
import { computeCoverage } from '../src/lib/application/analysis';

// ---------------------------------------------------------------------------
// computeCoverage
// ---------------------------------------------------------------------------

describe('computeCoverage', () => {
  it('returns zero coverage when no detections', () => {
    const text = 'hello world foo bar baz';
    const result = computeCoverage(text, [], []);
    expect(result.coveredChars).toBe(0);
    expect(result.eligibleChars).toBe(text.length);
    expect(result.totalChars).toBe(text.length);
    expect(result.ratio).toBe(0);
  });

  it('returns full coverage when detection spans entire text', () => {
    const text = 'hello world';
    const result = computeCoverage(
      text,
      [{ suspiciousSpan: { offset: 0, length: text.length } }],
      [],
    );
    expect(result.coveredChars).toBe(text.length);
    expect(result.ratio).toBe(1);
  });

  it('computes partial coverage correctly', () => {
    // 10 chars: 5 covered, 5 not covered
    const text = 'hello world'; // 11 chars
    const result = computeCoverage(text, [{ suspiciousSpan: { offset: 0, length: 5 } }], []);
    expect(result.coveredChars).toBe(5);
    expect(result.eligibleChars).toBe(11);
    expect(Math.round(result.ratio * 100) / 100).toBeCloseTo(5 / 11, 2);
  });

  it('deduplicates overlapping detection spans', () => {
    const text = 'abcdefghij'; // 10 chars
    const result = computeCoverage(
      text,
      [
        { suspiciousSpan: { offset: 0, length: 6 } }, // a-f
        { suspiciousSpan: { offset: 3, length: 7 } }, // d-j (overlaps)
      ],
      [],
    );
    // All 10 chars are covered once
    expect(result.coveredChars).toBe(10);
    expect(result.ratio).toBe(1);
  });

  it('excludes suppressed (boilerplate) chars from eligible count', () => {
    const text = 'AB CDEFGH IJ'; // 12 chars
    // Suppress chars 3-9 (CDEFGH = 6 chars)
    const suppressed = [{ startOffset: 3, endOffset: 9 }];
    const result = computeCoverage(text, [], suppressed);
    // eligible = 12 - 6 = 6
    expect(result.eligibleChars).toBe(6);
    expect(result.totalChars).toBe(12);
  });

  it('covered chars in suppressed region do not count', () => {
    const text = 'ABCDE'; // 5 chars
    // Suppress 1-3 (BCD)
    const suppressed = [{ startOffset: 1, endOffset: 4 }];
    // Detection spans entire text
    const result = computeCoverage(
      text,
      [{ suspiciousSpan: { offset: 0, length: 5 } }],
      suppressed,
    );
    // Covered = chars in [0,5) but NOT in [1,4) = chars 0 and 4 = 2
    expect(result.coveredChars).toBe(2);
    expect(result.eligibleChars).toBe(2); // 5 - 3 = 2
    expect(result.ratio).toBe(1);
  });

  it('handles empty text', () => {
    const result = computeCoverage('', [], []);
    expect(result.coveredChars).toBe(0);
    expect(result.eligibleChars).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it('clamps detection spans that exceed text length', () => {
    const text = 'hello'; // 5 chars
    // Detection claims offset=3, length=100 (way past the end)
    const result = computeCoverage(text, [{ suspiciousSpan: { offset: 3, length: 100 } }], []);
    // Only chars 3,4 (2 chars) are within text
    expect(result.coveredChars).toBe(2);
  });
});
