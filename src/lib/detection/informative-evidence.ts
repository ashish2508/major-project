import type { Detection } from './detector';
import { lexicalTokens } from './tfidf';

/** Require enough distinct words on both sides of a completed evidence span. */
export function filterInformativeEvidence(
  detections: Detection[],
  documents: ReadonlyMap<string, string>,
  minimumWords: number,
): Detection[] {
  if (!Number.isSafeInteger(minimumWords) || minimumWords < 0)
    throw new Error('Invalid minimum evidence size');
  if (minimumWords === 0) return detections;

  const countWords = (reference: string, { offset, length }: Detection['sourceSpan']) => {
    const text = documents.get(reference);
    if (
      text === undefined ||
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length <= 0 ||
      offset + length > text.length
    )
      throw new Error('Evidence span is outside its document');
    const tokens = lexicalTokens(text.slice(offset, offset + length));
    return new Set(tokens.filter((token) => /\p{L}/u.test(token))).size;
  };

  /**
   * Check if a passage consists primarily of meaningless tokens (numbers-only fragments,
   * single isolated boilerplate words, isolated citation markers). Very short passages
   * with only such tokens are almost certainly not plagiarism evidence.
   *
   * Example of filtered-out spans:
   * - "134. 135. 136." (only section numbers)
   * - "et al." (citation abbreviation alone)
   * - "[17, 18]" (only reference markers)
   * - "IV." (Roman numeral)
   * - "4.2" (section number)
   *
   * A short passage like "replicate lag" or "query parser" should pass because
   * it contains substantive words.
   */
  const isMeaninglessBoilerplate = (text: string): boolean => {
    const tokens = lexicalTokens(text);
    if (tokens.length === 0) return true;

    // Count meaningful letter-containing tokens
    let meaningfulTokens = 0;
    let allLetterTokens = 0;

    for (const token of tokens) {
      if (/\p{L}/u.test(token)) {
        allLetterTokens++;
        // Single-letter words (section markers like "V.", "X.") don't count as meaningful
        if (token.length > 1) {
          meaningfulTokens++;
        }
      }
    }

    // If it's just numbers and single letters, it's boilerplate
    if (meaningfulTokens === 0) return true;

    // If it's very short (1-2 tokens) and they're mostly single-letter markers or isolated abbreviations
    if (tokens.length <= 2 && meaningfulTokens <= 1) {
      return true;
    }

    return false;
  };

  return detections.filter((detection) => {
    const suspiciousText =
      documents
        .get(detection.suspiciousReference)
        ?.slice(
          detection.suspiciousSpan.offset,
          detection.suspiciousSpan.offset + detection.suspiciousSpan.length,
        ) ?? '';
    const sourceText =
      documents
        .get(detection.sourceReference)
        ?.slice(
          detection.sourceSpan.offset,
          detection.sourceSpan.offset + detection.sourceSpan.length,
        ) ?? '';

    // Must meet minimum distinct word requirement
    if (
      countWords(detection.suspiciousReference, detection.suspiciousSpan) < minimumWords ||
      countWords(detection.sourceReference, detection.sourceSpan) < minimumWords
    ) {
      return false;
    }

    // Both passages must not be pure boilerplate (e.g., just numbers and single letters)
    return !isMeaninglessBoilerplate(suspiciousText) && !isMeaninglessBoilerplate(sourceText);
  });
}
