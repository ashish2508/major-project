'use client';

import type { AnalysisResult } from '@/lib/application/analysis';
import type { CorpusDocumentMetadata, CorpusStats } from '@/lib/corpus/types';
import type { DetectionConfig, Method } from '@/lib/detection/detector';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Header from '@/components/Header';
import AnalysisForm from '@/components/AnalysisForm';
import CorpusManager from '@/components/CorpusManager';
import ResultsView from '@/components/ResultsView';
import ContextPanel from '@/components/ContextPanel';
import Footer from '@/components/Footer';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'analyze' | 'corpus'>('analyze');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [runningMethod, setRunningMethod] = useState('');
  const [pdfLinks, setPdfLinks] = useState<Record<string, string>>({});
  const [analysisTarget, setAnalysisTarget] = useState('');
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [method, setMethod] = useState<Method>('hybrid');

  // Corpus management state
  const [corpusDocs, setCorpusDocs] = useState<CorpusDocumentMetadata[]>([]);
  const [corpusStats, setCorpusStats] = useState<CorpusStats | null>(null);
  const [corpusLoading, setCorpusLoading] = useState(false);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const [status, setStatus] = useState<{
    ready: boolean;
    modelAvailable: boolean;
    configs?: Record<Method, DetectionConfig>;
    corpus?: CorpusStats;
    error?: string;
  } | null>(null);

  // Request coalescing for corpus/status fetches
  const statusAbortControllerRef = useRef<AbortController | null>(null);

  // Cleanup blob URLs on unmount
  useEffect(
    () => () => {
      Object.values(pdfLinks)
        .filter((url) => url.startsWith('blob:'))
        .forEach((url) => URL.revokeObjectURL(url));
    },
    [pdfLinks],
  );

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

  // Request coalescing: prevent duplicate concurrent status/corpus fetches
  useEffect(() => {
    const loadInitialData = async () => {
      // Abort any in-flight request
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

  useEffect(() => {
    if (!busy) return;
    const start = Date.now(),
      timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    setElapsed(0);
    setResult(null);
    setAnalyses([]);
    try {
      // Get form data from the event target
      const formData = new FormData(event.currentTarget);

      // Parallelize all 3 detection method fetches instead of sequential for...of loop
      const methodIds = ['lexical', 'semantic', 'hybrid'] as const;
      const promises = methodIds.map(async (methodId) => {
        setRunningMethod(
          methodId === 'lexical' ? 'TF-IDF' : methodId === 'semantic' ? 'MiniLM' : 'Hybrid',
        );
        // Create fresh FormData for each request
        const data = new FormData(event.currentTarget);
        data.set('method', methodId);
        const response = await fetch('/api/analyze', { method: 'POST', body: data });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Analysis failed');
        return body;
      });

      const completed = await Promise.all(promises);

      const links: Record<string, string> = {};
      const useCorpus = formData.get('useCorpus') === 'true';
      if (completed[0].query.format === 'pdf') {
        const queryFile = formData.get('queryFile') as File | null;
        if (queryFile) links.query = URL.createObjectURL(queryFile);
      }
      for (const [index, source] of completed[0].sources.entries()) {
        if (source.format !== 'pdf') continue;
        if (useCorpus)
          links[source.reference] =
            '/api/corpus/pdf?reference=' + encodeURIComponent(source.reference);
        else {
          const sourceFiles = formData.getAll('sourceFiles') as File[];
          const sourceText = formData.get('sourceText') as string;
          const file = sourceFiles[index - (sourceText.trim() ? 1 : 0)];
          if (file) links[source.reference] = URL.createObjectURL(file);
        }
      }
      setPdfLinks(links);
      setAnalysisTarget(useCorpus ? 'Persistent user corpus' : 'Uploaded and pasted sources');
      setAnalyses(completed);
      const selected = completed.find((r) => r.method === method)!;
      setResult(selected);
      setActive(
        selected.detections.length === 0 && selected.semanticReviewLeads.length > 0 ? -1 : 0,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to analyze these documents');
    } finally {
      setBusy(false);
    }
  }

  async function handleIngest(files: File[]) {
    if (!files.length) return;
    setIngestBusy(true);
    setIngestMessage(null);
    setIngestError(null);

    const data = new FormData();
    for (const file of files) {
      data.append('files', file);
    }

    try {
      const res = await fetch('/api/corpus', { method: 'POST', body: data });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Ingestion failed');

      const duplicates = body.results?.filter((r: { isDuplicate: boolean }) => r.isDuplicate) || [];
      const added = body.results?.filter((r: { isDuplicate: boolean }) => !r.isDuplicate) || [];
      const failed = body.failed || [];

      let msg = '';
      if (added.length > 0) msg += `Successfully ingested ${added.length} research paper(s). `;
      if (duplicates.length > 0) msg += `${duplicates.length} duplicate paper(s) skipped. `;
      if (failed.length > 0) msg += `${failed.length} paper(s) failed.`;

      setIngestMessage(msg.trim());
      refreshCorpus();
    } catch (e) {
      setIngestError(e instanceof Error ? e.message : 'Failed to ingest documents');
    } finally {
      setIngestBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to remove this paper from your corpus?')) return;
    try {
      const res = await fetch(`/api/corpus?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Deletion failed');
      }
      refreshCorpus();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function handleRetry(id: string) {
    try {
      const res = await fetch('/api/corpus/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Retry failed');
      }
      refreshCorpus();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Retry failed');
    }
  }

  async function handleCorpusReset() {
    if (busy || ingestBusy || resetBusy) return;
    const confirmed = window.confirm(
      'Reset the local corpus? This permanently removes every imported paper and its indexes, then clears all analysis inputs and results. This cannot be undone.',
    );
    if (!confirmed) return;

    setResetBusy(true);
    setIngestError(null);
    try {
      const response = await fetch('/api/corpus?all=true', {
        method: 'DELETE',
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Corpus reset failed');
      if (
        body.stats?.totalDocuments !== 0 ||
        body.stats?.readyDocuments !== 0 ||
        body.stats?.totalPassages !== 0
      ) {
        throw new Error('Corpus reset did not produce an empty corpus');
      }

      const resetUrl = new URL(window.location.href);
      resetUrl.searchParams.set('_corpus_reset', String(Date.now()));
      window.location.replace(resetUrl.toString());
    } catch (e) {
      setIngestError(e instanceof Error ? e.message : 'Corpus reset failed');
      setResetBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <Header />
      <main>
        {/* Workspace Navigation Tabs */}
        <nav className="nav-tabs" aria-label="Workspace sections">
          <button
            type="button"
            className={`nav-tab ${activeTab === 'analyze' ? 'active' : ''}`}
            onClick={() => setActiveTab('analyze')}
          >
            Plagiarism Analysis
          </button>
          <button
            type="button"
            className={`nav-tab ${activeTab === 'corpus' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('corpus');
              refreshCorpus();
            }}
          >
            My Corpus
            <span className="nav-tab-badge">{corpusStats?.readyDocuments ?? 0}</span>
          </button>
        </nav>

        {activeTab === 'corpus' ? (
          <CorpusManager
            corpusDocs={corpusDocs}
            corpusStats={corpusStats}
            corpusLoading={corpusLoading}
            busy={busy}
            resetBusy={resetBusy}
            ingestBusy={ingestBusy}
            ingestMessage={ingestMessage}
            ingestError={ingestError}
            onIngest={handleIngest}
            onDelete={handleDelete}
            onRetry={handleRetry}
            onReset={handleCorpusReset}
          />
        ) : (
          <div className="review-layout">
            <AnalysisForm
              onSubmit={submit}
              corpusStats={corpusStats}
              busy={busy}
              resetBusy={resetBusy}
              error={error}
              status={status}
              onCorpusReset={handleCorpusReset}
              onTabChange={setActiveTab}
            />
            <ContextPanel />
          </div>
        )}

        {busy && (
          <p role="status">
            Analysing with {runningMethod} · {elapsed} seconds
          </p>
        )}

        {result && activeTab === 'analyze' && (
          <ResultsView
            result={result}
            analyses={analyses}
            analysisTarget={analysisTarget}
            pdfLinks={pdfLinks}
            onMethodChange={setMethod}
            onActiveChange={setActive}
            active={active}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
