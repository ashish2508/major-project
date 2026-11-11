/**
 * Pure, model-free helpers for the research-paper validation experiment.
 *
 * These utilities build controlled suspicious documents with exact character
 * offsets and locate genuine source passages with whitespace-tolerant anchor
 * matching. They deliberately do not import the detector, embeddings, or any
 * production pipeline so they can be unit-tested cheaply.
 */

export interface TextSpan {
  offset: number;
  length: number;
}

/** Escape a literal word for RegExp and join phrase words with `\s+`. */
export function phrasePattern(phrase: string): string {
  return phrase
    .split(' ')
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
}

/** Index of a phrase in `body`, tolerating any whitespace (including PDF line breaks). */
export function findPhrase(body: string, phrase: string, fromIndex = 0): number {
  const match = new RegExp(phrasePattern(phrase)).exec(body.slice(fromIndex));
  return match ? fromIndex + match.index : -1;
}

/**
 * Locate a genuine source passage between a start anchor and an end anchor.
 * Returns the span from the start of `startAnchor` through the end of
 * `endAnchor` (first end-anchor occurrence at or after the start match).
 */
export function locateSpan(body: string, startAnchor: string, endAnchor: string): TextSpan {
  const start = findPhrase(body, startAnchor);
  if (start < 0) throw new Error(`Start anchor not found: ${startAnchor}`);
  const endPattern = new RegExp(phrasePattern(endAnchor));
  const after = body.slice(start);
  const endMatch = endPattern.exec(after);
  if (!endMatch) throw new Error(`End anchor not found after start: ${endAnchor}`);
  return { offset: start, length: endMatch.index + endMatch[0].length };
}

export interface DocumentPart {
  /** Identifier for this part (case id or 'filler'). */
  id: string;
  text: string;
}

export interface BuiltDocument {
  text: string;
  /** Offsets of each part in insertion order. */
  spans: { id: string; span: TextSpan }[];
}

/** Join parts with blank lines while recording the exact span of each part. */
export function buildDocument(parts: DocumentPart[]): BuiltDocument {
  let text = '';
  const spans: BuiltDocument['spans'] = [];
  parts.forEach((part, index) => {
    if (text.length > 0) text += '\n\n';
    const offset = text.length;
    text += part.text;
    spans.push({ id: part.id, span: { offset, length: part.text.length } });
    // Verify round-trip integrity by position: each recorded span must slice
    // back its own part (parts may legitimately share ids, e.g. fillers).
    const roundTrip = text.slice(offset, offset + part.text.length);
    if (roundTrip !== parts[index].text)
      throw new Error(`Span round-trip failed for part ${index} (${part.id})`);
  });
  return { text, spans };
}
