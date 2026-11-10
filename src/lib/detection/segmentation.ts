export interface Passage {
  id: string;
  documentReference: string;
  offset: number;
  length: number;
  text: string;
}
export interface SegmentOptions {
  words?: number;
  overlap?: number;
  maxTokens?: number;
  countTokens?: (s: string) => number;
}
/** Sentence/paragraph-aware overlapping word windows. Offsets always refer to the untouched JS string. */
export function segment(
  text: string,
  documentReference: string,
  options: SegmentOptions = {},
): Passage[] {
  const { words = 80, overlap = 20, maxTokens = 256, countTokens } = options;
  if (
    !Number.isInteger(words) ||
    words < 2 ||
    !Number.isInteger(overlap) ||
    overlap < 0 ||
    overlap >= words
  )
    throw new Error('Invalid segmentation window');
  const tokens = [...text.matchAll(/\S+/gu)];
  const out: Passage[] = [];
  for (let start = 0; start < tokens.length;) {
    let end = Math.min(start + words, tokens.length);
    if (end < tokens.length)
      for (let i = end; i > start + Math.floor(words / 2); i--) {
        const word = tokens[i - 1][0],
          gap = text.slice(tokens[i - 1].index! + word.length, tokens[i].index);
        if (/[.!?]["')\]]?$/.test(word) || /\n\s*\n/.test(gap)) {
          end = i;
          break;
        }
      }
    const extract = (stop: number) =>
      text.slice(tokens[start].index!, tokens[stop - 1].index! + tokens[stop - 1][0].length);
    if (countTokens && countTokens(extract(end)) > maxTokens) {
      let lo = start + 1,
        hi = end;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (countTokens(extract(mid)) <= maxTokens) lo = mid;
        else hi = mid - 1;
      }
      end = lo;
      if (countTokens(extract(end)) > maxTokens)
        throw new Error(
          'A single whitespace token exceeds the model budget; split this input before analysis',
        );
    }
    const offset = tokens[start].index!,
      content = extract(end);
    out.push({
      id: `${documentReference}@${offset}:${content.length}`,
      documentReference,
      offset,
      length: content.length,
      text: content,
    });
    if (end === tokens.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return out;
}
