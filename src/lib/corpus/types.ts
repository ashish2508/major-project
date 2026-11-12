export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface CorpusDocumentStripping {
  confident: boolean;
  detectedHeading: string | null;
  charsRemoved: number;
  referenceOffset: number | null;
}

export interface CorpusDocumentMetadata {
  id: string;
  reference: string;
  title: string;
  filename: string;
  sha256: string;
  fileSize: number;
  format: 'pdf' | 'text';
  characterCount: number;
  passageCount: number;
  status: DocumentStatus;
  errorMessage: string | null;
  ingestedAt: string;
  updatedAt: string;
  stripping: CorpusDocumentStripping;
  pageCount?: number;
  pageRanges?: { page: number; start: number; end: number }[];
}

export interface CorpusPassage {
  id: string;
  documentId: string;
  documentReference: string;
  passageIndex: number;
  offset: number;
  length: number;
  text: string;
  page?: number;
}

export interface CorpusCatalog {
  documents: Record<string, CorpusDocumentMetadata>;
  totalDocuments: number;
  readyDocuments: number;
  totalPassages: number;
  lastUpdated: string;
}

export interface LexicalPosting {
  passageId: string;
  documentId: string;
  passageIndex: number;
  offset: number;
  length: number;
  weight: number;
}

export interface CorpusStats {
  totalDocuments: number;
  readyDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  totalPassages: number;
  storageBytes: number;
  lastUpdated: string;
}
