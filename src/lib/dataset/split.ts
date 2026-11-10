import type {
  DatasetSplit,
  DocumentRecord,
  Inventory,
  PlagiarismAnnotation,
  SplitPartition,
} from './types';
import { digest } from './inventory';

export class Families {
  private parent = new Map<string, string>();
  constructor(refs: string[]) {
    for (const r of refs) this.parent.set(r, r);
  }
  find(r: string): string {
    const p = this.parent.get(r);
    if (p === undefined) throw new Error(`Unknown reference ${r}`);
    if (p === r) return r;
    const f = this.find(p);
    this.parent.set(r, f);
    return f;
  }
  join(a: string, b: string) {
    const x = this.find(a),
      y = this.find(b);
    if (x !== y) this.parent.set(x < y ? y : x, x < y ? x : y);
  }
}
const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
/** Conservative: a shared normalized title OR nonempty author list joins families. */
export function documentFamilies(documents: DocumentRecord[]): Record<string, string> {
  const uf = new Families(documents.map((d) => d.reference)),
    keys = new Map<string, string>();
  for (const d of documents) {
    for (const key of [
      `title:${normalize(d.title)}`,
      ...(d.authors ? [`authors:${normalize(d.authors)}`] : []),
    ]) {
      const prior = keys.get(key);
      if (prior) uf.join(prior, d.reference);
      else keys.set(key, d.reference);
    }
  }
  return Object.fromEntries(documents.map((d) => [d.reference, uf.find(d.reference)]));
}
export type PartitionName = 'train' | 'validation' | 'test';
export const SPLIT_SEED = 'pan-pc11-v1-20261110';
export function partitionFor(family: string, seed = SPLIT_SEED): PartitionName {
  const n = parseInt(digest(seed + '\0' + family).slice(0, 8), 16) / 2 ** 32;
  return n < 0.6 ? 'train' : n < 0.8 ? 'validation' : 'test';
}
export function annotationIndex(annotations: PlagiarismAnnotation[]) {
  const map = new Map<string, PlagiarismAnnotation[]>();
  for (const a of annotations) {
    const list = map.get(a.suspiciousReference) ?? [];
    list.push(a);
    map.set(a.suspiciousReference, list);
  }
  return map;
}
export function eligiblePartition(
  doc: DocumentRecord,
  annotations: PlagiarismAnnotation[],
  families: Record<string, string>,
): PartitionName | undefined {
  if (
    doc.language !== 'en' ||
    annotations.some((a) => a.construction.type === 'translation' || a.issues.length > 0)
  )
    return;
  const own = partitionFor(families[doc.reference]);
  if (annotations.some((a) => partitionFor(families[a.sourceReference]) !== own)) return;
  return own;
}
export function validateSplit(split: DatasetSplit, inventory: Inventory): void {
  if (split.corpusFingerprint !== inventory.fingerprint)
    throw new Error('Split corpus fingerprint mismatch');
  const docs = new Map(inventory.documents.map((d) => [d.reference, d])),
    anns = new Map(inventory.annotations.map((a) => [a.id, a]));
  const allAnns = annotationIndex(inventory.annotations),
    used = new Set<string>(),
    families = new Map<string, string>();
  for (const part of ['train', 'validation', 'test'] as const) {
    const p = split[part],
      sourceSet = new Set(p.sourceReferences),
      querySet = new Set(p.suspiciousReferences),
      ids = new Set(p.annotationIds);
    if (
      sourceSet.size !== p.sourceReferences.length ||
      querySet.size !== p.suspiciousReferences.length ||
      ids.size !== p.annotationIds.length
    )
      throw new Error('Duplicate split member');
    for (const [role, refs] of [
      ['source', p.sourceReferences],
      ['suspicious', p.suspiciousReferences],
    ] as const)
      for (const ref of refs) {
        if (used.has(ref)) throw new Error('Document crosses partitions');
        used.add(ref);
        const d = docs.get(ref);
        if (!d || d.role !== role || d.language !== 'en') throw new Error('Invalid split document');
        const family = split.familyByReference[ref];
        if (!family) throw new Error('Missing document family');
        if (families.has(family) && families.get(family) !== part)
          throw new Error('Document family crosses partitions');
        families.set(family, part);
      }
    for (const ref of p.suspiciousReferences)
      for (const a of allAnns.get(ref) ?? []) {
        if (
          !sourceSet.has(a.sourceReference) ||
          !ids.has(a.id) ||
          a.issues.length ||
          a.construction.type === 'translation'
        )
          throw new Error('Missing/cross-split/invalid annotation relationship');
      }
    for (const id of p.annotationIds) {
      const a = anns.get(id);
      if (!a || !querySet.has(a.suspiciousReference) || !sourceSet.has(a.sourceReference))
        throw new Error('Orphan split annotation');
    }
  }
}
export const emptyPartition = (): SplitPartition => ({
  sourceReferences: [],
  suspiciousReferences: [],
  annotationIds: [],
});
