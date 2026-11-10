import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AnalysisResult } from '../src/lib/application/analysis';

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

const [pdf, source] = await Promise.all([
  readFile('demo/submitted.pdf'),
  readFile('demo/possible-source.txt', 'utf8'),
]);
const passage = source.trim();
const endpoint = new URL('/api/analyze', base);
for (const method of ['lexical', 'semantic', 'hybrid'] as const) {
  const form = new FormData();
  form.set('method', method);
  if (method === 'semantic') form.set('queryFile', new File([pdf], 'submitted.pdf'));
  else form.set('queryText', passage);
  form.set('sourceFiles', new File([source], 'possible-source.txt'));
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
  assert.equal(result.provider, method === 'lexical' ? 'TF-IDF on CPU' : 'CPUExecutionProvider');
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
