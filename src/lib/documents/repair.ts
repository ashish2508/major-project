import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OffsetMapEntry {
  /** Position in the repaired text where this entry takes effect. */
  repairedOffset: number;
  /** Corresponding position in the original text. */
  originalOffset: number;
  /** Cumulative characters added (positive) or removed (negative) up to this
   *  point. Given repaired position P, the original position is P − delta. */
  delta: number;
}

export interface RepairResult {
  text: string;
  offsetMap: OffsetMapEntry[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Ligature word-list (lazy singleton)
// ---------------------------------------------------------------------------

let _ligatureWordSet: Set<string> | null = null;

function ligatureWordSet(): Set<string> {
  if (_ligatureWordSet) return _ligatureWordSet;
  try {
    const path = resolve(__dirname, 'ligature-words.txt');
    const lines = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    _ligatureWordSet = new Set(lines);
  } catch {
    // Fall back to empty set if the file is missing at runtime.
    _ligatureWordSet = new Set();
  }
  return _ligatureWordSet;
}

// Exposed for testing: reset the cached set.
export function _resetLigatureWordSetCache(): void {
  _ligatureWordSet = null;
}

// ---------------------------------------------------------------------------
// Offset-map helper
// ---------------------------------------------------------------------------

/**
 * Map a position in the repaired text back to the corresponding position in
 * the original text.
 *
 * @param repairedPos  Character index in the repaired string.
 * @param offsetMap    The map returned by repairText().
 * @returns            Approximate character index in the original string.
 */
export function mapOffset(repairedPos: number, offsetMap: OffsetMapEntry[]): number {
  if (offsetMap.length === 0) return repairedPos;
  // Find the last entry whose repairedOffset <= repairedPos.
  let entry: OffsetMapEntry | undefined;
  for (const e of offsetMap) {
    if (e.repairedOffset <= repairedPos) {
      entry = e;
    } else {
      break;
    }
  }
  // If no entry applies (all entries start after repairedPos), no repairs have
  // occurred before this position so the offset is unchanged.
  if (!entry) return repairedPos;
  // Map within the entry's span: original = entry.originalOffset + (repaired - entry.repairedOffset)
  return entry.originalOffset + (repairedPos - entry.repairedOffset);
}

// ---------------------------------------------------------------------------
// Step 1 — ligature rejoining
// ---------------------------------------------------------------------------

const LIGATURE_PATTERN = /\b(\w+)\s+(fi|fl|ff|ffi|ffl)\s+(\w+)\b/g;

function repairLigatures(
  text: string,
  offsetMap: OffsetMapEntry[],
  cumulativeDelta: number,
): { text: string; delta: number } {
  const wordList = ligatureWordSet();

  // Pre-count occurrences of each potential joined form in the ORIGINAL text
  // (before any edits in this pass) so the threshold check is stable.
  function countOccurrences(joined: string): number {
    const escaped = joined.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (text.match(new RegExp(escaped, 'gi')) ?? []).length;
  }

  // We need to rebuild the string piece-by-piece so we can track exact offsets.
  let result = '';
  let lastIndex = 0;
  let delta = cumulativeDelta;

  LIGATURE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LIGATURE_PATTERN.exec(text)) !== null) {
    const [full, pre, lig, post] = match;
    const matchStart = match.index;

    const joined = pre + lig + post;
    const joinedLower = joined.toLowerCase();

    const inWordList = wordList.has(joinedLower);
    const countInDoc = inWordList ? 0 : countOccurrences(joined); // skip count if already in list
    const shouldJoin = inWordList || countInDoc >= 2;

    if (!shouldJoin) continue;

    // Append everything up to this match.
    result += text.slice(lastIndex, matchStart);

    // Record the offset-map entry at the start of the joined word in the
    // repaired string. The match introduces two removed spaces: the gap
    // between pre and lig, and the gap between lig and post.
    const repairedOffset = result.length;
    const originalOffset = matchStart - (delta - cumulativeDelta); // undo any prior delta
    const removedChars = full.length - joined.length; // = 2 spaces removed

    delta -= removedChars;
    offsetMap.push({ repairedOffset, originalOffset, delta });

    result += joined;
    lastIndex = matchStart + full.length;

    // Advance past the joined result to avoid re-matching overlapping regions.
    LIGATURE_PATTERN.lastIndex = lastIndex;
  }

  result += text.slice(lastIndex);
  return { text: result, delta };
}

// ---------------------------------------------------------------------------
// Step 2 — hyphenated line-break rejoining
// ---------------------------------------------------------------------------

// Matches a word character followed by a hyphen, then a newline, then a
// lowercase letter.  Unicode property \p{Ll} requires the 'u' flag.
const HYPHEN_LINEBREAK_PATTERN = /(\w+-)(\n)(\p{Ll})/gu;

function repairHyphenLineBreaks(
  text: string,
  offsetMap: OffsetMapEntry[],
  cumulativeDelta: number,
): { text: string; delta: number } {
  let result = '';
  let lastIndex = 0;
  let delta = cumulativeDelta;

  HYPHEN_LINEBREAK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HYPHEN_LINEBREAK_PATTERN.exec(text)) !== null) {
    const [full, hyphenPart, , continuationChar] = match;
    const matchStart = match.index;

    // Append everything up to this match.
    result += text.slice(lastIndex, matchStart);

    // We remove the '\n' between the hyphen-word and the continuation char.
    const repairedOffset = result.length;
    const originalOffset = repairedOffset - (delta - cumulativeDelta);
    delta -= 1; // one newline removed
    offsetMap.push({ repairedOffset, originalOffset, delta });

    result += hyphenPart + continuationChar;
    lastIndex = matchStart + full.length;

    // Reset so the continuation char can be part of the next match's \w+ prefix.
    HYPHEN_LINEBREAK_PATTERN.lastIndex = lastIndex;
  }

  result += text.slice(lastIndex);
  return { text: result, delta };
}

// ---------------------------------------------------------------------------
// Step 3 — normalize repeated spaces
// ---------------------------------------------------------------------------

const MULTI_SPACE_PATTERN = / {2,}/g;

function repairMultipleSpaces(
  text: string,
  offsetMap: OffsetMapEntry[],
  cumulativeDelta: number,
  warnings: string[],
): { text: string; delta: number } {
  // Space normalization collapses runs of 2+ spaces to 1 space.
  // The offset delta becomes approximate because the number of removed chars
  // varies per occurrence and tracking every one would be expensive.
  // We add a single warning and append a single end-of-document sentinel
  // entry instead.
  let delta = cumulativeDelta;
  let removedTotal = 0;
  const repaired = text.replace(MULTI_SPACE_PATTERN, (spaces) => {
    removedTotal += spaces.length - 1;
    return ' ';
  });

  if (removedTotal > 0) {
    warnings.push('offset tracking approximate after space normalization');
    // Append a sentinel at the very end so callers know deltas shifted.
    offsetMap.push({
      repairedOffset: repaired.length,
      originalOffset: repaired.length - (delta - cumulativeDelta) + removedTotal,
      delta: delta - removedTotal,
    });
    delta -= removedTotal;
  }

  return { text: repaired, delta };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Apply three ordered repairs to PDF-extracted text:
 * 1. Rejoin ligature fragments ("ef fi cacy" → "efficacy")
 * 2. Rejoin hyphenated line-breaks ("meta-\nanalysis" → "meta-analysis")
 * 3. Normalize runs of spaces to a single space
 *
 * Returns the repaired text together with an offset map that lets callers
 * translate positions in the repaired text back to positions in the original.
 */
export function repairText(text: string): RepairResult {
  const offsetMap: OffsetMapEntry[] = [];
  const warnings: string[] = [];

  // Step 1: ligatures
  const step1 = repairLigatures(text, offsetMap, 0);

  // Step 2: hyphen line-breaks (operates on already-ligature-repaired text)
  const step2 = repairHyphenLineBreaks(step1.text, offsetMap, step1.delta);

  // Step 3: multiple spaces
  const step3 = repairMultipleSpaces(step2.text, offsetMap, step2.delta, warnings);

  return { text: step3.text, offsetMap, warnings };
}
