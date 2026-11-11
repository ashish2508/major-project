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

  return detections.filter(
    (detection) =>
      countWords(detection.suspiciousReference, detection.suspiciousSpan) >= minimumWords &&
      countWords(detection.sourceReference, detection.sourceSpan) >= minimumWords,
  );
}
