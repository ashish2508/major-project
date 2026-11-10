// Read-only, corpus-specific exploration. Not an application XML parser.
// Fails on XML outside the simple document/feature shape seen in this release.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(
  process.argv[2] ?? 'data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011',
);
const out = resolve(process.argv[3] ?? 'reports/pan-pc-11/results.json');
const ext = resolve(root, 'external-detection-corpus');
const hash = (bytes, alg = 'sha256') => createHash(alg).update(bytes).digest('hex');
const inc = (o, k, n = 1) => {
  o[k] = (o[k] ?? 0) + n;
};
const decodeEntity = (s) =>
  s.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (_, e) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e] ??
      String.fromCodePoint(
        e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
      ),
  );
function attrs(s) {
  const a = {};
  let rest = s;
  for (const m of s.matchAll(/([\w:]+)="([^"]*)"/g)) {
    if (m[1] in a) throw Error('Duplicate attribute');
    a[m[1]] = decodeEntity(m[2]);
    rest = rest.replace(m[0], '');
  }
  if (rest.trim()) throw Error('Unrecognized attributes: ' + rest);
  return a;
}
function xml(bytes) {
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const doc = text.match(/<document\s+([^>]*)>/);
  if (!doc) throw Error('Missing document');
  const features = [...text.matchAll(/<feature\s+([^>]*?)\s*\/>/g)].map((m) => attrs(m[1]));
  const residual = text
    .replace(/<\?xml[^?]*\?>/, '')
    .replace(/<document\s+[^>]*>/, '')
    .replace(/<\/document>/, '')
    .replace(/<feature\s+[^>]*?\s*\/>/g, '')
    .trim();
  if (residual) throw Error('Unexpected XML content');
  return { document: attrs(doc[1]), features };
}
const stats = {
  runtime: { bun: process.versions.bun, node: process.versions.node },
  root: relative(process.cwd(), root),
  parts: [],
  documents: { source: 0, suspicious: 0 },
  xmlFiles: { source: 0, suspicious: 0 },
  languages: { source: {}, suspicious: {} },
  featureAttributes: {},
  featureNames: {},
  documentAttributes: {},
  types: {},
  obfuscation: {},
  typeByObfuscation: {},
  languagePairs: {},
  lengthsByType: {},
  issues: {},
  examples: {},
  unicode: {
    nonBmpDocuments: 0,
    nonBmpCharacters: 0,
    nonAsciiDocuments: 0,
    crlfDocuments: 0,
    bomDocuments: 0,
    replacementCharacterDocuments: 0,
  },
  cleanSuspicious: [],
  sourcesUsed: 0,
};
const issues = stats.issues;
stats.manualObfuscation = {};
stats.typeByManualObfuscation = {};
stats.annotationAttributeValues = {};
stats.missingAuthors = { source: 0, suspicious: 0 };
stats.md5Checks = { exact: 0, zeroPaddingOnly: 0, otherMismatch: 0 };
function issue(key, sample) {
  const x = (issues[key] ??= { count: 0, examples: [] });
  x.count++;
  if (x.examples.length < 8) x.examples.push(sample);
}
const docs = new Map(),
  annotations = [],
  fingerprint = createHash('sha256'),
  textHashes = new Map(),
  bookKeys = new Map();
for (const [dir, kind] of [
  ['source-document', 'source'],
  ['suspicious-document', 'suspicious'],
]) {
  for (const part of readdirSync(resolve(ext, dir)).sort(
    (a, b) => Number(a.slice(4)) - Number(b.slice(4)),
  )) {
    const folder = resolve(ext, dir, part),
      files = readdirSync(folder).sort();
    const row = { kind, part, text: 0, xml: 0, withPlagiarism: 0, clean: 0, annotations: 0 };
    stats.parts.push(row);
    for (const file of files) {
      if (!file.endsWith('.xml') && !file.endsWith('.txt')) {
        issue('unexpectedFile', relative(ext, resolve(folder, file)));
        continue;
      }
      if (file.endsWith('.txt')) {
        row.text++;
        continue;
      }
      row.xml++;
      stats.xmlFiles[kind]++;
      const xb = readFileSync(resolve(folder, file)),
        parsed = xml(xb),
        ref = parsed.document.reference;
      for (const key of Object.keys(parsed.document)) inc(stats.documentAttributes, key);
      const expected = file.replace(/\.xml$/, '.txt');
      if (ref !== expected) issue('documentReferenceMismatch', file);
      const path = resolve(folder, expected),
        bytes = readFileSync(path);
      // Buffer preserves UTF-8 BOM as U+FEFF; no newline/Unicode normalization.
      const text = bytes.toString('utf8');
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        issue('invalidUtf8', ref);
      }
      const sha = hash(bytes),
        about = parsed.features.find((f) => f.name === 'about'),
        md5 = parsed.features.find((f) => f.name === 'md5Hash');
      fingerprint.update(
        relative(ext, path) +
          '\0' +
          sha +
          '\n' +
          relative(ext, resolve(folder, file)) +
          '\0' +
          hash(xb) +
          '\n',
      );
      const actualMd5 = hash(bytes, 'md5');
      if (md5?.value === actualMd5) stats.md5Checks.exact++;
      else if (md5?.value?.padStart(32, '0') === actualMd5) stats.md5Checks.zeroPaddingOnly++;
      else stats.md5Checks.otherMismatch++;
      if (md5?.value !== actualMd5)
        issue('md5Mismatch', { ref, expected: md5?.value, actual: actualMd5 });
      if (!about?.authors) stats.missingAuthors[kind]++;
      if (!about?.lang) issue('missingLanguage', ref);
      const nonBmp = [...text.matchAll(/[\u{10000}-\u{10FFFF}]/gu)].length;
      for (const [key, yes] of [
        ['nonAsciiDocuments', /[^\x00-\x7f]/.test(text)],
        ['crlfDocuments', text.includes('\r\n')],
        ['bomDocuments', text.startsWith('\uFEFF')],
        ['replacementCharacterDocuments', text.includes('\uFFFD')],
        ['nonBmpDocuments', nonBmp > 0],
      ])
        if (yes) stats.unicode[key]++;
      stats.unicode.nonBmpCharacters += nonBmp;
      if (text.includes('\uFFFD')) {
        stats.unicode.replacementCharacterReferences ??= [];
        stats.unicode.replacementCharacterReferences.push(ref);
      }
      const doc = {
        ref,
        kind,
        path: relative(ext, path),
        lang: about?.lang,
        authors: about?.authors,
        title: about?.title,
        utf16Length: text.length,
        codePointLength: text.length - nonBmp,
        bytes: bytes.length,
        sha256: sha,
      };
      if (docs.has(ref)) issue('duplicateReference', ref);
      docs.set(ref, doc);
      stats.documents[kind]++;
      inc(stats.languages[kind], about?.lang ?? '<missing>');
      const hs = textHashes.get(sha) ?? [];
      hs.push(ref);
      textHashes.set(sha, hs);
      const bk = JSON.stringify([about?.authors, about?.title]);
      const bs = bookKeys.get(bk) ?? [];
      bs.push(ref);
      bookKeys.set(bk, bs);
      const anns = [];
      for (const f of parsed.features) {
        inc(stats.featureNames, f.name);
        const fa = (stats.featureAttributes[f.name] ??= {});
        for (const key of Object.keys(f)) inc(fa, key);
        if (f.name === 'artificial-plagiarism' || f.name === 'plagiarism') anns.push(f);
        else if (!['about', 'md5Hash'].includes(f.name)) issue('unexpectedFeature', { ref, f });
      }
      if (kind === 'source' && anns.length) issue('sourceHasAnnotations', ref);
      if (kind === 'suspicious') {
        if (anns.length) row.withPlagiarism++;
        else {
          row.clean++;
          stats.cleanSuspicious.push(ref);
        }
        row.annotations += anns.length;
      }
      for (const a of anns) {
        const rec = { suspicious: ref, ...a };
        annotations.push(rec);
        for (const key of [
          'name',
          'type',
          'this_language',
          'source_language',
          'this_offset',
          'this_length',
          'source_reference',
          'source_offset',
          'source_length',
        ])
          if (!(key in a)) issue('missingAnnotationAttribute', { ref, key });
        for (const key of [
          'type',
          'obfuscation',
          'manual_obfuscation',
          'this_language',
          'source_language',
        ]) {
          const dist = (stats.annotationAttributeValues[key] ??= {});
          inc(dist, a[key] ?? '<missing>');
        }
        inc(stats.manualObfuscation, a.manual_obfuscation ?? '<missing>');
        inc(stats.typeByManualObfuscation, `${a.type}/${a.manual_obfuscation ?? '<missing>'}`);
        if (a.this_language !== about?.lang) issue('suspiciousLanguageMismatch', { ref, a });
        for (const key of ['this_offset', 'this_length', 'source_offset', 'source_length'])
          if (
            !/^\d+$/.test(a[key] ?? '') ||
            !Number.isSafeInteger(Number(a[key])) ||
            (key.endsWith('length') && Number(a[key]) <= 0)
          )
            issue('invalidAnnotationNumber', { ref, key, value: a[key] });
        inc(stats.types, a.type);
        inc(stats.obfuscation, a.obfuscation ?? '<missing>');
        inc(stats.typeByObfuscation, `${a.type}/${a.obfuscation ?? '<missing>'}`);
        const length = (stats.lengthsByType[a.type] ??= { equal: 0, different: 0 });
        inc(length, a.this_length === a.source_length ? 'equal' : 'different');
        const end = Number(a.this_offset) + Number(a.this_length);
        if (end > text.length) issue('suspiciousUtf16OutOfBounds', rec);
        if (end > doc.codePointLength) issue('suspiciousCodePointOutOfBounds', rec);
        if (end > bytes.length) issue('suspiciousByteOutOfBounds', rec);
        if (end > text.length - 1) issue('suspiciousBomExcludedOutOfBounds', rec);
        const key = `${a.type}/${a.obfuscation ?? a.manual_obfuscation ?? '<missing>'}`;
        stats.examples[key] ??= {
          xml: relative(ext, resolve(folder, file)),
          annotation: rec,
          suspiciousExcerpt: text.slice(Number(a.this_offset), Number(a.this_offset) + 160),
        };
      }
    }
    if (row.text !== row.xml) issue('partPairCountMismatch', row);
  }
  console.error(`Scanned ${kind}: ${stats.documents[kind]} documents`);
}
stats.fingerprintSha256 = fingerprint.digest('hex');
stats.totalAnnotations = annotations.length;
stats.withPlagiarism = stats.parts.reduce((s, p) => s + p.withPlagiarism, 0);
stats.withoutPlagiarism = stats.cleanSuspicious.length;
const parent = new Map([...docs.keys()].map((k) => [k, k]));
function find(a) {
  const p = parent.get(a);
  if (p === a) return a;
  const r = find(p);
  parent.set(a, r);
  return r;
}
function join(a, b) {
  const x = find(a),
    y = find(b);
  if (x !== y) parent.set(x, y);
}
const usage = new Map(),
  cache = new Map();
function sourceText(ref) {
  if (cache.has(ref)) return cache.get(ref);
  const t = readFileSync(resolve(ext, docs.get(ref).path)).toString('utf8');
  cache.set(ref, t);
  if (cache.size > 32) cache.delete(cache.keys().next().value);
  return t;
}
const exact = {
  cases: 0,
  utf16Equal: 0,
  codePointEqual: 0,
  byteEqual: 0,
  byteBoundaryInvalid: 0,
  examples: [],
};
exact.shiftChecks = {};
exact.bomExcluded = {
  rawEqual: 0,
  whitespaceRemovedEqual: 0,
  byteWhitespaceRemovedEqual: 0,
  mismatchExamples: [],
};
for (const a of annotations) {
  const s = docs.get(a.source_reference),
    d = docs.get(a.suspicious);
  if (!s) {
    issue('missingSourceReference', a);
    continue;
  }
  if (s.kind !== 'source') issue('wrongSourceRole', a);
  join(a.suspicious, a.source_reference);
  const us = usage.get(a.source_reference) ?? new Set();
  us.add(a.suspicious);
  usage.set(a.source_reference, us);
  inc(stats.languagePairs, `${a.type}:${s.lang}->${d.lang}`);
  if (a.source_language && a.source_language !== s.lang) issue('sourceLanguageMismatch', a);
  const end = Number(a.source_offset) + Number(a.source_length);
  if (end > s.utf16Length) issue('sourceUtf16OutOfBounds', a);
  if (end > s.codePointLength) issue('sourceCodePointOutOfBounds', a);
  if (end > s.bytes) issue('sourceByteOutOfBounds', a);
  if (end > s.utf16Length - 1) issue('sourceBomExcludedOutOfBounds', a);
  const example =
    stats.examples[`${a.type}/${a.obfuscation ?? a.manual_obfuscation ?? '<missing>'}`];
  if (example.annotation === a)
    example.sourceExcerpt = sourceText(s.ref).slice(
      Number(a.source_offset),
      Number(a.source_offset) + 160,
    );
  if (a.type === 'artificial' && a.obfuscation === 'none') {
    exact.cases++;
    const st = sourceText(s.ref),
      dt = readFileSync(resolve(ext, d.path)).toString('utf8');
    const so = Number(a.source_offset),
      sl = Number(a.source_length),
      to = Number(a.this_offset),
      tl = Number(a.this_length);
    const ss = st.slice(so, so + sl),
      ds = dt.slice(to, to + tl);
    const ue = ss === ds,
      ce =
        Array.from(st)
          .slice(so, so + sl)
          .join('') ===
        Array.from(dt)
          .slice(to, to + tl)
          .join('');
    const sb = Buffer.from(st).subarray(so, so + sl),
      db = Buffer.from(dt).subarray(to, to + tl);
    const be = sb.equals(db);
    if (ue) exact.utf16Equal++;
    if (ce) exact.codePointEqual++;
    if (be) exact.byteEqual++;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sb);
      new TextDecoder('utf-8', { fatal: true }).decode(db);
    } catch {
      exact.byteBoundaryInvalid++;
    }
    if (exact.examples.length < 4 && ue !== be)
      exact.examples.push({
        annotation: a,
        utf16Equal: ue,
        byteEqual: be,
        sourceStart: ss.slice(0, 100),
        suspiciousStart: ds.slice(0, 100),
      });
    if (!ue) issue('unobfuscatedRawSliceMismatch', a);
    const cl = st.slice(so + 1, so + sl + 1),
      cr = dt.slice(to + 1, to + tl + 1);
    if (cl === cr) exact.bomExcluded.rawEqual++;
    if (cl.replace(/\s/g, '') === cr.replace(/\s/g, '')) exact.bomExcluded.whitespaceRemovedEqual++;
    else if (exact.bomExcluded.mismatchExamples.length < 8)
      exact.bomExcluded.mismatchExamples.push({ annotation: a, source: cl, suspicious: cr });
    const bl = Buffer.from(st)
        .subarray(so + 3, so + sl + 3)
        .toString('utf8'),
      br = Buffer.from(dt)
        .subarray(to + 3, to + tl + 3)
        .toString('utf8');
    if (bl.replace(/\s/g, '') === br.replace(/\s/g, ''))
      exact.bomExcluded.byteWhitespaceRemovedEqual++;
    for (const shift of [-1, 0, 1, 2]) {
      const left = st.slice(so + shift, so + sl + shift),
        right = dt.slice(to + shift, to + tl + shift);
      const result = (exact.shiftChecks[shift] ??= {
        whitespaceRemovedEqual: 0,
        wordSequencesEqual: 0,
      });
      if (left.replace(/\s/g, '') === right.replace(/\s/g, '')) result.whitespaceRemovedEqual++;
      if (
        JSON.stringify(left.match(/[\p{L}\p{N}]+/gu)) ===
        JSON.stringify(right.match(/[\p{L}\p{N}]+/gu))
      )
        result.wordSequencesEqual++;
    }
  }
}
stats.offsetEvidence = exact;
stats.sourcesUsed = usage.size;
stats.sourcesUnused = stats.documents.source - usage.size;
stats.sourcesUsedByMultipleSuspicious = [...usage.values()].filter((s) => s.size > 1).length;
stats.maxSuspiciousPerSource = Math.max(...[...usage.values()].map((s) => s.size));
function components() {
  const groups = new Map();
  for (const d of docs.values()) {
    const r = find(d.ref);
    const g = groups.get(r) ?? { documents: 0, source: 0, suspicious: 0, annotations: 0 };
    g.documents++;
    g[d.kind]++;
    groups.set(r, g);
  }
  for (const a of annotations) {
    groups.get(find(a.suspicious)).annotations++;
  }
  const values = [...groups.values()].sort((a, b) => b.documents - a.documents);
  return {
    count: values.length,
    nontrivial: values.filter((g) => g.documents > 1).length,
    largest: values.slice(0, 10),
  };
}
stats.annotationGraph = components();
stats.exactDuplicateGroups = [...textHashes.values()].filter((v) => v.length > 1);
stats.sameBookMetadataGroups = [...bookKeys.values()].filter((v) => v.length > 1);
for (const g of stats.exactDuplicateGroups) for (const ref of g.slice(1)) join(g[0], ref);
for (const g of stats.sameBookMetadataGroups) for (const ref of g.slice(1)) join(g[0], ref);
stats.graphWithDuplicateAndBookMetadata = components();
// Check duplicate annotations and overlaps within each suspicious document.
const seen = new Set(),
  byDoc = new Map();
for (const a of annotations) {
  const k = JSON.stringify(a);
  if (seen.has(k)) issue('duplicateAnnotation', a);
  seen.add(k);
  const arr = byDoc.get(a.suspicious) ?? [];
  arr.push(a);
  byDoc.set(a.suspicious, arr);
}
let overlapPairs = 0,
  overlapDocs = 0;
for (const arr of byDoc.values()) {
  arr.sort((a, b) => Number(a.this_offset) - Number(b.this_offset));
  let count = 0;
  for (let i = 0; i < arr.length; i++)
    for (
      let j = i + 1;
      j < arr.length &&
      Number(arr[j].this_offset) < Number(arr[i].this_offset) + Number(arr[i].this_length);
      j++
    )
      count++;
  overlapPairs += count;
  if (count) overlapDocs++;
}
stats.suspiciousOverlaps = { pairs: overlapPairs, documents: overlapDocs };
stats.suspiciousTypeCombinations = {};
for (const d of docs.values())
  if (d.kind === 'suspicious') {
    const types =
      [...new Set((byDoc.get(d.ref) ?? []).map((a) => a.type))].sort().join('+') || 'clean';
    inc(stats.suspiciousTypeCombinations, types);
  }
function scopedGraph(strictEnglishOnly) {
  const eligible = new Set(
    [...docs.values()]
      .filter(
        (d) =>
          d.lang === 'en' &&
          !(
            strictEnglishOnly &&
            d.kind === 'suspicious' &&
            (byDoc.get(d.ref) ?? []).some((a) => a.type === 'translation')
          ),
      )
      .map((d) => d.ref),
  );
  const p = new Map([...eligible].map((r) => [r, r]));
  function f(r) {
    if (p.get(r) === r) return r;
    const x = f(p.get(r));
    p.set(r, x);
    return x;
  }
  const selected = annotations.filter(
    (a) => eligible.has(a.suspicious) && eligible.has(a.source_reference),
  );
  for (const a of selected) {
    const x = f(a.suspicious),
      y = f(a.source_reference);
    if (x !== y) p.set(x, y);
  }
  const groups = new Map();
  for (const r of eligible) {
    const k = f(r);
    const g = groups.get(k) ?? { source: 0, suspicious: 0, annotations: 0 };
    g[docs.get(r).kind]++;
    groups.set(k, g);
  }
  for (const a of selected) groups.get(f(a.suspicious)).annotations++;
  return {
    documents: eligible.size,
    annotations: selected.length,
    components: groups.size,
    largest: [...groups.values()].sort((a, b) => b.annotations - a.annotations).slice(0, 3),
  };
}
stats.englishAnnotationGraph = scopedGraph(false);
stats.strictEnglishDocumentAnnotationGraph = scopedGraph(true);
const lengths = annotations.map((a) => Number(a.this_length)).sort((a, b) => a - b);
stats.suspiciousPassageLengths = {
  min: lengths[0],
  median: lengths[Math.floor(lengths.length / 2)],
  p95: lengths[Math.floor(lengths.length * 0.95)],
  max: lengths.at(-1),
  over256Characters: lengths.filter((n) => n > 256).length,
};
writeFileSync(out, JSON.stringify(stats, null, 2) + '\n');
console.error(`Wrote ${out}`);
