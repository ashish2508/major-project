# Audit Report: Page-Offset Mapping Through Reference Stripping

**Date:** $(date)
**Task:** Verify that reference stripping preserves the original text prefix and maintains valid page-range offsets.

## Executive Summary

✅ **ALL INVARIANTS VERIFIED**

The implementation correctly preserves the original text prefix `[0, referenceOffset)` after reference stripping and maintains valid page-range offsets in the stripped coordinate system. 26 comprehensive test cases covering all required scenarios now pass.

## Invariants Verified

### Invariant 1: Text Prefix Preservation

**Verified:** After stripping at `referenceOffset`, `body = original[0, referenceOffset)`

- ✅ References detected with standard heading ("References", "Bibliography", "Works Cited")
- ✅ No modifications when reference section is not detected
- ✅ Ambiguous reference headings not stripped (confidence guard)
- ✅ Unicode and newlines preserved correctly
- ✅ Two-column PDF layout with large whitespace gaps handled correctly

**Test Coverage:**
- `preserves exact text prefix [0, referenceOffset) when references detected`
- `does not modify text when reference section not detected`
- `returns entire text unchanged for ambiguous reference headings`
- `extracts correct prefix for single-character reference boundary`
- `preserves Unicode and newlines in prefix correctly`
- `handles two-column PDF layout with large whitespace gap`

### Invariant 2: Page Range Clamping

**Verified:** Page ranges clamped to `[0, referenceOffset)` to maintain valid offsets in stripped coordinate system

Implementation in `src/lib/corpus/service.ts` (ingestDocumentFile):
```typescript
const adjustedPages = extracted.pages
  ?.map((range) => {
    const { page, start, end } = range;
    return {
      page,
      start: Math.min(start, stripResult.referenceOffset ?? Infinity),
      end: Math.min(end, stripResult.referenceOffset ?? Infinity),
    };
  })
  .filter(({ start, end }) => start < end); // Remove empty ranges
```

Implementation in `src/lib/application/analysis.ts`:
- Query document pages clamped (lines 134-142)
- Source document pages clamped (lines 185-193, 280-288)

**Test Coverage:**
- ✅ Pages entirely before reference section remain intact
- ✅ Page intersecting reference boundary clamped correctly
- ✅ Pages entirely after reference boundary filtered out
- ✅ Reference offset exactly at page boundary handled
- ✅ Documents without references preserve all pages
- ✅ Range ordering maintained after clamping

### Invariant 3: Character Offset Validity

**Verified:** Character offsets in passages remain valid in stripped text

- ✅ Passage offsets in stripped text extract correct content
- ✅ `pageAtOffset()` correctly resolves pages for valid offsets
- ✅ `attachPassagePages()` correctly assigns pages using clamped ranges
- ✅ No passages mapped to undefined pages after stripping and clamping

**Test Coverage:**
- `passage offsets in stripped text match original coordinates`
- `pageAtOffset correctly resolves page for any valid offset in stripped coordinate system`
- `attachPassagePages correctly assigns pages using clamped ranges`
- `no passages are mapped to undefined pages after stripping and clamping`

### Invariant 4: Boundary and Edge Cases

**Verified:** All boundary conditions handled correctly

- ✅ Reference section at page boundary (e.g., page 5 start) → pages 1-4 intact
- ✅ Reference section within a page (e.g., mid-page 3) → page 3 clamped
- ✅ Pages entirely after reference boundary → filtered out, not included with invalid ranges
- ✅ Documents without references (referenceOffset = null) → unchanged
- ✅ Exact boundary where end === referenceOffset → included (half-open interval)
- ✅ Very long documents (50,000+ characters) → correctly handled
- ✅ Page number attribution preserved for first, middle, last pages

**Test Coverage:**
- `handles reference section at page boundary (page 5 start)`
- `handles reference section within a page (mid-page 3)`
- `filters pages entirely after reference boundary`
- `preserves attribution order: first, middle, last pages`
- `handles document with no reference section gracefully`
- `handles very long documents with significant reference section`
- `handles exact boundary where end === referenceOffset`

### Invariant 5: Integration with Analysis Paths

**Verified:** Both corpus ingestion and manual upload paths correctly implement stripping and clamping

**Corpus Ingestion Path** (src/lib/corpus/service.ts):
1. Extract document (pages with half-open intervals)
2. Strip references (body = original[0, referenceOffset))
3. Segment paragraphs into passages
4. Adjust page ranges to clipped coordinate system
5. Create CorpusPassage records with correct page attribution

**Manual Upload Path** (src/lib/application/analysis.ts):
1. Extract query and source documents
2. Strip both independently
3. Adjust page ranges for each document
4. Segmentation uses adjusted page ranges
5. Analysis detections reference correct pages

**Test Coverage:**
- `simulates corpus ingestion path: extract → strip → segment → adjust pages`
- `simulates manual upload path: extract → strip → analyze without corpus`
- `preserves offset validity through complete analysis pipeline`

## Code Review: Implementation Correctness

### stripReferences() function
**File:** `src/lib/detection/strip-references.ts`

The function correctly:
1. Detects reference-section headings using heuristic patterns
2. Applies confidence guards (prose check, minimum trailing chars)
3. Returns body as exact prefix [0, referenceOffset)
4. Never modifies original text

### stripCanonicalReferences() function
**File:** `src/lib/detection/strip-references.ts`

The function correctly:
1. Uses verified PDF coordinate ranges for canonical papers
2. Masks (replaces with spaces) reference regions to preserve offsets
3. Maintains exact string length for coordinate preservation

### pageAtOffset() function
**File:** `src/lib/corpus/service.ts`

The function correctly:
1. Finds page containing a given offset
2. Uses half-open interval semantics: offset >= range.start && offset < range.end
3. Returns undefined for offsets outside all ranges

### attachPassagePages() function
**File:** `src/lib/corpus/service.ts`

The function correctly:
1. Maps each passage to its page using pageAtOffset()
2. Works with clamped ranges where all offsets are valid
3. Preserves passage information unchanged

## Test Results

**Page-Offset Mapping Test Suite:**
- File: `tests/detection/page-offset-mapping.test.ts`
- Tests: 26
- Passing: 26 ✅
- Failing: 0
- Skipped: 0

**Breakdown by category:**
- Invariant 1 (Text Prefix): 6 tests passing ✅
- Invariant 2 (Page Clamping): 6 tests passing ✅
- Invariant 3 (Offset Validity): 4 tests passing ✅
- Invariant 4 (Boundary Cases): 7 tests passing ✅
- Integration Tests: 3 tests passing ✅

## Findings

### ✅ Verified Behaviors

1. **Text prefix is unchanged**: After stripping at referenceOffset, the body text is exactly the original[0, referenceOffset).

2. **Page ranges are correctly clamped**: All page range end values are clamped to referenceOffset, filtering out pages entirely after the reference boundary.

3. **Character offsets remain valid**: All passage offsets in the stripped text map correctly to their pages using half-open interval semantics.

4. **No silent transformations**: The only transformation affecting character positions is reference stripping itself, which is explicitly tracked via referenceOffset.

5. **Both analysis paths implement correctly**: 
   - Corpus ingestion (ingestDocumentFile) properly clamps pages
   - Manual upload path (analyzeDocuments) properly clamps query and source pages

### ⚠️ Limitations and Assumptions

1. **Half-open interval semantics**: The implementation consistently uses [start, end) semantics. An offset exactly equal to `end` is NOT included in that range.

2. **Confidence-based stripping**: Reference stripping uses heuristic detection with confidence flags. Low-confidence detection returns the full original text unchanged.

3. **No offset remapping required**: Character offsets in passages do not need remapping because the stripped body contains offsets that are valid in the original[0, referenceOffset) coordinate system.

4. **Canonical vs. heuristic stripping**:
   - Canonical papers: use verified PDF coordinates, mask ranges to preserve offsets
   - Other papers: use heuristic heading detection, may remove trailing content

## Recommendations

### For Production Use

1. ✅ All invariants are correctly implemented
2. ✅ Edge cases are handled appropriately
3. ✅ Both analysis paths follow the same coordinate transformation
4. ✅ Offset preservation is explicit and verifiable

### For Future Enhancements

1. Consider logging warnings when reference detection confidence is low
2. Consider collecting statistics on reference section sizes and positions
3. Consider exposing confidence flags in the analysis result for transparency

## Conclusion

The implementation correctly preserves the original text prefix `[0, referenceOffset)` after reference stripping and maintains valid page-range offsets in the stripped coordinate system. All 26 test cases pass, covering text prefix preservation, page range clamping, character offset validity, boundary conditions, and integration with both corpus ingestion and manual upload analysis paths.

**Status: AUDIT COMPLETE - ALL INVARIANTS VERIFIED ✅**
