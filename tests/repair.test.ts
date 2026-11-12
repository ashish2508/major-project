import { describe, expect, it } from 'vitest';
import { mapOffset, repairText } from '../src/lib/documents/repair';

// ---------------------------------------------------------------------------
// Ligature rejoining — word-list cases
// ---------------------------------------------------------------------------

describe('ligature rejoining (word-list)', () => {
  it('repairs "ef fi cacy" → "efficacy"', () => {
    const { text } = repairText('ef fi cacy');
    expect(text).toBe('efficacy');
  });

  it('repairs "con fl icts" → "conflicts"', () => {
    const { text } = repairText('con fl icts');
    expect(text).toBe('conflicts');
  });

  it('repairs "signi fi cant" → "significant"', () => {
    const { text } = repairText('signi fi cant');
    expect(text).toBe('significant');
  });

  it('repairs "scienti fi cally" → "scientifically"', () => {
    const { text } = repairText('scienti fi cally');
    expect(text).toBe('scientifically');
  });

  it('repairs "in fl uenza" → "influenza"', () => {
    const { text } = repairText('in fl uenza');
    expect(text).toBe('influenza');
  });

  it('repairs "ef fi ciency" → "efficiency"', () => {
    const { text } = repairText('ef fi ciency');
    expect(text).toBe('efficiency');
  });
});

// ---------------------------------------------------------------------------
// Ligature rejoining — word NOT in list AND not repeated ≥2 times
// ---------------------------------------------------------------------------

describe('ligature rejoining (unchanged)', () => {
  it('leaves "a fi rst" unchanged (not in word list, not repeated ≥2 times)', () => {
    // "afirst" is not in the ligature word list and does not appear twice.
    const input = 'a fi rst';
    const { text } = repairText(input);
    expect(text).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Hyphenated line-break rejoining
// ---------------------------------------------------------------------------

describe('hyphenated line-break rejoining', () => {
  it('repairs "meta-\\nanalysis" → "meta-analysis" (next char lowercase)', () => {
    const { text } = repairText('meta-\nanalysis');
    expect(text).toBe('meta-analysis');
  });

  it('leaves "Meta-\\nAnalysis" unchanged (next char uppercase A)', () => {
    const input = 'Meta-\nAnalysis';
    const { text } = repairText(input);
    expect(text).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Offset map
// ---------------------------------------------------------------------------

describe('offset map', () => {
  it('mapOffset(0, []) returns 0', () => {
    expect(mapOffset(0, [])).toBe(0);
  });

  it('offset map has at least one entry after a ligature join', () => {
    const { offsetMap } = repairText('ef fi cacy');
    expect(offsetMap.length).toBeGreaterThanOrEqual(1);
  });

  it('offset map entry has non-negative repairedOffset', () => {
    const { offsetMap } = repairText('ef fi cacy');
    for (const e of offsetMap) {
      expect(e.repairedOffset).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-repair pass
// ---------------------------------------------------------------------------

describe('multi-repair pass', () => {
  it('repairs "The ef fi cacy  of meta-\\nanalysis" to "The efficacy of meta-analysis"', () => {
    const input = 'The ef fi cacy  of meta-\nanalysis';
    const { text, offsetMap } = repairText(input);
    expect(text).toBe('The efficacy of meta-analysis');

    // Offset map must be non-empty (ligature + hyphen repairs both fire).
    expect(offsetMap.length).toBeGreaterThan(0);

    // Position 0 in repaired text ('T') should map back close to 0 in original.
    const origPos = mapOffset(0, offsetMap);
    expect(origPos).toBe(0);

    // "The " is 4 chars; repaired[4] is 'e' (start of "efficacy").
    // Original[4] is also 'e' (start of "ef fi cacy") — delta not yet applied.
    // After repair the delta at that point is 0 (no changes before position 4).
    const origEfficacy = mapOffset(4, offsetMap);
    expect(origEfficacy).toBe(4);
  });
});
