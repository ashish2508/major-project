'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AnalysisResult } from '@/lib/application/analysis';
import type { CorpusDocumentMetadata, CorpusStats } from '@/lib/corpus/types';
import type { DetectionConfig, Method } from '@/lib/detection/detector';
import {
  FormStateContext,
  AnalysisStateContext,
  CorpusStateContext,
  UIStateContext,
} from '@/lib/contexts';

export function StateProviders({ children }: { children: ReactNode }) {
  // Form State
  const [method, setMethod] = useState<Method>('hybrid');
  const [compareTarget, setCompareTarget] = useState<'corpus' | 'manual'>('corpus');
  const [queryText, setQueryText] = useState('');
  const [queryFile, setQueryFile] = useState<File | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);

  // Analysis State
  const [busy, setBusy] = useState(false);
  const [runningMethod, setRunningMethod] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Corpus State
  const [corpusDocs, setCorpusDocs] = useState<CorpusDocumentMetadata[]>([]);
  const [corpusStats, setCorpusStats] = useState<CorpusStats | null>(null);
  const [corpusLoading, setCorpusLoading] = useState(false);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'analyze' | 'corpus'>('analyze');
  const [pdfLinks, setPdfLinks] = useState<Record<string, string>>({});
  const [analysisTarget, setAnalysisTarget] = useState('');
  const [status, setStatus] = useState<{
    ready: boolean;
    modelAvailable: boolean;
    configs?: Record<Method, DetectionConfig>;
    corpus?: CorpusStats;
    error?: string;
  } | null>(null);

  // Request coalescing for corpus/status fetches
  const statusAbortControllerRef = useRef<AbortController | null>(null);

  const refreshCorpus = () => {
    setCorpusLoading(true);
    fetch('/api/corpus', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.documents) setCorpusDocs(data.documents);
        if (data.stats) setCorpusStats(data.stats);
      })
      .catch(() => {})
      .finally(() => setCorpusLoading(false));
  };

  // Cleanup blob URLs on unmount
  useEffect(
    () => () => {
      Object.values(pdfLinks)
        .filter((url) => url.startsWith('blob:'))
        .forEach((url) => URL.revokeObjectURL(url));
    },
    [pdfLinks],
  );

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      statusAbortControllerRef.current?.abort();
      statusAbortControllerRef.current = new AbortController();

      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has('_corpus_reset')) {
        setActiveTab('corpus');
        currentUrl.searchParams.delete('_corpus_reset');
        window.history.replaceState(null, '', currentUrl.toString());
      }
      refreshCorpus();
      try {
        const r = await fetch('/api/status', {
          cache: 'no-store',
          signal: statusAbortControllerRef.current.signal,
        });
        const data = await r.json();
        setStatus(data);
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setStatus({
            ready: false,
            modelAvailable: false,
            error: 'Local service is unavailable.',
          });
        }
      }
    };
    loadInitialData();
  }, []);

  // Timer for elapsed seconds during analysis
  useEffect(() => {
    if (!busy) return;
    const start = Date.now(),
      timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const formState = {
    method,
    setMethod,
    compareTarget,
    setCompareTarget,
    queryText,
    setQueryText,
    queryFile,
    setQueryFile,
    sourceText,
    setSourceText,
    sourceFiles,
    setSourceFiles,
  };

  const analysisState = {
    busy,
    setBusy,
    runningMethod,
    setRunningMethod,
    error,
    setError,
    result,
    setResult,
    analyses,
    setAnalyses,
    active,
    setActive,
    elapsed,
    setElapsed,
  };

  const corpusState = {
    corpusDocs,
    setCorpusDocs,
    corpusStats,
    setCorpusStats,
    corpusLoading,
    setCorpusLoading,
    ingestBusy,
    setIngestBusy,
    resetBusy,
    setResetBusy,
    ingestMessage,
    setIngestMessage,
    ingestError,
    setIngestError,
    refreshCorpus,
  };

  const uiState = {
    activeTab,
    setActiveTab,
    pdfLinks,
    setPdfLinks,
    analysisTarget,
    setAnalysisTarget,
    status,
    setStatus,
  };

  return (
    <UIStateContext.Provider value={uiState}>
      <FormStateContext.Provider value={formState}>
        <AnalysisStateContext.Provider value={analysisState}>
          <CorpusStateContext.Provider value={corpusState}>{children}</CorpusStateContext.Provider>
        </AnalysisStateContext.Provider>
      </FormStateContext.Provider>
    </UIStateContext.Provider>
  );
}
