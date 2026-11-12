'use client';

import { useState, useRef } from 'react';
import type { CorpusDocumentMetadata, CorpusStats } from '@/lib/corpus/types';
import ResetCorpusButton from './ResetCorpusButton';

interface CorpusManagerProps {
  corpusDocs: CorpusDocumentMetadata[];
  corpusStats: CorpusStats | null;
  corpusLoading: boolean;
  busy: boolean;
  resetBusy: boolean;
  ingestBusy: boolean;
  ingestMessage: string | null;
  ingestError: string | null;
  onIngest: (files: File[]) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onReset: () => void;
}

export default function CorpusManager({
  corpusDocs,
  corpusStats,
  corpusLoading,
  busy,
  resetBusy,
  ingestBusy,
  ingestMessage,
  ingestError,
  onIngest,
  onDelete,
  onRetry,
  onReset,
}: CorpusManagerProps) {
  const [ingestFiles, setIngestFiles] = useState<File[]>([]);
  const corpusFileInputRef = useRef<HTMLInputElement>(null);

  function handleIngest(event: React.FormEvent) {
    event.preventDefault();
    onIngest(ingestFiles);
    setIngestFiles([]);
    if (corpusFileInputRef.current) corpusFileInputRef.current.value = '';
  }

  return (
    <div className="corpus-manager-panel">
      <div className="section-heading corpus-heading">
        <div>
          <h2>Corpus Management</h2>
          <p>
            Import arbitrary research papers (PDF or UTF-8 TXT). Documents are extracted,
            reference-stripped, segmented into passages, and indexed with persistent lexical and
            semantic embeddings.
          </p>
        </div>
        <ResetCorpusButton disabled={busy || ingestBusy} busy={resetBusy} onReset={onReset} />
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
            Upload your research papers above to create a searchable index for lexical, semantic,
            and hybrid plagiarism analysis.
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
                          onClick={() => onRetry(doc.id)}
                        >
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        className="corpus-btn-sm danger"
                        onClick={() => onDelete(doc.id)}
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
  );
}
