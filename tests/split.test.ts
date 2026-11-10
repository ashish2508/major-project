import { it, expect } from 'vitest';
import { documentFamilies, validateSplit, emptyPartition } from '../src/lib/dataset/split';
import type { DatasetSplit, DocumentRecord, Inventory } from '../src/lib/dataset/types';
const doc = (
  reference: string,
  role: 'source' | 'suspicious',
  title: string,
  authors?: string,
): DocumentRecord => ({
  reference,
  role,
  title,
  authors,
  part: 'part1',
  language: 'en',
  textPath: '',
  xmlPath: '',
  textLength: 10,
  byteLength: 10,
  sha256: '',
  declaredMd5: '',
  hasBom: false,
  issues: [],
});
it('conservatively groups shared titles or authors transitively', () => {
  const ds = [
    doc('s', 'source', 'Book A', 'Author'),
    doc('q', 'suspicious', 'Book B', 'Author'),
    doc('z', 'source', 'Book B'),
  ];
  const f = documentFamilies(ds);
  expect(f.s).toBe(f.q);
  expect(f.s).toBe(f.z);
});
it('rejects family leakage, omitted source relationships and repeated documents', () => {
  const documents = [doc('s', 'source', 'A'), doc('q', 'suspicious', 'B'), doc('x', 'source', 'C')];
  const annotations = [
    {
      id: 'a',
      suspiciousReference: 'q',
      sourceReference: 's',
      suspiciousLanguage: 'en' as const,
      sourceLanguage: 'en' as const,
      suspiciousSpan: { offset: 0, length: 2 },
      sourceSpan: { offset: 0, length: 2 },
      construction: { type: 'simulated' as const },
      rawAttributes: {},
      issues: [],
    },
  ];
  const inv: Inventory = {
    version: 1,
    root: '',
    documents,
    annotations,
    fingerprint: 'hash',
    statistics: {
      sourceDocuments: 2,
      suspiciousDocuments: 1,
      xmlFiles: 3,
      plagiarismInstances: 1,
      withAnnotations: 1,
      withoutAnnotations: 0,
      types: { simulated: 1 },
      languages: {},
      issues: {},
    },
  };
  const split: DatasetSplit = {
    version: 1,
    seed: 's',
    corpusFingerprint: 'hash',
    scope: 'english-to-english',
    algorithm: 'test',
    config: {},
    familyByReference: { s: 'a', q: 'b', x: 'c' },
    train: emptyPartition(),
    validation: { sourceReferences: ['s'], suspiciousReferences: ['q'], annotationIds: ['a'] },
    test: emptyPartition(),
    excluded: [],
  };
  expect(() => validateSplit(split, inv)).not.toThrow();
  split.validation.annotationIds = [];
  expect(() => validateSplit(split, inv)).toThrow();
  split.validation.annotationIds = ['a'];
  split.test.sourceReferences = ['x'];
  split.familyByReference.x = 'b';
  expect(() => validateSplit(split, inv)).toThrow();
  split.familyByReference.x = 'c';
  split.test.sourceReferences = ['s'];
  expect(() => validateSplit(split, inv)).toThrow();
});
