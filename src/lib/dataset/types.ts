export type Language = 'en' | 'de' | 'es';
export interface CharacterSpan {
  offset: number;
  length: number;
}
export interface DocumentRecord {
  reference: string;
  role: 'source' | 'suspicious';
  part: string;
  textPath: string;
  xmlPath: string;
  language: Language;
  title: string;
  authors?: string;
  textLength: number;
  byteLength: number;
  sha256: string;
  declaredMd5: string;
  hasBom: boolean;
  issues: string[];
}
export interface SourceDocument extends DocumentRecord {
  role: 'source';
}
export interface SuspiciousDocument extends DocumentRecord {
  role: 'suspicious';
}
export type Construction =
  | { type: 'artificial'; obfuscation: 'none' | 'low' | 'high' }
  | { type: 'simulated' }
  | { type: 'translation'; manualObfuscation: boolean };
export interface PlagiarismAnnotation {
  id: string;
  suspiciousReference: string;
  sourceReference: string;
  suspiciousLanguage: Language;
  sourceLanguage: Language;
  suspiciousSpan: CharacterSpan;
  sourceSpan: CharacterSpan;
  construction: Construction;
  rawAttributes: Record<string, string>;
  issues: string[];
}
export interface DatasetStatistics {
  sourceDocuments: number;
  suspiciousDocuments: number;
  xmlFiles: number;
  plagiarismInstances: number;
  withAnnotations: number;
  withoutAnnotations: number;
  types: Record<string, number>;
  languages: Record<string, number>;
  issues: Record<string, number>;
}
export interface Inventory {
  version: 1;
  root: string;
  fingerprint: string;
  documents: DocumentRecord[];
  annotations: PlagiarismAnnotation[];
  statistics: DatasetStatistics;
}
export interface SplitPartition {
  sourceReferences: string[];
  suspiciousReferences: string[];
  annotationIds: string[];
}
export interface DatasetSplit {
  version: 1;
  seed: string;
  corpusFingerprint: string;
  scope: 'english-to-english';
  algorithm: string;
  config: Record<string, number | string>;
  train: SplitPartition;
  validation: SplitPartition;
  test: SplitPartition;
  familyByReference: Record<string, string>;
  excluded: { reference: string; reason: string }[];
}
