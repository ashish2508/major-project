import { expect, it } from 'vitest';
import { detect, type Candidate } from '../src/lib/detection/detector';
import { filterInformativeEvidence } from '../src/lib/detection/informative-evidence';

function candidate(query: string, source: string): Candidate {
  return {
    suspiciousReference: 'query',
    sourceReference: 'source',
    suspiciousSpan: { offset: 0, length: query.length },
    sourceSpan: { offset: 0, length: source.length },
    score: 0.9,
    lexical: 0.1,
    semantic: 0.9,
  };
}

it.each(['134. 135. 136.', 'IV.', '[17, 18]', 'Dear Mrs. Coney.', 'repeat repeat repeat'])(
  'rejects weak standalone evidence even with high scores (%s)',
  (text) => {
    const documents = new Map([
      ['query', text],
      ['source', text],
    ]);
    const detections = detect([candidate(text, text)], 0.7);
    expect(filterInformativeEvidence(detections, documents, 5)).toEqual([]);
    expect(filterInformativeEvidence(detections, documents, 0)).toBe(detections);
  },
);

it('requires sufficient evidence on both sides and preserves complete paraphrased spans', () => {
  const query = 'Replica lag triggers throttling during peak traffic.';
  const source = 'Heavy demand slows requests when followers fall behind.';
  const detections = detect([candidate(query, source)], 0.7);
  expect(
    filterInformativeEvidence(
      detections,
      new Map([
        ['query', query],
        ['source', source],
      ]),
      5,
    ),
  ).toEqual(detections);
  const short = 'Dear reader.';
  expect(
    filterInformativeEvidence(
      detect([candidate(query, short)], 0.7),
      new Map([
        ['query', query],
        ['source', short],
      ]),
      5,
    ),
  ).toEqual([]);
});

it('allows adjacent short windows to contribute to a longer copy', () => {
  const first = 'Replicas apply writes.';
  const second = ' Followers report lag.';
  const text = first + second;
  const tail = candidate(second, second);
  tail.suspiciousSpan.offset = first.length;
  tail.sourceSpan.offset = first.length;
  const detections = detect([candidate(first, first), tail], 0.7, 0, true);
  expect(
    filterInformativeEvidence(
      detections,
      new Map([
        ['query', text],
        ['source', text],
      ]),
      5,
    ),
  ).toEqual(detections);
  expect(detections).toHaveLength(1);
  expect(detections[0].suspiciousSpan).toEqual({ offset: 0, length: text.length });
});
