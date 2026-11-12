export type SparseVector = Map<string, number>;
export function lexicalTokens(text: string): string[] {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** Metadata describing how a research-mode Tfidf was fitted. */
export interface TfidfFitMetadata {
  passages: number;
  documents: number;
  backgroundPassages: number;
  source: string;
}

export class Tfidf {
  /** Set by fitOnPassages() to describe how this instance was created. */
  fittedOn?: TfidfFitMetadata;

  constructor(
    readonly idf: Record<string, number>,
    readonly trainingPassages: number,
  ) {}
  static fit(texts: string[]): Tfidf {
    if (!texts.length) throw new Error('Cannot fit TF-IDF without training passages');
    const df = new Map<string, number>();
    for (const t of texts)
      for (const word of new Set(lexicalTokens(t))) df.set(word, (df.get(word) ?? 0) + 1);
    return new Tfidf(
      Object.fromEntries(
        [...df].map(([word, n]) => [word, Math.log((1 + texts.length) / (1 + n)) + 1]),
      ),
      texts.length,
    );
  }

  /**
   * Fit IDF on the supplied passages (and optional background passages).
   *
   * All terms that appear in any passage are included in the vocabulary — no
   * OOV dropping at fit time. This is the correct approach for research-paper
   * mode where the PAN book vocabulary would leave domain-specific terms as
   * out-of-vocabulary (silently scoring zero).
   *
   * Formula: IDF(t) = log((1 + N) / (1 + df(t))) + 1
   *   where N  = total number of passages (supplied + background)
   *         df = number of passages containing term t
   *
   * @param passages          Query and source passages from the documents being analysed.
   * @param backgroundPassages Optional additional passages used only for IDF estimation.
   * @param documents         Number of distinct source documents (for metadata only).
   * @returns A new Tfidf instance fitted on these passages.
   */
  static fitOnPassages(
    passages: string[],
    backgroundPassages?: string[],
    documents?: number,
  ): Tfidf {
    const bg = backgroundPassages ?? [];
    const allPassages = [...passages, ...bg];
    const N = allPassages.length;
    if (N === 0) throw new Error('Cannot fit TF-IDF without passages');

    const df = new Map<string, number>();
    for (const t of allPassages)
      for (const word of new Set(lexicalTokens(t))) df.set(word, (df.get(word) ?? 0) + 1);

    const idf = Object.fromEntries(
      [...df].map(([word, n]) => [word, Math.log((1 + N) / (1 + n)) + 1]),
    );

    const instance = new Tfidf(idf, N);
    instance.fittedOn = {
      passages: passages.length,
      documents: documents ?? 0,
      backgroundPassages: bg.length,
      source: 'fitOnPassages',
    };
    return instance;
  }
  transform(text: string): SparseVector {
    const counts = new Map<string, number>();
    for (const w of lexicalTokens(text))
      if (Object.hasOwn(this.idf, w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const vector = new Map([...counts].map(([w, n]) => [w, (1 + Math.log(n)) * this.idf[w]]));
    const norm = Math.sqrt([...vector.values()].reduce((s, v) => s + v * v, 0));
    if (norm) for (const [w, v] of vector) vector.set(w, v / norm);
    return vector;
  }
}
export function sparseCosine(a: SparseVector, b: SparseVector): number {
  if (a.size > b.size) [a, b] = [b, a];
  let sum = 0;
  for (const [word, value] of a) sum += value * (b.get(word) ?? 0);
  return Math.min(1, Math.max(0, sum));
}
export function denseCosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || !a.length) throw new Error('Embedding dimensions differ');
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw new Error('Non-finite embedding');
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? Math.min(1, Math.max(-1, dot / Math.sqrt(aa * bb))) : 0;
}
