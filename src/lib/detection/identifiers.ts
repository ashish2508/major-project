/**
 * identifiers.ts
 *
 * Extracts research-document identifiers (trial IDs, DOIs, registry numbers,
 * accession numbers, long numeric strings) from plain text.
 *
 * Shared identifiers are strong but non-conclusive evidence that two documents
 * originate from the same experiment or data-set.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IdentifierMatch {
  type: string;
  value: string;
  offset: number;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PatternDef {
  type: string;
  pattern: RegExp;
}

const PATTERNS: PatternDef[] = [
  // ClinicalTrials.gov registration numbers: NCT followed by exactly 8 digits
  { type: 'ClinicalTrials', pattern: /\bNCT\d{8}\b/g },
  // ISRCTN registry: ISRCTN followed by any run of digits
  { type: 'ISRCTN', pattern: /\bISRCTN\d+\b/g },
  // PROSPERO / CRD: CRD followed by exactly 11 digits
  { type: 'PROSPERO', pattern: /\bCRD\d{11}\b/g },
  // DOIs: start with 10. then 4+ digits, then separator, then remainder
  { type: 'DOI', pattern: /\b10\.\d{4,}[/.][\w./:;()+\-]+/g },
  // GenBank / EMBL / DDBJ-style accession numbers: 1-3 uppercase letters + 6+ digits
  { type: 'accession', pattern: /\b[A-Z]{1,3}\d{6,}\b/g },
  // Long standalone numeric strings: 8 or more consecutive digits
  { type: 'numeric_id', pattern: /\b\d{8,}\b/g },
];

// ---------------------------------------------------------------------------
// Core extraction
// ---------------------------------------------------------------------------

/**
 * Extract all identifier matches from `text`.
 *
 * If `referenceSection` is provided, identifiers that appear ONLY in the
 * reference section (and not in the main body) are excluded.  This prevents
 * reference-list DOIs from inflating shared-identifier counts.
 *
 * DOI values are normalised to lower-case for comparison purposes.
 */
export function extractIdentifiers(text: string, referenceSection?: string): IdentifierMatch[] {
  const results: IdentifierMatch[] = [];

  for (const { type, pattern } of PATTERNS) {
    // Reset lastIndex because patterns are defined with /g and may be reused.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[0];
      // DOIs are case-normalised; all others are kept verbatim.
      const value = type === 'DOI' ? raw.toLowerCase() : raw;
      results.push({ type, value, offset: match.index });
    }
  }

  // If a reference section was provided, filter out identifiers that appear
  // ONLY in the reference section (not in the main body).
  if (referenceSection !== undefined && referenceSection.length > 0) {
    // Determine the main body: everything that is NOT in the reference section.
    // We locate the reference section by finding its first occurrence offset inside `text`.
    const refStart = text.indexOf(referenceSection);

    if (refStart !== -1) {
      // Build a set of (type+value) pairs that appear in the main body.
      const mainBody = text.slice(0, refStart) + text.slice(refStart + referenceSection.length);
      const mainBodyIds = new Set<string>();

      for (const { type, pattern } of PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(mainBody)) !== null) {
          const raw = match[0];
          const value = type === 'DOI' ? raw.toLowerCase() : raw;
          mainBodyIds.add(`${type}:${value}`);
        }
      }

      return results.filter((id) => mainBodyIds.has(`${id.type}:${id.value}`));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Intersection helper
// ---------------------------------------------------------------------------

/**
 * Find identifiers that appear in both `a` and `b` (by type + normalised value).
 *
 * Each shared identifier is returned once regardless of how many times it
 * appears in each document.
 */
export function intersectIdentifiers(
  a: IdentifierMatch[],
  b: IdentifierMatch[],
): IdentifierMatch[] {
  const bKeys = new Set(b.map((id) => `${id.type}:${id.value}`));
  const seen = new Set<string>();
  const shared: IdentifierMatch[] = [];

  for (const id of a) {
    const key = `${id.type}:${id.value}`;
    if (bKeys.has(key) && !seen.has(key)) {
      seen.add(key);
      shared.push(id);
    }
  }

  return shared;
}
