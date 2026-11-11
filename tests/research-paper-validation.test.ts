import { describe, expect, it } from 'vitest';
import {
  buildDocument,
  findPhrase,
  locateSpan,
  phrasePattern,
} from '../src/lib/research-paper-validation/ground-truth';
import { evaluatePan } from '../src/lib/evaluation/pan';

describe('phrasePattern', () => {
  it('escapes regex metacharacters in literal words', () => {
    const re = new RegExp(phrasePattern('code (f) f .'));
    expect('code (f) f .'.match(re)).not.toBeNull();
    expect('codeX(f)XfZY'.match(re)).toBeNull();
  });

  it('matches across newlines and column padding', () => {
    expect(findPhrase('soft-\nware and   tear', 'soft- ware')).toBe(0);
    expect(findPhrase('nothing here', 'soft- ware')).toBe(-1);
  });
});

describe('locateSpan', () => {
  it('spans from the start anchor through the end anchor', () => {
    const body = 'prefix Abstract Context: some genuine prose. suffix';
    const span = locateSpan(body, 'Abstract Context', 'genuine prose');
    expect(body.slice(span.offset, span.offset + span.length)).toBe(
      'Abstract Context: some genuine prose',
    );
  });

  it('picks the end anchor at or after the start match', () => {
    const body =
      'outline generated in plan enumeration. Problem. Real generated in plan enumeration.';
    const span = locateSpan(body, 'Problem. Real', 'generated in plan enumeration');
    expect(body.slice(span.offset, span.offset + span.length)).toBe(
      'Problem. Real generated in plan enumeration',
    );
  });

  it('throws when an anchor is missing', () => {
    expect(() => locateSpan('abc', 'missing', 'abc')).toThrow();
    expect(() => locateSpan('abc', 'abc', 'missing')).toThrow();
  });
});

describe('buildDocument', () => {
  it('records exact round-tripping offsets for every part', () => {
    const doc = buildDocument([
      { id: 'filler-1', text: 'Generic background sentence.' },
      { id: 'case-A', text: 'Copied genuine passage with numbers 20.33%.' },
      { id: 'filler-2', text: 'Closing remark.' },
    ]);
    expect(doc.spans).toHaveLength(3);
    expect(doc.spans.map((s) => s.id)).toEqual(['filler-1', 'case-A', 'filler-2']);
    expect(doc.text.indexOf('Copied genuine')).toBe(doc.spans[1].span.offset);
    // Parts must not overlap.
    const ordered = [...doc.spans].sort((a, b) => a.span.offset - b.span.offset);
    for (let i = 1; i < ordered.length; i++)
      expect(ordered[i].span.offset).toBeGreaterThanOrEqual(
        ordered[i - 1].span.offset + ordered[i - 1].span.length,
      );
  });
});

describe('controlled PAN scoring sanity', () => {
  it('scores a perfect overlapping detection as 1.0', () => {
    const pair = {
      suspiciousReference: 'Q',
      sourceReference: 'S',
      suspiciousSpan: { offset: 10, length: 100 },
      sourceSpan: { offset: 20, length: 100 },
    };
    const metrics = evaluatePan([pair], [pair]);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.falsePositiveDetections).toBe(0);
  });
});
