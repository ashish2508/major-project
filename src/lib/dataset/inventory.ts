import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { digest } from '../digest';
import { decodeCorpusText, parseAnnotationXml, validateSpan } from './parser';
import type { Inventory, DocumentRecord, PlagiarismAnnotation } from './types';
export const DEFAULT_CORPUS = 'data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011';
export { digest } from '../digest';
export async function loadDocument(root: string, doc: DocumentRecord): Promise<string> {
  const bytes = await readFile(resolve(root, doc.textPath));
  if (digest(bytes) !== doc.sha256) throw new Error(`Document changed: ${doc.reference}`);
  return decodeCorpusText(bytes).text;
}
export async function buildInventory(root = DEFAULT_CORPUS): Promise<Inventory> {
  const documents: DocumentRecord[] = [],
    annotations: PlagiarismAnnotation[] = [];
  const stats: Inventory['statistics'] = {
    sourceDocuments: 0,
    suspiciousDocuments: 0,
    xmlFiles: 0,
    plagiarismInstances: 0,
    withAnnotations: 0,
    withoutAnnotations: 0,
    types: {},
    languages: {},
    issues: {},
  };
  const hash = createHash('sha256');
  const refs = new Map<string, DocumentRecord>();
  const increment = (obj: Record<string, number>, key: string) => {
    obj[key] = (obj[key] ?? 0) + 1;
  };
  for (const role of ['source', 'suspicious'] as const) {
    const dir = resolve(root, 'external-detection-corpus', `${role}-document`);
    const parts = (await readdir(dir)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
    for (const part of parts) {
      if (!/^part\d+$/.test(part)) throw new Error(`Unexpected corpus entry: ${part}`);
      const folder = resolve(dir, part),
        files = (await readdir(folder)).sort();
      const texts = new Set(files.filter((f) => f.endsWith('.txt')));
      for (const file of files.filter((f) => f.endsWith('.xml'))) {
        const xmlPath = resolve(folder, file),
          xb = await readFile(xmlPath);
        const parsed = parseAnnotationXml(xb.toString('utf8'));
        const ref = file.replace(/\.xml$/, '.txt');
        if (
          parsed.reference !== ref ||
          !ref.startsWith(role) ||
          !texts.delete(ref) ||
          refs.has(ref)
        )
          throw new Error(`Invalid pairing/reference: ${file}`);
        const textPath = resolve(folder, ref),
          bytes = await readFile(textPath),
          decoded = decodeCorpusText(bytes);
        const issues: string[] = [];
        if (/[\u{10000}-\u{10ffff}]/u.test(decoded.text))
          throw new Error(`Unverified non-BMP corpus coordinates: ${ref}`);
        const actualMd5 = digest(bytes, 'md5');
        if (parsed.declaredMd5.toLowerCase().padStart(32, '0') !== actualMd5)
          throw new Error(`Checksum mismatch: ${ref}`);
        if (parsed.declaredMd5.length !== 32) issues.push('md5-zero-padding');
        if (!parsed.authors) issues.push('missing-authors');
        if (decoded.text.includes('\ufffd')) issues.push('replacement-character');
        const doc: DocumentRecord = {
          reference: ref,
          role,
          part,
          textPath: relative(resolve(root), textPath).split(sep).join('/'),
          xmlPath: relative(resolve(root), xmlPath).split(sep).join('/'),
          language: parsed.language,
          authors: parsed.authors,
          title: parsed.title,
          textLength: decoded.text.length,
          byteLength: bytes.length,
          sha256: digest(bytes),
          declaredMd5: parsed.declaredMd5,
          hasBom: decoded.hasBom,
          issues,
        };
        const prefix = 'external-detection-corpus/';
        hash.update(
          doc.textPath.slice(prefix.length) +
            '\0' +
            doc.sha256 +
            '\n' +
            doc.xmlPath.slice(prefix.length) +
            '\0' +
            digest(xb) +
            '\n',
        );
        documents.push(doc);
        refs.set(ref, doc);
        annotations.push(...parsed.annotations);
        stats[role === 'source' ? 'sourceDocuments' : 'suspiciousDocuments']++;
        stats.xmlFiles++;
        increment(stats.languages, `${role}:${doc.language}`);
        if (role === 'suspicious')
          stats[parsed.annotations.length ? 'withAnnotations' : 'withoutAnnotations']++;
        for (const i of issues) increment(stats.issues, i);
        for (const a of parsed.annotations) {
          validateSpan(a.suspiciousSpan, doc.textLength);
          increment(stats.types, a.construction.type);
          for (const i of a.issues) increment(stats.issues, i);
        }
      }
      if (texts.size || files.some((f) => !/\.(txt|xml)$/.test(f)))
        throw new Error(`Unpaired or unexpected files: ${folder}`);
    }
    console.error(`Validated ${role} documents`);
  }
  for (const a of annotations) {
    const source = refs.get(a.sourceReference);
    if (!source || source.role !== 'source' || source.language !== a.sourceLanguage)
      throw new Error(`Missing/invalid source: ${a.id}`);
    validateSpan(a.sourceSpan, source.textLength);
  }
  stats.plagiarismInstances = annotations.length;
  return {
    version: 1,
    root: relative(process.cwd(), resolve(root)),
    fingerprint: hash.digest('hex'),
    documents,
    annotations,
    statistics: stats,
  };
}
