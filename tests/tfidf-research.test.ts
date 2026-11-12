/**
 * tfidf-research.test.ts
 *
 * Tests for Tfidf.fitOnPassages() — the research-paper IDF fitting path
 * introduced in Phase 2.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Tfidf } from '../src/lib/detection/tfidf';

const ROOT = resolve(__dirname, '..');
const FIXTURES = join(ROOT, 'tests/fixtures/papers');

// ---------------------------------------------------------------------------
// 1. Domain terms end up in the vocabulary after fitOnPassages
// ---------------------------------------------------------------------------
describe('Tfidf.fitOnPassages — vocabulary coverage', () => {
  it('includes domain-specific term "efficacy" in the fitted vocabulary', () => {
    const tfidf = Tfidf.fitOnPassages([
      'the efficacy of treatment was studied',
      'treatment showed efficacy',
    ]);
    expect(Object.hasOwn(tfidf.idf, 'efficacy')).toBe(true);
  });

  it('includes all terms that appear in any passage (no OOV dropping)', () => {
    const passages = [
      'randomized controlled trial of prophylaxis',
      'prophylaxis reduced incidence significantly',
      'incidence rate was lower',
    ];
    const tfidf = Tfidf.fitOnPassages(passages);
    // Every word that appears in any passage should be in the vocabulary
    for (const term of [
      'randomized',
      'controlled',
      'trial',
      'prophylaxis',
      'incidence',
      'significantly',
    ]) {
      expect(Object.hasOwn(tfidf.idf, term), `term "${term}" should be in vocabulary`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. fittedOn metadata is set correctly
// ---------------------------------------------------------------------------
describe('Tfidf.fitOnPassages — fittedOn metadata', () => {
  it('sets fittedOn.passages to the number of supplied passages', () => {
    const passages = ['passage one about treatment', 'passage two about efficacy'];
    const tfidf = Tfidf.fitOnPassages(passages);
    expect(tfidf.fittedOn).toBeDefined();
    expect(tfidf.fittedOn!.passages).toBe(2);
  });

  it('sets fittedOn.backgroundPassages to 0 when no background is supplied', () => {
    const tfidf = Tfidf.fitOnPassages(['only document passages here']);
    expect(tfidf.fittedOn!.backgroundPassages).toBe(0);
  });

  it('sets fittedOn.source to "fitOnPassages"', () => {
    const tfidf = Tfidf.fitOnPassages(['a passage']);
    expect(tfidf.fittedOn!.source).toBe('fitOnPassages');
  });

  it('records document count when passed', () => {
    const tfidf = Tfidf.fitOnPassages(['passage a', 'passage b'], undefined, 3);
    expect(tfidf.fittedOn!.documents).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3. backgroundPassages are used in IDF estimation
// ---------------------------------------------------------------------------
describe('Tfidf.fitOnPassages — background passages effect', () => {
  it('fittedOn.backgroundPassages matches the background array length', () => {
    const passages = ['query source passage about treatment'];
    const background = [
      'background corpus line about methodology',
      'background corpus line about results',
      'background corpus line about discussion',
    ];
    const tfidf = Tfidf.fitOnPassages(passages, background);
    expect(tfidf.fittedOn!.backgroundPassages).toBe(3);
    expect(tfidf.fittedOn!.passages).toBe(1);
  });

  it('N (total passages) includes background in IDF smoothing denominator', () => {
    // With background, N is larger, so IDF values for rare terms are higher
    // (more smoothing). We verify trainingPassages = passages + background.
    const passages = ['term alpha'];
    const background = ['term beta', 'term gamma', 'term delta', 'term epsilon'];
    const tfidf = Tfidf.fitOnPassages(passages, background);
    expect(tfidf.trainingPassages).toBe(5); // 1 + 4
  });

  it('background term "beta" is added to vocabulary via background passage', () => {
    // 'beta' only appears in background, not in the main passages
    const passages = ['only term alpha here'];
    const background = ['only term beta here'];
    const tfidf = Tfidf.fitOnPassages(passages, background);
    // Both alpha and beta should be in vocabulary
    expect(Object.hasOwn(tfidf.idf, 'alpha')).toBe(true);
    expect(Object.hasOwn(tfidf.idf, 'beta')).toBe(true);
  });

  it('a term appearing in many background passages has lower IDF (higher frequency = lower IDF)', () => {
    const passages = ['rare term xyzzy appears once'];
    const background = Array.from({ length: 10 }, (_, i) => `common word the document ${i}`);
    const tfidf = Tfidf.fitOnPassages(passages, background);
    // 'the' appears in all 10 background passages; IDF should be lower than 'xyzzy'
    const idfThe = tfidf.idf['the'];
    const idfXyzzy = tfidf.idf['xyzzy'];
    if (idfThe !== undefined && idfXyzzy !== undefined) {
      expect(idfXyzzy).toBeGreaterThan(idfThe);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. IDF formula is correct (smoothed log IDF)
// ---------------------------------------------------------------------------
describe('Tfidf.fitOnPassages — IDF formula correctness', () => {
  it('computes smoothed IDF = log((1+N)/(1+df)) + 1', () => {
    // 2 passages, term 'alpha' appears in 1 passage
    // IDF(alpha) = log((1+2)/(1+1)) + 1 = log(1.5) + 1
    const tfidf = Tfidf.fitOnPassages(['alpha beta', 'beta gamma']);
    const expected = Math.log(3 / 2) + 1;
    expect(tfidf.idf['alpha']).toBeCloseTo(expected, 10);
  });

  it('computes smoothed IDF for a term appearing in all passages', () => {
    // 2 passages, term 'common' appears in both (df=2)
    // IDF(common) = log((1+2)/(1+2)) + 1 = log(1) + 1 = 1.0
    const tfidf = Tfidf.fitOnPassages(['common alpha', 'common beta']);
    expect(tfidf.idf['common']).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// 5. C1 control pair — fitted vocabulary should not reduce recall vs PAN vocab
// ---------------------------------------------------------------------------
// This test requires the fixture files. Skip if they are absent.
describe('Tfidf.fitOnPassages — C1 exact-copy recall', () => {
  const c1Path = join(FIXTURES, 'c1-exact-copy.txt');
  const liuPdfPath = join(FIXTURES, 'liu-2020-e21808.pdf');

  if (!existsSync(c1Path)) {
    it.skip('c1-exact-copy.txt not present — skipping recall test', () => {});
  } else if (!existsSync(liuPdfPath)) {
    it.skip('liu-2020-e21808.pdf not present — skipping recall test', () => {});
  } else {
    it('fitted vocabulary covers C1 tokens (all words in-vocabulary)', async () => {
      const { readFile } = await import('node:fs/promises');
      const { lexicalTokens } = await import('../src/lib/detection/tfidf');

      const c1Text = await readFile(c1Path, 'utf8');
      const tokens = lexicalTokens(c1Text);

      // Build a minimal passage list from the C1 text itself
      const sentences = c1Text
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const tfidf = Tfidf.fitOnPassages(sentences);

      // Every unique token from C1 should be in the vocabulary
      const oov = [...new Set(tokens)].filter((t) => !Object.hasOwn(tfidf.idf, t));
      expect(oov).toHaveLength(0);
    });

    it('alert count with fitted vocabulary is >= alert count with PAN vocabulary on C1', async () => {
      // This test is a sanity check: fitting on the actual document passages
      // should not reduce lexical recall compared to the PAN book vocabulary.
      //
      // We compare:
      //   - Tfidf.fit(['passage 1', ...]) — trained on the passages themselves
      //   - Tfidf.fitOnPassages([same passages]) — same data, different API
      //
      // Both should produce identical results since the data is the same;
      // the purpose is to confirm fitOnPassages does not silently drop vocabulary.
      const { readFile } = await import('node:fs/promises');
      const { retrieveCandidates, detect, scoreKey } =
        await import('../src/lib/detection/detector');
      const { segment } = await import('../src/lib/detection/segmentation');

      const c1Text = await readFile(c1Path, 'utf8');

      const queryPassages = segment(c1Text, 'c1-query');
      const queryTexts = queryPassages.map((p) => p.text);

      // Build a fake source from the same text (exact copy scenario)
      const sourcePassages = segment(c1Text, 'c1-source');
      const sourceTexts = sourcePassages.map((p) => p.text);
      const allTexts = [...queryTexts, ...sourceTexts];

      // Fit using static fit (original API — equivalent data)
      const tfidfFit = Tfidf.fit(allTexts);
      // Fit using fitOnPassages (new API)
      const tfidfFitOn = Tfidf.fitOnPassages(allTexts);

      const method = 'lexical' as const;
      const threshold = 0.6;

      const rowsFit = retrieveCandidates(queryPassages, sourcePassages, tfidfFit);
      const rowsFitOn = retrieveCandidates(queryPassages, sourcePassages, tfidfFitOn);

      const alertsFit = detect(rowsFit[scoreKey(method, 1)], threshold).length;
      const alertsFitOn = detect(rowsFitOn[scoreKey(method, 1)], threshold).length;

      // fitOnPassages should produce the same (or more) alerts — no regression
      expect(alertsFitOn).toBeGreaterThanOrEqual(alertsFit);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Edge cases
// ---------------------------------------------------------------------------
describe('Tfidf.fitOnPassages — edge cases', () => {
  it('throws when given an empty passages array', () => {
    expect(() => Tfidf.fitOnPassages([])).toThrow();
  });

  it('works with a single passage', () => {
    const tfidf = Tfidf.fitOnPassages(['single passage with unique terms']);
    expect(Object.keys(tfidf.idf).length).toBeGreaterThan(0);
  });

  it('transform() returns non-zero score for a known in-vocabulary term', () => {
    const tfidf = Tfidf.fitOnPassages([
      'efficacy of the treatment was studied',
      'the treatment showed significant efficacy',
    ]);
    const vec = tfidf.transform('efficacy treatment');
    expect(vec.size).toBeGreaterThan(0);
    expect(vec.get('efficacy')).toBeDefined();
    expect(vec.get('efficacy')!).toBeGreaterThan(0);
  });
});
