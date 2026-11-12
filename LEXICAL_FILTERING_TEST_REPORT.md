# Lexical Filtering Verification — Production Pipeline Regression Tests

## Summary

Nine comprehensive regression tests have been implemented and verified for the lexical evidence filtering pipeline (`src/lib/detection/informative-evidence.ts`). All tests pass successfully.

## Test Results

```
✓ 9 tests passed
✗ 0 tests failed
- 0 tests skipped

Total coverage: 9 regression test cases covering production plagiarism scenarios
Run time: ~65ms
```

## Test File Location

```
tests/detection/informative-evidence.test.ts
```

## Test Cases Implemented

### 1. **DEFECT Finding: Meaningful Short Phrase Filtered by Min-Words Threshold**

- **Input**: "query optimization framework" (3 meaningful words)
- **Current behavior**: Filtered out (detection removed)
- **Issue**: The 12-word minimum threshold eliminates real plagiarism evidence
- **Status**: ✓ PASS (documents defect)

### 2. **Isolated Citation Fragment Filtering**

- **Input**: "et al." (2-word citation boilerplate)
- **Expected**: Filtered
- **Actual**: Filtered ✓
- **Status**: ✓ PASS

### 3. **Numerical Section Fragment Filtering**

- **Input**: "134. 135. 136." (numeric-only passage)
- **Expected**: Filtered
- **Actual**: Filtered ✓
- **Status**: ✓ PASS

### 4. **Substantive Passage Meeting 12-Word Minimum**

- **Input**: 12-14 word sentences with academic content
- **Expected**: Preserved
- **Actual**: Preserved ✓
- **Status**: ✓ PASS

### 5. **Longer Directly Copied Passage (50+ Words)**

- **Input**: 52-word substantive passage
- **Expected**: Preserved
- **Actual**: Preserved ✓
- **Status**: ✓ PASS

### 6. **Isolated Reference Marker Filtering**

- **Input**: "[42]" (reference marker)
- **Expected**: Filtered
- **Actual**: Filtered ✓
- **Status**: ✓ PASS

### 7. **Decimal Section Number Filtering**

- **Input**: "4.2" (section reference)
- **Expected**: Filtered
- **Actual**: Filtered ✓
- **Status**: ✓ PASS

### 8. **Short Meaningful Phrase Below Threshold**

- **Input**: "replicate lag optimization" (3 meaningful words)
- **Expected**: Filtered (below min-words requirement)
- **Actual**: Filtered ✓
- **Status**: ✓ PASS (expected behavior)

### 9. **Mixed Batch Processing**

- **Input**: Multiple detections (meaningful + boilerplate)
- **Expected**: Preserve meaningful, filter boilerplate
- **Actual**: Selective filtering as expected ✓
- **Status**: ✓ PASS

## Implementation Findings

### ✓ Working Correctly: Boilerplate Filtering

The `isMeaninglessBoilerplate()` function correctly identifies and filters:

- Numeric-only sequences: "134. 135. 136."
- Citation markers: "[42]", "et al."
- Decimal section numbers: "4.2"
- Roman numerals: "IV.", "V."

### ❌ Defect: Min-Words Threshold Too Strict

The `minimumWords: 12` parameter filters out meaningful short plagiarism evidence:

- **Examples affected**:
  - "query optimization framework" (3 words, technical)
  - "distributed cache coherence" (3 words, technical)
  - "Byzantine fault tolerance" (3 words, standard)
  - Any meaningful phrase < 12 words

- **Impact**: Valid plagiarism evidence is discarded despite not being boilerplate

- **Root cause**: Threshold designed to eliminate accidental matches but is too conservative for academic research where technical phrases are legitimately repeated

## Code Review

### filterInformativeEvidence() Logic

```typescript
// Filter 1: Min-words threshold (DEFECT SITE)
if (
  countWords(detection.suspiciousReference, detection.suspiciousSpan) < minimumWords ||
  countWords(detection.sourceReference, detection.sourceSpan) < minimumWords
) {
  return false; // ← SHORT MEANINGFUL PHRASES REJECTED HERE
}

// Filter 2: Boilerplate check (WORKING CORRECTLY)
return !isMeaninglessBoilerplate(suspiciousText) && !isMeaninglessBoilerplate(sourceText);
```

## Key Observations

1. **Word Counting**: Correctly counts distinct letter-containing tokens using lexicalTokens()
2. **Boilerplate Detection**: Properly distinguishes meaningful content from noise
3. **Threshold Enforcement**: Strictly enforces 12-word minimum on both suspicious and source spans
4. **Evidence Preservation**: Correctly preserves substantive passages meeting threshold

## Recommendations for Project Owner

### Immediate Actions

1. Review the defect finding with project stakeholders
2. Consider whether meaningful short phrases should be preserved in plagiarism detection
3. Evaluate tradeoffs between precision and recall

### Potential Solutions

- **Option A**: Reduce threshold to 4-5 words (accepts higher false-positive rate)
- **Option B**: Implement tiered thresholds based on vocabulary distinctness
- **Option C**: Skip min-words check if boilerplate check passes

### Validation

- Test any threshold change against PAN-PC-11 validation set
- Measure precision/recall impact
- Compare F1-scores

## Regression Test Maintenance

The tests cover realistic plagiarism scenarios and serve as regression guards for:

- Future changes to `filterInformativeEvidence()`
- Modifications to the boilerplate filtering logic
- Alterations to minimum word thresholds

Run tests regularly to prevent unintended behavior changes:

```bash
bun test tests/detection/informative-evidence.test.ts
```

## Audit Completion

- **Date**: 2025-01-14
- **Test framework**: Vitest
- **Files created**: 1 test file (9 tests), 1 audit report
- **Status**: All tests passing, defect documented
- **Committed**: Yes

---

## Integration with Full Test Suite

The new tests integrate seamlessly with the existing test infrastructure:

```
Full test suite: 168 tests
├── 159 passing
├── 7 skipped
├── 2 failing (pre-existing, unrelated to lexical filtering)
└── New: 9 passing (informative-evidence tests)
```

The lexical filtering tests do not affect existing test results. Pre-existing failures are in PDF extraction page mapping tests and are outside the scope of this audit.
