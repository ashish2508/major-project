'use client';

import type { AnalysisResult } from '@/lib/application/analysis';
import { analysisReport } from '@/lib/application/report';
import type { CorpusDocumentMetadata, CorpusStats } from '@/lib/corpus/types';
import type { DetectionConfig, Method } from '@/lib/detection/detector';
import ResetCorpusButton from '@/components/ResetCorpusButton';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';

const METHODS: { id: Method; name: string; description: string }[] = [
  { id: 'lexical', name: 'TF-IDF', description: 'Shared wording' },
  { id: 'semantic', name: 'MiniLM', description: 'Semantic similarity' },
  { id: 'hybrid', name: 'Hybrid', description: 'Validation-selected blend' },
];

function getQueryPage(
  pages?: { page: number; start: number; end: number }[],
  offset?: number,
): number | null {
  if (!pages || offset === undefined) return null;
  const p = pages.find((page) => offset >= page.start && offset < page.end);
  return p ? p.page : null;
}

function RevealedScore({ score }: { score: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    let frame: number;
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / 380);
      setDisplay(score * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);
  return (
    <>
      <span className="animated-score" aria-hidden="true">
        {display.toFixed(3)}
      </span>
      <span className="static-score">{score.toFixed(3)}</span>
    </>
  );
}

function HighlightedText({
  text,
  span,
  review = false,
}: {
  text: string;
  span?: { offset: number; length: number };
  review?: boolean;
}) {
  if (!span) return <>{text}</>;
  return (
    <>
      {text.slice(0, span.offset)}
      <mark tabIndex={-1} data-highlight={review ? 'review' : 'true'}>
        {text.slice(span.offset, span.offset + span.length)}
      </mark>
      {text.slice(span.offset + span.length)}
    </>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'analyze' | 'corpus'>('analyze');
  const [method, setMethod] = useState<Method>('hybrid');
  const [compareTarget, setCompareTarget] = useState<'corpus' | 'manual'>('corpus');
  const [queryText, setQueryText] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [queryFile, setQueryFile] = useState<File | null>(null);
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [runningMethod, setRunningMethod] = useState('');
  const [pdfLinks, setPdfLinks] = useState<Record<string, string>>({});
  const [analysisTarget, setAnalysisTarget] = useState('');
  useEffect(
    () => () => {
      Object.values(pdfLinks)
        .filter((url) => url.startsWith('blob:'))
        .forEach((url) => URL.revokeObjectURL(url));
    },
    [pdfLinks],
  );
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Corpus management state
  const [corpusDocs, setCorpusDocs] = useState<CorpusDocumentMetadata[]>([]);
  const [corpusStats, setCorpusStats] = useState<CorpusStats | null>(null);
  const [corpusLoading, setCorpusLoading] = useState(false);
  const [ingestFiles, setIngestFiles] = useState<File[]>([]);
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

  const resultsRef = useRef<HTMLElement>(null);
  const queryPane = useRef<HTMLPreElement>(null);
  const sourcePane = useRef<HTMLPreElement>(null);
  const corpusFileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const loadInitialData = async () => {
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has('_corpus_reset')) {
        setActiveTab('corpus');
        currentUrl.searchParams.delete('_corpus_reset');
        window.history.replaceState(null, '', currentUrl.toString());
      }
      refreshCorpus();
      try {
        const r = await fetch('/api/status', { cache: 'no-store' });
        const data = await r.json();
        setStatus(data);
      } catch {
        setStatus({ ready: false, modelAvailable: false, error: 'Local service is unavailable.' });
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!result) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultsRef.current?.scrollIntoView({
      behavior: reducedMotion ? 'instant' : 'smooth',
      block: 'start',
    });
  }, [result]);

  useEffect(() => {
    if (!busy) return;
    const start = Date.now(),
      timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!result) return;
    for (const pane of [queryPane.current, sourcePane.current]) {
      const mark = pane?.querySelector<HTMLElement>('mark');
      if (mark && pane) pane.scrollTop = Math.max(0, mark.offsetTop - pane.offsetTop - 80);
    }
  }, [active, result]);

  const reviewingLead = active < 0;
  const chosen = reviewingLead
    ? result?.semanticReviewLeads[-active - 1]
    : result?.detections[active];
  const selectedSource = chosen
    ? result?.sources.find((s) => s.reference === chosen.sourceReference)
    : result?.sources[0];
  const config = status?.configs?.[method];

  const hasQuery = Boolean(queryText.trim()) || Boolean(queryFile);
  const hasCorpusReady = (corpusStats?.readyDocuments ?? 0) > 0;
  const hasSource =
    compareTarget === 'corpus'
      ? hasCorpusReady
      : Boolean(sourceText.trim()) || sourceFiles.length > 0;
  const canSubmit = !busy && !resetBusy && status?.ready !== false && hasQuery && hasSource;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    setElapsed(0);
    setResult(null);
    setAnalyses([]);
    const data = new FormData();
    data.set('method', method);
    data.set('queryText', queryText);
    data.set('useCorpus', String(compareTarget === 'corpus'));
    if (queryFile) data.set('queryFile', queryFile);
    if (compareTarget === 'manual') {
      data.set('sourceText', sourceText);
      for (const file of sourceFiles) data.append('sourceFiles', file);
    }
    try {
      const completed: AnalysisResult[] = [];
      for (const entry of METHODS) {
        setRunningMethod(entry.name);
        data.set('method', entry.id);
        const response = await fetch('/api/analyze', { method: 'POST', body: data });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Analysis failed');
        completed.push(body);
      }
      const links: Record<string, string> = {};
      if (queryFile && completed[0].query.format === 'pdf')
        links.query = URL.createObjectURL(queryFile);
      for (const [index, source] of completed[0].sources.entries()) {
        if (source.format !== 'pdf') continue;
        if (compareTarget === 'corpus')
          links[source.reference] =
            '/api/corpus/pdf?reference=' + encodeURIComponent(source.reference);
        else {
          const file = sourceFiles[index - (sourceText.trim() ? 1 : 0)];
          if (file) links[source.reference] = URL.createObjectURL(file);
        }
      }
      setPdfLinks(links);
      setAnalysisTarget(
        compareTarget === 'corpus' ? 'Persistent user corpus' : 'Uploaded and pasted sources',
      );
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

  async function handleIngest(event: FormEvent) {
    event.preventDefault();
    if (!ingestFiles.length) return;
    setIngestBusy(true);
    setIngestMessage(null);
    setIngestError(null);

    const data = new FormData();
    for (const file of ingestFiles) {
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
      setIngestFiles([]);
      if (corpusFileInputRef.current) corpusFileInputRef.current.value = '';
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

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([analysisReport(analyses, analysisTarget)], { type: 'text/html;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'research-paper-analysis.html';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ¶
          </span>{' '}
          Passage Review<span className="brand-tag">RESEARCH WORKSPACE</span>
        </Link>
        <span className="local-badge">
          <span aria-hidden="true" />
          Local processing
        </span>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">RESEARCH-PAPER PLAGIARISM DETECTION · HUMAN REVIEW</p>
          <h1>
            Follow the passage.
            <br />
            <span>Examine the evidence.</span>
          </h1>
          <p className="intro-copy">
            Index arbitrary research papers into your local searchable corpus, or compare documents
            directly using lexical overlap, semantic embeddings, and hybrid similarity.
          </p>
        </section>

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
          /* Corpus Management Tab */
          <div className="corpus-manager-panel">
            <div className="section-heading corpus-heading">
              <div>
                <h2>Corpus Management</h2>
                <p>
                  Import arbitrary research papers (PDF or UTF-8 TXT). Documents are extracted,
                  reference-stripped, segmented into passages, and indexed with persistent lexical
                  and semantic embeddings.
                </p>
              </div>
              <ResetCorpusButton
                disabled={busy || ingestBusy}
                busy={resetBusy}
                onReset={handleCorpusReset}
              />
            </div>

            <div className="corpus-stats-grid">
              <div className="corpus-stat-card">
                <span className="corpus-stat-label">Total Papers</span>
                <span className="corpus-stat-value">{corpusStats?.totalDocuments ?? 0}</span>
              </div>
              <div className="corpus-stat-card">
                <span className="corpus-stat-label">Indexed for Search</span>
                <span className="corpus-stat-value">{corpusStats?.readyDocuments ?? 0}</span>
              </div>
              <div className="corpus-stat-card">
                <span className="corpus-stat-label">Total Passages</span>
                <span className="corpus-stat-value">
                  {(corpusStats?.totalPassages ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="corpus-stat-card">
                <span className="corpus-stat-label">Storage Size</span>
                <span className="corpus-stat-value">
                  {((corpusStats?.storageBytes ?? 0) / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
            </div>

            {/* Ingestion Dropzone & Form */}
            <form onSubmit={handleIngest} className="corpus-upload-box">
              <p className="field-hint" style={{ margin: 0 }}>
                Select one or more research papers to ingest (PDF or TXT, up to 15 MB per paper).
              </p>
              <div className="corpus-upload-controls">
                <input
                  ref={corpusFileInputRef}
                  id="corpus-files"
                  className="corpus-file-input"
                  type="file"
                  accept=".pdf,.txt"
                  multiple
                  disabled={ingestBusy || resetBusy}
                  onChange={(e) => setIngestFiles(Array.from(e.target.files ?? []))}
                />
                <label className="secondary-button" htmlFor="corpus-files">
                  ↑ Choose research papers ({ingestFiles.length} selected)
                </label>
                <button
                  type="submit"
                  className="corpus-upload-btn"
                  disabled={ingestBusy || resetBusy || ingestFiles.length === 0}
                >
                  {ingestBusy ? (
                    <>
                      Ingesting & Indexing <span className="spinner" aria-hidden="true" />
                    </>
                  ) : (
                    'Ingest into Corpus'
                  )}
                </button>
              </div>
              {ingestFiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '600px' }}>
                  {ingestFiles.map((f, i) => (
                    <span className="file-chip" key={`ingest-${f.name}-${f.size}-${i}`}>
                      {f.name} ({(f.size / 1024).toFixed(0)} KB)
                    </span>
                  ))}
                </div>
              )}
            </form>

            {ingestMessage && (
              <div
                className="progress-note"
                role="status"
                style={{ background: '#f0f9f5', color: '#126338' }}
              >
                ✓ {ingestMessage}
              </div>
            )}
            {ingestError && (
              <p className="error-box" role="alert">
                ✕ {ingestError}
              </p>
            )}

            {/* Corpus Document List */}
            {corpusDocs.length === 0 && !corpusLoading ? (
              <div className="corpus-empty-state">
                <h3>Your corpus is currently empty</h3>
                <p>
                  Upload your research papers above to create a searchable index for lexical,
                  semantic, and hybrid plagiarism analysis.
                </p>
              </div>
            ) : (
              <div className="corpus-table-wrapper">
                <table className="corpus-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Fingerprint</th>
                      <th>Size / Pages</th>
                      <th>Passages</th>
                      <th>Reference Stripping</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corpusDocs.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <strong>{doc.title}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            {doc.reference} · {new Date(doc.ingestedAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td>
                          <span className="hash-badge" title={doc.sha256}>
                            {doc.sha256.slice(0, 10)}…
                          </span>
                        </td>
                        <td>
                          {(doc.fileSize / 1024).toFixed(0)} KB · {doc.format.toUpperCase()}
                          {doc.pageCount ? ` (${doc.pageCount} pp)` : ''}
                        </td>
                        <td>{doc.passageCount.toLocaleString()}</td>
                        <td>
                          {doc.stripping.charsRemoved > 0 ? (
                            <span style={{ color: 'var(--teal)' }}>
                              ✓ Stripped {doc.stripping.charsRemoved.toLocaleString()} chars
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>No bibliography removed</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-pill ${doc.status}`}>{doc.status}</span>
                          {doc.errorMessage && (
                            <div style={{ fontSize: '10px', color: '#9b1c1c', marginTop: '2px' }}>
                              {doc.errorMessage}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {doc.status === 'failed' && (
                              <button
                                type="button"
                                className="corpus-btn-sm retry"
                                onClick={() => handleRetry(doc.id)}
                              >
                                Retry
                              </button>
                            )}
                            <button
                              type="button"
                              className="corpus-btn-sm danger"
                              onClick={() => handleDelete(doc.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Plagiarism Analysis Tab */
          <div className="review-layout">
            <form onSubmit={submit} className="workspace" aria-label="Document comparison">
              <fieldset disabled={busy || resetBusy} className="form-fieldset">
                <div className="section-heading">
                  <span className="step">01</span>
                  <div>
                    <h2>Choose the initial results view</h2>
                    <p>
                      Each analysis runs all three methods. Choose which results to inspect first.
                    </p>
                  </div>
                </div>
                <div className="method-options" role="radiogroup" aria-label="Detection method">
                  {METHODS.map((m) => (
                    <label
                      className={`method-option ${method === m.id ? 'selected' : ''}`}
                      key={m.id}
                    >
                      <input
                        type="radio"
                        name="method-choice"
                        checked={method === m.id}
                        onChange={() => setMethod(m.id)}
                        value={m.id}
                      />
                      <strong>{m.name}</strong>
                      <span>{m.description}</span>
                    </label>
                  ))}
                </div>
                <p className="calibration-note">
                  {config ? (
                    <>
                      Validation-selected threshold: <b>{config.threshold.toFixed(2)}</b>
                      {method === 'hybrid' && (
                        <>
                          {' '}
                          · lexical weight α = <b>{config.alpha.toFixed(2)}</b>
                          {(config.alpha === 1 || config.alpha === 0) && (
                            <>
                              . This selection reduces to the{' '}
                              {config.alpha === 1 ? 'lexical' : 'semantic'} baseline.
                            </>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    'Checking local calibration artifacts…'
                  )}
                </p>

                <div className="section-heading document-heading">
                  <span className="step">02</span>
                  <div>
                    <h2>Target & Documents</h2>
                    <p>Search against your persistent corpus or provide specific sources.</p>
                  </div>
                  <ResetCorpusButton disabled={busy} busy={resetBusy} onReset={handleCorpusReset} />
                </div>

                {/* Target Selection: Corpus vs. Manual Sources */}
                <div className="corpus-target-wrapper">
                  <div className="corpus-target-selector">
                    <label
                      className={`corpus-target-card ${compareTarget === 'corpus' ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="compare-target"
                        checked={compareTarget === 'corpus'}
                        onChange={() => setCompareTarget('corpus')}
                        disabled={busy}
                      />
                      <div className="corpus-target-content">
                        <span className="corpus-target-title">
                          Search Research Paper Corpus
                          <span className="nav-tab-badge">
                            {corpusStats?.readyDocuments ?? 0} papers
                          </span>
                        </span>
                        <span className="corpus-target-hint">
                          Query against your persistent indexed collection of research papers (
                          {(corpusStats?.totalPassages ?? 0).toLocaleString()} passages).
                        </span>
                      </div>
                    </label>

                    <label
                      className={`corpus-target-card ${compareTarget === 'manual' ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="compare-target"
                        checked={compareTarget === 'manual'}
                        onChange={() => setCompareTarget('manual')}
                        disabled={busy}
                      />
                      <div className="corpus-target-content">
                        <span className="corpus-target-title">Upload Specific Sources</span>
                        <span className="corpus-target-hint">
                          Compare directly against up to six specific source documents or pasted
                          text.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="document-grid">
                  <section className="input-panel">
                    <label htmlFor="query-text" className="input-title">
                      Document to review<span>ONE DOCUMENT</span>
                    </label>
                    <textarea
                      id="query-text"
                      value={queryText}
                      disabled={Boolean(queryFile) || busy}
                      onChange={(e) => setQueryText(e.target.value)}
                      maxLength={250000}
                      placeholder="Paste the passage or document you want to review…"
                    />
                    <label className="file-label" htmlFor="query-file">
                      <span>↑ Upload document</span>
                      <span>PDF / TXT</span>
                    </label>
                    <input
                      id="query-file"
                      className="file-input"
                      type="file"
                      accept=".pdf,.txt"
                      disabled={busy || Boolean(queryText.trim())}
                      onChange={(e) => setQueryFile(e.target.files?.[0] ?? null)}
                    />
                    {queryFile && (
                      <div className="file-chip">
                        {queryFile.name}
                        <button
                          type="button"
                          aria-label="Remove query file"
                          onClick={() => {
                            setQueryFile(null);
                            const input = document.getElementById('query-file') as HTMLInputElement;
                            if (input) input.value = '';
                          }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <p className="field-hint">
                      {queryFile
                        ? `${(queryFile.size / 1024).toFixed(0)} KB selected`
                        : `${queryText.length.toLocaleString()} / 250,000 characters`}
                    </p>
                  </section>

                  <section className="input-panel">
                    <label htmlFor="source-text" className="input-title">
                      Possible original sources
                      <span>
                        {compareTarget === 'corpus'
                          ? `${corpusStats?.readyDocuments ?? 0} CORPUS PAPERS`
                          : 'UP TO SIX SOURCES'}
                      </span>
                    </label>
                    {compareTarget === 'corpus' ? (
                      <div className="corpus-active-card">
                        <div className="corpus-active-badge">✓ Corpus Search Active</div>
                        <p className="corpus-active-heading">
                          Searching across {corpusStats?.readyDocuments ?? 0} indexed research
                          paper(s)
                        </p>
                        <p className="corpus-active-desc">
                          Query passages are matched against{' '}
                          {(corpusStats?.totalPassages ?? 0).toLocaleString()} pre-indexed passages
                          using persistent lexical and semantic indexes.
                        </p>
                        {(corpusStats?.readyDocuments ?? 0) === 0 && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setActiveTab('corpus')}
                          >
                            + Import papers into your corpus
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <textarea
                          id="source-text"
                          value={sourceText}
                          onChange={(e) => setSourceText(e.target.value)}
                          maxLength={250000}
                          placeholder="Paste one possible source, or upload source documents below…"
                        />
                        <label className="file-label" htmlFor="source-files">
                          <span>↑ Upload sources</span>
                          <span>PDF / TXT · MULTIPLE</span>
                        </label>
                        <input
                          id="source-files"
                          className="file-input"
                          type="file"
                          accept=".pdf,.txt"
                          multiple
                          onChange={(e) => setSourceFiles(Array.from(e.target.files ?? []))}
                        />
                        {sourceFiles.map((file, i) => (
                          <div className="file-chip" key={`${file.name}-${i}`}>
                            {file.name}
                            <button
                              type="button"
                              aria-label={`Remove source ${file.name}`}
                              onClick={() =>
                                setSourceFiles(sourceFiles.filter((_, index) => index !== i))
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <p className="field-hint">
                          15 MB per file · 250,000 extracted characters per document
                        </p>
                      </>
                    )}
                  </section>
                </div>

                <div className="submit-row">
                  <p>
                    {compareTarget === 'corpus'
                      ? `Searching across ${corpusStats?.readyDocuments ?? 0} research paper(s) in your corpus.`
                      : 'Searches only the sources you provide.'}
                    <br />
                    English text · 2,500,000 combined character limit.
                  </p>
                  <button className="primary-button" disabled={!canSubmit} type="submit">
                    {busy ? (
                      <>
                        Comparing locally <span className="spinner" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        Analyze documents <span aria-hidden="true">→</span>
                      </>
                    )}
                  </button>
                </div>
              </fieldset>

              {busy && (
                <div className="progress-note" role="status">
                  Comparing passages locally · {elapsed}s elapsed. Model loading and longer
                  documents can take a little time.
                </div>
              )}
              {error && (
                <p className="error-box" role="alert">
                  {error}
                </p>
              )}
              {status?.ready === false && (
                <p className="error-box" role="alert">
                  {status.error}
                </p>
              )}
              {status?.ready && !status.modelAvailable && (
                <p className="error-box">
                  MiniLM weights are missing. Run <code>bun run setup:model</code> before using
                  semantic or hybrid analysis.
                </p>
              )}
            </form>

            <aside className="context-panel">
              <p className="eyebrow">READ BEFORE INTERPRETING</p>
              <h2>Similarity is a starting point.</h2>
              <p>
                A match can reflect quotation, common language, shared subject matter, or textual
                reuse. Scores are not calibrated probabilities and do not establish plagiarism or
                misconduct.
              </p>
              <div className="context-divider" />
              <h3>What the methods measure</h3>
              <dl>
                <dt>TF-IDF</dt>
                <dd>Overlap in weighted words.</dd>
                <dt>MiniLM</dt>
                <dd>Similarity in sentence and short-passage meaning.</dd>
                <dt>Hybrid</dt>
                <dd>
                  A weighted score selected using validation data. It may reduce to a single
                  baseline.
                </dd>
              </dl>
              <div className="context-divider" />
              <p className="small-copy">
                Research calibration uses a bounded, book-based PAN-PC-11 subset. Performance on
                Computer Science research publications is not established. Scanned PDFs and OCR are
                not supported.
              </p>
            </aside>
          </div>
        )}

        {busy && (
          <p role="status">
            Analysing with {runningMethod} · {elapsed} seconds
          </p>
        )}
        {/* Results Section */}
        {result && activeTab === 'analyze' && (
          <section
            className="results-section"
            ref={resultsRef}
            aria-label="Analysis results"
            aria-live="polite"
          >
            <h2>Analysis summary</h2>
            <p>
              {analysisTarget} · {result.passages.query} query passages · {result.passages.sources}{' '}
              source passages searched · {new Set(result.sources.map((s) => s.reference)).size}{' '}
              unique source documents ·{' '}
              {analyses.reduce((sum, r) => sum + r.elapsedSeconds, 0).toFixed(2)} seconds total
            </p>
            <div className="method-options" aria-label="Results by detection method">
              {analyses.map((analysis) => (
                <button
                  key={analysis.method}
                  type="button"
                  className="secondary-button"
                  aria-pressed={analysis.method === result.method}
                  onClick={() => {
                    setResult(analysis);
                    setActive(analysis.detections.length ? 0 : -1);
                  }}
                >
                  {METHODS.find((m) => m.id === analysis.method)?.name} ·{' '}
                  {analysis.detections.length} similarity alerts ·{' '}
                  {analysis.semanticReviewLeads.length} review recommendations
                  {analysis.coverage
                    ? ` · ${(analysis.coverage.ratio * 100).toFixed(1)}% coverage`
                    : ''}
                </button>
              ))}
            </div>
            <div className="result-heading result-banner result-neutral">
              <div>
                <p className="eyebrow">REVIEW THE EVIDENCE</p>
                <h2>
                  {result.detections.length
                    ? 'Potential textual similarity detected'
                    : result.semanticReviewLeads.length
                      ? 'Semantic review leads'
                      : 'No matching passages found above the selected threshold.'}
                </h2>
                <p>
                  {result.detections.length
                    ? 'Matching passages were identified. Review the highlighted evidence and possible source before drawing conclusions.'
                    : result.semanticReviewLeads.length
                      ? 'MiniLM ranked potentially related passages for manual review.'
                      : 'This does not establish originality. Other sources or paraphrases may have been missed.'}
                </p>
                <dl className="result-metrics">
                  <div>
                    <dt>Document under review (query)</dt>
                    <dd>{result.query.title}</dd>
                  </div>
                  <div>
                    <dt>Query size</dt>
                    <dd>
                      {result.query.text.length.toLocaleString()} characters
                      {result.query.pages?.length ? ` (${result.query.pages.length} pages)` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Query passages</dt>
                    <dd>{result.passages.query.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Source papers</dt>
                    <dd>{result.sources.length}</dd>
                  </div>
                  <div>
                    <dt>Source passages</dt>
                    <dd>{result.passages.sources.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Candidate passages</dt>
                    <dd>{result.detections.length}</dd>
                  </div>
                  {result.coverage && (
                    <div>
                      <dt>Query coverage</dt>
                      <dd>
                        {(result.coverage.ratio * 100).toFixed(1)}%
                        <small style={{ marginLeft: '4px', color: 'var(--muted)' }}>
                          ({result.coverage.coveredChars.toLocaleString()} /{' '}
                          {result.coverage.eligibleChars.toLocaleString()} eligible chars)
                        </small>
                      </dd>
                    </div>
                  )}
                  {result.detections.length > 0 && (
                    <div>
                      <dt>Highest similarity</dt>
                      <dd>
                        <RevealedScore
                          score={result.detections.reduce(
                            (max, match) => Math.max(max, match.score),
                            0,
                          )}
                        />
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Method</dt>
                    <dd>{METHODS.find(({ id }) => id === result.method)?.name}</dd>
                  </div>
                  <div>
                    <dt>Threshold</dt>
                    <dd>{result.config.threshold.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Execution provider</dt>
                    <dd>{result.provider}</dd>
                  </div>
                  {result.model && (
                    <div>
                      <dt>Model</dt>
                      <dd>{result.model}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Processing time</dt>
                    <dd>{result.elapsedSeconds.toFixed(2)} s</dd>
                  </div>
                </dl>

                {result.stripping && (
                  <div className="stripping-summary-banner">
                    <span className="stripping-summary-badge">Reference Stripping Status</span>
                    <div className="stripping-summary-details">
                      <div>
                        <strong>Query: </strong>
                        {result.stripping.query.charsRemoved > 0
                          ? `Query references stripped: ${result.stripping.query.charsRemoved.toLocaleString()} chars removed${
                              result.stripping.query.detectedHeading
                                ? ` ("${result.stripping.query.detectedHeading}")`
                                : ''
                            }`
                          : 'No references section removed'}
                      </div>
                      <div>
                        <strong>Sources: </strong>
                        {(() => {
                          const strippedCount = result.stripping.sources.filter(
                            (s) => s.charsRemoved > 0,
                          ).length;
                          const totalRemoved = result.stripping.sources.reduce(
                            (sum, s) => sum + s.charsRemoved,
                            0,
                          );
                          return strippedCount > 0
                            ? `${strippedCount} of ${result.sources.length} source references stripped (${totalRemoved.toLocaleString()} chars removed)`
                            : 'No references section removed';
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <button type="button" className="secondary-button" onClick={download}>
                Download analysis report ↓
              </button>
            </div>
            <p className="evidence-warning">
              Similarity scores are uncalibrated evidence for human review, not probabilities or
              proof of plagiarism or misconduct.
            </p>
            <p className="evidence-warning" style={{ fontStyle: 'italic' }}>
              ⚠ Matching is symmetric. Direction of copying cannot be determined from similarity
              alone. Use publication dates and provenance to establish direction.
            </p>
            {result.sharedIdentifiers && result.sharedIdentifiers.length > 0 && (
              <div
                className="stripping-summary-banner"
                style={{ background: '#fff8e6', borderColor: '#d4a800' }}
              >
                <span className="stripping-summary-badge">Shared Identifiers</span>
                <div className="stripping-summary-details">
                  <p style={{ margin: 0, fontSize: '0.9em' }}>
                    The following identifiers appear in both documents. Shared registration numbers,
                    DOIs, or trial IDs are strong but non-conclusive evidence of a common origin.
                  </p>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '0.9em' }}>
                    {result.sharedIdentifiers.flatMap((s) =>
                      s.matches.map((m) => (
                        <li key={`${m.type}-${m.value}-${s.sourceReference}`}>
                          <strong>{m.type}</strong>: <code>{m.value}</code> (found in{' '}
                          {result.sources.find((src) => src.reference === s.sourceReference)
                            ?.title ?? s.sourceReference}
                          )
                        </li>
                      )),
                    )}
                  </ul>
                </div>
              </div>
            )}
            {result.semanticReviewLeads.map((lead, index) => (
              <article
                className="review-lead"
                key={`lead-${lead.sourceReference}-${lead.suspiciousSpan.offset}-${lead.sourceSpan.offset}`}
                aria-labelledby={`review-lead-title-${index}`}
              >
                <div>
                  <p className="review-lead-label">
                    Potential semantic match — requires human review
                  </p>
                  <h3 id={`review-lead-title-${index}`}>
                    {result.sources.find((s) => s.reference === lead.sourceReference)?.title ??
                      'Possible source'}
                  </h3>
                  <p>
                    MiniLM context similarity <strong>{lead.semantic.toFixed(3)}</strong>
                  </p>
                  <dl>
                    <div>
                      <dt>Document characters</dt>
                      <dd>
                        {lead.suspiciousSpan.offset}–
                        {lead.suspiciousSpan.offset + lead.suspiciousSpan.length}
                        {lead.suspiciousPage ? ` (Page ${lead.suspiciousPage})` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Source characters</dt>
                      <dd>
                        {lead.sourceSpan.offset}–{lead.sourceSpan.offset + lead.sourceSpan.length}
                        {lead.sourcePage ? ` (Page ${lead.sourcePage})` : ''}
                      </dd>
                    </div>
                  </dl>
                </div>
                <a
                  className="secondary-button"
                  href="#evidence-comparison"
                  onClick={() => setActive(-index - 1)}
                >
                  Inspect evidence ↓
                </a>
              </article>
            ))}
            {result.detections.length > 0 && (
              <div className="match-list" role="list" aria-label="Matching passages">
                <h2>
                  Confirmed similarity alerts · {METHODS.find((m) => m.id === result.method)?.name}
                </h2>
                {result.detections.map((d, i) => {
                  const page = getQueryPage(result.query.pages, d.suspiciousSpan.offset);
                  const src = result.sources.find((s) => s.reference === d.sourceReference);
                  const excerpt = result.query.text
                    .slice(
                      d.suspiciousSpan.offset,
                      d.suspiciousSpan.offset + Math.min(d.suspiciousSpan.length, 120),
                    )
                    .trim();
                  return (
                    <button
                      type="button"
                      className={`match-card ${active === i ? 'active' : ''}`}
                      key={`detection-${i}-${d.sourceReference}-${d.suspiciousSpan.offset}-${d.sourceSpan.offset}`}
                      aria-pressed={active === i}
                      onClick={() => setActive(i)}
                    >
                      <span className="match-number">{String(i + 1).padStart(2, '0')}</span>
                      <span className="match-description">
                        <strong>{src?.title ?? d.sourceReference}</strong>
                        <span>
                          Query characters {d.suspiciousSpan.offset}–
                          {d.suspiciousSpan.offset + d.suspiciousSpan.length}
                          {page ? ` (Page ${page})` : ''} · {d.evidenceWindows} evidence window
                          {d.evidenceWindows === 1 ? '' : 's'}
                        </span>
                        <span>
                          Source characters {d.sourceSpan.offset}–
                          {d.sourceSpan.offset + d.sourceSpan.length}
                          {d.sourcePage ? ` (Page ${d.sourcePage})` : ''}
                        </span>
                        <span className="match-scores-sub">
                          Lexical: <b>{d.lexical.toFixed(3)}</b> · Semantic:{' '}
                          <b>{d.semantic !== null ? d.semantic.toFixed(3) : 'Not computed'}</b>
                        </span>
                        {excerpt && (
                          <span className="match-passage-excerpt">
                            &ldquo;{excerpt}
                            {d.suspiciousSpan.length > 120 ? '…' : ''}&rdquo;
                          </span>
                        )}
                      </span>
                      <span className="score">
                        {d.score.toFixed(3)}
                        <small>SIMILARITY</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {chosen && (
              <div className="evidence-stats">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={reviewingLead ? active === -1 : active === 0}
                  onClick={() => setActive(reviewingLead ? active + 1 : active - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    reviewingLead
                      ? -active >= result.semanticReviewLeads.length
                      : active + 1 >= result.detections.length
                  }
                  onClick={() => setActive(reviewingLead ? active - 1 : active + 1)}
                >
                  Next
                </button>
                {pdfLinks.query && (
                  <a
                    href={
                      pdfLinks.query +
                      '#page=' +
                      (getQueryPage(result.query.pages, chosen.suspiciousSpan.offset) ?? 1)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open query PDF page
                  </a>
                )}
                {pdfLinks[chosen.sourceReference] && (
                  <a
                    href={pdfLinks[chosen.sourceReference] + '#page=' + (chosen.sourcePage ?? 1)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open source PDF page
                  </a>
                )}
                <span>
                  Source paper <b>{selectedSource?.title ?? chosen.sourceReference}</b>
                </span>
                <span>
                  Lexical similarity <b>{chosen.lexical.toFixed(3)}</b>
                </span>
                <span>
                  Semantic similarity{' '}
                  <b>{chosen.semantic !== null ? chosen.semantic.toFixed(3) : 'Not computed'}</b>
                </span>
                {!reviewingLead && (
                  <>
                    <span>
                      Combined similarity <b>{chosen.score.toFixed(3)}</b>
                    </span>
                    <span>
                      Applied threshold <b>{result.config.threshold.toFixed(2)}</b>
                    </span>
                  </>
                )}
                <span>
                  Query characters{' '}
                  <b>
                    {chosen.suspiciousSpan.offset}–
                    {chosen.suspiciousSpan.offset + chosen.suspiciousSpan.length}
                    {(() => {
                      const page = getQueryPage(result.query.pages, chosen.suspiciousSpan.offset);
                      return page ? ` (Page ${page})` : '';
                    })()}
                  </b>
                </span>
                <span>
                  Source characters{' '}
                  <b>
                    {chosen.sourceSpan.offset}–{chosen.sourceSpan.offset + chosen.sourceSpan.length}
                    {chosen.sourcePage ? ` (Page ${chosen.sourcePage})` : ''}
                  </b>
                </span>
                <span>
                  Similarity scores are uncalibrated evidence for human review, not probabilities or
                  proof of plagiarism or misconduct.
                </span>
              </div>
            )}
            {chosen && (
              <div className="excerpt-comparison-wrapper">
                <div className="excerpt-comparison-title">
                  Passage Excerpts ·{' '}
                  {reviewingLead ? `Review lead #${-active}` : `Detection #${active + 1}`}
                </div>
                <div className="excerpt-comparison-grid">
                  <div className="excerpt-block">
                    <div className="excerpt-block-header">
                      <span>Document under review (query): {result.query.title}</span>
                      <span className="excerpt-block-meta">
                        Chars {chosen.suspiciousSpan.offset}–
                        {chosen.suspiciousSpan.offset + chosen.suspiciousSpan.length}
                        {(() => {
                          const page = getQueryPage(
                            result.query.pages,
                            chosen.suspiciousSpan.offset,
                          );
                          return page ? ` · Page ${page}` : '';
                        })()}
                      </span>
                    </div>
                    <p className="excerpt-block-text">
                      {result.query.text.slice(
                        chosen.suspiciousSpan.offset,
                        chosen.suspiciousSpan.offset + chosen.suspiciousSpan.length,
                      )}
                    </p>
                  </div>
                  <div className="excerpt-block">
                    <div className="excerpt-block-header">
                      <span>
                        Possible source (original):{' '}
                        {selectedSource?.title ?? chosen.sourceReference}
                      </span>
                      <span className="excerpt-block-meta">
                        Chars {chosen.sourceSpan.offset}–
                        {chosen.sourceSpan.offset + chosen.sourceSpan.length}
                        {chosen.sourcePage ? ` · Page ${chosen.sourcePage}` : ''}
                      </span>
                    </div>
                    <p className="excerpt-block-text">
                      {selectedSource?.text.slice(
                        chosen.sourceSpan.offset,
                        chosen.sourceSpan.offset + chosen.sourceSpan.length,
                      ) ?? 'Source text not available'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="comparison-grid" id="evidence-comparison">
              <article className="text-panel">
                <div className="text-panel-header">
                  <span>DOCUMENT UNDER REVIEW (QUERY)</span>
                  <h3>{result.query.title}</h3>
                  {chosen && (
                    <p className="panel-span-meta">
                      Characters {chosen.suspiciousSpan.offset}–
                      {chosen.suspiciousSpan.offset + chosen.suspiciousSpan.length}
                      {(() => {
                        const page = getQueryPage(result.query.pages, chosen.suspiciousSpan.offset);
                        return page ? ` (Page ${page})` : '';
                      })()}
                    </p>
                  )}
                </div>
                <pre
                  ref={queryPane}
                  tabIndex={0}
                  aria-label="Document text with suspicious passage highlighted"
                >
                  <HighlightedText
                    text={result.query.text}
                    span={
                      selectedSource && chosen?.suspiciousReference === result.query.reference
                        ? chosen.suspiciousSpan
                        : undefined
                    }
                    review={reviewingLead}
                  />
                </pre>
              </article>
              {selectedSource && (
                <article className="text-panel source-panel">
                  <div className="text-panel-header">
                    <span>POSSIBLE SOURCE (ORIGINAL)</span>
                    <h3>{selectedSource.title}</h3>
                    {chosen && (
                      <p className="panel-span-meta">
                        Characters {chosen.sourceSpan.offset}–
                        {chosen.sourceSpan.offset + chosen.sourceSpan.length}
                        {chosen.sourcePage ? ` (Page ${chosen.sourcePage})` : ''}
                      </p>
                    )}
                  </div>
                  <pre
                    ref={sourcePane}
                    tabIndex={0}
                    aria-label="Source text with matching passage highlighted"
                  >
                    <HighlightedText
                      text={selectedSource.text}
                      span={
                        chosen?.suspiciousReference === result.query.reference
                          ? chosen.sourceSpan
                          : undefined
                      }
                      review={reviewingLead}
                    />
                  </pre>
                </article>
              )}
            </div>
            <p className="small-copy">
              Character ranges refer to extracted text. PDF reading order can differ from page
              layout; highlights are shown in the extracted text, not overlaid on PDF pages. A
              merged highlight may contain gaps between evidence windows.
            </p>
          </section>
        )}
      </main>
      <footer>
        <span>Passage Review · General-purpose research paper plagiarism detection</span>
        <span>TF-IDF + MiniLM · Evidence for human review</span>
      </footer>
    </div>
  );
}
