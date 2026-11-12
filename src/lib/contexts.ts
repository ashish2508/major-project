import { createContext } from 'react';
import type { Method, DetectionConfig } from '@/lib/detection/detector';
import type { AnalysisResult } from '@/lib/application/analysis';
import type { CorpusDocumentMetadata, CorpusStats } from '@/lib/corpus/types';

// Form state: document inputs and detection method selection
export const FormStateContext = createContext<{
  method: Method;
  setMethod: (method: Method) => void;
  compareTarget: 'corpus' | 'manual';
  setCompareTarget: (target: 'corpus' | 'manual') => void;
  queryText: string;
  setQueryText: (text: string) => void;
  queryFile: File | null;
  setQueryFile: (file: File | null) => void;
  sourceText: string;
  setSourceText: (text: string) => void;
  sourceFiles: File[];
  setSourceFiles: (files: File[]) => void;
} | null>(null);

// Analysis state: detection results and progress
export const AnalysisStateContext = createContext<{
  busy: boolean;
  setBusy: (busy: boolean) => void;
  runningMethod: string;
  setRunningMethod: (method: string) => void;
  error: string;
  setError: (error: string) => void;
  result: AnalysisResult | null;
  setResult: (result: AnalysisResult | null) => void;
  analyses: AnalysisResult[];
  setAnalyses: (analyses: AnalysisResult[]) => void;
  active: number;
  setActive: (index: number) => void;
  elapsed: number;
  setElapsed: (seconds: number) => void;
} | null>(null);

// Corpus state: document storage and ingestion
export const CorpusStateContext = createContext<{
  corpusDocs: CorpusDocumentMetadata[];
  setCorpusDocs: (docs: CorpusDocumentMetadata[]) => void;
  corpusStats: CorpusStats | null;
  setCorpusStats: (stats: CorpusStats | null) => void;
  corpusLoading: boolean;
  setCorpusLoading: (loading: boolean) => void;
  ingestBusy: boolean;
  setIngestBusy: (busy: boolean) => void;
  resetBusy: boolean;
  setResetBusy: (busy: boolean) => void;
  ingestMessage: string | null;
  setIngestMessage: (msg: string | null) => void;
  ingestError: string | null;
  setIngestError: (error: string | null) => void;
  refreshCorpus: () => void;
} | null>(null);

// UI state: navigation and display settings
export const UIStateContext = createContext<{
  activeTab: 'analyze' | 'corpus';
  setActiveTab: (tab: 'analyze' | 'corpus') => void;
  pdfLinks: Record<string, string>;
  setPdfLinks: (links: Record<string, string>) => void;
  analysisTarget: string;
  setAnalysisTarget: (target: string) => void;
  status: {
    ready: boolean;
    modelAvailable: boolean;
    configs?: Record<Method, DetectionConfig>;
    corpus?: CorpusStats;
    error?: string;
  } | null;
  setStatus: (
    status: {
      ready: boolean;
      modelAvailable: boolean;
      configs?: Record<Method, DetectionConfig>;
      corpus?: CorpusStats;
      error?: string;
    } | null,
  ) => void;
} | null>(null);
