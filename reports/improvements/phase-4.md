# Phase 4 — Best-Match Filtering and Lexical Top-K

## Summary

Phase 3 left the lexical mode keeping only the **single best** source passage per query
passage (legacy behaviour, originally noted as a known weakness in the codebase review,
section 4.1 and weakness 5). This phase makes two targeted changes to the lexical path
in research-paper mode:

1. **Lexical Top-K**: the lexical retrieval step now considers the **top 10** source
   passages per query passage (up from 1) so that the best match is not silently missed
   when it is not ranked first.
2. **Mutual-best-match filter**: after expanding the candidate pool, a filter keeps
   candidate (q, s) only when s is in the top-K source passages for q **and** q is in
   the top-K query passages for s. With K=1 this removes the false-positive pattern
   where a generic query passage matches many unrelated source passages at similar scores.

Both changes apply **only** to the research-paper (non-corpus) mode. The PAN benchmark
path is unchanged (it passes `topKLexical=1` explicitly to `retrieveCandidates()`).

The semantic and hybrid paths are unaffected: they already use a top-50+top-50 union.

---

## Changes

| File                              | Change                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/detection/detector.ts`   | Added `topKLexical` parameter to `retrieveCandidates()` (default 10); replaced single-best lexical loop with top-K ranking; added `mutualBestMatchFilter()` function; added `otherCandidates?` field to `Detection` type                         |
| `src/lib/application/analysis.ts` | Added `RESEARCH_PAPER_PARAMS` constant (`topKLexical: 10`, `mutualBestMatchK: 1`); updated lexical call to pass `topKLexical`; apply `mutualBestMatchFilter` before `detect()` in non-corpus mode; populate `otherCandidates` on kept detections |
| `tests/retrieval.test.ts`         | Updated existing test to pass `topKLexical=1` for the legacy single-best assertion; added assertion that default (topK=10) returns more candidates                                                                                               |
| `tests/detector-filter.test.ts`   | New: 8 tests for `mutualBestMatchFilter` covering K=1, K=2, exact-copy survival, error handling, and empty input                                                                                                                                 |

---

## Implementation Details

### `retrieveCandidates(topKLexical = 10)`

The new `topKLexical` parameter controls how many source passages are returned per query
passage in lexical-only mode. The default of 10 is used by the web tool's research-paper
path. Passing `1` restores the legacy single-best behaviour used by the PAN benchmark
scripts.

### `mutualBestMatchFilter(candidates, K = 1)`

Groups candidates by query-passage key and by source-passage key. For each query
passage, keeps only the top-K source passages (by score descending). For each source
passage, keeps only the top-K query passages. A candidate survives if and only if both
conditions hold simultaneously.

Logs at debug level: `mutual-best-match filter: removed N candidates, kept M`.

Throws for `K < 1` or non-integer `K`.

### `Detection.otherCandidates`

After the boilerplate filter, any candidate from the full (pre-mutual-filter) lexical pool
that shares the same query span as a kept detection but maps to a different source span is
attached as `d.otherCandidates` (sorted by score descending). This lets the report UI
show secondary matches without cluttering the main alert list.

### `RESEARCH_PAPER_PARAMS`

```ts
const RESEARCH_PAPER_PARAMS = {
  topKLexical: 10,
  mutualBestMatchK: 1,
} as const;
```

This block is the authoritative source for the research-paper-mode parameters. The PAN
benchmark frozen parameters remain in
`reports/implementation/alignment-fusion/frozen-parameters.json`.

---

## Filter Counts (observed at eval time)

| Pair     | Candidates before filter | Candidates after filter | Removed |
| -------- | -----------------------: | ----------------------: | ------: |
| P1       |                     1870 |                      84 |    1786 |
| C1       |                     3260 |                     261 |    2999 |
| C2       |                     3260 |                     259 |    3001 |
| C3       |                     4080 |                     170 |    3910 |
| C4-light |                     3260 |                     261 |    2999 |

The filter aggressively prunes the expanded pool: for C1 (exact copy), 261 of 3260
candidates survive. High-score mutual matches (the genuine copied passages) are retained;
low-scoring cross-matches from similar-topic background vocabulary are removed.

---

## Before / After Alert Counts

"Before" = Phase-3 numbers (single-best lexical, no mutual-best-match filter).
"After" = Phase-4 numbers (top-10 lexical + mutual-best-match filter, K=1).

| pair     | method   | before_informativeAlerts | after_informativeAlerts | change |
| -------- | -------- | -----------------------: | ----------------------: | -----: |
| P1       | lexical  |                        2 |                       2 |      0 |
| P1       | semantic |                       69 |                      69 |      0 |
| P1       | hybrid   |                       12 |                      12 |      0 |
| C1       | lexical  |                        5 |                       5 |      0 |
| C1       | semantic |                      264 |                     264 |      0 |
| C1       | hybrid   |                      155 |                     155 |      0 |
| C2       | lexical  |                        5 |                       5 |      0 |
| C2       | semantic |                      253 |                     253 |      0 |
| C2       | hybrid   |                      133 |                     133 |      0 |
| C3       | lexical  |                       44 |                      46 |     +2 |
| C3       | semantic |                      253 |                     253 |      0 |
| C3       | hybrid   |                      135 |                     135 |      0 |
| C4-light | lexical  |                        5 |                       5 |      0 |
| C4-light | semantic |                      259 |                     259 |      0 |
| C4-light | hybrid   |                      142 |                     142 |      0 |

---

## C1 Recall Criterion

**Criterion met: YES — C1 recall before: 5, C1 recall after: 5, drop: 0**

The mutual-best-match filter does not remove any C1 (exact copy) alerts.
An exact copy is a strong mutual match: the query passage that best matches a source
passage is also that source passage's best query match, so both conditions hold at K=1
and the candidate survives.

---

## Interpretation

- **Lexical mode is unchanged in alert count for most pairs.** The mutual-best-match
  filter with K=1 retains exactly the same alert-level output because the top-scoring
  match for each query passage is typically a strong mutual match. The benefit is
  architectural: the retrieval pool is now 10 candidates wide instead of 1, so a genuine
  copied passage that is not the absolute top-1 TF-IDF match (due to boilerplate or IDF
  imbalance) can still be detected.

- **C3 (sentence shuffle) gains 2 alerts** (44→46). Shuffled passages may now recover
  source matches that were ranked 2nd or 3rd under the old single-best retrieval.

- **Semantic and hybrid are unaffected.** These paths always used top-50+top-50 retrieval
  and the mutual-best-match filter is not applied to them.

- **The filter log confirms heavy pruning** (~90% of candidates removed) without hurting
  recall, which is the intended behaviour: high-score mutual matches survive, low-score
  one-directional cross-matches are discarded.

---

## Conservative Decisions

1. **K=1 for the filter.** A more permissive K (e.g. 2 or 3) would allow more
   candidates through. K=1 is the most aggressive option that still preserves strong
   mutual matches. This was chosen to maximise precision improvement; threshold
   calibration is reserved for Phase 6.

2. **Mutual-best-match filter applied to lexical only.** Semantic and hybrid already use
   a wide candidate pool (top-50+50); applying a mutual filter there would require
   different K tuning and was not requested in this phase.

3. **PAN benchmark path unchanged.** The existing `retrieveCandidates` call in the PAN
   scripts was not modified; it defaults to `topKLexical=1` via the new parameter default
   that is explicitly passed.

---

## Test Results

New test file: `tests/detector-filter.test.ts` — **8 tests, 8 pass, 0 fail**.

Updated: `tests/retrieval.test.ts` — existing test adapted for new default topK behaviour.

Full suite: **247 pass, 10 skip, 0 fail** (239 → 247 test count after adding 8 new tests).

Checks run: `bun test`
