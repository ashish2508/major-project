import { describe, expect, it } from 'vitest';
import { getArtifacts } from '../src/lib/application/analysis';
import { detect, retrieveCandidates, scoreKey } from '../src/lib/detection/detector';
import { segment } from '../src/lib/detection/segmentation';
import { Tfidf } from '../src/lib/detection/tfidf';

describe('Production hybrid calibration consistency', () => {
  it('uses the validation-selected interior alpha and applies weighted lexical-semantic scoring', async () => {
    const { configs } = await getArtifacts();
    const config = configs.hybrid;
    expect(config.alpha).toBe(0.25);
    expect(config.threshold).toBe(0.7);

    const query = segment('alpha', 'query');
    const sources = [...segment('alpha', 'lexical-source'), ...segment('beta', 'semantic-source')];
    const vector = (axis: number) => {
      const values = new Array(384).fill(0);
      values[axis] = 1;
      return values;
    };
    const candidates = retrieveCandidates(
      query,
      sources,
      Tfidf.fit(['alpha', 'beta']),
      [vector(1)],
      [vector(0), vector(1)],
      [config.alpha],
    )[scoreKey('hybrid', config.alpha)];

    // Hybrid mode returns merged candidates from top-K lexical and semantic sources
    expect(candidates.length).toBeGreaterThan(0);

    // Find the semantic-source candidate (should have semantic=1, lexical=0)
    const semanticSourceCandidate = candidates.find((c) => c.sourceReference === 'semantic-source');
    expect(semanticSourceCandidate).toBeDefined();
    expect(semanticSourceCandidate).toMatchObject({
      sourceReference: 'semantic-source',
      lexical: 0,
      semantic: 1,
      score: 0.75,
    });

    // After applying threshold, we get only the high-scoring candidates
    const detections = detect(candidates, config.threshold);
    expect(detections.length).toBeGreaterThan(0);
    expect(detections.some((d) => d.sourceReference === 'semantic-source')).toBe(true);
  });
});
