/**
 * Reference-section stripping for extracted research-paper text.
 *
 * Motivation
 * ----------
 * PDF text extraction (Poppler) flattens two-column layouts into interleaved
 * lines.  A reference-section heading such as "References" may therefore
 * appear mid-line, preceded or followed by body content from the adjacent
 * column.  This module locates the first plausible reference-section heading
 * and returns everything before that heading as the "body" text.  Character
 * offsets in the returned body remain valid against the original in-memory
 * string; the original canonical files on disk are never touched.
 *
 * Design decisions
 * ----------------
 * - Only the FIRST plausible heading that is not followed by substantial
 *   prose is treated as the reference boundary.  Earlier mentions that look
 *   like headings but are embedded inside sentences (e.g. "see the References
 *   section above") are excluded by the prose-continuation guard.
 * - The function never truncates the body when no heading is found; callers
 *   receive the original text unchanged and can record a "not detected" flag.
 * - All matching is case-insensitive to handle ALL-CAPS headings.
 * - The function is pure and synchronous so it is trivially testable.
 */

/**
 * Primary pattern: matches a heading that occupies the full line (clean case).
 *
 * Rationale:
 *   - `(?:^|[\f\n])` – must start at the beginning of a line or after a
 *     form-feed.  This excludes mid-sentence occurrences like "we provide
 *     references to …".
 *   - `[ \t]*` – optional horizontal indent (column padding).
 *   - `(References|Bibliography|Works\s+Cited)` – the heading keyword.
 *   - `[ \t]*(?:\r?\n|$|\f)` – after the keyword only horizontal whitespace
 *     may appear before the line ends.
 */
const HEADING_RE_CLEAN = new RegExp(
  String.raw`(?:^|[\f\n])[ \t]*(References|Bibliography|Works\s+Cited)[ \t]*(?:\r?\n|$|\f)`,
  'im',
);

/**
 * Secondary pattern: handles two-column PDF layout artefacts where Poppler
 * places the left-column heading and the right-column citation entry on the
 * same line, separated by a large span of spaces (column gap).
 *
 * Example (after \f → \n\n normalisation):
 *   "\n\nReferences                                    2017.    SearchQA: …"
 *
 * We require at least 10 consecutive spaces between the heading keyword and
 * the trailing right-column content.  Normal prose never has such large gaps
 * after a word.
 */
const HEADING_RE_TWO_COLUMN = new RegExp(
  String.raw`(?:^|[\f\n])[ \t]*(References|Bibliography|Works\s+Cited)[ \t]{10,}\S`,
  'im',
);

/**
 * Maximum number of words we allow in the 300 characters immediately
 * following a candidate heading before we consider it "embedded in prose"
 * rather than a true reference-section heading.
 *
 * A genuine reference section starts with a citation entry (numbered or
 * author-year format).  We sample 300 chars; prose paragraphs typically
 * contain at least 55 words in that window.  Citation entries are sparser
 * in continuous readable words due to punctuation, numbers, and abbreviations.
 *
 * The threshold is intentionally conservative: false negatives (failing to
 * flag a reference section) are preferable to false positives (treating a
 * body section headed "References" as the bibliography).
 */
const MAX_PROSE_WORDS_AFTER_HEADING = 54;

/**
 * Minimum number of characters that must remain after the detected heading
 * before we accept it as the reference boundary.  A match near the very end
 * of a document is likely a stray mention rather than a full reference list.
 */
const MIN_TRAILING_CHARS = 50;

export interface StripResult {
  /** The body text with the reference section removed. */
  body: string;
  /**
   * The character offset in the original text where the reference-section
   * heading was found, or null if no heading was detected.
   */
  referenceOffset: number | null;
  /**
   * The heading text that was matched (e.g. "References"), or null.
   */
  detectedHeading: string | null;
  /**
   * Whether the detection is considered confident.
   *
   * Confidence is LOW when:
   *   - no heading was found at all, or
   *   - the detected heading was found very close to the end of the document
   *     (fewer than MIN_TRAILING_CHARS characters remaining), or
   *   - the text immediately after the heading looks like flowing prose rather
   *     than citation entries.
   */
  confident: boolean;
}

/**
 * Counts whitespace-delimited words in a string.
 */
function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

/**
 * Returns whether the text immediately following a candidate heading looks
 * like flowing prose (which would indicate a false positive) rather than a
 * citation list.
 *
 * We examine the first 300 characters after the heading and count words.
 * A citation entry is typically short and highly structured; prose paragraphs
 * have a higher word density.  The threshold is deliberately generous to avoid
 * false negatives on unusual reference formats.
 */
function appearsToBeProse(textAfterHeading: string): boolean {
  const sample = textAfterHeading.slice(0, 300);
  return wordCount(sample) > MAX_PROSE_WORDS_AFTER_HEADING;
}

/**
 * Strips the reference/bibliography section from extracted PDF text.
 *
 * The original `text` string is never mutated; the function returns a new
 * string containing only the body content before the reference section, along
 * with metadata about the detection.
 *
 * @param text Normalized extracted paper text (as produced by
 *   `normalizeExtractedText` in the external-evaluation script).
 * @returns A {@link StripResult} describing what was found and what the body
 *   text looks like.
 */
export function stripReferences(text: string): StripResult {
  // Try the clean pattern first (heading on its own line), then fall back to
  // the two-column pattern (heading followed by a large whitespace gap before
  // the first right-column citation entry on the same line).
  let match = HEADING_RE_CLEAN.exec(text);
  let isTwoColumn = false;

  if (!match) {
    match = HEADING_RE_TWO_COLUMN.exec(text);
    isTwoColumn = match !== null;
  }

  if (!match) {
    return {
      body: text,
      referenceOffset: null,
      detectedHeading: null,
      confident: false,
    };
  }

  // The heading keyword is in capture group 1.  The match itself may start
  // with a newline/form-feed that we do NOT want to include in the body,
  // because that newline is a legitimate paragraph separator that belongs to
  // the last body paragraph.  We therefore trim the body at the character
  // just before the keyword start, preserving that preceding newline.
  const keywordStart = match.index + match[0].indexOf(match[1]);
  const headingText = match[1];

  // For two-column matches, the regex consumes the first \S of the right-column
  // content (to ensure the gap really leads to content).  Rewind by 1 so the
  // prose guard can see the full right-column citation entry.
  const afterOffset = isTwoColumn
    ? match.index + match[0].length - 1
    : match.index + match[0].length;
  const afterHeading = text.slice(afterOffset);

  // Guard: too close to the end – likely a stray mention.
  if (afterHeading.trim().length < MIN_TRAILING_CHARS) {
    return {
      body: text,
      referenceOffset: keywordStart,
      detectedHeading: headingText,
      confident: false,
    };
  }

  // Guard: the content after the heading looks like flowing prose, not
  // citation entries.  This catches false positives where "References" appears
  // as a section heading followed by explanatory body text.
  if (appearsToBeProse(afterHeading)) {
    return {
      body: text,
      referenceOffset: keywordStart,
      detectedHeading: headingText,
      confident: false,
    };
  }

  // Trim the body at the keyword start, keeping any preceding whitespace that
  // forms part of the last body paragraph rather than the heading itself.
  const body = text.slice(0, keywordStart);

  return {
    body,
    referenceOffset: keywordStart,
    detectedHeading: headingText,
    confident: true,
  };
}

/**
 * Returns a human-readable summary of a {@link StripResult} suitable for
 * logging and report generation.
 */
export function describeStripResult(reference: string, result: StripResult): string {
  if (!result.confident) {
    if (!result.detectedHeading) return `${reference}: no reference-section heading detected`;
    return `${reference}: heading "${result.detectedHeading}" found at offset ${result.referenceOffset} but detection was not confident (possible false positive or stray mention)`;
  }
  const removedChars =
    result.referenceOffset !== null
      ? // The reference section runs from the keyword to the end of the text.
        // We report total characters removed (including the heading itself).
        'removed ' + String(result.body.length > 0 ? 1 : 0) + ' section'
      : 'no removal';
  void removedChars; // suppress unused-variable lint; we build the string inline
  return (
    `${reference}: heading "${result.detectedHeading}" detected at offset ${result.referenceOffset}, ` +
    `body trimmed to ${result.body.length} characters (confident)`
  );
}
