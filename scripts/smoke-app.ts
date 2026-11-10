import assert from 'node:assert/strict';
import type { AnalysisResult } from '../src/lib/application/analysis';
import { textPdf } from '../tests/pdf-fixture';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3000');
const signal = () => AbortSignal.timeout(60_000);
const home = await fetch(new URL('/', base), { signal: signal() });
assert.equal(home.status, 200);
assert.match(await home.text(), /Passage Review/);

const status = await fetch(new URL('/api/status', base), { signal: signal() });
assert.equal(status.status, 200, await status.clone().text());
const readiness = await status.json();
assert.equal(readiness.ready, true);
assert.equal(readiness.modelAvailable, true);

const passage = 'A researcher compares documents and reviews textual similarity.';
const pdf = textPdf(passage);
const endpoint = new URL('/api/analyze', base);
for (const method of ['lexical', 'semantic', 'hybrid'] as const) {
  const form = new FormData();
  form.set('method', method);
  if (method === 'semantic') form.set('queryFile', new File([pdf], 'submitted.pdf'));
  else form.set('queryText', passage);
  form.set('sourceFiles', new File([passage], 'possible-source.txt'));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Origin: base.origin },
    body: form,
    signal: signal(),
  });
  const body = await response.text();
  assert.equal(response.status, 200, body);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = JSON.parse(body) as AnalysisResult;
  assert.equal(result.method, method);
  assert.equal(result.sources[0]?.title, 'possible-source.txt');
  assert.equal(result.query.format, method === 'semantic' ? 'pdf' : 'text');
  if (method === 'semantic') assert.equal(result.query.pages?.[0]?.page, 1);
  const detection = result.detections[0];
  assert.ok(detection && detection.score > 0.99, `Expected exact match from ${method}`);
  const { offset, length } = detection.suspiciousSpan;
  assert.equal(result.query.text.slice(offset, offset + length).trim(), passage);
  assert.equal(detection.sourceReference, result.sources[0].reference);
  if (method === 'lexical') assert.equal(result.provider, 'TF-IDF on CPU');
  else if (process.env.MINILM_DEVICE === 'dml')
    assert.match(result.provider, /DmlExecutionProvider/);
  else assert.equal(result.provider, 'CPUExecutionProvider');
  console.log(`${method}: exact ${result.query.format} match, score ${detection.score.toFixed(3)}`);
}

const invalid = new FormData();
invalid.set('queryFile', new File(['invalid PDF'], 'invalid.pdf'));
invalid.set('sourceText', passage);
const rejected = await fetch(endpoint, {
  method: 'POST',
  headers: { Origin: base.origin },
  body: invalid,
  signal: signal(),
});
assert.equal(rejected.status, 400, await rejected.clone().text());
assert.match(await rejected.text(), /valid PDF signature/);
const crossOrigin = await fetch(endpoint, {
  method: 'POST',
  headers: { Origin: 'https://example.invalid' },
  body: invalid,
  signal: signal(),
});
assert.equal(crossOrigin.status, 403);
console.log('Home, readiness, three methods, invalid PDF, and cross-origin checks passed.');
