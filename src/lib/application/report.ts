import type { AnalysisResult } from './analysis';

export function analysisReport(results: AnalysisResult[], target: string): string {
  const escape = (value: unknown) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  const evidence = (
    r: AnalysisResult,
    items: Array<
      AnalysisResult['semanticReviewLeads'][number] | AnalysisResult['detections'][number]
    >,
  ) =>
    items
      .map((item) => {
        const source = r.sources.find((s) => s.reference === item.sourceReference);
        const q = item.suspiciousSpan,
          s = item.sourceSpan;
        return `<article><h3>${escape(source?.title ?? item.sourceReference)}</h3>
      <p>Score ${item.score.toFixed(3)} · Query page ${item.suspiciousPage ?? 'unavailable'} · Source page ${item.sourcePage ?? 'unavailable'}</p>
      <p>Query characters [${q.offset}, ${q.offset + q.length}) · Source characters [${s.offset}, ${s.offset + s.length})</p>
      <div class="pair"><section><h4>${escape(r.query.title)}</h4><pre>${escape(r.query.text.slice(q.offset, q.offset + q.length))}</pre></section>
      <section><h4>${escape(source?.title)}</h4><pre>${escape(source?.text.slice(s.offset, s.offset + s.length))}</pre></section></div></article>`;
      })
      .join('');

  const suppressedSection = (r: AnalysisResult): string => {
    const items = r.suppressedItems ?? [];
    if (items.length === 0) return '';
    const rows = items
      .map(
        (item) =>
          `<tr><td>${escape(item.name)}</td><td><code>${escape(item.matchedText.slice(0, 100))}</code></td><td>${escape(item.reason)}</td></tr>`,
      )
      .join('');
    return `<details class="suppressed-audit">
<summary>Suppressed (boilerplate/section filter) — ${items.length} item(s)</summary>
<p class="suppressed-note">Suppressed items are shown here for audit. They were removed from the main analysis to reduce false positives.</p>
<table>
<thead><tr><th>Name</th><th>Matched text (truncated)</th><th>Reason</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</details>`;
  };

  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Research paper analysis</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px;color:#172a38}article{border:1px solid #ccd6df;padding:20px;margin:16px 0;break-inside:avoid}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}h2{margin-top:40px}@media(max-width:650px){.pair{grid-template-columns:1fr}}details.suppressed-audit{margin:16px 0;padding:12px;border:1px solid #e0d4a0;background:#fffdf0;border-radius:4px}details.suppressed-audit summary{cursor:pointer;font-weight:600;color:#7a6a00}.suppressed-note{font-size:0.9em;color:#666;margin:8px 0}details table{width:100%;border-collapse:collapse;font-size:0.85em}details th,details td{text-align:left;padding:4px 8px;border-bottom:1px solid #e8e0c0}details th{background:#f5f0d8}</style>
  <h1>Research paper analysis</h1><p>${escape(results[0]?.query.title)} · ${escape(target)} · ${escape(new Date().toISOString())}</p>
  <p>Algorithmic similarity requires human interpretation. It does not establish plagiarism. Review recommendations use uncalibrated context scores. PAN-PC-11 calibration uses book texts and does not establish research-paper accuracy. Only supplied sources were searched. PDF text reading order may differ from visual layout.</p>
  ${results
    .map(
      (
        r,
      ) => `<h2>${escape(r.method)}</h2><p>${r.passages.query} query passages · ${r.passages.sources} source passages · ${r.sources.length} sources · ${r.detections.length} similarity alerts · ${r.semanticReviewLeads.length} review recommendations · ${r.elapsedSeconds.toFixed(2)} seconds</p>
  <p>Threshold ${r.config.threshold} · Alpha ${r.config.alpha} · Merge gap ${r.config.mergeGap} · ${escape(r.provider)} · ${escape(r.model ?? 'TF-IDF')}</p>
  <p>Sources: ${r.sources.map((s) => escape(s.title) + ' (' + escape(s.reference) + ')').join(', ')}</p>
  <h3>Confirmed similarity alerts</h3>${evidence(r, r.detections) || '<p>None.</p>'}
  <h3>Potential semantic matches — require human review</h3>${evidence(r, r.semanticReviewLeads) || '<p>None.</p>'}
  ${suppressedSection(r)}`,
    )
    .join('')}</html>`;
}
