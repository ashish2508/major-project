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
/** Preserve paragraph boundaries and split long paragraphs with the existing token-budgeted windows. */
export function segmentParagraphs(
  text: string,
  documentReference: string,
  options: SegmentOptions = {},
  paragraphBreaks: number[] = [],
): Passage[] {
  const breaks = new Set([0, text.length, ...paragraphBreaks]);
  for (const match of text.matchAll(/\r?\n\s*\r?\n/g)) breaks.add(match.index + match[0].length);
  const boundaries = [...breaks].sort((a, b) => a - b);
  return boundaries.slice(0, -1).flatMap((start, i) => {
    let content = text.slice(start, boundaries[i + 1]);
    // A short first line followed by prose is a heading, kept outside the evidence span.
    const heading = content.match(/^\s*([^\n]+)\r?\n(?=\S)/);
    if (
      heading &&
      heading[1].trim().split(/\s+/).length <= 10 &&
      !/[.!?]$/.test(heading[1].trim())
    ) {
      start += heading[0].length;
      content = content.slice(heading[0].length);
    }
    if (boundaries.length > 2 && content.trim().split(/\s+/).length <= 10 && !/[.!?]/.test(content))
      return [];
    const sentences = [...content.matchAll(/[\s\S]+?(?:[.!?]+(?=\s|$)|$)/g)];
    const windows = sentences.map((sentence, index) => {
      const end = sentences[Math.min(index + 1, sentences.length - 1)];
      const offset = sentence.index;
      return { offset, text: content.slice(offset, end.index + end[0].length) };
    });
    return windows.flatMap((window) =>
      segment(window.text, documentReference, options).map((passage) => {
        const offset = passage.offset + start + window.offset;
        return { ...passage, offset, id: `${documentReference}@${offset}:${passage.length}` };
      }),
    );
  });
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
