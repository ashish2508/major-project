import type { PassagePair } from '../evaluation/pan';
import type { Passage } from './segmentation';
import { Tfidf } from './tfidf';
export type Method = 'lexical' | 'semantic' | 'hybrid';
export interface DetectionConfig {
  method: Method;
  threshold: number;
  alpha: number;
  mergeGap: number;
}

/** Fuse separately ranked lexical and semantic evidence at their own operating points. */
export function fuseEvidence(
  lexical: Candidate[],
  semantic: Candidate[],
  lexicalThreshold: number,
  semanticThreshold: number,
  mergeGap: number,
): Detection[] {
  return detect(
    [
      ...lexical.filter((candidate) => candidate.score >= lexicalThreshold),
      ...semantic.filter((candidate) => candidate.score >= semanticThreshold),
    ],
    0,
    mergeGap,
  );
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
  semanticAlternatives = 0,
): Record<string, Candidate[]> {
  if (!sources.length) throw new Error('At least one source passage is required');
  if (!Number.isSafeInteger(semanticAlternatives) || semanticAlternatives < 0)
    throw new Error('Invalid semantic shortlist size');
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
  if (semanticAlternatives && queryEmbeddings) output.semanticAlternatives = [];
  const embeddingNorms = (vectors: number[][]) =>
    vectors.map((vector) => {
      if (vector.length !== 384) throw new Error('Expected a normalized 384-dimensional embedding');
      const norm = Math.hypot(...vector);
      if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.001)
        throw new Error('Expected a normalized 384-dimensional embedding');
      return norm;
    });
  const queryNorms = queryEmbeddings && embeddingNorms(queryEmbeddings);
  const sourceNorms = sourceEmbeddings && embeddingNorms(sourceEmbeddings);
  const postings = new Map<string, { index: number; weight: number }[]>();
  for (const [index, source] of sources.entries()) {
    for (const [term, weight] of tfidf.transform(source.text)) {
      const posting = postings.get(term);
      if (posting) posting.push({ index, weight });
      else postings.set(term, [{ index, weight }]);
    }
  }
  const lexicalScores = new Float64Array(sources.length);
  const semanticScores = new Float64Array(sources.length);
  for (let qi = 0; qi < queries.length; qi++) {
    const query = queries[qi],
      qv = tfidf.transform(query.text),
      bestScores = keys.map(() => -Infinity),
      bestIndices = keys.map(() => 0);
    lexicalScores.fill(0);
    for (const [term, weight] of qv) {
      const posting = postings.get(term);
      if (!posting) continue;
      for (const entry of posting) lexicalScores[entry.index] += weight * entry.weight;
    }
    for (let si = 0; si < sources.length; si++) {
      const lexical = Math.min(1, lexicalScores[si]);
      let semantic = 0;
      if (queryEmbeddings) {
        const a = queryEmbeddings[qi],
          b = sourceEmbeddings![si];
        for (let k = 0; k < 384; k++) semantic += a[k] * b[k];
        semantic = Math.min(1, Math.max(-1, semantic / (queryNorms![qi] * sourceNorms![si])));
      }
      lexicalScores[si] = lexical;
      semanticScores[si] = semantic;
      for (let index = 0; index < keys.length; index++) {
        const alpha = alphas[index - 2];
        const score =
          index === 0 ? lexical : index === 1 ? semantic : alpha * lexical + (1 - alpha) * semantic;
        if (
          score > bestScores[index] ||
          (index === 1 &&
            score === bestScores[index] &&
            lexical > lexicalScores[bestIndices[index]])
        ) {
          bestScores[index] = score;
          bestIndices[index] = si;
        }
      }
    }
    for (const [index, key] of keys.entries()) {
      const sourceIndex = bestIndices[index];
      const source = sources[sourceIndex];
      output[key].push({
        suspiciousReference: query.documentReference,
        sourceReference: source.documentReference,
        suspiciousSpan: { offset: query.offset, length: query.length },
        sourceSpan: { offset: source.offset, length: source.length },
        lexical: lexicalScores[sourceIndex],
        semantic: semanticScores[sourceIndex],
        score: bestScores[index],
      });
    }
    if (output.semanticAlternatives) {
      const ranked = sources
        .map((_, index) => index)
        .sort(
          (a, b) => semanticScores[b] - semanticScores[a] || lexicalScores[b] - lexicalScores[a],
        );
      for (const index of ranked.slice(0, semanticAlternatives)) {
        const source = sources[index];
        output.semanticAlternatives.push({
          suspiciousReference: query.documentReference,
          sourceReference: source.documentReference,
          suspiciousSpan: { offset: query.offset, length: query.length },
          sourceSpan: { offset: source.offset, length: source.length },
          lexical: lexicalScores[index],
          semantic: semanticScores[index],
          score: semanticScores[index],
        });
      }
    }
  }
  return output;
}
const spanGap = (a: { offset: number; length: number }, b: { offset: number; length: number }) =>
  Math.max(a.offset, b.offset) - Math.min(a.offset + a.length, b.offset + b.length);
function consistentAlignment(a: Candidate, b: Candidate): boolean {
  const queryOrder = a.suspiciousSpan.offset - b.suspiciousSpan.offset;
  const sourceOrder = a.sourceSpan.offset - b.sourceSpan.offset;
  return (
    queryOrder * sourceOrder >= 0 &&
    spanGap(a.suspiciousSpan, b.suspiciousSpan) < 0 === spanGap(a.sourceSpan, b.sourceSpan) < 0
  );
}
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
  requireConsistentAlignment = false,
): Detection[] {
  if (
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1 ||
    !Number.isFinite(mergeGap) ||
    mergeGap < 0
  )
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
  const members = new Map<Detection, Candidate[]>();
  for (const c of accepted) {
    const indices = merged.flatMap((d, i) =>
      d.suspiciousReference === c.suspiciousReference &&
      d.sourceReference === c.sourceReference &&
      spanGap(d.suspiciousSpan, c.suspiciousSpan) <= mergeGap &&
      spanGap(d.sourceSpan, c.sourceSpan) <= mergeGap &&
      (!requireConsistentAlignment ||
        members.get(d)!.every((window) => consistentAlignment(window, c)))
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
      if (requireConsistentAlignment) members.set(merged.at(-1)!, [c]);
      continue;
    }
    let next: Detection = {
      ...c,
      suspiciousSpan: { ...c.suspiciousSpan },
      sourceSpan: { ...c.sourceSpan },
      evidenceWindows: 1,
    };
    const windows = [c];
    for (const i of indices.reverse()) {
      const group = members.get(merged[i]);
      if (group && !group.every((a) => windows.every((b) => consistentAlignment(a, b)))) continue;
      const d = merged.splice(i, 1)[0];
      if (group) {
        windows.push(...group);
        members.delete(d);
      }
      const strongest = d.score > next.score ? d : next;
      next = {
        ...strongest,
        suspiciousSpan: spanUnion(d.suspiciousSpan, next.suspiciousSpan),
        sourceSpan: spanUnion(d.sourceSpan, next.sourceSpan),
        evidenceWindows: d.evidenceWindows + next.evidenceWindows,
      };
    }
    merged.push(next);
    if (requireConsistentAlignment) members.set(next, windows);
  }
  return merged.sort(
    (a, b) =>
      a.suspiciousReference.localeCompare(b.suspiciousReference) ||
      a.suspiciousSpan.offset - b.suspiciousSpan.offset,
  );
}

export function selectSemanticReviewLead(
  candidates: Candidate[],
  threshold: number,
): Candidate | null {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error('Invalid detection parameters');
  const lead = [...candidates].sort((a, b) => b.semantic - a.semantic || b.score - a.score)[0];
  return lead && lead.semantic < threshold ? lead : null;
}
