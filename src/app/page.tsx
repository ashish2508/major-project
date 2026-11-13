'use client';
import type { FormEvent } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import AnalysisForm from '@/components/AnalysisForm';
import ContextPanel from '@/components/ContextPanel';
import Footer from '@/components/Footer';
import { ResultsSkeleton, DocumentListSkeleton } from '@/components/Skeletons';
import { useUIState } from '@/hooks/useUIState';
import { useAnalysisState } from '@/hooks/useAnalysisState';
import { useCorpusState } from '@/hooks/useCorpusState';
import { useFormState } from '@/hooks/useFormState';

// Dynamic imports for heavy components - lazy loaded on tab click
const CorpusManager = dynamic(() => import('@/components/CorpusManager'), {
  loading: () => <DocumentListSkeleton />,
  ssr: false,
});

const ResultsView = dynamic(() => import('@/components/ResultsView'), {
  loading: () => <ResultsSkeleton />,
  ssr: false,
});

export default function Home() {
  const {
    activeTab,
    setActiveTab,
    pdfLinks,
    setPdfLinks,
    analysisTarget,
    setAnalysisTarget,
    status,
  } = useUIState();
  const {
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
  } = useAnalysisState();
  const {
    corpusDocs,
    corpusStats,
    corpusLoading,
    ingestBusy,
    resetBusy,
    ingestMessage,
    ingestError,
    refreshCorpus,
    setIngestBusy,
    setIngestMessage,
    setIngestError,
    setResetBusy,
  } = useCorpusState();
  const { method } = useFormState();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
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

        {busy && <p role="status">Analysing with {runningMethod}</p>}

        {result && activeTab === 'analyze' && (
          <ResultsView
            result={result}
            analyses={analyses}
            analysisTarget={analysisTarget}
            pdfLinks={pdfLinks}
            onMethodChange={() => {}}
            onActiveChange={setActive}
            active={active}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
