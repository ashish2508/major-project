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
      <div class="pair">
        <section>
          <h4>Document under review (query): ${escape(r.query.title)}</h4>
          <pre>${escape(r.query.text.slice(q.offset, q.offset + q.length))}</pre>
        </section>
        <section>
          <h4>Possible source (original): ${escape(source?.title ?? item.sourceReference)}</h4>
          <pre>${escape(source?.text.slice(s.offset, s.offset + s.length))}</pre>
        </section>
      </div></article>`;
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

  const identifierSection = (r: AnalysisResult): string => {
    const sharedIds = r.sharedIdentifiers ?? [];
    if (sharedIds.length === 0) return '';
    const allMatches = sharedIds.flatMap((s) =>
      s.matches.map((m) => ({
        ...m,
        sourceReference: s.sourceReference,
      })),
    );
    if (allMatches.length === 0) return '';
    const rows = allMatches
      .map(
        (m) =>
          `<tr><td>${escape(m.type)}</td><td><code>${escape(m.value)}</code></td><td>${escape(m.sourceReference)}</td></tr>`,
      )
      .join('');
    return `<div class="shared-identifiers">
<h3>⚠ Shared identifiers</h3>
<p class="identifier-note">The following identifiers appear in both the document under review and the possible source(s). Shared registration numbers, DOIs, or trial IDs are strong but non-conclusive evidence of a common origin. They may reflect legitimate citation. Verify with publication records.</p>
<table>
<thead><tr><th>Type</th><th>Value</th><th>Found in source</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div>`;
  };

  const coverageSection = (r: AnalysisResult): string => {
    const c = r.coverage;
    if (!c) return '';
    const pct = (c.ratio * 100).toFixed(1);
    return `<p class="coverage-line"><strong>Query coverage:</strong> ${pct}% of eligible query characters are covered by similarity alerts (${c.coveredChars.toLocaleString()} / ${c.eligibleChars.toLocaleString()} eligible chars; ${c.totalChars.toLocaleString()} total).</p>`;
  };

  const configLine = (r: AnalysisResult): string => {
    const src = r.researchMode
      ? 'research-paper-parameters (document-local IDF)'
      : 'PAN frozen calibration';
    return `Config: ${escape(src)} · Threshold ${r.config.threshold} · Alpha ${r.config.alpha} · Merge gap ${r.config.mergeGap} · ${escape(r.provider)} · ${escape(r.model ?? 'TF-IDF')}`;
  };

  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Research paper analysis — document under review vs possible source</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px;color:#172a38}
    article{border:1px solid #ccd6df;padding:20px;margin:16px 0;break-inside:avoid}
    .pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}
    pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}
    h2{margin-top:40px}
    @media(max-width:650px){.pair{grid-template-columns:1fr}}
    details.suppressed-audit{margin:16px 0;padding:12px;border:1px solid #e0d4a0;background:#fffdf0;border-radius:4px}
    details.suppressed-audit summary{cursor:pointer;font-weight:600;color:#7a6a00}
    .suppressed-note{font-size:0.9em;color:#666;margin:8px 0}
    details table{width:100%;border-collapse:collapse;font-size:0.85em}
    details th,details td{text-align:left;padding:4px 8px;border-bottom:1px solid #e8e0c0}
    details th{background:#f5f0d8}
    .role-header{background:#f0f5fc;border:1px solid #b8ccdf;padding:12px 16px;border-radius:4px;margin-bottom:16px}
    .role-header .role-query{color:#0a3d6b;font-weight:700}
    .role-header .role-source{color:#0a5a2f;font-weight:700}
    .symmetry-note{font-size:0.9em;color:#555;font-style:italic;margin:4px 0 0}
    .coverage-line{background:#f5f9f5;border-left:3px solid #3a7a3a;padding:6px 10px;margin:8px 0;font-size:0.95em}
    .shared-identifiers{background:#fff8e6;border:1px solid #d4a800;padding:12px 16px;border-radius:4px;margin:16px 0}
    .shared-identifiers h3{margin:0 0 8px;color:#8a6000}
    .identifier-note{font-size:0.9em;color:#6a5000;margin:0 0 8px}
    .shared-identifiers table{width:100%;border-collapse:collapse;font-size:0.85em}
    .shared-identifiers th,.shared-identifiers td{text-align:left;padding:4px 8px;border-bottom:1px solid #e8d880}
    .shared-identifiers th{background:#fdf0b0}
    .config-line{font-size:0.85em;color:#555;margin:4px 0}
  </style>
  <h1>Research paper analysis</h1>
  <p class="config-line">Generated: ${escape(new Date().toISOString())} · Target: ${escape(target)}</p>
  <div class="role-header">
    <p><span class="role-query">Document under review (query):</span> ${escape(results[0]?.query.title ?? 'unknown')}</p>
    <p><span class="role-source">Possible source (original):</span> ${escape(results[0]?.sources.map((s) => s.title).join(', ') ?? 'unknown')}</p>
    <p class="symmetry-note">⚠ Matching is symmetric; direction of copying cannot be determined from similarity alone. Use publication dates and provenance to establish direction.</p>
  </div>
  <p>Algorithmic similarity requires human interpretation. It does not establish plagiarism. Review recommendations use uncalibrated context scores. PAN-PC-11 calibration uses book texts and does not establish research-paper accuracy. Only supplied sources were searched. PDF text reading order may differ from visual layout.</p>
  ${results
    .map(
      (r) => `<h2>${escape(r.method)}</h2>
  <p class="config-line">${configLine(r)}</p>
  <p>${r.passages.query} query passages · ${r.passages.sources} source passages · ${r.sources.length} sources · ${r.detections.length} similarity alerts · ${r.semanticReviewLeads.length} review recommendations · ${r.elapsedSeconds.toFixed(2)} seconds</p>
  ${coverageSection(r)}
  <p>Sources: ${r.sources.map((s) => `<em>${escape(s.title)}</em> (<code>${escape(s.reference)}</code>)`).join(', ')}</p>
  ${identifierSection(r)}
  <h3>Confirmed similarity alerts</h3>${evidence(r, r.detections) || '<p>None.</p>'}
  <h3>Potential semantic matches — require human review</h3>${evidence(r, r.semanticReviewLeads) || '<p>None.</p>'}
  ${suppressedSection(r)}`,
    )
    .join('')}</html>`;
}
