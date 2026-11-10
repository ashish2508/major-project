import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getArtifacts } from '../src/lib/application/analysis';
import { retrieveCandidates } from '../src/lib/detection/detector';
import { segmentParagraphs } from '../src/lib/detection/segmentation';
import { extractFile } from '../src/lib/documents/extract';
import { embedTexts, tokenCounter } from '../src/lib/embeddings/model';
import { overlaps } from '../src/lib/evaluation/pan';

it('preserves short input and splits long sentences without dropping punctuation or content', () => {
  expect(segmentParagraphs('Brief observation', 'short')[0].text).toBe('Brief observation');
  const text = 'Version 1.2 remained stable. ' + 'Additional measurement '.repeat(100) + 'ended.';
  const spans = segmentParagraphs(text, 'long', {
    words: 25,
    overlap: 5,
    maxTokens: 12,
    countTokens: (value) => value.split(/\s+/).length,
  });
  expect(spans[0].text).toContain('Version 1.2');
  expect(spans.at(-1)?.text).toContain('ended.');
  for (const span of spans) {
    expect(span.text).toBe(text.slice(span.offset, span.offset + span.length));
    expect(span.text.split(/\s+/).length).toBeLessThanOrEqual(12);
  }
});

it.skipIf(process.env.INFERENCE_TESTS !== '1')(
  'retrieves the annotated source without crossing the adjacent section',
  async () => {
    const manifest = JSON.parse(await readFile('demo/ground-truth.json', 'utf8'));
    const item = manifest.cases.find((entry: { kind: string }) => entry.kind === 'paraphrase');
    const expected = item.matches.find(
      (entry: { source: { section: string } }) => entry.source.section === 'Evaluation cohorts',
    );
    const load = async (name: string, reference: string) =>
      extractFile(new File([await readFile(`demo/${name}`)], name), reference);
    const [query, source] = await Promise.all([
      load(item.suspiciousFile, 'query'),
      load(item.sourceFile, 'source-1'),
    ]);
    const countTokens = await tokenCounter();
    const queries = segmentParagraphs(
      query.text,
      query.reference,
      { countTokens },
      query.paragraphBreaks,
    );
    const sources = segmentParagraphs(
      source.text,
      source.reference,
      { countTokens },
      source.paragraphBreaks,
    );
    const vectors = await embedTexts([...queries, ...sources].map(({ text }) => text));
    const { tfidf } = await getArtifacts();
    const { semantic } = retrieveCandidates(
      queries,
      sources,
      tfidf,
      vectors.slice(0, queries.length),
      vectors.slice(queries.length),
    );
    const aligned = semantic.find((candidate) =>
      overlaps(candidate, {
        suspiciousReference: 'query',
        sourceReference: 'source-1',
        suspiciousSpan: expected.suspicious,
        sourceSpan: expected.source,
      }),
    );
    expect(aligned).toBeDefined();
    const { offset, length } = aligned!.sourceSpan;
    expect(offset).toBeGreaterThanOrEqual(expected.source.offset);
    expect(offset + length).toBeLessThanOrEqual(expected.source.offset + expected.source.length);
    expect(expected.source.excerpt).toContain(source.text.slice(offset, offset + length));
  },
);
