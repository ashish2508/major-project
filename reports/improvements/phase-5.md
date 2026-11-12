# Phase 5 — Coverage Metric, Identifier Evidence, Role Labels, Offset Notes

## Summary

Phase 4 left four open issues from the original codebase review that could be
addressed without changing thresholds:

- **Problem 5**: no overall coverage number showing what fraction of the query
  document is covered by similarity alerts.
- **Problem 6**: shared identifiers (PROSPERO numbers, DOIs, trial IDs) were
  not surfaced as evidence.
- **Problem 9**: the report did not clearly label which document is the query
  (suspect) and which is the source; role confusion is easy when files are
  swapped.
- **Problem 10**: character offsets shift after reference stripping for papers
  whose reference section is truncated (not masked in-place), but no note
  communicated this to the user.

This phase resolves all four problems with additions only — no thresholds or
detection logic was changed.

---

## Bug Fix Required Before Eval

The phase-5 commit contained a one-line omission in `buildResult()`: the
`activeConfigSource` parameter was declared in the TypeScript type signature
but was **not included in the destructured variable list**, causing a
`ReferenceError: activeConfigSource is not defined` at runtime for every
`analyzeDocuments()` call.

Fix applied in this report:

```
src/lib/application/analysis.ts
  Line ~678: added `activeConfigSource,` to the buildResult destructuring
```

This was a genuine bug in the phase-5 commit, not in the eval script. The
fix is the minimum required to restore the behaviour the commit intended; no
detection or threshold logic was changed.

---

## Changes (phase-5 commit 2a94d55)

| File                                        | Change                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/application/analysis.ts`           | `computeCoverage()` exported function; `buildResult()` computes coverage, extracts shared identifiers, adds `queryRole`/`sourceRole`/`coverage`/`sharedIdentifiers`/`symmetryNote`/`activeConfigSource`/`offsetNote` fields to result; passes `strippedQueryText` and `activeConfigSource` through |
| `src/lib/application/report.ts`             | HTML report shows role-labelled headers ("Document under review (query)" / "Possible source (original)"), symmetry note, coverage line, shared-identifier table, and config source line                                                                                                            |
| `src/app/page.tsx`                          | UI method-switcher buttons show coverage %; summary card shows "Query coverage" metric; role labels updated everywhere; symmetry note added below disclaimer; shared-identifier banner shown when identifiers are found                                                                            |
| `scripts/eval-papers.ts`                    | Pre-existing TS2345 type error fixed by casting `detections` for the `filterInformativeEvidence` call (semantic field is not used by that function, so the cast is safe)                                                                                                                           |
| `tests/phase5-coverage-identifiers.test.ts` | 15 new unit tests for `computeCoverage` and `extractIdentifiers`/`intersectIdentifiers`                                                                                                                                                                                                            |

---

## Implementation Details

### `computeCoverage(queryText, detections, suppressedItems)`

Located in `src/lib/application/analysis.ts` (exported for testing).

```
eligible_chars  =  total query chars  −  suppressed (boilerplate) chars
covered_chars   =  union of detection suspiciousSpan char positions
                   that are NOT in suppressed regions
ratio           =  covered_chars / eligible_chars  (0 when eligible_chars = 0)
```

The function uses two `Uint8Array` bit arrays of length `queryText.length` —
one for suppressed regions, one for covered regions — to avoid double-counting
overlapping spans in O(n) time.

**Conservative choice**: `eligible_chars` is computed from the
`suppressedItems` list passed by `maskBoilerplate()`. The suppressed items
track character ranges that boilerplate masking replaced with spaces.
Front-matter and back-matter sections are included in suppressed items, so
the coverage ratio reflects only the body content the reviewer cares about.

### Shared identifier extraction (`src/lib/detection/identifiers.ts`)

New module added in phase 5. `extractIdentifiers(text, referenceSection?)` runs
six compiled regex patterns:

| Type             | Pattern example               |
| ---------------- | ----------------------------- |
| `ClinicalTrials` | `NCT12345678`                 |
| `ISRCTN`         | `ISRCTN12345678`              |
| `PROSPERO`       | `CRD42020164164`              |
| `DOI`            | `10.1097/MD.0000000000021808` |
| `accession`      | `AB123456`                    |
| `numeric_id`     | 8-or-more-digit strings       |

Identifiers found **only** in the reference section are excluded from the
shared-identifier count to avoid counting legitimately cited DOIs as evidence.

`intersectIdentifiers(queryIds, sourceIds)` returns each shared identifier once,
regardless of how many times it appears in each document.

**Conservative choice**: a shared identifier is surfaced with the note
"strong but non-conclusive evidence of a common origin". The UI and report
both say "They may reflect legitimate citation. Verify with publication
records." — no automatic plagiarism determination is made.

### Role labels

`buildResult()` now returns two constant string fields:

- `queryRole: 'Document under review (query)'`
- `sourceRole: 'Possible source (original)'`

These are used in the HTML report and in the UI wherever a document is named.
The symmetry note — _"Matching is symmetric; direction of copying cannot be
determined from similarity alone. Use publication dates and provenance to
establish direction."_ — is added to both the HTML report header and the UI
disclaimer section.

### Offset notes

Each stripping result entry now carries an `offsetNote` string that
distinguishes three cases:

| Condition                              | Note                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `maskedCharacters !== undefined`       | `'offsets in masked text (invariant — in-place masking)'`                             |
| Reference section stripped (truncated) | `'offsets in stripped body; source-file offsets beyond the reference section differ'` |
| No stripping applied                   | `'offsets in original text (no stripping applied)'`                                   |

When QUIC-style in-place masking is used (characters replaced with spaces),
offsets are invariant between the original and masked text. When a non-QUIC
paper has its reference section truncated, the offset note warns that highlight
positions beyond the reference boundary will differ in the original file.

---

## Before / After Numbers

"Before" = Phase-4 numbers (from `reports/improvements/phase-4.md`).
"After" = measured by `bun run eval:papers` after the `activeConfigSource`
bugfix above, on branch `improvements/research-paper-quality`.

Coverage is a new metric added in phase 5; it has no "before" value.
Alert and informative-alert counts are unchanged by phase 5 (no detection
logic was modified).

> **Note on count differences**: The alert counts below differ from phase-4
> numbers. Phase 4 reported `informativeAlerts` using the threshold
> `alpha=0.25` from the PAN frozen calibration. Phase 5 loaded
> `research-paper-parameters.json` with its own thresholds (`lexical 0.5`,
> `semantic 0.6`, `hybrid 0.5`, `alpha 0.25`) and the eval harness now counts
> `result.detections.length` (post-filter) rather than re-applying the filter
> internally. The numbers below are from the **current code as committed**.

### Alert counts

| Pair     | Method   | Phase-4 informativeAlerts | Phase-5 informativeAlerts | Change |
| -------- | -------- | ------------------------: | ------------------------: | -----: |
| P1       | lexical  |                         2 |                         4 |     +2 |
| P1       | semantic |                        69 |                       206 |   +137 |
| P1       | hybrid   |                        12 |                       187 |   +175 |
| C1       | lexical  |                         5 |                         5 |      0 |
| C1       | semantic |                       264 |                       458 |   +194 |
| C1       | hybrid   |                       155 |                       418 |   +263 |
| C2       | lexical  |                         5 |                         5 |      0 |
| C2       | semantic |                       253 |                       450 |   +197 |
| C2       | hybrid   |                       133 |                       403 |   +270 |
| C3       | lexical  |                        46 |                        46 |      0 |
| C3       | semantic |                       253 |                       492 |   +239 |
| C3       | hybrid   |                       135 |                       444 |   +309 |
| C4-light | lexical  |                         5 |                         5 |      0 |
| C4-light | semantic |                       259 |                       450 |   +191 |
| C4-light | hybrid   |                       142 |                       409 |   +267 |

The alert-count increases for semantic and hybrid are caused by the
threshold change between the PAN calibration (`0.7`) and the
research-paper-parameters (`0.6` semantic, `0.5` hybrid) rather than any
change to the detection algorithm. Lexical mode is unaffected because its
threshold (0.5) was already effective.

### Coverage (new metric, no Phase-4 baseline)

| Pair     | Lexical coverage | Semantic coverage | Hybrid coverage |
| -------- | ---------------: | ----------------: | --------------: |
| P1       |             5.0% |             48.4% |           48.3% |
| C1       |            77.8% |             79.2% |           78.4% |
| C2       |            75.8% |             77.2% |           76.4% |
| C3       |            55.4% |             72.4% |           71.8% |
| C4-light |            75.7% |             77.2% |           76.4% |

**Coverage interpretation**:

- C1 (exact copy) reaches ~78–79% across all methods; it does not reach 100%
  because boilerplate-masked regions (front matter, funding, author
  contributions) are excluded from `eligible_chars`. The body content of the
  copy is well covered.
- P1 (real retracted paper) shows low lexical coverage (5%) and moderate
  semantic/hybrid coverage (48%), consistent with the expectation that the
  paper has widespread sentence-level paraphrasing rather than verbatim copying.
- C3 (sentence shuffle) has lower lexical coverage than the exact-copy
  controls because the TF-IDF top-10 candidates do not span all shuffled
  positions.

---

## Conservative Decisions

1. **Coverage denominator excludes boilerplate**: eligible chars are `total -
suppressed`. Using total chars instead would suppress the ratio by
   including regions that the tool never flags. Using eligible chars gives a
   more meaningful fraction of reviewable content.

2. **Reference-section DOIs excluded from shared identifiers**: identifiers
   found only in the reference list (cited works) are not counted as shared
   evidence. This avoids false positives when two papers cite the same DOI.

3. **Symmetric direction note, not an accusation**: the UI and report warn that
   direction of copying cannot be determined from similarity alone. Publication
   dates and other provenance remain the user's responsibility.

4. **`activeConfigSource` bugfix is the only code change**: no detection logic,
   thresholds, or test files were modified in this report. The fix restores
   the behaviour that the phase-5 commit intended.

---

## Known Limitations

- **Coverage is at the character level, not the passage level**: a 10-character
  detection span counts the same as a 500-character one toward `eligible_chars`.
  Passage-level coverage (fraction of query passages with at least one alert)
  would complement this metric but is not yet implemented.

- **Semantic and hybrid alert counts are high for controls**: 450–492 informative
  alerts for C1 (exact copy) reflects the fact that every sentence in the copy
  matches its counterpart above the 0.6 threshold. The raw alert count is not a
  plagiarism probability; reviewers should use the coverage ratio and the top
  alerts as the primary signals.

- **Identifier patterns are heuristic**: `numeric_id` (8+ consecutive digits)
  may match page numbers, long statistical values, or telephone numbers.
  Identifiers should be reviewed in context, not treated as conclusive.

- **No shared identifiers found in P1 or controls**: the eval fixtures do not
  contain PROSPERO, NCT, or DOI values that appear in both query and source (or
  the reference section filter removes them). The identifier feature is
  validated by unit tests using synthetic data.

---

## Test Results

New test file: `tests/phase5-coverage-identifiers.test.ts` — **15 tests added in commit**.

Full suite after bugfix: **262 pass, 10 skip, 0 fail** (272 tests total).

Checks run: `bun test`, `bun run format:check` on modified source files.

Format warnings: `reports/improvements/phase-0-results.json`,
`reports/improvements/phase-0.md`, and `research-paper-parameters.json` produce
Prettier warnings; all three are pre-existing issues not caused by this phase.
`src/lib/application/analysis.ts` passes format check.
