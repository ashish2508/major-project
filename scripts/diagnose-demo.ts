import { readFile, writeFile } from 'node:fs/promises';
import { getArtifacts } from '../src/lib/application/analysis';
import { extractFile } from '../src/lib/documents/extract';
import { segment, segmentParagraphs } from '../src/lib/detection/segmentation';
import { denseCosine, sparseCosine } from '../src/lib/detection/tfidf';
import { embedTexts, tokenCounter } from '../src/lib/embeddings/model';
import type { CharacterSpan } from '../src/lib/dataset/types';
import type { AnalysisResult } from '../src/lib/application/analysis';
import { overlaps } from '../src/lib/evaluation/pan';

type DemoCase = {
  id: string;
  kind: string;
  suspiciousFile: string;
  sourceFile: string;
  matches: { id: string; suspicious: CharacterSpan; source: CharacterSpan }[];
};
const { cases } = JSON.parse(await readFile('demo/ground-truth.json', 'utf8')) as {
  cases: DemoCase[];
};
const { tfidf } = await getArtifacts();
const countTokens = await tokenCounter();
const [mode, server] = process.argv.slice(2);
const results = [];
for (const item of cases) {
  const read = async (name: string) => new File([await readFile(`demo/${name}`)], name);
  const [pdf, txt] = await Promise.all([read(item.suspiciousFile), read(item.sourceFile)]);
  const [query, source] = await Promise.all([
    extractFile(pdf, 'query'),
    extractFile(txt, 'source-1'),
  ]);
  const split = mode === 'before' ? segment : segmentParagraphs;
  const queries = split(query.text, query.reference, { countTokens }, query.paragraphBreaks);
  const sources = split(source.text, source.reference, { countTokens }, source.paragraphBreaks);
  const vectors = await embedTexts([...queries, ...sources].map(({ text }) => text));
  const describe = (passage: (typeof queries)[number], index: number) => ({
    ...passage,
    tokens: countTokens(passage.text),
    embeddingDimensions: vectors[index].length,
    embeddingNorm: Math.hypot(...vectors[index]),
  });
  const candidates = queries.map((q, qi) => {
    const qv = tfidf.transform(q.text);
    const scores = sources.map((s, si) => ({
      sourceIndex: si,
      lexical: sparseCosine(qv, tfidf.transform(s.text)),
      semantic: denseCosine(vectors[qi], vectors[queries.length + si]),
      correspondences: item.matches
        .filter((match) =>
          overlaps(
            {
              suspiciousReference: query.reference,
              sourceReference: source.reference,
              suspiciousSpan: q,
              sourceSpan: s,
            },
            {
              suspiciousReference: query.reference,
              sourceReference: source.reference,
              suspiciousSpan: match.suspicious,
              sourceSpan: match.source,
            },
          ),
        )
        .map(({ id }) => id),
    }));
    return {
      queryIndex: qi,
      scores,
      topFiveSemantic: [...scores].sort((a, b) => b.semantic - a.semantic).slice(0, 5),
    };
  });
  const application = [];
  if (server) {
    for (const method of ['lexical', 'semantic', 'hybrid'] as const) {
      const form = new FormData();
      form.set('queryFile', pdf);
      form.append('sourceFiles', txt);
      form.set('method', method);
      const response = await fetch(new URL('/api/analyze', server), {
        method: 'POST',
        headers: { Origin: new URL(server).origin },
        body: form,
      });
      if (!response.ok) throw new Error(await response.text());
      const analysis: AnalysisResult = await response.json();
      const detections = analysis.detections.map((detection) => ({
        ...detection,
        matchedIds: item.matches
          .filter((match) =>
            overlaps(detection, {
              suspiciousReference: query.reference,
              sourceReference: source.reference,
              suspiciousSpan: match.suspicious,
              sourceSpan: match.source,
            }),
          )
          .map(({ id }) => id),
      }));
      const found = new Set(detections.flatMap((detection) => detection.matchedIds));
      application.push({
        config: analysis.config,
        provider: analysis.provider,
        elapsedSeconds: analysis.elapsedSeconds,
        passages: analysis.passages,
        matchedCases: found.size,
        unmatchedDetections: detections.filter((detection) => !detection.matchedIds.length).length,
        missedIds: item.matches.filter(({ id }) => !found.has(id)).map(({ id }) => id),
        detections,
      });
    }
  }
  results.push({
    case: item.id,
    expected: item.matches,
    queryPassages: queries.map(describe),
    sourcePassages: sources.map((passage, i) => describe(passage, queries.length + i)),
    candidates,
    application,
  });
}
const path = `reports/implementation/demo-diagnostics-${mode === 'before' ? 'before' : 'after'}.json`;
await writeFile(
  path,
  JSON.stringify({ scope: 'Synthetic demonstrations only', results }, null, 2) + '\n',
);
console.log(`Wrote ${path}`);
