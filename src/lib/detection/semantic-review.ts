import type { Candidate } from './detector';
import type { Passage } from './segmentation';
import { denseCosine, lexicalTokens, sparseCosine, type Tfidf } from './tfidf';

interface Context {
  reference: string;
  offset: number;
  end: number;
  page?: number;
  vector: number[];
  text: string;
}

function buildContexts(
  passages: Passage[],
  vectors: number[][],
  documents: ReadonlyMap<string, string>,
  minimumWords: number,
): Context[] {
  const contexts: Context[] = [];
  const ordered = passages
    .map((passage, index) => ({ passage, vector: vectors[index] }))
    .sort(
      (a, b) =>
        a.passage.documentReference.localeCompare(b.passage.documentReference) ||
        a.passage.offset - b.passage.offset ||
        b.passage.length - a.passage.length,
    );
  for (const { passage, vector } of ordered) {
    const { documentReference: reference, offset, length, page } = passage;
    const end = offset + length;
    const last = contexts.at(-1);
    // The indexed two-sentence windows link their constituent sentences.
    // Across paragraph breaks these windows never overlap.
    if (last && last.reference === reference && last.page === page && offset < last.end) {
      last.end = Math.max(last.end, end);
      for (let i = 0; i < vector.length; i++) last.vector[i] += vector[i];
    } else {
      contexts.push({ reference, offset, end, page, vector: [...vector], text: '' });
    }
  }
  return contexts.filter((context) => {
    context.text = documents.get(context.reference)?.slice(context.offset, context.end) ?? '';
    const words = lexicalTokens(context.text).filter((word) => /\p{L}/u.test(word));
    return new Set(words).size >= minimumWords;
  });
}

/** Rank review evidence using context pooled from existing MiniLM windows on both sides. */
export function contextualReviewLeads(
  queries: Passage[],
  sources: Passage[],
  queryVectors: number[][],
  sourceVectors: number[][],
  documents: ReadonlyMap<string, string>,
  tfidf: Tfidf,
  minimumWords: number,
  limit: number,
  detections: Candidate[],
): Candidate[] {
  const queryContexts = buildContexts(queries, queryVectors, documents, minimumWords);
  const sourceContexts = buildContexts(sources, sourceVectors, documents, minimumWords);
  const bestByQuery = new Map<Context, { source: Context; score: number }>();
  const covered = (query: Context) =>
    detections.some(
      ({ suspiciousReference, suspiciousSpan }) =>
        suspiciousReference === query.reference &&
        suspiciousSpan.offset < query.end &&
        query.offset < suspiciousSpan.offset + suspiciousSpan.length,
    );
  const confirmedContexts = new Set(queryContexts.filter(covered));

  // Let each source context identify its best query before ranking source
  // alternatives. A broadly similar source can then only occupy one lead slot.
  for (const source of sourceContexts) {
    let bestQuery: Context | undefined;
    let score = 0;
    for (const query of queryContexts) {
      const similarity = denseCosine(query.vector, source.vector);
      if (similarity > score) {
        score = similarity;
        bestQuery = query;
      }
    }
    if (!bestQuery || confirmedContexts.has(bestQuery)) continue;
    if (score > (bestByQuery.get(bestQuery)?.score ?? 0))
      bestByQuery.set(bestQuery, { source, score });
  }

  return [...bestByQuery]
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, limit)
    .map(([query, { source, score }]) => ({
      suspiciousReference: query.reference,
      sourceReference: source.reference,
      suspiciousSpan: { offset: query.offset, length: query.end - query.offset },
      sourceSpan: { offset: source.offset, length: source.end - source.offset },
      suspiciousPage: query.page,
      sourcePage: source.page,
      lexical: sparseCosine(tfidf.transform(query.text), tfidf.transform(source.text)),
      semantic: score,
      score,
    }));
}
