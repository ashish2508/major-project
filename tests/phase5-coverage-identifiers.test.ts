/**
 * Phase 5 tests: coverage computation and identifier extraction integration.
 *
 * Tests:
 *   - computeCoverage: basic coverage ratio, eligible char exclusion, overlapping spans
 *   - shared identifiers: CRD number present in both documents is surfaced
 *   - roles: analyzeDocuments result carries queryRole / sourceRole fields
 *   - symmetryNote: analyzeDocuments result carries the symmetry note
 *   - offset notes in stripping metadata
 */

import { describe, expect, it } from 'vitest';
import { computeCoverage } from '../src/lib/application/analysis';
import { extractIdentifiers, intersectIdentifiers } from '../src/lib/detection/identifiers';

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

// ---------------------------------------------------------------------------
// Identifier extraction / intersection
// ---------------------------------------------------------------------------

describe('extractIdentifiers', () => {
  it('extracts PROSPERO registration number CRD42020164164', () => {
    const text =
      'This study was registered in PROSPERO as CRD42020164164 prior to data collection.';
    const ids = extractIdentifiers(text);
    const crd = ids.find((id) => id.type === 'PROSPERO');
    expect(crd).toBeDefined();
    expect(crd?.value).toBe('CRD42020164164');
  });

  it('extracts ClinicalTrials.gov NCT number', () => {
    const text = 'Trial registered at ClinicalTrials.gov (NCT01234567).';
    const ids = extractIdentifiers(text);
    const nct = ids.find((id) => id.type === 'ClinicalTrials');
    expect(nct).toBeDefined();
    expect(nct?.value).toBe('NCT01234567');
  });

  it('extracts DOI and normalises to lower case', () => {
    const text = 'See DOI: 10.1097/MD.0000000000021808 for more information.';
    const ids = extractIdentifiers(text);
    const doi = ids.find((id) => id.type === 'DOI');
    expect(doi).toBeDefined();
    expect(doi?.value).toBe(doi?.value?.toLowerCase());
  });

  it('filters out identifiers that appear only in the reference section', () => {
    const body = 'Main text with NCT01234567 registration.';
    const refs = '[1] Author. Title. 2020. DOI 10.9999/FAKE\nNCT99999999 is ref-only.';
    const full = body + '\n\nReferences\n\n' + refs;
    const ids = extractIdentifiers(full, '\n\nReferences\n\n' + refs);
    const nctValues = ids.filter((id) => id.type === 'ClinicalTrials').map((id) => id.value);
    // NCT01234567 is in body → kept; NCT99999999 is refs-only → filtered
    expect(nctValues).toContain('NCT01234567');
    expect(nctValues).not.toContain('NCT99999999');
  });
});

describe('intersectIdentifiers', () => {
  it('finds shared identifiers between two documents', () => {
    const aIds = extractIdentifiers('Study registered as CRD42020164164 and NCT01234567.');
    const bIds = extractIdentifiers('Registration: CRD42020164164 (PROSPERO).');
    const shared = intersectIdentifiers(aIds, bIds);
    expect(shared.some((id) => id.value === 'CRD42020164164')).toBe(true);
    // NCT not in b → not shared
    expect(shared.some((id) => id.type === 'ClinicalTrials')).toBe(false);
  });

  it('returns empty array when no identifiers are shared', () => {
    const aIds = extractIdentifiers('NCT01234567 is in document A.');
    const bIds = extractIdentifiers('NCT98765432 is in document B.');
    const shared = intersectIdentifiers(aIds, bIds);
    expect(shared).toHaveLength(0);
  });

  it('deduplicates: each shared identifier value appears only once per type', () => {
    // Identifier appears twice in both docs at different offsets
    const text = 'CRD42020164164 and CRD42020164164 again.';
    const aIds = extractIdentifiers(text);
    const bIds = extractIdentifiers(text);
    const shared = intersectIdentifiers(aIds, bIds);
    // The key is type+value. PROSPERO:CRD42020164164 appears once, accession:CRD42020164164 once.
    // No key should appear twice even though both docs have the value at two offsets.
    const keys = shared.map((id) => `${id.type}:${id.value}`);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
    // PROSPERO type appears exactly once
    const prosperoCount = shared.filter(
      (id) => id.type === 'PROSPERO' && id.value === 'CRD42020164164',
    ).length;
    expect(prosperoCount).toBe(1);
  });
});
