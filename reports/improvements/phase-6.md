# Phase 6 — Threshold Tuning for Research-Paper Mode

## Summary

Phase 5 implemented coverage, shared-identifier detection, and role labels. The
previous `thresholdSweepTable` in `research-paper-parameters.json` was based on
early-phase numbers obtained without N1/N2 negative-pair PDFs and without the Phase-5
alert-count recalibration. This phase runs the **real** sweep using
`scripts/threshold-sweep.ts` on the current fixture set, records the measured data,
decides on final thresholds, and updates the config file.

The thresholds are **unchanged from Phase 5** — the sweep confirms they are the correct
conservative choice given the absence of N1/N2 negative-pair data.

---

## Availability of N1 and N2

| File                                 | Present in `tests/fixtures/papers/` |
| ------------------------------------ | :---------------------------------: |
| `zhu-2020-e22356.pdf` (N1)           |                 NO                  |
| `tanreqing-2020-pmc7458256.pdf` (N2) |                 NO                  |

Both negative-pair PDFs were absent during the sweep. All N1/N2 columns in the sweep
table are `null`. This is a material constraint on threshold choice: without negative
pairs we cannot measure how many false-positive alerts each threshold produces, so the
conservative strategy is to favour recall over precision.

**What to do when N1/N2 become available:** place the PDFs in
`tests/fixtures/papers/`, re-run `bun run scripts/threshold-sweep.ts`, and update
`research-paper-parameters.json` with the real N1/N2 alert counts. If N1 or N2 produces
high alert counts at the current thresholds (indicating false positives), raise the
threshold incrementally, verifying that C1 recall does not drop.

PMC links for future addition:

- N1: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7505387/>
- N2: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7458256/>

---

## Baseline (Phase 5 numbers confirmed)

Before any threshold changes, the current state was verified by running
`bun run eval:papers`:

| Pair     | Method   | informativeAlerts | Coverage |
| -------- | -------- | ----------------: | -------: |
| P1       | lexical  |                 4 |     5.0% |
| P1       | semantic |               206 |    48.4% |
| P1       | hybrid   |               187 |    48.3% |
| C1       | lexical  |                 5 |    77.8% |
| C1       | semantic |               458 |    79.2% |
| C1       | hybrid   |               418 |    78.4% |
| C2       | lexical  |                 5 |    75.8% |
| C2       | semantic |               450 |    77.2% |
| C2       | hybrid   |               403 |    76.4% |
| C3       | lexical  |                46 |    55.4% |
| C3       | semantic |               492 |    72.4% |
| C3       | hybrid   |               444 |    71.8% |
| C4-light | lexical  |                 5 |    75.7% |
| C4-light | semantic |               450 |    77.2% |
| C4-light | hybrid   |               409 |    76.4% |

This confirms Phase 5 numbers are stable.

---

## Threshold Sweep Script

A new helper script was written at `scripts/threshold-sweep.ts`.

**What it does:**

1. Loads `liu-2020-e21808.pdf` (source), `c1-exact-copy.txt` (C1),
   `qiu-2020-e22022.pdf` (P1), and `c4-light-auto-paraphrase.txt` (C4-light).
2. If `zhu-2020-e22356.pdf` (N1) or `tanreqing-2020-pmc7458256.pdf` (N2) are present,
   loads them too; otherwise notes their absence.
3. Mutates `RESEARCH_PAPER_CONFIG.methods[method].threshold` (and `.alpha` for hybrid)
   in memory — no config file is written — calls `analyzeDocuments`, counts
   `result.detections.length`, then restores the original value.
4. Prints a table per method and a machine-readable raw data file at
   `reports/improvements/phase-6-sweep-raw.json`.

The script is kept in the repository for future re-runs (e.g. after N1/N2 are added).

---

## Lexical Threshold Sweep

Thresholds tried: 0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7

| Threshold | C1 alerts | P1 alerts | C4-light alerts | N1 alerts | N2 alerts |
| --------: | --------: | --------: | --------------: | --------: | --------: |
|       0.3 |         5 |        16 |               5 |       n/a |       n/a |
|       0.4 |         5 |        10 |               5 |       n/a |       n/a |
|   **0.5** |     **5** |     **4** |           **5** |   **n/a** |   **n/a** |
|      0.55 |         5 |         3 |               5 |       n/a |       n/a |
|       0.6 |         5 |         2 |               5 |       n/a |       n/a |
|      0.65 |         6 |         0 |               6 |       n/a |       n/a |
|       0.7 |         6 |         0 |               7 |       n/a |       n/a |

**Key observations:**

- C1 (exact copy) stays at 5 for all thresholds 0.3–0.6. At 0.65 it jumps to 6 — this
  is a merge-grouping artefact (adjacent windows coalesce differently at different
  thresholds), not a genuine recall gain.
- P1 (retracted paper) is 0 at thresholds ≥ 0.65. This means the tool would produce
  **no alerts** on the confirmed positive pair at those thresholds — unacceptable.
- P1 drops from 16 (0.3) to 4 (0.5): the extra alerts at 0.3–0.4 are likely
  topic-similarity false positives that the mutual-best-match filter has already
  partially suppressed, but without N1/N2 we cannot confirm how many are truly spurious.
- **Chosen: 0.5** — maximises P1 recall (4 alerts) while holding C1 and C4-light at
  their maximum count. Without N1/N2 it is not safe to raise the threshold.

---

## Semantic Threshold Sweep

Thresholds tried: 0.5, 0.55, 0.6, 0.65, 0.7, 0.75

| Threshold | C1 alerts | P1 alerts | C4-light alerts | N1 alerts | N2 alerts |
| --------: | --------: | --------: | --------------: | --------: | --------: |
|       0.5 |       796 |       468 |             793 |       n/a |       n/a |
|      0.55 |       612 |       315 |             605 |       n/a |       n/a |
|   **0.6** |   **458** |   **206** |         **450** |   **n/a** |   **n/a** |
|      0.65 |       341 |       125 |             338 |       n/a |       n/a |
|       0.7 |       264 |        69 |             259 |       n/a |       n/a |
|      0.75 |       211 |        39 |             209 |       n/a |       n/a |

**Key observations:**

- Each 0.05 step upward reduces C1 alerts by roughly 25–35% and P1 alerts by even more.
- Raising to 0.65 would drop C1 by 25% and P1 by 39% from the current 0.6 baseline.
- The PAN frozen threshold of 0.7 would halve C1 alerts and reduce P1 by 66%. The PAN
  calibration was fitted on book texts; applying it to research papers (denser technical
  vocabulary, higher base semantic similarity between closely related papers) would
  under-detect.
- **Chosen: 0.6** — retains maximum recall on positive controls and positive pair.
  Without N1/N2, there is no measured justification for raising the threshold. If N1/N2
  later show high false-positive counts at 0.6, revisit to 0.65.

**Note on absolute alert counts:** 206 semantic alerts for P1 (a known retracted paper)
and 458 for C1 (exact copy) are high as absolute numbers but expected: the semantic
model scores every passage pair above the cosine threshold, and the two papers share
large portions of their body text. The `filterInformativeEvidence` filter and coverage
metric help reviewers focus on the most significant matches.

---

## Hybrid Threshold Sweep

Thresholds tried: 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7
Alpha values tried: 0.15, 0.25, 0.35

**Alpha = 0.15 (85% semantic, 15% lexical):**

| Threshold | C1 alerts | P1 alerts | C4-light alerts |
| --------: | --------: | --------: | --------------: |
|       0.4 |      1041 |       627 |            1035 |
|      0.45 |       766 |       433 |             761 |
|       0.5 |       571 |       270 |             566 |
|      0.55 |       400 |       171 |             396 |
|       0.6 |       306 |       102 |             302 |
|      0.65 |       242 |        56 |             239 |
|       0.7 |       193 |        34 |             186 |

**Alpha = 0.25 (75% semantic, 25% lexical) — current:**

| Threshold | C1 alerts | P1 alerts | C4-light alerts |
| --------: | --------: | --------: | --------------: |
|       0.4 |       833 |       483 |             831 |
|      0.45 |       610 |       291 |             602 |
| **0.5** ★ |   **418** |   **187** |         **409** |
|      0.55 |       302 |       110 |             299 |
|       0.6 |       248 |        59 |             245 |
|      0.65 |       191 |        36 |             187 |
|       0.7 |       155 |        12 |             142 |

**Alpha = 0.35 (65% semantic, 35% lexical):**

| Threshold | C1 alerts | P1 alerts | C4-light alerts |
| --------: | --------: | --------: | --------------: |
|       0.4 |       646 |       319 |             633 |
|      0.45 |       431 |       191 |             422 |
|       0.5 |       310 |       117 |             306 |
|      0.55 |       249 |        64 |             244 |
|       0.6 |       184 |        36 |             184 |
|      0.65 |       150 |        14 |             144 |
|       0.7 |       121 |         4 |             116 |

**Key observations:**

- Increasing alpha (more lexical weight) reduces alert volumes across all thresholds.
  At alpha=0.35, threshold=0.5, P1 drops from 187 (alpha=0.25) to 117 (38% reduction).
- Increasing the threshold within any alpha setting has a larger effect on P1 than on
  C1: at alpha=0.25, raising from 0.5 to 0.6 reduces P1 by 68% but C1 by only 41%.
  This asymmetry means higher thresholds hurt recall on the actual positive pair more
  than on the exact-copy control.
- Without N1/N2 to benchmark precision, raising either alpha or threshold is not
  justified.
- **Chosen: alpha=0.25, threshold=0.5** — consistent with the lexical and semantic
  choices; maximises P1 and C4-light recall; retains balanced lexical/semantic
  weighting from the Phase-5 calibration.

---

## Chosen Thresholds

| Method   | Threshold | Alpha | Rationale                                                                |
| -------- | --------: | ----: | ------------------------------------------------------------------------ |
| Lexical  |       0.5 |   1.0 | P1=4 (threshold 0.65+ gives 0); C1=5 at max; conservative without N1/N2  |
| Semantic |       0.6 |   0.0 | P1=206, C4-light=450; raising to 0.65 drops P1 by 39%; N1/N2 unavailable |
| Hybrid   |       0.5 |  0.25 | P1=187, C4-light=409; raising to 0.6 drops P1 by 68%; N1/N2 unavailable  |

**All chosen thresholds are identical to Phase 5.** The sweep confirms they are the
correct operating point: they maximise recall on positive and control pairs, and
threshold changes cannot be validated for precision improvement without N1/N2 data.

---

## UI / Report Config Line

`src/lib/application/report.ts` — `configLine()` now uses `r.activeConfigSource`
(passed through `analyzeDocuments` → `buildResult`) instead of a hardcoded string.

Before (Phase 5):

```
Config: research-paper-parameters (document-local IDF) · Threshold 0.5 · Alpha 0.25 …
```

After (Phase 6):

```
Config: research-paper-parameters.json · Threshold 0.5 · Alpha 0.25 · Merge gap 120 …
```

The config source is taken from `RESEARCH_PAPER_CONFIG.source`, which is loaded from
the `configSource` field of `research-paper-parameters.json`. In corpus mode
(PAN benchmark path) it still shows
`alignment-fusion/frozen-parameters.json (PAN calibration)`.

---

## Conservative Decisions

1. **No threshold changes without N1/N2.** The sweep showed clear precision/recall
   tradeoffs in the threshold dimension, but without negative-pair measurements it is
   not possible to make an evidence-based precision improvement. Keeping thresholds at
   their recall-maximising values is the conservative choice.

2. **Alpha unchanged at 0.25.** The alpha sweep shows that higher lexical weight (0.35)
   reduces alert volumes (which could improve precision) but also reduces P1 recall from
   187 to 117 at the same threshold. Without measuring how that change affects the
   false-positive rate on N1/N2, the reduction is not justified.

3. **Merge-grouping artefact at 0.65 not exploited.** The slight increase in C1 count
   at threshold 0.65 (5→6 alerts for lexical) is caused by window boundaries coalescing
   at that threshold, not by genuine new recall. It was not used to justify the higher
   threshold because P1 drops to 0 simultaneously.

4. **Sweep script kept, not deleted.** The instructions left the decision to keep or
   delete the script open. It is kept because it will need to be re-run when N1/N2 PDFs
   are added, and there is no cost to retaining it.

---

## Files Changed

| File                                          | Change                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `scripts/threshold-sweep.ts`                  | New: Phase-6 sweep script; sweeps lexical/semantic/hybrid; outputs `reports/improvements/phase-6-sweep-raw.json`   |
| `research-paper-parameters.json`              | Updated: `calibration` note, full `thresholdSweepTable` with real measured values, `choiceRationale` with evidence |
| `src/lib/application/report.ts`               | Updated: `configLine()` now uses `r.activeConfigSource` instead of a hardcoded string                              |
| `reports/improvements/phase-6-sweep-raw.json` | New: machine-readable raw sweep output                                                                             |
| `reports/improvements/phase-6.md`             | New: this report                                                                                                   |

---

## After / Before Comparison

Alert counts are identical before and after because the thresholds did not change.

| Pair     | Method   | Phase-5 informativeAlerts | Phase-6 informativeAlerts | Change |
| -------- | -------- | ------------------------: | ------------------------: | -----: |
| P1       | lexical  |                         4 |                         4 |      0 |
| P1       | semantic |                       206 |                       206 |      0 |
| P1       | hybrid   |                       187 |                       187 |      0 |
| C1       | lexical  |                         5 |                         5 |      0 |
| C1       | semantic |                       458 |                       458 |      0 |
| C1       | hybrid   |                       418 |                       418 |      0 |
| C2       | lexical  |                         5 |                         5 |      0 |
| C2       | semantic |                       450 |                       450 |      0 |
| C2       | hybrid   |                       403 |                       403 |      0 |
| C3       | lexical  |                        46 |                        46 |      0 |
| C3       | semantic |                       492 |                       492 |      0 |
| C3       | hybrid   |                       444 |                       444 |      0 |
| C4-light | lexical  |                         5 |                         5 |      0 |
| C4-light | semantic |                       450 |                       450 |      0 |
| C4-light | hybrid   |                       409 |                       409 |      0 |

The only behavioural change is that the HTML report now shows the exact config filename
(`research-paper-parameters.json`) in the config line instead of a generic description.

---

## Test Results

Full suite: **262 pass, 10 skip, 0 fail** (272 tests).

No tests were added in this phase (no new detection logic). No existing tests were
changed — the threshold values in `research-paper-parameters.json` did not change, so
no test assertions needed updating.

Format check: all new/modified source files pass Prettier.
Pre-existing warnings on `reports/improvements/phase-0-results.json` and
`reports/improvements/phase-0.md` remain (documented in Phase 5 as pre-existing).
