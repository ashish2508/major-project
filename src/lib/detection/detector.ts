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
  suspiciousPage?: number;
  sourcePage?: number;
}
export interface Detection extends Candidate {
  evidenceWindows: number;
  /** Candidates for the same query span that scored below the top-1 after mutual-best-match filtering. */
  otherCandidates?: Candidate[];
}
export const ALPHAS = [0, 0.25, 0.5, 0.75, 1] as const;
export const THRESHOLDS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] as const;
export const MERGE_GAP = 120;
export function scoreKey(method: Method, alpha = 0.5): string {
  return method === 'hybrid' ? `hybrid:${alpha}` : method;
}
/**
 * Retrieve candidates for plagiarism detection across multiple scoring methods.
 *
 * For hybrid detection, returns a merged candidate set that includes:
 * - Top lexical candidates per query (up to 50)
 * - Top semantic candidates per query (up to 50)
 * - The union of source IDs from both
 * All candidates are scored with all available methods (lexical, semantic, hybrid alphas).
 *
 * For lexical-only, returns top-K matches per query (default 10 for research mode;
 * pass topKLexical=1 for the legacy single-best behaviour used by PAN benchmarks).
 */
export function retrieveCandidates(
  queries: Passage[],
  sources: Passage[],
  tfidf: Tfidf,
  queryEmbeddings?: number[][],
  sourceEmbeddings?: number[][],
  alphas: readonly number[] = ALPHAS,
  semanticAlternatives = 0,
  indexedSourceVectors?: ReadonlyMap<string, ReadonlyMap<string, number>>,
  topKLexical = 10,
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

  const isHybridMethod = queryEmbeddings; // If embeddings provided, we're doing semantic/hybrid
  const keys = isHybridMethod
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
    const vector = indexedSourceVectors?.get(source.id) ?? tfidf.transform(source.text);
    for (const [term, weight] of vector) {
      const posting = postings.get(term);
      if (posting) posting.push({ index, weight });
      else postings.set(term, [{ index, weight }]);
    }
  }

  const lexicalScores = new Float64Array(sources.length);
  const semanticScores = new Float64Array(sources.length);

  for (let qi = 0; qi < queries.length; qi++) {
    const query = queries[qi];
    const qv = tfidf.transform(query.text);

    // Compute all scores for this query against all sources
    lexicalScores.fill(0);
    for (const [term, weight] of qv) {
      const posting = postings.get(term);
      if (!posting) continue;
      for (const entry of posting) lexicalScores[entry.index] += weight * entry.weight;
    }

    semanticScores.fill(0);
    if (queryEmbeddings) {
      const a = queryEmbeddings[qi];
      for (let si = 0; si < sources.length; si++) {
        const b = sourceEmbeddings![si];
        let semantic = 0;
        for (let k = 0; k < 384; k++) semantic += a[k] * b[k];
        semanticScores[si] = Math.min(
          1,
          Math.max(-1, semantic / (queryNorms![qi] * sourceNorms![si])),
        );
      }
    }

    // Normalize lexical scores to [0, 1]
    for (let si = 0; si < sources.length; si++) {
      lexicalScores[si] = Math.min(1, lexicalScores[si]);
    }

    // For lexical-only retrieval, return top-K candidates (default 10).
    // Pass topKLexical=1 for the legacy single-best behaviour (PAN benchmark path).
    if (!isHybridMethod) {
      // Build an index array sorted by lexical score descending
      const ranked = Array.from({ length: sources.length }, (_, si) => si).sort(
        (a, b) => lexicalScores[b] - lexicalScores[a],
      );
      const limit = Math.min(topKLexical, sources.length);
      for (let rank = 0; rank < limit; rank++) {
        const si = ranked[rank];
        const source = sources[si];
        output.lexical.push({
          suspiciousReference: query.documentReference,
          sourceReference: source.documentReference,
          suspiciousSpan: { offset: query.offset, length: query.length },
          sourceSpan: { offset: source.offset, length: source.length },
          suspiciousPage: query.page,
          sourcePage: source.page,
          lexical: lexicalScores[si],
          semantic: semanticScores[si],
          score: lexicalScores[si],
        });
      }
      continue;
    }

    // For hybrid/semantic retrieval: merge top lexical and semantic candidates
    const topK = 50;

    // Get indices sorted by lexical score (descending)
    const lexicalRanked = sources
      .map((_, si) => si)
      .sort((a, b) => lexicalScores[b] - lexicalScores[a])
      .slice(0, topK);

    // Get indices sorted by semantic score (descending)
    const semanticRanked = sources
      .map((_, si) => si)
      .sort((a, b) => semanticScores[b] - semanticScores[a])
      .slice(0, topK);

    // Merge source indices to get union
    const candidateIndices = Array.from(new Set([...lexicalRanked, ...semanticRanked]));

    // Score all candidates with all methods and store them
    for (const si of candidateIndices) {
      const source = sources[si];

      // Calculate hybrid scores for all alphas
      for (let index = 0; index < keys.length; index++) {
        const alpha = alphas[index - 2];
        const score =
          index === 0
            ? lexicalScores[si]
            : index === 1
              ? semanticScores[si]
              : alpha * lexicalScores[si] + (1 - alpha) * semanticScores[si];

        output[keys[index]].push({
          suspiciousReference: query.documentReference,
          sourceReference: source.documentReference,
          suspiciousSpan: { offset: query.offset, length: query.length },
          sourceSpan: { offset: source.offset, length: source.length },
          suspiciousPage: query.page,
          sourcePage: source.page,
          lexical: lexicalScores[si],
          semantic: semanticScores[si],
          score,
        });
      }
    }

    // Generate semantic alternatives from top semantic candidates
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
          suspiciousPage: query.page,
          sourcePage: source.page,
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

/**
 * Mutual-best-match filter: keeps a candidate (q, s) only when s is among the
 * top-K source passages for q AND q is among the top-K query passages for s.
 *
 * This removes the "one query passage matches many unrelated source passages"
 * false-positive pattern while preserving strong mutual matches.
 *
 * @param candidates  Flat list of scored candidates (any method).
 * @param K           How many top counterparts each side may keep (default 1).
 * @returns           `{ kept, removed }` where `removed` is the count of dropped candidates.
 */
export function mutualBestMatchFilter(
  candidates: Candidate[],
  K = 1,
): { kept: Candidate[]; removed: number } {
  if (!Number.isInteger(K) || K < 1) throw new Error('K must be a positive integer');

  // For each query passage: rank source passages by score descending, keep top-K source ids.
  // Key = suspiciousReference + '|' + JSON(suspiciousSpan)
  const topSourcesForQuery = new Map<string, Set<string>>();
  // For each source passage: rank query passages by score descending, keep top-K query ids.
  const topQueriesForSource = new Map<string, Set<string>>();

  const qKey = (c: Candidate) =>
    `${c.suspiciousReference}\0${c.suspiciousSpan.offset}\0${c.suspiciousSpan.length}`;
  const sKey = (c: Candidate) =>
    `${c.sourceReference}\0${c.sourceSpan.offset}\0${c.sourceSpan.length}`;

  // Group by query passage key, then pick top-K source keys
  const byQuery = new Map<string, Candidate[]>();
  const bySource = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const qk = qKey(c);
    const sk = sKey(c);
    if (!byQuery.has(qk)) byQuery.set(qk, []);
    byQuery.get(qk)!.push(c);
    if (!bySource.has(sk)) bySource.set(sk, []);
    bySource.get(sk)!.push(c);
  }

  for (const [qk, group] of byQuery) {
    group.sort((a, b) => b.score - a.score);
    const topSources = new Set(group.slice(0, K).map(sKey));
    topSourcesForQuery.set(qk, topSources);
  }

  for (const [sk, group] of bySource) {
    group.sort((a, b) => b.score - a.score);
    const topQueries = new Set(group.slice(0, K).map(qKey));
    topQueriesForSource.set(sk, topQueries);
  }

  const kept: Candidate[] = [];
  let removed = 0;
  for (const c of candidates) {
    const qk = qKey(c);
    const sk = sKey(c);
    const isTopSourceForQ = topSourcesForQuery.get(qk)?.has(sk) ?? false;
    const isTopQueryForS = topQueriesForSource.get(sk)?.has(qk) ?? false;
    if (isTopSourceForQ && isTopQueryForS) {
      kept.push(c);
    } else {
      removed++;
    }
  }

  console.debug(`mutual-best-match filter: removed ${removed} candidates, kept ${kept.length}`);
  return { kept, removed };
}
