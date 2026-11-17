'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '@/lib/application/analysis';
import { analysisReport } from '@/lib/application/report';
import type { Method } from '@/lib/detection/detector';

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

function getQueryPage(
  pages?: { page: number; start: number; end: number }[],
  offset?: number,
): number | null {
  if (!pages || offset === undefined) return null;
  const p = pages.find((page) => offset >= page.start && offset < page.end);
  return p ? p.page : null;
}

interface ResultsViewProps {
  result: AnalysisResult;
  analyses: AnalysisResult[];
  analysisTarget: string;
  pdfLinks: Record<string, string>;
  onMethodChange: (method: Method) => void;
  onActiveChange: (index: number) => void;
  active: number;
}

export default function ResultsView({
  result,
  analyses,
  analysisTarget,
  pdfLinks,
  onMethodChange,
  onActiveChange,
  active,
}: ResultsViewProps) {
  const resultsRef = useRef<HTMLElement>(null);
  const queryPane = useRef<HTMLPreElement>(null);
  const sourcePane = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultsRef.current?.scrollIntoView({
      behavior: reducedMotion ? 'instant' : 'smooth',
      block: 'start',
    });
  }, [result]);

  useEffect(() => {
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
  const analysisDuration = analyses.length
    ? Math.max(...analyses.map((analysis) => analysis.elapsedSeconds))
    : result.elapsedSeconds;

  function download() {
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
    <section
      className="results-section"
      ref={resultsRef}
      aria-label="Analysis results"
      aria-live="polite"
    >
      <h2>Analysis summary</h2>
      <p>Analysis took {analysisDuration.toFixed(2)} seconds.</p>
      <div className="method-options" aria-label="Results by detection method">
        {analyses.map((analysis) => (
          <button
            key={analysis.method}
            type="button"
            className="secondary-button"
            aria-pressed={analysis.method === result.method}
            onClick={() => {
              onMethodChange(analysis.method);
              onActiveChange(
                analysis.detections.length === 0 && analysis.semanticReviewLeads.length > 0
                  ? -1
                  : 0,
              );
            }}
          >
            {METHODS.find((m) => m.id === analysis.method)?.name} · {analysis.detections.length}{' '}
            similarity alerts · {analysis.semanticReviewLeads.length} review recommendations
            {analysis.coverage ? ` · ${(analysis.coverage.ratio * 100).toFixed(1)}% coverage` : ''}
          </button>
        ))}
      </div>
      <div
        className={`result-heading result-banner ${
          result.detections.length > 0
            ? 'result-alert'
            : result.semanticReviewLeads.length > 0
              ? 'result-review'
              : 'result-clear'
        }`}
      >
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
                    score={result.detections.reduce((max, match) => Math.max(max, match.score), 0)}
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
      {result.semanticReviewLeads.map((lead, index) => (
        <article
          className="review-lead"
          key={`lead-${lead.sourceReference}-${lead.suspiciousSpan.offset}-${lead.sourceSpan.offset}`}
          aria-labelledby={`review-lead-title-${index}`}
        >
          <div>
            <p className="review-lead-label">Potential semantic match — requires human review</p>
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
            onClick={() => onActiveChange(-index - 1)}
          >
            Inspect evidence ↓
          </a>
        </article>
      ))}
      {result.detections.length > 0 && (
        <div className="match-list" role="list" aria-label="Matching passages">
          <h2>{METHODS.find((m) => m.id === result.method)?.name} similarity alerts</h2>
        </div>
      )}
      {chosen && (
        <div className="evidence-stats">
          {pdfLinks.query && (
            <a
              href={
                pdfLinks.query +
                '#page=' +
                (getQueryPage(result.query.pages, chosen.suspiciousSpan.offset) ?? 1)
              }
              target="_blank"
              rel="noreferrer"
              id="open-query"
            >
              Open query PDF page
            </a>
          )}
          {pdfLinks[chosen.sourceReference] && (
            <a
              href={pdfLinks[chosen.sourceReference] + '#page=' + (chosen.sourcePage ?? 1)}
              target="_blank"
              rel="noreferrer"
              id="open-source"
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
                    const page = getQueryPage(result.query.pages, chosen.suspiciousSpan.offset);
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
                  Possible source (original): {selectedSource?.title ?? chosen.sourceReference}
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
    </section>
  );
}
