import type { Passage } from './segmentation';
import { Tfidf, sparseCosine } from './tfidf';
import type { PassagePair } from '../evaluation/pan';
export type Method = 'lexical' | 'semantic' | 'hybrid';
export interface DetectionConfig {
  method: Method;
  threshold: number;
  alpha: number;
  mergeGap: number;
}
export interface Candidate extends PassagePair {
  lexical: number;
  semantic: number;
  score: number;
}
export interface Detection extends Candidate {
  evidenceWindows: number;
}
export const ALPHAS = [0, 0.25, 0.5, 0.75, 1] as const;
export const THRESHOLDS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] as const;
export const MERGE_GAP = 120;
export function scoreKey(method: Method, alpha = 0.5): string {
  return method === 'hybrid' ? `hybrid:${alpha}` : method;
}
/** Each method retrieves over the entire supplied candidate collection. No annotation-known pairs or lexical prefilter. */
export function retrieveCandidates(
  queries: Passage[],
  sources: Passage[],
  tfidf: Tfidf,
  queryEmbeddings?: number[][],
  sourceEmbeddings?: number[][],
  alphas: readonly number[] = ALPHAS,
): Record<string, Candidate[]> {
  if (!sources.length) throw new Error('At least one source passage is required');
  if (Boolean(queryEmbeddings) !== Boolean(sourceEmbeddings))
    throw new Error('Both embedding arrays are required');
  if (
    queryEmbeddings &&
    (queryEmbeddings.length !== queries.length || sourceEmbeddings!.length !== sources.length)
  )
    throw new Error('Embedding/passages mismatch');
  const keys = queryEmbeddings
    ? ['lexical', 'semantic', ...alphas.map((a) => scoreKey('hybrid', a))]
    : ['lexical'];
  const output = Object.fromEntries(keys.map((k) => [k, [] as Candidate[]]));
  const sourceVectors = sources.map((p) => tfidf.transform(p.text));
  for (let qi = 0; qi < queries.length; qi++) {
    const query = queries[qi],
      qv = tfidf.transform(query.text),
      best = new Map<string, { index: number; lexical: number; semantic: number; score: number }>();
    for (let si = 0; si < sources.length; si++) {
      const lexical = sparseCosine(qv, sourceVectors[si]);
      let semantic = 0;
      if (queryEmbeddings) {
        const a = queryEmbeddings[qi],
          b = sourceEmbeddings![si];
        if (a.length !== 384 || b.length !== 384) throw new Error('Invalid embedding dimension');
        for (let k = 0; k < 384; k++) semantic += a[k] * b[k];
        semantic = Math.min(1, Math.max(-1, semantic));
      }
      const scores: Record<string, number> = { lexical };
      if (queryEmbeddings) {
        scores.semantic = semantic;
        for (const alpha of alphas)
          scores[scoreKey('hybrid', alpha)] = alpha * lexical + (1 - alpha) * semantic;
      }
      for (const key of keys)
        if (!best.has(key) || scores[key] > best.get(key)!.score)
          best.set(key, { index: si, lexical, semantic, score: scores[key] });
    }
    for (const key of keys) {
      const b = best.get(key)!,
        source = sources[b.index];
      output[key].push({
        suspiciousReference: query.documentReference,
        sourceReference: source.documentReference,
        suspiciousSpan: { offset: query.offset, length: query.length },
        sourceSpan: { offset: source.offset, length: source.length },
        lexical: b.lexical,
        semantic: b.semantic,
        score: b.score,
      });
    }
  }
  return output;
}
const spanGap = (a: { offset: number; length: number }, b: { offset: number; length: number }) =>
  Math.max(a.offset, b.offset) - Math.min(a.offset + a.length, b.offset + b.length);
const spanUnion = (
  a: { offset: number; length: number },
  b: { offset: number; length: number },
) => {
  const offset = Math.min(a.offset, b.offset);
  return { offset, length: Math.max(a.offset + a.length, b.offset + b.length) - offset };
};
export function detect(
  candidates: Candidate[],
  threshold: number,
  mergeGap = MERGE_GAP,
): Detection[] {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1 || mergeGap < 0)
    throw new Error('Invalid detection parameters');
  const accepted = candidates
    .filter((c) => c.score >= threshold)
    .sort(
      (a, b) =>
        a.suspiciousReference.localeCompare(b.suspiciousReference) ||
        a.sourceReference.localeCompare(b.sourceReference) ||
        a.suspiciousSpan.offset - b.suspiciousSpan.offset,
    );
  const merged: Detection[] = [];
  for (const c of accepted) {
    const indices = merged.flatMap((d, i) =>
      d.suspiciousReference === c.suspiciousReference &&
      d.sourceReference === c.sourceReference &&
      spanGap(d.suspiciousSpan, c.suspiciousSpan) <= mergeGap &&
      spanGap(d.sourceSpan, c.sourceSpan) <= mergeGap
        ? [i]
        : [],
    );
    if (!indices.length) {
      merged.push({
        ...c,
        suspiciousSpan: { ...c.suspiciousSpan },
        sourceSpan: { ...c.sourceSpan },
        evidenceWindows: 1,
      });
      continue;
    }
    let next: Detection = {
      ...c,
      suspiciousSpan: { ...c.suspiciousSpan },
      sourceSpan: { ...c.sourceSpan },
      evidenceWindows: 1,
    };
    for (const i of indices.reverse()) {
      const d = merged.splice(i, 1)[0];
      const strongest = d.score > next.score ? d : next;
      next = {
        ...strongest,
        suspiciousSpan: spanUnion(d.suspiciousSpan, next.suspiciousSpan),
        sourceSpan: spanUnion(d.sourceSpan, next.sourceSpan),
        evidenceWindows: d.evidenceWindows + next.evidenceWindows,
      };
    }
    merged.push(next);
  }
  return merged.sort(
    (a, b) =>
      a.suspiciousReference.localeCompare(b.suspiciousReference) ||
      a.suspiciousSpan.offset - b.suspiciousSpan.offset,
  );
}
