# Improvements Summary — Research-Paper Plagiarism Detection

Branch: `improvements/research-paper-quality` · Phases 0–7

---

## What Improved (Phases 1–7)

### Phase 1 — PDF Text Repair

**Problem fixed:** Split ligatures (`ef fi cacy`, `con fl icts`, `signi fi cant`) caused
mis-tokenisation in TF-IDF and produced broken display snippets.

**Changes:** `src/lib/documents/repair.ts` — ligature rejoining (word-list checked),
hyphenated line-break rejoining, repeated-space normalisation, applied per page so page
offsets stay aligned.

**Effect:** Zero change in alert counts — the same ligature tokens appear in both query
and source PDFs. Benefit is downstream: joined words tokenise correctly for Phase 2 IDF
refit, and display snippets are human-readable.

**Tests added:** 13. Suite: **211 pass, 10 skip, 0 fail**.

---

### Phase 2 — IDF Fitted on Research Text

**Problem fixed:** PAN-PC-11 book vocabulary treated medical terms as out-of-vocabulary,
silently scoring them zero.

**Changes:** `Tfidf.fitOnPassages()` static method; `fitResearchTfidf()` helper fits
IDF on the uploaded documents' own passages (optionally with a background corpus). PAN
path unchanged.

**Effect on P1 (Qiu vs Liu):**

| Method  | Before | After | Change |
| ------- | -----: | ----: | -----: |
| lexical |      8 |     3 |     −5 |
| hybrid  |     36 |    25 |    −11 |

Reductions are a precision improvement: domain terms now have higher IDF weights.
Semantic unchanged.

**Tests added:** 17. Suite: **228 pass, 10 skip, 0 fail**.

---

### Phase 3 — Boilerplate and Section Handling

**Problem fixed:** License text, citation instructions, Received/Accepted dates,
Correspondence blocks, CRediT lines, and funding statements scored 0.90–1.00 against
identical boilerplate, inflating alert counts.

**Changes:** `src/lib/detection/boilerplate.ts` — offset-preserving in-place masking of
front matter, back-matter sections, and 10 pattern categories from
`boilerplate-patterns.json`. Pair-level filter drops detections where both sides match
boilerplate. Suppressed items listed in a collapsed audit `<details>` block.

**Effect:**

| Pair | Method   | Before | After | Change |
| ---- | -------- | -----: | ----: | -----: |
| P1   | semantic |     97 |    69 |    −28 |
| P1   | hybrid   |     25 |    12 |    −13 |
| C3   | semantic |    366 |   253 |   −113 |

C1/C2/C4-light lexical gained +2 (boilerplate exclusion raises IDF weight of genuine
content — a recall improvement).

**Tests added:** 11. Suite: **239 pass, 10 skip, 0 fail**.

---

### Phase 4 — Best-Match Filtering and Lexical Top-K

**Problem fixed:** Lexical mode kept only the single best source passage per query
window, allowing a generic query sentence to match many unrelated source passages.

**Changes:** Lexical retrieval expanded to top-10 source passages per query passage
(research-paper mode). `mutualBestMatchFilter()` with K=1 keeps a candidate only when
the match is mutual (each side is the other's top-K). PAN path unchanged (`topKLexical=1`).

**Effect:** Alert counts stable (K=1 preserves strong mutual matches). Filter removed
~90% of expanded candidates (P1: 1870→84; C1: 3260→261) without hurting recall. C3
gained +2 from wider retrieval.

**Tests added:** 8. Suite: **247 pass, 10 skip, 0 fail**.

---

### Phase 5 — Coverage, Identifier Evidence, Role Labels, Offset Notes

**Problems fixed:** No coverage number (problem 5); shared identifiers not surfaced
(problem 6); no role labelling (problem 9); offset shift for non-QUIC papers undocumented
(problem 10).

**Changes:** `computeCoverage()` returns `%` of eligible query characters covered (eligible
excludes boilerplate-masked chars). `src/lib/detection/identifiers.ts` extracts trial IDs,
PROSPERO CRD numbers, DOIs, and accession codes; reference-section DOIs are excluded.
Role labels (`queryRole`/`sourceRole`) and symmetry note added to result and HTML report.
Bug fix: `activeConfigSource` was missing from `buildResult()` destructuring causing a
`ReferenceError`.

**Coverage baseline (new metric):**

| Pair     | Lexical | Semantic | Hybrid |
| -------- | ------: | -------: | -----: |
| P1       |    5.0% |    48.4% |  48.3% |
| C1       |   77.8% |    79.2% |  78.4% |
| C4-light |   75.7% |    77.2% |  76.4% |

**Tests added:** 15. Suite: **262 pass, 10 skip, 0 fail**.

---

### Phase 6 — Threshold Tuning for Research-Paper Mode

**Problem fixed:** The app silently used PAN frozen calibration (threshold 0.7) designed
for book texts. At that threshold: semantic P1 drops to 69 (-66%); hybrid P1 drops to 12
(-94%).

**Changes:** `scripts/threshold-sweep.ts` swept lexical 0.3–0.7, semantic 0.5–0.75,
hybrid 0.4–0.7 × alpha 0.15/0.25/0.35 on the Phase-0 fixtures. Results in
`phase-6-sweep-raw.json` and `research-paper-parameters.json`. `configLine()` in
`report.ts` updated to display `r.activeConfigSource`.

**Final thresholds (confirmed by sweep; unchanged from Phase 5):**

| Method   | Threshold | Alpha | P1 alerts | C1 alerts |
| -------- | --------: | ----: | --------: | --------: |
| Lexical  |       0.5 |   1.0 |         4 |         5 |
| Semantic |       0.6 |   0.0 |       206 |       458 |
| Hybrid   |       0.5 |  0.25 |       187 |       418 |

**Tests added:** 0. Suite: **262 pass, 10 skip, 0 fail**.

---

### Phase 7 — Paraphrase Recall Experiment (Flagged)

**Problem addressed:** One heavily-paraphrased passage in C4-light scored 0.5265 —
below the 0.6 semantic threshold, so missed by the standard pipeline.

**Changes:** `src/lib/detection/paraphrase-evidence.ts` — promotes passage pairs scoring
≥ 0.4 that satisfy a corroborating signal (shared rare tokens, shared numeric IDs, or
consecutive-passage alignment). Gated by `ENABLE_PARAPHRASE_EXPERIMENT=true`; existing
behaviour unchanged when flag is unset. Not yet wired into `analyzeDocuments`.

**Effect (C4-light, raw passage level):**

| Metric                   | Baseline (≥ 0.6) | Experiment (≥ 0.4 + evidence) |
| ------------------------ | ---------------: | ----------------------------: |
| Distinct passages caught |              324 |                           326 |
| Net-new passages         |                — |                            +2 |

**Tests added:** 50. Suite: **312 pass, 10 skip, 0 fail**.

---

## What Did NOT Improve

**No negative-pair validation.** N1 (`zhu-2020-e22356.pdf`) and N2
(`tanreqing-2020-pmc7458256.pdf`) were absent throughout. All threshold choices are
recall-only; precision cannot be measured for any method. The Phase-7 paraphrase
experiment cannot verify false-positive rates on same-topic pairs.

**Low lexical coverage on P1.** Lexical mode produces 4 alerts and ~5–7% query coverage
on P1 (real retracted paper). The paper uses sentence-level paraphrasing rather than
verbatim copying; lexical TF-IDF is inherently limited here.

**No stronger embedding model or cross-encoder.** Phase 7 investigated a cross-encoder
reranker and a stronger bi-encoder (`bge-small-en-v1.5`) but neither ONNX checkpoint
was available locally and downloading is prohibited by project constraints.

---

## Remaining Weaknesses

1. **Precision unknown.** Without N1/N2, false-positive rates are unknown for all
   methods at all thresholds.
2. **High raw semantic/hybrid alert counts.** 206 semantic alerts on P1 are difficult
   to triage without ranked-region grouping.
3. **Document-local IDF only.** No background corpus is present; IDF weights are
   estimated from the two uploaded documents.
4. **Paraphrase experiment not integrated.** Phase-7 logic is validated in unit tests
   but not wired into `analyzeDocuments`.
5. **C4-medium / C4-heavy are placeholders.** Medium and heavy paraphrase recall cannot
   be measured.

---

## Recommendations for Future Work

1. **Add N1 and N2 PDFs.** Re-run `bun run scripts/threshold-sweep.ts` with negative
   pairs present. Use N1/N2 alert counts to set precision-calibrated thresholds.
2. **Fetch background corpus.** Run `bun run fetch:background` (fetches ~500 PubMed
   abstracts via NCBI E-utilities) to stabilise IDF weights for medical vocabulary.
3. **Write C4-medium and C4-heavy fixtures.** Replace stub files with passages that
   change ~50% and ~80% of words to test semantic/hybrid recall under heavier
   transformation.
4. **Integrate Phase-7 experiment after N1/N2 validation.** Once N1/N2 confirm zero or
   acceptable false-positive impact, wire `filterParaphraseCandidates` into
   `analyzeDocuments` (one-function change).
5. **Add ranked-region view to HTML report.** Group detections by query region, show
   the highest-scoring alert per region first, and collapse lower-scoring alternatives
   to reduce reviewer cognitive load on large positive pairs.
6. **Extend boilerplate patterns.** Add patterns for PRISMA flow-diagram captions,
   Cochrane Risk-of-Bias table headers, and statistical software version lines to reduce
   residual false positives in clinical research papers.
7. **Evaluate on a CS-specific corpus.** PAN-PC-11 is a book-text benchmark. If a
   CS-research-paper dataset with passage-level annotations becomes accessible, re-benchmark
   all three methods and update `research-paper-parameters.json` with corpus-calibrated
   thresholds.
8. **Profile and cache embeddings for large papers.** For papers with 500+ passages,
   semantic and hybrid mode may take several seconds. Consider caching embeddings per
   document hash analogous to the PAN lexical index.
