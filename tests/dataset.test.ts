import { describe, it, expect } from 'vitest';
import {
  parseAnnotationXml,
  decodeCorpusText,
  validateSpan,
  codePointToUtf16,
} from '../src/lib/dataset/parser';
const feature =
  '<feature name="plagiarism" type="artificial" obfuscation="none" this_language="en" this_offset="2" this_length="3" source_reference="source-document00001.txt" source_language="en" source_offset="5" source_length="8" />';
const xml = (f = feature) =>
  `\ufeff<?xml version="1.0"?><document reference="suspicious-document00001.txt"><feature name="about" title="A &amp; B" lang="en"/><feature name="md5Hash" value="abc"/>${f}</document>`;
describe('PAN parser', () => {
  it('preserves entities, absent authors, independent spans and raw values', () => {
    const d = parseAnnotationXml(xml());
    expect(d.title).toBe('A & B');
    expect(d.authors).toBeUndefined();
    expect(d.annotations[0].sourceSpan.length).toBe(8);
    expect(d.annotations[0].suspiciousSpan.length).toBe(3);
    expect(d.annotations[0].rawAttributes.this_offset).toBe('2');
  });
  it('handles clean documents', () => expect(parseAnnotationXml(xml('')).annotations).toEqual([]));
  it('decodes UTF-8, strips only the initial BOM, preserves CRLF and combining marks', () => {
    const text = '\ufeffé\r\ne\u0301\ufeff😀 ';
    const d = decodeCorpusText(Buffer.from(text));
    expect(d.hasBom).toBe(true);
    expect(d.text).toBe(text.slice(1));
    expect(decodeCorpusText(Buffer.from('plain ')).text).toBe('plain ');
  });
  it('rejects invalid UTF-8', () =>
    expect(() => decodeCorpusText(new Uint8Array([0xff]))).toThrow());
  it('maps Unicode code points to JS units without splitting surrogates', () => {
    expect(codePointToUtf16('a😀é', 2)).toBe(3);
    expect(codePointToUtf16('a😀é', 3)).toBe(4);
    expect(() => codePointToUtf16('x', 2)).toThrow();
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe offsets %s', (offset) =>
    expect(() => validateSpan({ offset, length: 1 }, 20)).toThrow(),
  );
  it('rejects out of bounds but preserves zero length for policy handling', () => {
    expect(() => validateSpan({ offset: 5, length: 6 }, 10)).toThrow();
    expect(() => validateSpan({ offset: 10, length: 0 }, 10)).not.toThrow();
    expect(
      parseAnnotationXml(xml(feature.replace('this_length="3"', 'this_length="0"'))).annotations[0]
        .issues,
    ).toContain('zero-length');
  });
  it.each([
    feature.replace('this_length="3"', 'this_length="-3"'),
    feature.replace('source_reference="source-document00001.txt"', 'source_reference="../bad"'),
    feature.replace('obfuscation="none"', 'obfuscation="unknown"'),
  ])('rejects invalid annotation fields', (f) =>
    expect(() => parseAnnotationXml(xml(f))).toThrow(),
  );
  it('requires type-specific fields', () => {
    expect(() =>
      parseAnnotationXml(xml(feature.replace('type="artificial"', 'type="simulated"'))),
    ).toThrow();
    const t = feature.replace(
      'type="artificial" obfuscation="none"',
      'type="translation" manual_obfuscation="false"',
    );
    expect(parseAnnotationXml(xml(t)).annotations[0].construction).toEqual({
      type: 'translation',
      manualObfuscation: false,
    });
  });
  it('rejects malformed XML, duplicate metadata and DTDs', () => {
    expect(() => parseAnnotationXml(xml().replace('</document>', ''))).toThrow();
    expect(() => parseAnnotationXml(xml('<feature name="about" title="x" lang="en"/>'))).toThrow();
    expect(() => parseAnnotationXml('<!DOCTYPE a>' + xml())).toThrow();
  });
});
