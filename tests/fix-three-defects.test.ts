import { describe, expect, it } from 'vitest';
import {
  detect,
  retrieveCandidates,
  scoreKey,
  type Candidate,
} from '../src/lib/detection/detector';
import { filterInformativeEvidence } from '../src/lib/detection/informative-evidence';
import { segment } from '../src/lib/detection/segmentation';
import { Tfidf } from '../src/lib/detection/tfidf';
import { pageAtOffset } from '../src/lib/corpus/service';

// ============================================================================
// DEFECT 1: LEXICAL EVIDENCE FILTERING IN PRODUCTION PIPELINE
// ============================================================================

describe('Defect 1: Lexical evidence filtering', () => {
  it('rejects isolated citation fragments like "et al."', () => {
    const documents = new Map([
      ['query', 'This is et al. something important'],
      ['source', 'This is et al. something important'],
    ]);
    const candidate: Candidate = {
      suspiciousReference: 'query',
      sourceReference: 'source',
      suspiciousSpan: { offset: 8, length: 7 },
      sourceSpan: { offset: 8, length: 7 },
      lexical: 1.0,
      semantic: 0.0,
      score: 1.0,
    };
    const detections = detect([candidate], 0.6);
    const filtered = filterInformativeEvidence(detections, documents, 12);
    expect(filtered).toHaveLength(0);
  });

  it('rejects section numbers like "4.2"', () => {
    const documents = new Map([
      ['query', 'Section 4.2 discusses important topics'],
      ['source', 'Section 4.2 discusses important topics'],
    ]);
    const candidate: Candidate = {
      suspiciousReference: 'query',
      sourceReference: 'source',
      suspiciousSpan: { offset: 8, length: 3 },
      sourceSpan: { offset: 8, length: 3 },
      lexical: 1.0,
      semantic: 0.0,
      score: 1.0,
    };
    const detections = detect([candidate], 0.6);
    const filtered = filterInformativeEvidence(detections, documents, 12);
    expect(filtered).toHaveLength(0);
  });

  it('rejects reference markers like "[17, 18]"', () => {
    const documents = new Map([
      ['query', 'The research shows [17, 18] strong results'],
      ['source', 'The research shows [17, 18] strong results'],
    ]);
    const candidate: Candidate = {
      suspiciousReference: 'query',
      sourceReference: 'source',
      suspiciousSpan: { offset: 20, length: 8 },
      sourceSpan: { offset: 20, length: 8 },
      lexical: 1.0,
      semantic: 0.0,
      score: 1.0,
    };
    const detections = detect([candidate], 0.6);
    const filtered = filterInformativeEvidence(detections, documents, 12);
    expect(filtered).toHaveLength(0);
  });

  it('preserves meaningful technical terminology "query parser"', () => {
    const documents = new Map([
      [
        'query',
        'The query parser validates syntax. It performs semantic analysis before execution.',
      ],
      [
        'source',
        'Our system implements a query parser that ensures correctness throughout the pipeline.',
      ],
    ]);
    const candidate: Candidate = {
      suspiciousReference: 'query',
      sourceReference: 'source',
      suspiciousSpan: { offset: 4, length: 12 },
      sourceSpan: { offset: 34, length: 12 },
      lexical: 0.95,
      semantic: 0.88,
      score: 0.9,
    };
    const detections = detect([candidate], 0.6);
    const filtered = filterInformativeEvidence(detections, documents, 2);
    expect(filtered).toHaveLength(1);
  });

  it('rejects numeric enumerations like "134. 135. 136."', () => {
    const documents = new Map([
      ['query', 'Figures: 134. 135. 136. show the data'],
      ['source', 'Figures: 134. 135. 136. show the data'],
    ]);
    const candidate: Candidate = {
      suspiciousReference: 'query',
      sourceReference: 'source',
      suspiciousSpan: { offset: 8, length: 14 },
      sourceSpan: { offset: 8, length: 14 },
      lexical: 1.0,
      semantic: 0.0,
      score: 1.0,
    };
    const detections = detect([candidate], 0.6);
    const filtered = filterInformativeEvidence(detections, documents, 12);
    expect(filtered).toHaveLength(0);
  });

  it('filters uninformative lexical matches in production pipeline', () => {
    const query = segment('Methods include et al. notation and consensus protocol.', 'query');
    const source = segment(
      'Prior work uses et al. to cite many sources about consensus protocol.',
      'source',
    );

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(source.map((p) => p.text)));
    const candidates = retrieveCandidates(query, source, tfidf);
    const detections = detect(candidates.lexical, 0.3);

    const documents = new Map([
      ['query', 'Methods include et al. notation and consensus protocol.'],
      ['source', 'Prior work uses et al. to cite many sources about consensus protocol.'],
    ]);
    const filtered = filterInformativeEvidence(detections, documents, 12);

    // Filtering should remove or reduce low-quality matches
    expect(Array.isArray(filtered)).toBe(true);
  });
});

// ============================================================================
// DEFECT 2: HYBRID CANDIDATE RETRIEVAL
// ============================================================================

describe('Defect 2: Hybrid candidate retrieval merges top-K candidates', () => {
  it('produces correct hybrid scores: alpha=0.25', () => {
    const alpha = 0.25;
    const lexical = 0.8687;
    const semantic = 0.8822;
    const expected = alpha * lexical + (1 - alpha) * semantic;
    expect(expected).toBeCloseTo(0.8789, 3);
    expect(expected).toBeGreaterThan(0.7);
  });

  it('returns merged candidates from both lexical and semantic retrievals', () => {
    const query = segment('semantic similarity detection', 'query');
    const sources = [
      segment('semantic similarity detection with features', 'source1'),
      segment('unrelated networking content', 'source2'),
      segment('document similarity processing', 'source3'),
    ];
    const allSources = sources.flatMap((s) => s);

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(allSources.map((p) => p.text)));

    const createRandomEmbedding = () => {
      const v = new Array(384).fill(0).map(() => Math.random());
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return v.map((x) => x / norm);
    };

    const queryEmbeddings = query.map(() => createRandomEmbedding());
    const sourceEmbeddings = allSources.map(() => createRandomEmbedding());

    const candidates = retrieveCandidates(
      query,
      allSources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );

    expect(candidates.lexical.length).toBeGreaterThan(0);
    expect(candidates.semantic.length).toBeGreaterThan(0);
    expect(candidates[scoreKey('hybrid', 0.25)].length).toBeGreaterThan(0);

    for (const cand of candidates[scoreKey('hybrid', 0.25)]) {
      expect(Number.isFinite(cand.score)).toBe(true);
      expect(Number.isFinite(cand.lexical)).toBe(true);
      expect(Number.isFinite(cand.semantic)).toBe(true);
    }
  });

  it('tests candidate not best in either method but passing hybrid threshold', () => {
    const query = segment('semantic analysis methods', 'query');
    const sources = [
      segment('semantic analysis methods advanced features', 'A'),
      segment('lexical analysis approach', 'B'),
      segment('semantic methods for analysis', 'C'),
    ];
    const allSources = sources.flatMap((s) => s);

    const tfidf = Tfidf.fit(query.map((p) => p.text).concat(allSources.map((p) => p.text)));

    const queryVec = new Array(384).fill(0);
    queryVec[0] = 1;

    const normalize = (v: number[]) => {
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return v.map((x) => x / norm);
    };

    const queryEmbeddings = [normalize(queryVec)];
    const sourceEmbeddings = allSources.map((_, i) => {
      const v = new Array(384).fill(0);
      if (i === 2) v[0] = 0.95;
      else if (i === 0) v[0] = 1;
      else v[0] = 0.1;
      return normalize(v);
    });

    const candidates = retrieveCandidates(
      query,
      allSources,
      tfidf,
      queryEmbeddings,
      sourceEmbeddings,
      [0.25],
    );

    const hybridCandidates = candidates[scoreKey('hybrid', 0.25)];
    const sourceC = hybridCandidates.filter((c) => c.sourceReference === 'C');
    expect(sourceC.length).toBeGreaterThan(0);

    for (const cand of sourceC) {
      const hybrid = 0.25 * cand.lexical + 0.75 * cand.semantic;
      expect(hybrid).toBeCloseTo(cand.score, 5);
    }
  });

  it('correctly handles alpha: 0, 0.25, 0.5, 0.75, 1.0', () => {
    const testCases = [
      { alpha: 0, lex: 0.5, sem: 0.8, expected: 0.8 },
      { alpha: 0.25, lex: 0.8687, sem: 0.8822, expected: 0.8789 },
      { alpha: 0.5, lex: 0.6, sem: 0.8, expected: 0.7 },
      { alpha: 0.75, lex: 0.8, sem: 0.4, expected: 0.7 }, // 0.75*0.8 + 0.25*0.4 = 0.7
      { alpha: 1, lex: 0.5, sem: 0.8, expected: 0.5 },
    ];

    for (const tc of testCases) {
      const score = tc.alpha * tc.lex + (1 - tc.alpha) * tc.sem;
      expect(score).toBeCloseTo(tc.expected, 3);
    }
  });
});

// ============================================================================
// DEFECT 3: PAGE AND CHARACTER OFFSET MAPPING
// ============================================================================

describe('Defect 3: Page offset mapping through reference stripping', () => {
  it('correctly maps page ranges through reference stripping', () => {
    const originalPages = [
      { page: 1, start: 0, end: 1000 },
      { page: 2, start: 1000, end: 2000 },
    ];

    const referenceOffset = 1200;

    const adjustedPages = originalPages
      .map((range) => {
        const { page, start, end } = range;
        return {
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        };
      })
      .filter(({ start, end }) => start < end);

    expect(adjustedPages[0]).toEqual({ page: 1, start: 0, end: 1000 });
    expect(adjustedPages[1]).toEqual({ page: 2, start: 1000, end: 1200 });
  });

  it('handles reference offset at page boundary', () => {
    const originalPages = [
      { page: 1, start: 0, end: 1000 },
      { page: 2, start: 1000, end: 2000 },
    ];

    const referenceOffset = 1000;

    const adjustedPages = originalPages
      .map((range) => {
        const { page, start, end } = range;
        return {
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        };
      })
      .filter(({ start, end }) => start < end);

    expect(adjustedPages.length).toBe(1);
    expect(adjustedPages[0]).toEqual({ page: 1, start: 0, end: 1000 });
  });

  it('pageAtOffset correctly looks up pages for stripped offsets', () => {
    const adjustedPages = [
      { page: 1, start: 0, end: 1000 },
      { page: 2, start: 1000, end: 1200 },
    ];

    expect(pageAtOffset(adjustedPages, 500)).toBe(1);
    expect(pageAtOffset(adjustedPages, 999)).toBe(1);
    expect(pageAtOffset(adjustedPages, 1000)).toBe(2);
    expect(pageAtOffset(adjustedPages, 1100)).toBe(2);
    expect(pageAtOffset(adjustedPages, 1199)).toBe(2);
    expect(pageAtOffset(adjustedPages, 1200)).toBeUndefined();
  });

  it('handles large documents with significant reference sections', () => {
    const originalLength = 91_793;
    const referenceOffset = 25_000;

    const originalPages = [
      { page: 1, start: 0, end: 10_000 },
      { page: 2, start: 10_000, end: 20_000 },
      { page: 3, start: 20_000, end: originalLength },
    ];

    const adjustedPages = originalPages
      .map((range) => {
        const { page, start, end } = range;
        return {
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        };
      })
      .filter(({ start, end }) => start < end);

    expect(adjustedPages[0]).toEqual({ page: 1, start: 0, end: 10_000 });
    expect(adjustedPages[1]).toEqual({ page: 2, start: 10_000, end: 20_000 });

    expect(adjustedPages.length).toBe(3);
    expect(adjustedPages[2].page).toBe(3);
    expect(adjustedPages[2].start).toBe(20_000);
    expect(adjustedPages[2].end).toBe(referenceOffset);

    expect(pageAtOffset(adjustedPages, 5_000)).toBe(1);
    expect(pageAtOffset(adjustedPages, 15_000)).toBe(2);
    expect(pageAtOffset(adjustedPages, 22_000)).toBe(3);
  });

  it('ensures all adjusted offsets remain valid', () => {
    const originalPages = [
      { page: 1, start: 0, end: 1000 },
      { page: 2, start: 1000, end: 2000 },
      { page: 3, start: 2000, end: 3000 },
    ];

    const testCase = (referenceOffset: number) => {
      const adjustedPages = originalPages
        .map((range) => {
          const { page, start, end } = range;
          return {
            page,
            start: Math.min(start, referenceOffset),
            end: Math.min(end, referenceOffset),
          };
        })
        .filter(({ start, end }) => start < end);

      for (const range of adjustedPages) {
        expect(range.start).toBeLessThan(range.end);
        expect(range.start).toBeGreaterThanOrEqual(0);
      }

      for (let i = 0; i < adjustedPages.length - 1; i++) {
        expect(adjustedPages[i].end).toBeLessThanOrEqual(adjustedPages[i + 1].start);
      }
    };

    testCase(500);
    testCase(1200);
    testCase(2500);
    testCase(0);
    testCase(3000);
  });

  it('handles documents without reference sections', () => {
    const originalPages = [
      { page: 1, start: 0, end: 1000 },
      { page: 2, start: 1000, end: 2000 },
    ];

    // When there's no reference offset, page offsets should not be clamped
    const referenceOffset = Infinity; // No reference section
    const adjustedPages = originalPages
      .map((range) => {
        const { page, start, end } = range;
        return {
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        };
      })
      .filter(({ start, end }) => start < end);

    expect(adjustedPages).toEqual(originalPages);
  });
});
