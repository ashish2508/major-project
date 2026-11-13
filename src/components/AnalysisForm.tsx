'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import type { CorpusStats } from '@/lib/corpus/types';
import type { Method, DetectionConfig } from '@/lib/detection/detector';
import researchPaperParameters from '../../research-paper-parameters.json';
import ResetCorpusButton from './ResetCorpusButton';

const METHODS: { id: Method; name: string; description: string }[] = [
  { id: 'lexical', name: 'TF-IDF', description: 'Shared wording' },
  { id: 'semantic', name: 'MiniLM', description: 'Semantic similarity' },
  { id: 'hybrid', name: 'Hybrid', description: 'Validation-selected blend' },
];

interface AnalysisFormProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  corpusStats: CorpusStats | null;
  busy: boolean;
  resetBusy: boolean;
  error: string;
  status: {
    ready: boolean;
    modelAvailable: boolean;
    configs?: Record<Method, DetectionConfig>;
    error?: string;
  } | null;
  onCorpusReset: () => void;
  onTabChange: (tab: 'analyze' | 'corpus') => void;
}

export default function AnalysisForm({
  onSubmit,
  corpusStats,
  busy,
  resetBusy,
  error,
  status,
  onCorpusReset,
  onTabChange,
}: AnalysisFormProps) {
  const [method, setMethod] = useState<Method>('hybrid');
  const [compareTarget, setCompareTarget] = useState<'corpus' | 'manual'>('corpus');

  const config =
    compareTarget === 'corpus'
      ? status?.configs?.[method]
      : researchPaperParameters.methods[method];

  return (
    <form onSubmit={onSubmit} className="workspace" aria-label="Document comparison">
      <input type="hidden" name="useCorpus" value={compareTarget === 'corpus' ? 'true' : 'false'} />
      <fieldset disabled={busy || resetBusy} className="form-fieldset">
        <div className="section-heading">
          <span className="step">01</span>
          <div>
            <h2>Choose the initial results view</h2>
            <p>Each analysis runs all three methods. Choose which results to inspect first.</p>
          </div>
        </div>
        <div className="method-options" role="radiogroup" aria-label="Detection method">
          {METHODS.map((m) => (
            <label className={`method-option ${method === m.id ? 'selected' : ''}`} key={m.id}>
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
        {config && (
          <p className="calibration-note">
            Validation-selected threshold: <b>{config.threshold.toFixed(2)}</b>
            {method === 'hybrid' && (
              <>
                {' '}
                · lexical weight α = <b>{config.alpha.toFixed(2)}</b>
                {(config.alpha === 1 || config.alpha === 0) && (
                  <>
                    . This selection reduces to the {config.alpha === 1 ? 'lexical' : 'semantic'}{' '}
                    baseline.
                  </>
                )}
              </>
            )}
          </p>
        )}

        <div className="section-heading document-heading">
          <span className="step">02</span>
          <div>
            <h2>Target & Documents</h2>
            <p>Search against your persistent corpus or provide specific sources.</p>
          </div>
          <ResetCorpusButton disabled={busy} busy={resetBusy} onReset={onCorpusReset} />
        </div>

        {/* Target Selection: Corpus vs. Manual Sources */}
        <div className="corpus-target-wrapper">
          <div className="corpus-target-selector">
            <label className={`corpus-target-card ${compareTarget === 'corpus' ? 'selected' : ''}`}>
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
                  <span className="nav-tab-badge">{corpusStats?.readyDocuments ?? 0} papers</span>
                </span>
                <span className="corpus-target-hint">
                  Query against your persistent indexed collection of research papers (
                  {(corpusStats?.totalPassages ?? 0).toLocaleString()} passages).
                </span>
              </div>
            </label>

            <label className={`corpus-target-card ${compareTarget === 'manual' ? 'selected' : ''}`}>
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
                  Compare directly against up to six specific source documents or pasted text.
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
              name="queryText"
              disabled={false}
              maxLength={250000}
              placeholder="Paste the passage or document you want to review…"
            />
            <label className="file-label" htmlFor="query-file">
              <span>↑ Upload document</span>
              <span>PDF / TXT</span>
            </label>
            <input
              id="query-file"
              name="queryFile"
              className="file-input"
              type="file"
              accept=".pdf,.txt"
            />
            <p className="field-hint">Paste or upload a document to review for similarity</p>
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
                  Searching across {corpusStats?.readyDocuments ?? 0} indexed research paper(s)
                </p>
                <p className="corpus-active-desc">
                  Query passages are matched against{' '}
                  {(corpusStats?.totalPassages ?? 0).toLocaleString()} pre-indexed passages using
                  persistent lexical and semantic indexes.
                </p>
                {(corpusStats?.readyDocuments ?? 0) === 0 && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onTabChange('corpus')}
                  >
                    + Import papers into your corpus
                  </button>
                )}
              </div>
            ) : (
              <>
                <textarea
                  id="source-text"
                  name="sourceText"
                  maxLength={250000}
                  placeholder="Paste one possible source, or upload source documents below…"
                />
                <label className="file-label" htmlFor="source-files">
                  <span>↑ Upload sources</span>
                  <span>PDF / TXT · MULTIPLE</span>
                </label>
                <input
                  id="source-files"
                  name="sourceFiles"
                  className="file-input"
                  type="file"
                  accept=".pdf,.txt"
                  multiple
                />
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
          <button className="primary-button" type="submit">
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
          MiniLM weights are missing. Run <code>bun run setup:model</code> before using semantic or
          hybrid analysis.
        </p>
      )}
    </form>
  );
}
