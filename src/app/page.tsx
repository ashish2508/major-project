'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AnalysisResult } from '@/lib/application/analysis';
import type { Method, DetectionConfig } from '@/lib/detection/detector';
const METHODS: { id: Method; name: string; description: string }[] = [
  { id: 'lexical', name: 'TF-IDF', description: 'Shared wording' },
  { id: 'semantic', name: 'MiniLM', description: 'Semantic similarity' },
  { id: 'hybrid', name: 'Hybrid', description: 'Validation-selected blend' },
];
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
}: {
  text: string;
  span?: { offset: number; length: number };
}) {
  if (!span) return <>{text}</>;
  return (
    <>
      {text.slice(0, span.offset)}
      <mark tabIndex={-1} data-highlight="true">
        {text.slice(span.offset, span.offset + span.length)}
      </mark>
      {text.slice(span.offset + span.length)}
    </>
  );
}
export default function Home() {
  const [method, setMethod] = useState<Method>('hybrid'),
    [queryText, setQueryText] = useState(''),
    [sourceText, setSourceText] = useState('');
  const [queryFile, setQueryFile] = useState<File | null>(null),
    [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<AnalysisResult | null>(null),
    [active, setActive] = useState(0),
    [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<{
    ready: boolean;
    modelAvailable: boolean;
    configs?: Record<Method, DetectionConfig>;
    error?: string;
  } | null>(null);
  const resultsRef = useRef<HTMLElement>(null),
    queryPane = useRef<HTMLPreElement>(null),
    sourcePane = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!result) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultsRef.current?.scrollIntoView({
      behavior: reducedMotion ? 'instant' : 'smooth',
      block: 'start',
    });
  }, [result]);
  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() =>
        setStatus({ ready: false, modelAvailable: false, error: 'Local service is unavailable.' }),
      );
  }, []);
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
  const chosen = result?.detections[active],
    selectedSource =
      result?.sources.find((s) => s.reference === chosen?.sourceReference) ?? result?.sources[0];
  const config = status?.configs?.[method];
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    setElapsed(0);
    setResult(null);
    const data = new FormData();
    data.set('method', method);
    data.set('queryText', queryText);
    data.set('sourceText', sourceText);
    if (queryFile) data.set('queryFile', queryFile);
    for (const file of sourceFiles) data.append('sourceFiles', file);
    try {
      const response = await fetch('/api/analyze', { method: 'POST', body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Analysis failed');
      setResult(body);
      setActive(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to analyze these documents');
    } finally {
      setBusy(false);
    }
  }
  function example() {
    setQueryFile(null);
    setSourceFiles([]);
    setQueryText(
      'Researchers compare documents to identify passages with similar wording. The resulting evidence requires careful human review before any conclusion is reached.',
    );
    setSourceText(
      'Researchers compare documents to identify passages with similar wording. The resulting evidence requires careful human review before any conclusion is reached. The method searches only the source documents supplied by the user.',
    );
    setResult(null);
    setError('');
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'passage-review.json';
    anchor.click();
    URL.revokeObjectURL(url);
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
          <p className="eyebrow">TEXTUAL SIMILARITY · HUMAN REVIEW</p>
          <h1>
            Follow the passage.
            <br />
            <span>Examine the evidence.</span>
          </h1>
          <p className="intro-copy">
            Compare a document with possible sources using shared wording, semantic similarity, or a
            validation-selected combination. Your documents stay in this local application.
          </p>
        </section>
        <div className="review-layout">
          <form onSubmit={submit} className="workspace" aria-label="Document comparison">
            <fieldset disabled={busy} className="form-fieldset">
              <div className="section-heading">
                <span className="step">01</span>
                <div>
                  <h2>Choose a method</h2>
                  <p>Three approaches. The same evidence standard.</p>
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
                  <h2>Add your documents</h2>
                  <p>Paste text or upload a text-based PDF / UTF-8 TXT.</p>
                </div>
                <button className="text-button" type="button" onClick={example}>
                  Try an example ↗
                </button>
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
                    maxLength={50000}
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
                      : `${queryText.length.toLocaleString()} / 50,000 characters`}
                  </p>
                </section>
                <section className="input-panel">
                  <label htmlFor="source-text" className="input-title">
                    Possible original sources<span>UP TO SIX SOURCES</span>
                  </label>
                  <textarea
                    id="source-text"
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    maxLength={50000}
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
                    5 MB per file · 50,000 extracted characters per document
                  </p>
                </section>
              </div>
              <div className="submit-row">
                <p>
                  Searches only the sources you provide.
                  <br />
                  English text · 200,000 combined character limit.
                </p>
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    status?.ready === false ||
                    (!queryText.trim() && !queryFile) ||
                    (!sourceText.trim() && !sourceFiles.length)
                  }
                  type="submit"
                >
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
                Comparing passages locally · {elapsed}s elapsed. Model loading and longer documents
                can take a little time.
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
                A weighted score selected using validation data. It may reduce to a single baseline.
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
        {result && (
          <section
            className="results-section"
            ref={resultsRef}
            aria-label="Analysis results"
            aria-live="polite"
          >
            <div
              className={`result-heading result-banner ${result.detections.length ? 'result-positive' : 'result-neutral'}`}
            >
              <div>
                <p className="eyebrow">REVIEW THE EVIDENCE</p>
                <h2>
                  {result.detections.length
                    ? 'Potential textual similarity detected'
                    : 'No matching passages found above the selected threshold.'}
                </h2>
                <p>
                  {result.detections.length
                    ? 'Matching passages were identified. Review the highlighted evidence and possible source before drawing conclusions.'
                    : 'This does not establish originality. Other sources or paraphrases may have been missed.'}
                </p>
                <dl className="result-metrics">
                  <div>
                    <dt>Candidate passages</dt>
                    <dd>{result.detections.length}</dd>
                  </div>
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
                  <div>
                    <dt>Processing time</dt>
                    <dd>{result.elapsedSeconds.toFixed(2)} s</dd>
                  </div>
                </dl>
              </div>
              <button type="button" className="secondary-button" onClick={download}>
                Export evidence ↓
              </button>
            </div>
            <p className="evidence-warning">Similarity is not proof of misconduct.</p>
            {result.detections.length > 0 && (
              <div className="match-list" role="list" aria-label="Matching passages">
                {result.detections.map((d, i) => (
                  <button
                    type="button"
                    className={`match-card ${active === i ? 'active' : ''}`}
                    key={`${d.sourceReference}-${d.suspiciousSpan.offset}`}
                    aria-pressed={active === i}
                    onClick={() => setActive(i)}
                  >
                    <span className="match-number">{String(i + 1).padStart(2, '0')}</span>
                    <span className="match-description">
                      <strong>
                        {result.sources.find((s) => s.reference === d.sourceReference)?.title}
                      </strong>
                      <span>
                        Query characters {d.suspiciousSpan.offset}–
                        {d.suspiciousSpan.offset + d.suspiciousSpan.length} · {d.evidenceWindows}{' '}
                        evidence window{d.evidenceWindows === 1 ? '' : 's'}
                      </span>
                      <span>
                        Source characters {d.sourceSpan.offset}–
                        {d.sourceSpan.offset + d.sourceSpan.length}
                      </span>
                    </span>
                    <span className="score">
                      {d.score.toFixed(3)}
                      <small>SIMILARITY</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {chosen && (
              <div className="evidence-stats">
                <span>
                  Lexical cosine <b>{chosen.lexical.toFixed(3)}</b>
                </span>
                <span>
                  Semantic cosine{' '}
                  <b>{chosen.semantic === null ? 'Not computed' : chosen.semantic.toFixed(3)}</b>
                </span>
                <span>
                  Applied threshold <b>{result.config.threshold.toFixed(2)}</b>
                </span>
                <span>Scores are not confidence probabilities.</span>
              </div>
            )}
            <div className="comparison-grid">
              <article className="text-panel">
                <div className="text-panel-header">
                  <span>DOCUMENT TO REVIEW</span>
                  <h3>{result.query.title}</h3>
                </div>
                <pre
                  ref={queryPane}
                  tabIndex={0}
                  aria-label="Document text with suspicious passage highlighted"
                >
                  <HighlightedText text={result.query.text} span={chosen?.suspiciousSpan} />
                </pre>
              </article>
              {selectedSource && (
                <article className="text-panel source-panel">
                  <div className="text-panel-header">
                    <span>POSSIBLE SOURCE</span>
                    <h3>{selectedSource.title}</h3>
                  </div>
                  <pre
                    ref={sourcePane}
                    tabIndex={0}
                    aria-label="Source text with matching passage highlighted"
                  >
                    <HighlightedText text={selectedSource.text} span={chosen?.sourceSpan} />
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
        <span>Passage Review · Local research prototype</span>
        <span>TF-IDF + MiniLM · Evidence for human review</span>
      </footer>
    </div>
  );
}
