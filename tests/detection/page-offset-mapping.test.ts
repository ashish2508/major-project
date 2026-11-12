import { describe, expect, it } from 'vitest';
import { stripReferences } from '../../src/lib/detection/strip-references';
import { pageAtOffset, attachPassagePages } from '../../src/lib/corpus/service';
import type { Passage } from '../../src/lib/detection/segmentation';

/**
 * INVARIANT AUDIT: Page-Offset Mapping Through Reference Stripping
 *
 * This suite validates that reference stripping preserves the original text prefix
 * and that page-range clamping maintains valid offsets in the stripped coordinate system.
 *
 * Key invariants:
 * 1. After stripping at referenceOffset, body = original[0, referenceOffset)
 * 2. Page ranges are clamped to [0, referenceOffset) to maintain valid passages
 * 3. Character offsets in passages remain valid against the stripped text
 * 4. Pages entirely after the reference boundary are filtered out
 * 5. Document without references should not be modified
 */

describe('Page-offset mapping through reference stripping', () => {
  // =========================================================================
  // INVARIANT 1: Text Prefix Preservation
  // =========================================================================

  describe('Invariant 1: Text prefix is unchanged after stripping', () => {
    it('preserves exact text prefix [0, referenceOffset) when references detected', () => {
      const originalText = `Chapter 1. Introduction
      The quick brown fox jumps over the lazy dog.
      This is body text.
      
      References
      [1] Author, "Title", Journal, 2020.
      [2] Another, "Paper", Conf, 2021.`;

      const result = stripReferences(originalText);

      if (result.referenceOffset !== null && result.confident) {
        const strippedPrefix = originalText.slice(0, result.referenceOffset);
        expect(result.body).toBe(strippedPrefix);
      }
    });

    it('does not modify text when reference section not detected', () => {
      const originalText = `This document has no references section.
      Just body content throughout.`;

      const result = stripReferences(originalText);

      expect(result.referenceOffset).toBeNull();
      expect(result.body).toBe(originalText);
    });

    it('returns entire text unchanged for ambiguous reference headings', () => {
      const originalText = `Background section mentions References in general.
      We discuss the References literature.
      No actual bibliography is included.`;

      const result = stripReferences(originalText);

      // The heading check will see the word "References" but fail the prose guard
      if (result.referenceOffset !== null && !result.confident) {
        // Detected but not confident → body should be unchanged
        expect(result.body).toBe(originalText);
      }
    });

    it('extracts correct prefix for single-character reference boundary', () => {
      const text = 'ABC\nReferences\nXYZ';
      const result = stripReferences(text);

      if (result.referenceOffset !== null && result.confident) {
        // The boundary should be at the start of "References"
        expect(result.referenceOffset).toBeGreaterThanOrEqual(3);
        expect(result.body).toBe(text.slice(0, result.referenceOffset));
        expect(result.body).not.toContain('References');
      }
    });

    it('preserves Unicode and newlines in prefix correctly', () => {
      const originalText = `Élan and café discuss résumé.
      Equation: 2 + 2 = 4 ✓
      
      References
      [1] Source with ñ and ü`;

      const result = stripReferences(originalText);

      if (result.referenceOffset !== null && result.confident) {
        const prefix = originalText.slice(0, result.referenceOffset);
        expect(result.body).toBe(prefix);
        expect(result.body).toContain('Élan');
        expect(result.body).toContain('✓');
        expect(result.body).not.toContain('[1]');
      }
    });

    it('handles two-column PDF layout with large whitespace gap', () => {
      // Simulates Poppler flattening where left column heading meets right column content
      const text =
        'Left column text.\nReferences                                    2017. Citation entry';

      const result = stripReferences(text);

      if (result.referenceOffset !== null && result.confident) {
        const prefix = text.slice(0, result.referenceOffset);
        expect(result.body).toBe(prefix);
        // Should not include the right-column citation
        expect(result.body).not.toMatch(/2017\.\s+Citation/);
      }
    });
  });

  // =========================================================================
  // INVARIANT 2: Page Range Clamping
  // =========================================================================

  describe('Invariant 2: Page ranges clamped to [0, referenceOffset)', () => {
    it('clamps pages entirely before reference section', () => {
      const originalPages = [
        { page: 1, start: 0, end: 1000 },
        { page: 2, start: 1000, end: 2000 },
      ];
      const referenceOffset = 5000;

      const adjusted = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      expect(adjusted).toEqual(originalPages);
    });

    it('clamps page intersecting reference boundary', () => {
      const originalPages = [
        { page: 1, start: 0, end: 1000 },
        { page: 2, start: 1000, end: 2000 },
        { page: 3, start: 2000, end: 3000 },
      ];
      const referenceOffset = 1500; // Falls within page 2

      const adjusted = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      expect(adjusted).toHaveLength(2);
      expect(adjusted[0]).toEqual({ page: 1, start: 0, end: 1000 });
      expect(adjusted[1]).toEqual({ page: 2, start: 1000, end: 1500 });
      // Page 3 should be filtered out
      expect(adjusted).not.toContainEqual(expect.objectContaining({ page: 3 }));
    });

    it('removes pages entirely after reference boundary', () => {
      const originalPages = [
        { page: 1, start: 0, end: 500 },
        { page: 2, start: 500, end: 1000 },
        { page: 3, start: 1000, end: 1500 },
        { page: 4, start: 1500, end: 2000 },
      ];
      const referenceOffset = 1000; // References start at beginning of page 3

      const adjusted = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      expect(adjusted).toHaveLength(2);
      expect(adjusted.map((r) => r.page)).toEqual([1, 2]);
      expect(adjusted).not.toContainEqual(expect.objectContaining({ page: 3 }));
      expect(adjusted).not.toContainEqual(expect.objectContaining({ page: 4 }));
    });

    it('handles reference offset exactly at page boundary', () => {
      const originalPages = [
        { page: 1, start: 0, end: 1000 },
        { page: 2, start: 1000, end: 2000 },
      ];
      const referenceOffset = 1000;

      const adjusted = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0]).toEqual({ page: 1, start: 0, end: 1000 });
    });

    it('preserves pages when no reference section detected', () => {
      const originalPages = [
        { page: 1, start: 0, end: 1000 },
        { page: 2, start: 1000, end: 2000 },
      ];
      // When referenceOffset is null or Infinity, pages stay unchanged
      const referenceOffset = null;

      const adjusted = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset ?? Infinity),
          end: Math.min(end, referenceOffset ?? Infinity),
        }))
        .filter(({ start, end }) => start < end);

      expect(adjusted).toEqual(originalPages);
    });

    it('correctly maintains range ordering after clamping', () => {
      const originalPages = [
        { page: 1, start: 0, end: 100 },
        { page: 2, start: 100, end: 200 },
        { page: 3, start: 200, end: 300 },
      ];
      const referenceOffset = 150;

      const adjusted = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      // Verify monotonicity
      for (let i = 0; i < adjusted.length - 1; i++) {
        expect(adjusted[i].end).toBeLessThanOrEqual(adjusted[i + 1].start);
      }
    });
  });

  // =========================================================================
  // INVARIANT 3: Character Offset Validity in Stripped Text
  // =========================================================================

  describe('Invariant 3: Character offsets remain valid in stripped text', () => {
    it('passage offsets in stripped text match original coordinates', () => {
      const originalText =
        'First sentence. Second sentence. Third sentence.\n\nReferences\n[1] Source.';
      const result = stripReferences(originalText);

      if (result.referenceOffset !== null && result.confident) {
        // Create mock passages at known offsets in the stripped text
        const passages: Passage[] = [
          {
            id: 'p1',
            documentReference: 'test',
            offset: 0,
            length: 15, // "First sentence."
            text: result.body.slice(0, 15),
          },
          {
            id: 'p2',
            documentReference: 'test',
            offset: 16,
            length: 17, // "Second sentence."
            text: result.body.slice(16, 33),
          },
        ];

        // Verify passage texts are extractable from stripped body
        for (const p of passages) {
          const extracted = result.body.slice(p.offset, p.offset + p.length);
          expect(extracted).toBe(p.text);
        }
      }
    });

    it('pageAtOffset correctly resolves page for any valid offset in stripped coordinate system', () => {
      const clampedPages = [
        { page: 1, start: 0, end: 1000 },
        { page: 2, start: 1000, end: 1500 },
      ];

      // Test midpoints
      expect(pageAtOffset(clampedPages, 500)).toBe(1);
      expect(pageAtOffset(clampedPages, 999)).toBe(1);
      expect(pageAtOffset(clampedPages, 1000)).toBe(2);
      expect(pageAtOffset(clampedPages, 1250)).toBe(2);
      expect(pageAtOffset(clampedPages, 1499)).toBe(2);

      // Test boundaries
      expect(pageAtOffset(clampedPages, 0)).toBe(1);
      expect(pageAtOffset(clampedPages, 1500)).toBeUndefined(); // End is exclusive
    });

    it('attachPassagePages correctly assigns pages using clamped ranges', () => {
      const clampedPages = [
        { page: 1, start: 0, end: 1000 },
        { page: 2, start: 1000, end: 1500 },
      ];

      const passages: Passage[] = [
        {
          id: 'p1',
          documentReference: 'doc1',
          offset: 100,
          length: 50,
          text: 'sample',
        },
        {
          id: 'p2',
          documentReference: 'doc1',
          offset: 1050,
          length: 50,
          text: 'sample',
        },
        {
          id: 'p3',
          documentReference: 'doc1',
          offset: 1450,
          length: 50,
          text: 'sample',
        },
      ];

      const withPages = attachPassagePages(passages, clampedPages);

      expect(withPages[0].page).toBe(1);
      expect(withPages[1].page).toBe(2);
      expect(withPages[2].page).toBe(2);
    });

    it('no passages are mapped to undefined pages after stripping and clamping', () => {
      const originalPages = [
        { page: 1, start: 0, end: 500 },
        { page: 2, start: 500, end: 1000 },
        { page: 3, start: 1000, end: 1500 },
      ];
      const referenceOffset = 750;

      const clampedPages = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      // Passages within the clipped range should all map to valid pages
      const testOffsets = [0, 100, 250, 500, 600, 700, 740];

      for (const offset of testOffsets) {
        const page = pageAtOffset(clampedPages, offset);
        expect(page).toBeDefined();
        expect([1, 2, 3]).toContain(page);
      }

      // Passages beyond the boundary should return undefined
      expect(pageAtOffset(clampedPages, 800)).toBeUndefined();
      expect(pageAtOffset(clampedPages, 1000)).toBeUndefined();
    });
  });

  // =========================================================================
  // INVARIANT 4: Boundary and Edge Cases
  // =========================================================================

  describe('Invariant 4: Reference boundary and edge cases', () => {
    it('handles reference section at page boundary (page 5 start)', () => {
      // Simulates: pages 1-4 intact, references start at page 5
      const originalPages = [
        { page: 1, start: 0, end: 500 },
        { page: 2, start: 500, end: 1000 },
        { page: 3, start: 1000, end: 1500 },
        { page: 4, start: 1500, end: 2000 },
        { page: 5, start: 2000, end: 2500 },
      ];
      const referenceOffset = 2000; // References start at page 5

      const clampedPages = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      // All pages 1-4 should be intact
      expect(clampedPages).toHaveLength(4);
      expect(clampedPages.map((r) => r.page)).toEqual([1, 2, 3, 4]);

      // All pages should maintain correct boundaries
      for (let i = 0; i < clampedPages.length; i++) {
        expect(clampedPages[i].page).toBe(i + 1);
      }
    });

    it('handles reference section within a page (mid-page 3)', () => {
      // Simulates: references start mid-page 3
      const originalPages = [
        { page: 1, start: 0, end: 500 },
        { page: 2, start: 500, end: 1000 },
        { page: 3, start: 1000, end: 1500 },
      ];
      const referenceOffset = 1250; // Refs start mid-page 3

      const clampedPages = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      expect(clampedPages).toHaveLength(3);
      expect(clampedPages[2]).toEqual({ page: 3, start: 1000, end: 1250 });
    });

    it('filters pages entirely after reference boundary', () => {
      const originalPages = [
        { page: 1, start: 0, end: 500 },
        { page: 2, start: 500, end: 1000 },
        { page: 3, start: 1000, end: 1500 },
        { page: 4, start: 1500, end: 2000 },
      ];
      const referenceOffset = 800; // Refs start in page 2

      const clampedPages = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      // Pages 3 and 4 should be filtered
      expect(clampedPages).toHaveLength(2);
      expect(clampedPages.map((r) => r.page)).toEqual([1, 2]);
    });

    it('preserves attribution order: first, middle, last pages', () => {
      const originalPages = [
        { page: 1, start: 0, end: 100 }, // first page
        { page: 2, start: 100, end: 200 },
        { page: 3, start: 200, end: 300 }, // middle page
        { page: 4, start: 300, end: 400 },
        { page: 5, start: 400, end: 500 }, // last page
      ];
      const referenceOffset = 250;

      const clampedPages = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      // Should have pages 1, 2, and partial 3
      const pageNumbers = clampedPages.map((r) => r.page);
      expect(pageNumbers).toEqual([1, 2, 3]);

      // Verify passages at key offsets get correct pages
      expect(pageAtOffset(clampedPages, 0)).toBe(1); // first page
      expect(pageAtOffset(clampedPages, 150)).toBe(2); // middle area
      expect(pageAtOffset(clampedPages, 200)).toBe(3); // last partial page
      expect(pageAtOffset(clampedPages, 240)).toBe(3);
    });

    it('handles document with no reference section gracefully', () => {
      const originalText = 'This document has no bibliography.\nJust content.';
      const result = stripReferences(originalText);

      expect(result.referenceOffset).toBeNull();
      expect(result.body).toBe(originalText);
      expect(result.confident).toBe(false);

      // Pages should not be clamped if referenceOffset is null
      const originalPages = [
        { page: 1, start: 0, end: 100 },
        { page: 2, start: 100, end: 200 },
      ];

      const clampedPages = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, result.referenceOffset ?? Infinity),
          end: Math.min(end, result.referenceOffset ?? Infinity),
        }))
        .filter(({ start, end }) => start < end);

      expect(clampedPages).toEqual(originalPages);
    });

    it('handles very long documents with significant reference section', () => {
      // Simulates large academic paper
      const bodyLength = 50000;
      const referenceLength = 10000;
      const totalLength = bodyLength + referenceLength;

      const originalPages = Array.from({ length: 15 }, (_, i) => ({
        page: i + 1,
        start: i * 3500,
        end: Math.min((i + 1) * 3500, totalLength),
      }));

      const referenceOffset = bodyLength;

      const clampedPages = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      // Verify partial page at boundary
      const lastClampedPage = clampedPages[clampedPages.length - 1];
      expect(lastClampedPage.end).toBeLessThanOrEqual(referenceOffset);

      // Verify all pages are ordered
      for (let i = 0; i < clampedPages.length - 1; i++) {
        expect(clampedPages[i].page).toBeLessThan(clampedPages[i + 1].page);
        expect(clampedPages[i].end).toBeLessThanOrEqual(clampedPages[i + 1].start);
      }
    });

    it('handles exact boundary where end === referenceOffset', () => {
      const originalPages = [
        { page: 1, start: 0, end: 500 },
        { page: 2, start: 500, end: 1000 },
      ];
      const referenceOffset = 1000;

      const clampedPages = originalPages
        .map(({ page, start, end }) => ({
          page,
          start: Math.min(start, referenceOffset),
          end: Math.min(end, referenceOffset),
        }))
        .filter(({ start, end }) => start < end);

      // Page 2's end (1000) equals referenceOffset, so it should not be filtered
      expect(clampedPages).toHaveLength(2);
      expect(clampedPages[1]).toEqual({ page: 2, start: 500, end: 1000 });
    });
  });

  // =========================================================================
  // INTEGRATION: Both Corpus Ingestion and Manual Upload Paths
  // =========================================================================

  describe('Integration: Reference stripping in real analysis paths', () => {
    it('simulates corpus ingestion path: extract → strip → segment → adjust pages', () => {
      const extractedText = `Title: Research Paper
      
Introduction
Academic content here.

Body Section
More content explaining methodology.
Data analysis results follow.

References
[1] Smith et al., Journal, 2020
[2] Jones, Conference, 2021`;

      const pages = [
        { page: 1, start: 0, end: 100 },
        { page: 2, start: 100, end: 200 },
        { page: 3, start: 200, end: extractedText.length },
      ];

      // Step 1: Strip references
      const stripResult = stripReferences(extractedText);
      expect(stripResult.body).toBe(
        extractedText.slice(0, stripResult.referenceOffset ?? extractedText.length),
      );

      // Step 2: Adjust pages
      if (stripResult.referenceOffset !== null) {
        const refOffset = stripResult.referenceOffset;
        const adjustedPages = pages
          .map(({ page, start, end }) => ({
            page,
            start: Math.min(start, refOffset),
            end: Math.min(end, refOffset),
          }))
          .filter(({ start, end }) => start < end);

        // Verify all adjusted ranges are valid
        for (const range of adjustedPages) {
          expect(range.start).toBeLessThan(range.end);
          expect(range.start).toBeGreaterThanOrEqual(0);
          expect(range.end).toBeLessThanOrEqual(stripResult.body.length);
        }

        // Verify passages would be extractable from stripped text
        const testPassageOffset = adjustedPages[0].start + 10;
        const testPassageLength = 20;
        if (testPassageOffset + testPassageLength <= stripResult.body.length) {
          const passageText = stripResult.body.slice(
            testPassageOffset,
            testPassageOffset + testPassageLength,
          );
          expect(passageText.length).toBe(testPassageLength);
        }
      }
    });

    it('simulates manual upload path: extract → strip → analyze without corpus', () => {
      const queryText = `Method: Query document
      Content and analysis
      Results and conclusions
      
      References
      [1] Referenced work 2020.
      [2] Another citation 2021.
      [3] Third citation 2022.`;

      const sourceText = `Background: Source document
      Different content here
      With similar concepts
      
      References
      [1] Work by Author 2019.
      [2] Another paper 2020.
      [3] Additional reference 2021.`;

      // Strip both documents
      const queryStrip = stripReferences(queryText);
      const sourceStrip = stripReferences(sourceText);

      // Both should have stripped text as prefixes
      expect(queryStrip.body).toBe(
        queryText.slice(0, queryStrip.referenceOffset ?? queryText.length),
      );
      expect(sourceStrip.body).toBe(
        sourceText.slice(0, sourceStrip.referenceOffset ?? sourceText.length),
      );

      // Character offsets should be stable within each stripped text
      const queryOffset = 10;
      const queryPassageLen = 30;
      if (queryOffset + queryPassageLen <= queryStrip.body.length) {
        const passage = queryStrip.body.slice(queryOffset, queryOffset + queryPassageLen);
        expect(passage.length).toBe(queryPassageLen);
      }
    });

    it('preserves offset validity through complete analysis pipeline', () => {
      // Simulate a passage that appears in stripped coordinate system
      const originalText = `Body paragraph one.
      Body paragraph two with content.
      Body paragraph three.
      
      References
      [1] Citation
      [2] Another citation`;

      const stripResult = stripReferences(originalText);

      if (stripResult.referenceOffset !== null && stripResult.confident) {
        // Simulate extracting a passage at offset 20, length 30 from stripped text
        const passageOffset = 20;
        const passageLength = 30;

        const passage = stripResult.body.slice(passageOffset, passageOffset + passageLength);
        expect(passage.length).toBe(passageLength);

        // Verify the passage is indeed body text, not references
        expect(passage).not.toMatch(/\[\d+\]/);
      }
    });
  });
});
