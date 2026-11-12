import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import groundTruth from '../demo/ground-truth.json';
import { analyzeDocuments } from '../src/lib/application/analysis';
import { extractFile } from '../src/lib/documents/extract';
import { embedTexts, tokenCounter } from '../src/lib/embeddings/model';
import { denseCosine } from '../src/lib/detection/tfidf';
import { overlaps } from '../src/lib/evaluation/pan';
it.skipIf(process.env.INFERENCE_TESTS !== '1')(
  'loads local MiniLM, produces normalized embeddings and enforces the token limit',
  async () => {
    const texts = [
      'A researcher compares two scientific documents.',
      'Two academic texts are compared by a researcher.',
      'A purple bicycle is parked beside a river.',
    ];
    const vectors = await embedTexts(texts);
    expect(vectors).toHaveLength(3);
    for (const v of vectors) {
      expect(v).toHaveLength(384);
      expect(v.reduce((s, x) => s + x * x, 0)).toBeCloseTo(1, 4);
    }
    expect(denseCosine(vectors[0], vectors[1])).toBeGreaterThan(
      denseCosine(vectors[0], vectors[2]),
    );
    const count = await tokenCounter();
    expect(count('a '.repeat(300))).toBeGreaterThan(256);
    await expect(embedTexts(['a '.repeat(300)])).rejects.toThrow('256');
    await expect(embedTexts([' '])).rejects.toThrow();
  },
  60000,
);

for (const fixture of groundTruth.cases) {
  it.skipIf(process.env.INFERENCE_TESTS !== '1')(
    `checks confirmed and review evidence for ${fixture.kind} through application analysis`,
    async () => {
      async function load(name: string, reference: string) {
        return extractFile(new File([await readFile(`demo/${name}`)], name), reference);
      }
      const query = await load(fixture.suspiciousFile, 'query');
      const source = await load(fixture.sourceFile, 'source');
      for (const method of ['lexical', 'semantic', 'hybrid'] as const) {
        const result = await analyzeDocuments(query, [source], method);
        if (fixture.kind === 'direct-copy') {
          for (const match of fixture.matches) {
            expect(
              result.detections.some((detection) =>
                overlaps(detection, {
                  suspiciousReference: query.reference,
                  sourceReference: source.reference,
                  suspiciousSpan: match.suspicious,
                  sourceSpan: match.source,
                }),
              ),
            ).toBe(true);
          }
        } else {
          expect(result.detections).toHaveLength(0);
        }

        expect(result.semanticReviewLeads.length).toBeLessThanOrEqual(5);
        if (method === 'lexical') expect(result.semanticReviewLeads).toHaveLength(0);
        if (fixture.kind === 'paraphrase' && method !== 'lexical') {
          for (const match of fixture.matches) {
            const lead = result.semanticReviewLeads.find(
              (candidate) => candidate.suspiciousSpan.offset === match.suspicious.offset,
            );
            expect(lead).toMatchObject({
              suspiciousReference: query.reference,
              sourceReference: source.reference,
              suspiciousPage: match.suspicious.page,
              suspiciousSpan: { offset: match.suspicious.offset, length: match.suspicious.length },
              sourceSpan: { offset: match.source.offset, length: match.source.length },
            });
            expect(
              result.query.text.slice(
                lead!.suspiciousSpan.offset,
                lead!.suspiciousSpan.offset + lead!.suspiciousSpan.length,
              ),
            ).toBe(match.suspicious.excerpt);
            expect(
              result.sources[0].text.slice(
                lead!.sourceSpan.offset,
                lead!.sourceSpan.offset + lead!.sourceSpan.length,
              ),
            ).toBe(match.source.excerpt);
          }
        }
      }
    },
    60000,
  );
}
