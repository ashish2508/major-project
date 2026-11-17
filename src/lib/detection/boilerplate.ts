/**
 * boilerplate.ts
 *
 * Boilerplate detection and masking for research-paper text.
 *
 * Performs section-aware masking (front matter, back matter) and pattern-based
 * masking (license text, correspondence blocks, CRediT lines, etc.).
 * Masking replaces matched characters with spaces of EQUAL LENGTH so that
 * character offsets in the original text remain valid — detections produced on
 * the masked text can be mapped back to the original text without an offset
 * translation table.
 *
 * Usage
 * -----
 * ```ts
 * const { maskedText, suppressedItems } = maskBoilerplate(documentText);
 * // feed maskedText to segmentation instead of the raw text
 * ```
 */

import patterns from './boilerplate-patterns.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuppressedItem {
  name: string;
  matchedText: string;
  startOffset: number;
  endOffset: number;
  reason: string;
}

/**
 * Identity offset map entry.
 *
 * Because masking preserves string length (replacement with equal-length
 * spaces), every repaired offset equals its original offset.  The map is
 * always empty; it is included in the return type so callers have a
 * consistent interface that can be extended later without breaking changes.
 */
export interface MaskOffsetEntry {
  repairedOffset: number;
  originalOffset: number;
}

export interface MaskResult {
  maskedText: string;
  offsetMap: MaskOffsetEntry[];
  suppressedItems: SuppressedItem[];
}

export interface PageInfo {
  page: number;
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Pattern cache
// ---------------------------------------------------------------------------

/** Back-matter section headings to detect and mask. */
const BACK_MATTER_HEADINGS = [
  'Acknowledgements?',
  'Funding',
  'Conflicts?\\s+of\\s+Interest',
  'Competing\\s+Interests?',
  'Author\\s+Contributions?',
  'Data\\s+Availability',
  'Ethics\\s+Statement',
  'Disclosure',
  'Supplementary(?:\\s+Materials?)?',
  'Declaration\\s+of\\s+competing\\s+interest',
];

/**
 * Matches a heading that occupies its own line (optionally followed by colon).
 * Example: "Acknowledgements\n" or "Funding:"
 */
const BACK_MATTER_RE = new RegExp(
  `^[ \\t]*(${BACK_MATTER_HEADINGS.join('|')})[ \\t]*:?[ \\t]*$`,
  'gim',
);

/**
 * Matches "Abstract" on its own line (optionally with a colon), which marks
 * the end of front matter.
 */
const ABSTRACT_HEADING_RE = /^[ \t]*Abstract[ \t]*:?[ \t]*$/im;

// ---------------------------------------------------------------------------
// Lazily-loaded compiled pattern cache
// ---------------------------------------------------------------------------

type CompiledPattern = { name: string; re: RegExp; description: string };

let _compiledPatterns: CompiledPattern[] | null = null;

function getCompiledPatterns(): CompiledPattern[] {
  if (_compiledPatterns) return _compiledPatterns;
  _compiledPatterns = patterns.map((p) => ({
    name: p.name,
    description: p.description,
    re: new RegExp(p.pattern, 'gi'),
  }));
  return _compiledPatterns;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replace characters in [start, end) in `chars` with space characters.
 * Modifies the array in-place.
 */
function maskRange(chars: string[], start: number, end: number): void {
  const clampedEnd = Math.min(end, chars.length);
  const clampedStart = Math.max(start, 0);
  for (let i = clampedStart; i < clampedEnd; i++) {
    chars[i] = ' ';
  }
}

/**
 * Extend a range to include the full lines that contain the given offsets.
 * Returns [lineStart, lineEnd] where lineEnd points just past the newline.
 */
function expandToLines(text: string, start: number, end: number): [number, number] {
  let lineStart = start;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;

  let lineEnd = end;
  while (lineEnd < text.length && text[lineEnd] !== '\n') lineEnd++;
  if (lineEnd < text.length) lineEnd++; // include the newline itself

  return [lineStart, lineEnd];
}

// ---------------------------------------------------------------------------
// maskBoilerplate — main export
// ---------------------------------------------------------------------------

/**
 * Performs section-aware and pattern-based boilerplate masking.
 *
 * Masking is offset-preserving: matched characters are replaced with space
 * characters of equal length.  The returned offsetMap is therefore always
 * an empty array (identity map).
 *
 * Masking order:
 *   1. Front matter  (everything before the "Abstract" heading)
 *   2. Back matter   (acknowledgements, funding, etc.)
 *   3. Pattern masks (license text, correspondence, CRediT lines…)
 *   4. Page header/footer detection (lines repeated on 3+ pages)
 */
export function maskBoilerplate(text: string, options?: { pages?: PageInfo[] }): MaskResult {
  const chars = text.split('');
  const suppressedItems: SuppressedItem[] = [];

  // --- 1. FRONT MATTER ---
  const abstractMatch = ABSTRACT_HEADING_RE.exec(text);
  if (abstractMatch && abstractMatch.index > 0) {
    const start = 0;
    const end = abstractMatch.index;
    // Keep the abstract heading itself visible
    maskRange(chars, start, end);
    suppressedItems.push({
      name: 'front_matter',
      matchedText: text.slice(start, Math.min(end, start + 100)),
      startOffset: start,
      endOffset: end,
      reason: 'Text before Abstract heading (title page, author affiliations, etc.)',
    });
  }

  // --- 2. BACK MATTER sections ---
  // Find all back-matter heading positions, then mask each section from its
  // heading start to the next heading (or end of document).
  BACK_MATTER_RE.lastIndex = 0;
  const backHeadingMatches: Array<{ start: number; end: number; name: string }> = [];
  let bm: RegExpExecArray | null;
  while ((bm = BACK_MATTER_RE.exec(text)) !== null) {
    // Preliminary pages can contain these headings before the abstract.
    if (abstractMatch && bm.index < abstractMatch.index) continue;
    // Find the start of the line containing this heading
    const [lineStart] = expandToLines(text, bm.index, bm.index + bm[0].length);
    backHeadingMatches.push({
      start: lineStart,
      end: bm.index + bm[0].length,
      name: bm[1].toLowerCase().replace(/\s+/g, '_'),
    });
  }

  for (let i = 0; i < backHeadingMatches.length; i++) {
    const sectionStart = backHeadingMatches[i].start;
    const sectionEnd =
      i + 1 < backHeadingMatches.length ? backHeadingMatches[i + 1].start : text.length;
    maskRange(chars, sectionStart, sectionEnd);
    suppressedItems.push({
      name: `back_matter_${backHeadingMatches[i].name}`,
      matchedText: text.slice(sectionStart, Math.min(sectionStart + 100, sectionEnd)),
      startOffset: sectionStart,
      endOffset: sectionEnd,
      reason: `Back-matter section: ${backHeadingMatches[i].name}`,
    });
  }

  // Build a masked snapshot for pattern scanning (don't re-detect already-masked text)
  const maskedSoFar = chars.join('');

  // --- 3. PATTERN MASKS ---
  const compiled = getCompiledPatterns();
  for (const { name, re, description } of compiled) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(maskedSoFar)) !== null) {
      const [lineStart, lineEnd] = expandToLines(maskedSoFar, m.index, m.index + m[0].length);
      // Only mask if not already fully masked
      const lineText = text.slice(lineStart, lineEnd);
      if (lineText.trim().length === 0) continue; // already masked

      maskRange(chars, lineStart, lineEnd);
      suppressedItems.push({
        name,
        matchedText: lineText.slice(0, 100),
        startOffset: lineStart,
        endOffset: lineEnd,
        reason: description,
      });
    }
  }

  // --- 4. PAGE HEADER/FOOTER DETECTION ---
  const pages = options?.pages;
  if (pages && pages.length >= 3) {
    // Split each page's text into lines and count how often each exact line
    // appears across different pages.
    const linePageSet = new Map<string, Set<number>>();

    for (const pageInfo of pages) {
      const pageText = text.slice(pageInfo.start, pageInfo.end);
      const lines = pageText.split('\n');
      const seenOnThisPage = new Set<string>();
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        if (!seenOnThisPage.has(trimmed)) {
          seenOnThisPage.add(trimmed);
          if (!linePageSet.has(trimmed)) linePageSet.set(trimmed, new Set());
          linePageSet.get(trimmed)!.add(pageInfo.page);
        }
      }
    }

    // Lines appearing on 3+ distinct pages are headers/footers
    const headerFooterLines = new Set<string>();
    for (const [line, pageSet] of linePageSet) {
      if (pageSet.size >= 3) headerFooterLines.add(line);
    }

    if (headerFooterLines.size > 0) {
      // Mask all occurrences of these lines in the full text
      for (const hfLine of headerFooterLines) {
        // Escape the line for use in a regex
        const escaped = hfLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hfRe = new RegExp(`^[ \\t]*${escaped}[ \\t]*$`, 'gm');
        let hm: RegExpExecArray | null;
        while ((hm = hfRe.exec(text)) !== null) {
          const [lineStart, lineEnd] = expandToLines(text, hm.index, hm.index + hm[0].length);
          maskRange(chars, lineStart, lineEnd);
          suppressedItems.push({
            name: 'page_header_footer',
            matchedText: hfLine.slice(0, 100),
            startOffset: lineStart,
            endOffset: lineEnd,
            reason: `Line repeated on ${linePageSet.get(hfLine)?.size ?? 3}+ pages`,
          });
        }
      }
    }
  }

  return {
    maskedText: chars.join(''),
    offsetMap: [], // identity map — no offset translation needed
    suppressedItems,
  };
}

// ---------------------------------------------------------------------------
// isSuppressedPair — pair-level boilerplate filter
// ---------------------------------------------------------------------------

let _cachedPairPatterns: RegExp[] | null = null;

function getPairPatterns(): RegExp[] {
  if (_cachedPairPatterns) return _cachedPairPatterns;
  _cachedPairPatterns = patterns.map((p) => new RegExp(p.pattern, 'gi'));
  return _cachedPairPatterns;
}

/**
 * Returns true if BOTH queryText and sourceText match any boilerplate pattern.
 *
 * Used as a pair-level filter: if both sides of a detection are boilerplate,
 * the detection is likely a false positive (e.g. two papers sharing the same
 * CC license statement).
 */
export function isSuppressedPair(
  queryText: string,
  sourceText: string,
  patternsArg?: RegExp[],
): boolean {
  const pats = patternsArg ?? getPairPatterns();

  const matchesAny = (text: string): boolean => {
    for (const re of pats) {
      re.lastIndex = 0;
      if (re.test(text)) return true;
    }
    return false;
  };

  return matchesAny(queryText) && matchesAny(sourceText);
}

// ---------------------------------------------------------------------------
// getSuppressedList — report helper
// ---------------------------------------------------------------------------

/**
 * Returns a formatted string listing suppressed items for the report.
 */
export function getSuppressedList(suppressedItems: SuppressedItem[]): string {
  if (suppressedItems.length === 0) return 'No items suppressed.';
  return suppressedItems
    .map(
      (item, i) =>
        `[${i + 1}] ${item.name} (offset ${item.startOffset}–${item.endOffset})\n` +
        `    Reason: ${item.reason}\n` +
        `    Text: ${JSON.stringify(item.matchedText.slice(0, 100))}`,
    )
    .join('\n\n');
}
