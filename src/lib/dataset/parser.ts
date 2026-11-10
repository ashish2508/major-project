import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import type { Language, PlagiarismAnnotation } from './types';

const language = z.enum(['en', 'de', 'es']);
const natural = z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger);
const common = z
  .object({
    name: z.literal('plagiarism'),
    type: z.enum(['artificial', 'simulated', 'translation']),
    this_language: language,
    source_language: language,
    this_offset: natural,
    this_length: natural,
    source_offset: natural,
    source_length: natural,
    source_reference: z.string().regex(/^source-document\d+\.txt$/),
  })
  .passthrough();
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  ignoreDeclaration: true,
  isArray: (_name, path) => path === 'document.feature',
});
export interface ParsedDocument {
  reference: string;
  title: string;
  authors?: string;
  language: Language;
  declaredMd5: string;
  annotations: PlagiarismAnnotation[];
}
export function parseAnnotationXml(xml: string): ParsedDocument {
  xml = xml.replace(/^\uFEFF/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('DTD and entity declarations are not supported');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`Invalid XML: ${valid.err.msg}`);
  const obj = parser.parse(xml) as Record<string, unknown>;
  const removeWhitespace = (record: Record<string, unknown>) => {
    if (typeof record['#text'] === 'string' && !(record['#text'] as string).trim())
      delete record['#text'];
  };
  removeWhitespace(obj);
  if (obj.document && typeof obj.document === 'object')
    removeWhitespace(obj.document as Record<string, unknown>);
  if (Object.keys(obj).length !== 1 || !obj.document)
    throw new Error('Expected a single document root');
  const root = z
    .object({
      reference: z.string().regex(/^(source|suspicious)-document\d+\.txt$/),
      feature: z.array(z.record(z.string(), z.string())).default([]),
    })
    .strict()
    .parse(obj.document);
  const about = root.feature.filter((f) => f.name === 'about');
  const md5 = root.feature.filter((f) => f.name === 'md5Hash');
  if (about.length !== 1 || md5.length !== 1)
    throw new Error('Expected one about and one md5Hash feature');
  const metadata = z
    .object({ title: z.string().min(1), authors: z.string().optional(), lang: language })
    .parse(about[0]);
  const declaredMd5 = z
    .string()
    .regex(/^[a-f\d]{1,32}$/i)
    .parse(md5[0].value);
  const annotations: PlagiarismAnnotation[] = [];
  for (const [ordinal, raw] of root.feature.entries()) {
    if (['about', 'md5Hash'].includes(raw.name)) continue;
    const a = common.parse(raw);
    if (!root.reference.startsWith('suspicious-'))
      throw new Error('Source metadata cannot contain plagiarism annotations');
    let construction: PlagiarismAnnotation['construction'];
    if (a.type === 'artificial') {
      if (raw.manual_obfuscation !== undefined)
        throw new Error('Unexpected manual_obfuscation for artificial case');
      construction = {
        type: a.type,
        obfuscation: z.enum(['none', 'low', 'high']).parse(raw.obfuscation),
      };
    } else if (a.type === 'translation') {
      if (raw.obfuscation !== undefined)
        throw new Error('Unexpected obfuscation for translation case');
      construction = {
        type: a.type,
        manualObfuscation: z.enum(['true', 'false']).parse(raw.manual_obfuscation) === 'true',
      };
    } else {
      if (raw.obfuscation !== undefined || raw.manual_obfuscation !== undefined)
        throw new Error('Unexpected simulated obfuscation attribute');
      construction = { type: a.type };
    }
    if (a.this_language !== metadata.lang)
      throw new Error('Suspicious language disagrees with metadata');
    annotations.push({
      id: `${root.reference}#${ordinal}`,
      suspiciousReference: root.reference,
      sourceReference: a.source_reference,
      suspiciousLanguage: a.this_language,
      sourceLanguage: a.source_language,
      suspiciousSpan: { offset: a.this_offset, length: a.this_length },
      sourceSpan: { offset: a.source_offset, length: a.source_length },
      construction,
      rawAttributes: raw,
      issues: a.this_length === 0 || a.source_length === 0 ? ['zero-length'] : [],
    });
  }
  return {
    reference: root.reference,
    title: metadata.title,
    authors: metadata.authors,
    language: metadata.lang,
    declaredMd5,
    annotations,
  };
}

/** Decode UTF-8 without normalizing Unicode/newlines; strip only an initial BOM. */
export function decodeCorpusText(bytes: Uint8Array): { text: string; hasBom: boolean } {
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const hasBom = raw.startsWith('\uFEFF');
  return { text: hasBom ? raw.slice(1) : raw, hasBom };
}
export function validateSpan(span: { offset: number; length: number }, textLength: number): void {
  if (
    ![span.offset, span.length, textLength].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    span.offset + span.length > textLength
  )
    throw new Error('Invalid or out-of-bounds span');
}
/** For future code-point corpora; PAN-PC-11 contains no non-BMP text. */
export function codePointToUtf16(text: string, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid code point offset');
  let points = 0,
    units = 0;
  for (const char of text) {
    if (points === offset) return units;
    points++;
    units += char.length;
  }
  if (points === offset) return units;
  throw new Error('Code point offset beyond text');
}
