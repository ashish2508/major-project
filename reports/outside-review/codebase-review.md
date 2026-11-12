# Codebase Review: Plagiarism Detection Tool

**Reviewer:** Automated codebase inspection  
**Date:** 2026-11-12  
**Workspace root:** `C:\Users\aincrad\Desktop\CODE\major-project`  
**Read-only:** Yes. No files were modified.

---

## 1. Overview

The tool is a Next.js 16 web application that accepts a "query" (suspect) document and one or more "source" documents, segments both into short text passages, and measures similarity using three independently implemented methods: TF-IDF cosine similarity (lexical), `all-MiniLM-L6-v2` sentence embeddings (semantic), and a weighted linear blend of the two (hybrid). It runs entirely locally: the ONNX model is loaded from disk, and no network requests are made during inference. The UI renders side-by-side highlighted passages for each alert and can download a self-contained HTML report. The same detection pipeline is also used as a research benchmark on the PAN-PC-11 plagiarism corpus.

**Stack**

| Item              | Value                                                            |
| ----------------- | ---------------------------------------------------------------- |
| Language          | TypeScript                                                       |
| Frontend          | Next.js 16.4.5 + React 19                                        |
| Package manager   | Bun 1.2.20                                                       |
| Embedding model   | `onnx-community/all-MiniLM-L6-v2-ONNX` (local)                   |
| Inference runtime | ONNX Runtime via `@huggingface/transformers` 4.3.2               |
| PDF extraction    | `pdfjs-dist` 6.5.438                                             |
| Validation        | Zod 4.6.7                                                        |
| Test runner       | Vitest 5.1.0                                                     |
| CPU/GPU           | CPU by default; DirectML on native Windows (`MINILM_DEVICE=dml`) |

**Repo layout (key files)**

```
src/
  app/
    page.tsx                  UI: file upload, method selector, highlighted results
    api/analyze/route.ts      POST endpoint: accepts form-data, calls analyzeDocuments()
  lib/
    application/
      analysis.ts             Main analysis pipeline (strip → segment → embed → retrieve → detect)
      report.ts               HTML report builder
      request.ts              Request parsing and validation
    detection/
      detector.ts             retrieveCandidates(), detect(), merge logic
      segmentation.ts         segment(), segmentParagraphs() — passage windowing
      tfidf.ts                Tfidf class, lexicalTokens(), sparseCosine()
      strip-references.ts     Reference-section stripping
      semantic-review.ts      contextualReviewLeads() — pooled-context review leads
      informative-evidence.ts filterInformativeEvidence() — boilerplate filter
    embeddings/model.ts       Model loading, embedTexts(), tokenCounter()
    documents/extract.ts      PDF.js extraction + text validation
    evaluation/pan.ts         PAN metrics implementation
demo/                         3 synthetic pairs (direct copy, paraphrase, negative control)
reports/implementation/
  alignment-fusion/frozen-parameters.json   Frozen thresholds loaded by the app
  benchmark-summary.md        PAN-PC-11 primary results
  paragraph-experiment/       Follow-up paragraph-window experiment
tests/                        39 unit/integration tests (Vitest)
```

---

## 2. Input Handling

**Accepted inputs:** PDF upload (up to 15 MB, 80-page limit), UTF-8 `.txt` upload, or pasted text (textarea `maxLength=250000`). Up to 6 source documents. Documents can also be pre-indexed into a persistent SQLite-backed corpus and searched.

**Role assignment.** The UI labels the left panel "Document to review" (the query / suspect) and the right panel "Possible sources". The HTML report and API response use the field names `query` and `sources`. There is no explicit "you have this backwards" guard; a user could upload the original as the query and the plagiarised copy as the source, which would still produce detections but with swapped labels.

**PDF extraction** (`src/lib/documents/extract.ts`). Uses PDF.js with `useSystemFonts: true, disableFontFace: true`. Pages are concatenated with `\n\n` separators; `item.hasEOL` triggers `\n`. Line detection uses vertical coordinate: a new paragraph break is inserted when `|y_new - y_prev| > 1.6 × max(height_prev, height_new)`. NUL bytes from unmapped glyphs are replaced with spaces (offset-preserving). Page offsets are recorded for each page.

Known PDF problems not mitigated: ligature artifacts (fi, fl etc. from embedded encoding), two-column reading order (PDF.js reads one stream, interleaving columns), hyphenation at line breaks, running headers/footers (included as text). The 1.6× threshold heuristic will split paragraphs in some layouts and merge headings into body in others.

**Size limits**

| Limit                | Value   | File            |
| -------------------- | ------- | --------------- |
| Upload size          | 15 MB   | `extract.ts:3`  |
| Extracted characters | 250,000 | `extract.ts:4`  |
| PDF pages            | 80      | `extract.ts:46` |

**Preprocessing** (`src/lib/detection/tfidf.ts:2`):

```ts
text
  .normalize('NFKC')
  .toLowerCase()
  .match(/[\p{L}\p{N}]+/gu);
```

NFKC normalisation + lowercase. Tokens are Unicode letter/number sequences; punctuation and whitespace discarded. No stemming, no stop-word removal. OOV terms silently score zero (vocabulary fitted on PAN training windows only).

**Reference stripping** (`src/lib/detection/strip-references.ts`). Two regex patterns: (1) clean-line pattern matching `References|Bibliography|Works Cited` on its own line, case-insensitive; (2) two-column fallback requiring ≥10 spaces after the keyword. A "prose guard" rejects the match if the 300 characters after the heading contain >54 words (treating that as body text, not citations). Minimum 50 trailing characters required. For the two QUIC papers, hardcoded character-range masks are used instead, preserving offsets. Strips only the first plausible heading found. Acknowledgements, funding statements, conflict-of-interest lines, author contributions, affiliations, and "How to cite" blurbs are **not** stripped.

---

## 3. Segmentation

**Primary method used by the app** (`segmentParagraphs()`, `src/lib/detection/segmentation.ts:11`). Paragraph boundaries come from: blank lines (`\r?\n\s*\r?\n`), page separators injected by `extract.ts`, and explicit `paragraphBreaks` metadata from PDF.js. Within each paragraph, sentences are identified by the pattern `[\s\S]+?(?:[.!?]+(?=\s|$)|$)`. Each sentence and each consecutive sentence pair generates a window candidate. Those windows are then passed through `segment()` for token-budget enforcement.

**Window parameters** (`src/lib/detection/segmentation.ts:50`):

| Parameter          | Value    | Note                                                           |
| ------------------ | -------- | -------------------------------------------------------------- |
| Max words          | 80       | Whitespace-delimited tokens                                    |
| Overlap            | 20 words | Used in `segment()` only when paragraph spans multiple windows |
| Max tokens         | 256      | Includes special tokens; enforced by tokenizer                 |
| Min distinct words | 12       | Filter applied after merging in `filterInformativeEvidence()`  |

**Short-window filter.** `segmentParagraphs()` drops windows from documents with more than one paragraph if the window has ≤10 words and no sentence-ending punctuation. Headings (≤10 words, no terminal punctuation, followed immediately by body text) are excluded from evidence spans.

**Page and offset tracking.** `attachPassagePages()` maps passage character offsets to one-based page numbers using the PDF page boundary records. Character offsets in `Passage` are always relative to the full extracted (stripped) string. If reference stripping shortens the text, offsets shift accordingly — the app only strips by zeroing bytes for QUIC (preserving length) or by slicing (shifting offsets for the remaining papers), which means source-offset labels in the report can be off for non-QUIC papers where stripping removed a leading reference section. This is a minor issue in practice since the reference section comes at the end of most papers.

**Typical passage count for a 4-page CS paper.** Unsure — no profiling data exists for a typical 4-page paper. The external evaluation over 12 papers (each 8–30 pages) produced an average of roughly 2,927 unique passages per paper set (`research-paper-validation.md`: "2927 unique passages in 19.0s"). A 4-page paper would likely yield 50–150 passages.

---

## 4. Matching Methods

### 4.1 Lexical (TF-IDF + cosine)

| Parameter       | Value                                                | File:line                                 |
| --------------- | ---------------------------------------------------- | ----------------------------------------- |
| Tokenizer       | NFKC/lowercase Unicode letter+number sequences       | `tfidf.ts:2`                              |
| TF weighting    | Sublinear: `1 + log(count)`                          | `tfidf.ts:19`                             |
| IDF weighting   | Smoothed: `log((1+N)/(1+df)) + 1`                    | `tfidf.ts:19`                             |
| Normalization   | L2 on transform output                               | `tfidf.ts:25`                             |
| Stemming        | None                                                 | —                                         |
| Stop words      | None                                                 | —                                         |
| OOV handling    | Silently zero                                        | `tfidf.ts:22`                             |
| Vocabulary      | Fitted on PAN training windows only                  | `analysis.ts:45`                          |
| Threshold (app) | 0.6                                                  | `alignment-fusion/frozen-parameters.json` |
| Similarity      | Cosine (dot product of L2-normalised sparse vectors) | `tfidf.ts:27`                             |

For lexical-only mode, the detector keeps **only the single best-matching source passage** per query passage (`detector.ts:106`). For hybrid mode (which calls the same code path), it keeps top-50 by lexical and top-50 by semantic, then unions them.

### 4.2 Semantic (MiniLM embeddings)

| Parameter        | Value                                      | File:line                                 |
| ---------------- | ------------------------------------------ | ----------------------------------------- |
| Model            | `onnx-community/all-MiniLM-L6-v2-ONNX`     | `model.ts:3`                              |
| Dimensions       | 384                                        | `model.ts:14`                             |
| Precision        | FP32                                       | `model.ts:14`                             |
| Pooling          | Mean pooling                               | `model.ts:62`                             |
| Normalization    | L2 (by model, asserted at load)            | `detector.ts:70`                          |
| Max tokens       | 256 (including specials)                   | `model.ts:13`                             |
| Batch size       | 16                                         | `model.ts:14`                             |
| Default device   | CPU                                        | `model.ts:30`                             |
| DirectML device  | Windows native only (`MINILM_DEVICE=dml`)  | `model.ts:30`                             |
| Intra-op threads | 4                                          | `model.ts:14`                             |
| Similarity       | Cosine; value clamped to [−1, 1]           | `detector.ts:98`                          |
| Threshold (app)  | 0.7                                        | `alignment-fusion/frozen-parameters.json` |
| Remote download  | Disabled (`env.allowRemoteModels = false`) | `model.ts:21`                             |

Embeddings are deduplicated by text before batching (`analysis.ts`). Over-budget passages throw an error rather than silently truncating.

### 4.3 Hybrid

| Parameter                | Value                                        | File:line                                 |
| ------------------------ | -------------------------------------------- | ----------------------------------------- |
| Formula                  | `alpha × lexical + (1 − alpha) × semantic`   | `detector.ts:171`                         |
| alpha (app)              | 0.25                                         | `alignment-fusion/frozen-parameters.json` |
| Threshold (app)          | 0.7                                          | `alignment-fusion/frozen-parameters.json` |
| Lexical score clamp      | `Math.min(1, raw_dot)` before combining      | `detector.ts:109`                         |
| Semantic negative values | Retained (not clamped to 0 before combining) | methodology.md                            |

**Note on alpha=0.25:** With alpha=0.25, the hybrid score is 25% lexical + 75% semantic. This was selected by validation PlagDet on PAN-PC-11. Because the validation also selected alpha=1.0 (pure lexical) as the winner in the original window experiment, the app actually ships a **different** frozen-parameters file from the PAN benchmark result. The benchmark (`frozen-parameters.json` at root implementation level, not alignment-fusion) used threshold 0.3 and alpha=1.0 for hybrid, which makes it identical to TF-IDF. The _application_ uses `alignment-fusion/frozen-parameters.json` with threshold=0.7, alpha=0.25. This is the paragraph-window follow-up configuration.

**Candidate retrieval.** For hybrid/semantic mode: top-50 by lexical + top-50 by semantic = up to 100 candidates per query passage. No approximate search; exhaustive dot-product against all source passages.

---

## 5. Post-processing

**Merge logic** (`detect()`, `detector.ts:184`). Candidates above threshold are sorted by (suspiciousReference, sourceReference, offset). Adjacent pairs merge if both their suspicious spans and their source spans have a gap ≤ `mergeGap` (120 characters). Merging also requires consistent ordering: if two windows are merged, the query ordering and source ordering must agree (no inversions). The merged detection inherits the highest-scoring window's score.

**One-to-many.** A query passage can match multiple source passages, and there is no best-match-only or mutual-best-match filter. Each (query, source) document pair is handled independently; a query passage matching the same source document at different offsets can produce multiple detections.

**Boilerplate filtering** (`filterInformativeEvidence()`, `informative-evidence.ts`). Post-merge filter requiring both sides to have ≥12 distinct word-containing tokens. Pure number/single-letter sequences (`"134. 135. 136."`, `"[17, 18]"`, `"IV."`) are rejected. This runs after merge for lexical; it also runs for semantic/hybrid when `alignSemantically=true`.

There is **no** specific filter for: "How to cite", data-sharing statements, conflict-of-interest lines, funding acknowledgements, author affiliations, or license boilerplate. These can appear in the body before the reference section and will be detected if they share wording.

**Similarity alerts vs. review recommendations vs. semantic matches.**

- **Similarity alerts** (`detections`): passages scoring above the method's threshold after merge and evidence filtering. Presented as "Confirmed similarity alerts" in the UI.
- **Review recommendations** (`semanticReviewLeads`): produced only by `contextualReviewLeads()` for semantic/hybrid runs. Pooled-context score using summed window vectors within a paragraph span. Excludes query spans already covered by a confirmed detection. At most `limit=5` leads, one per unique source context. These are shown as "Potential semantic matches — require human review" in the UI report and as `REVIEW LEAD - NOT A CONFIRMED DETECTION` in the demo.
- **Context score logic** (`semantic-review.ts:49`): adjacent passage vectors are summed (not averaged, not re-normalised) to form a pooled context vector. The source context that best matches each query context (by dense cosine) is recorded. The score used is `denseCosine(pooled_query_vector, pooled_source_vector)` — using unnormalised sums. This score is not directly comparable to the per-window cosine scores from retrieval.

**Overall coverage score.** There is none. The UI shows only a count of alerts (`r.detections.length`), review recommendations (`r.semanticReviewLeads.length`), and total passage counts. No percentage of the query document covered by alerts is computed or displayed.

---

## 6. Output / Report

**UI:** Summary line showing method, threshold, alpha, merge gap, provider, and model; a count of alerts and review recommendations; then a list of detection cards. Each card shows the score (animated counting display), query and source page numbers, character offsets, and side-by-side highlighted text with `<mark>` elements. A downloadable `.html` file is generated client-side.

**Disclaimers** (in both the HTML report and the JSON API response):

> "Similarity scores are uncalibrated evidence for human review, not probabilities or proof of plagiarism or misconduct. Only searched sources were evaluated. PAN-PC-11 calibration is book-based and does not establish CS-paper performance."

The HTML report also includes:

> "Algorithmic similarity requires human interpretation. It does not establish plagiarism. Review recommendations use uncalibrated context scores. PAN-PC-11 calibration uses book texts and does not establish research-paper accuracy. Only supplied sources were searched. PDF text reading order may differ from visual layout."

Wording is appropriately hedged throughout.

---

## 7. Calibration and Testing

**PAN-PC-11 benchmark** (primary). 80/48/48 family-disjoint split; 48 test queries (24 positive, 24 clean) against 36 source documents, 57 annotations. Results (from `benchmark-summary.md`):

| Method         | Threshold | Test Precision | Test Recall | Test F1 | Test PlagDet |
| -------------- | --------- | -------------- | ----------- | ------- | ------------ |
| TF-IDF         | 0.3       | 0.761          | 0.860       | 0.807   | 0.603        |
| MiniLM         | 0.6       | 0.354          | 0.527       | 0.424   | 0.305        |
| Hybrid (α=1.0) | 0.3       | 0.761          | 0.860       | 0.807   | 0.603        |

Hybrid tied TF-IDF because validation selected α=1.0 (pure lexical). This is the **primary frozen benchmark**.

**Paragraph-window follow-up** (descriptive only, `paragraph-experiment/analysis.md`):

| Method | Threshold | α    | Test F1 | Test PlagDet |
| ------ | --------- | ---- | ------- | ------------ |
| TF-IDF | 0.60      | 1.0  | 0.538   | 0.318        |
| MiniLM | 0.70      | 0.0  | 0.616   | 0.314        |
| Hybrid | 0.60      | 0.25 | 0.701   | 0.337        |

This configuration (α=0.25, threshold=0.7) is what the **application actually uses**, but its PlagDet is 0.337 — lower than the primary TF-IDF baseline of 0.603. The application configuration was not re-frozen after the paragraph-window experiment changed performance characteristics.

**Existing tests** (`tests/`, 39 total as of last verification):

| Test file                           | What it covers                                         |
| ----------------------------------- | ------------------------------------------------------ |
| `detection.test.ts`                 | Windowing, merge, threshold logic                      |
| `strip-references.test.ts`          | Heading regex, prose guard, QUIC coordinate masks      |
| `retrieval.test.ts`                 | Candidate retrieval, scoring, top-k                    |
| `informative-evidence.test.ts`      | Boilerplate filter                                     |
| `model.integration.test.ts`         | Live MiniLM inference (INFERENCE_TESTS=1)              |
| `research-paper-validation.test.ts` | PAN metric sanity, span helpers                        |
| `production-calibration.test.ts`    | Frozen-parameter checksum verification                 |
| `pdf-nul-extraction.test.ts`        | NUL-byte replacement in PDF extraction                 |
| `extraction.test.ts`                | File validation, format detection                      |
| Others                              | Corpus management, e2e PDF analysis, split, evaluation |

**Controlled synthetic pairs** (`demo/`). Three pairs: direct copy (3 verbatim paragraphs), paraphrase (3 rewrites), negative control (unrelated topics). Measured results (`alignment-and-directml.md`): direct-copy: 3/3 detected, 0 false positives for all three methods. Paraphrase: 0/3 detected for all three methods at the frozen thresholds — the highest MiniLM score for a paraphrase candidate was **0.5265**, below the 0.6 threshold.

**Research-paper validation** (`research-paper-validation.md`). Four genuine CS passages from two real papers, with synthetic verbatim and hand-paraphrase documents. Direct copies: all detected at high scores. Paraphrases: semantic recovered all with granularity ~2 (over-fragmenting), lexical and hybrid produced recall ~0.74 with false positives.

**No negative controls at corpus scale.** No test measures false-positive rate on a large collection of unrelated CS papers. The external 12-paper evaluation produced 1,719 TF-IDF alerts across 132 directed comparisons (13 per directed pair on average), but has no ground truth to classify them.

---

## 8. Current Results on Test Pair (Liu / Qiu)

The Liu et al. (Medicine 2020;99(35):e21808) and Qiu et al. (Medicine 2020;99(37):e22022) PDFs are **not present** in the repository. Searches across all directories found no file named `liu`, `qiu`, `plag`, `21808`, `22022`, `original`, or `query` (beyond the demo synthetic pairs). No saved output for this pair exists in `reports/`.

This section cannot be completed. The tool cannot be run on this pair without the PDF files.

---

## 9. Known Weaknesses

1. **Vocabulary mismatch.** The TF-IDF vocabulary was fitted on PAN-PC-11 book-text training windows. CS research paper terms (domain jargon, model names, dataset names, algorithm names, equation labels) will largely be OOV and score zero, reducing lexical sensitivity for technical CS content.

2. **No stop-word removal.** High-frequency academic phrases ("in this paper", "we propose", "it can be seen that") will appear in the vocabulary and score lexically, producing false positives when two papers from the same domain use common phrasing.

3. **Boilerplate scoring high.** The `informative-evidence.ts` filter only removes token-sparse spans (numbers, single letters). Complete but generic sentences like "All authors read and approved the final manuscript.", "Data sharing not applicable.", "The authors declare no competing interests.", shared GLUE benchmark table headers, or standard venue/publication lines are not filtered. The external evaluation confirmed this: a hybrid score of 1.000 on "Proceedings of the 27th Conference on Computational Natural Language Learning" vs. a different conference notice.

4. **Shared methodology vocabulary.** Two CS papers on related topics will share significant technical terminology. The external evaluation found MiniLM scoring 0.954 on shared GLUE benchmark column labels between unrelated papers, and 0.797 on two papers both discussing TCP congestion control. Same-subfield negative pairs are not controlled in any evaluation.

5. **TF-IDF lexical-only retrieval uses only the best source passage per query** (`detector.ts:106`). If the actual copied passage is not the single top-scoring source passage for a given query window, it will be missed silently. This "one best" design is noted in comments as "legacy behavior for performance", contrasting with the top-50+50 union used for hybrid.

6. **MiniLM context-pooling review leads use unnormalised summed vectors** (`semantic-review.ts:30`). Adjacent passage vectors are added without re-normalising before cosine comparison. The score from this path is not on the same scale as the per-window retrieval scores, and there is no threshold calibration for it; the results are presented without a threshold gate.

7. **Hybrid configuration divergence.** The app loads `alignment-fusion/frozen-parameters.json` (paragraph-window experiment, α=0.25, threshold=0.7, PlagDet 0.337 on the follow-up) but the main benchmark paper reports results from the original window experiment (α=1.0, threshold=0.3, PlagDet 0.603). The app's hybrid PlagDet is lower than TF-IDF by a large margin. The UI shows the app config as "validation-selected" without noting it comes from the follow-up, not the primary benchmark.

8. **No overall coverage number.** The report shows a count of alerts but not what fraction of the query document is covered. A paper could have 2 alerts covering 10% of the text or 2 alerts covering 90%; both look identical in the summary line.

9. **PDF two-column layout.** PDF.js reads text items in the order the PDF stream provides them, which for two-column layouts typically interleaves columns. Reference stripping partially compensates for one pattern (≥10-space gap), but body text in two-column papers will produce garbled passage windows. This is acknowledged in comments but not mitigated for the body.

10. **Thresholds calibrated on book text, not CS papers.** PAN-PC-11 consists of Project Gutenberg book extracts. The optimal threshold for the precision/recall trade-off in CS research paper comparisons is unknown. The disclaimer is correct, but the thresholds are presented as the defaults.

11. **MiniLM paraphrase detection is weak at current threshold.** The highest measured score for hand-written paraphrase in the demo was 0.5265, below the 0.6 alert threshold. The PAN paraphrase recall (simulated cases) was 7/23 for the original window experiment. Genuinely reworded plagiarism may not trigger semantic alerts.

12. **No figure, table, or equation content.** Extracted text from PDF.js for tables and equations often yields garbled token sequences. The `informative-evidence` filter may pass some; others produce high lexical scores from shared numeric content (confirmed by TF-IDF 0.588 on two unrelated figures in the external evaluation).

13. **Single-source-passage retrieval for lexical mode** (see weakness 5). The semantic/hybrid mode uses union of top-50+50, which is much more thorough.

14. **Merge uses strongest-window score, not merged-span score.** The score reported for a merged detection is the score of the strongest contributing window, not a property of the full merged span. A large merged span with one high-scoring window and many low-scoring ones shows the same score as a single-window detection.

---

## 10. Open Questions

1. **Why does lexical-only retrieval keep only the single best source passage per query window, while hybrid keeps 50+50?** This design is labelled "legacy behavior for performance" in comments but no analysis of the false-negative cost has been recorded.

2. **Why is the app configured from the paragraph-window follow-up (`alignment-fusion/frozen-parameters.json`, PlagDet 0.337) rather than the stronger primary benchmark configuration (PlagDet 0.603)?** The paragraph-window analysis.md says "The application retains the original configuration for TF-IDF and the lexical-only hybrid", but `analysis.ts` imports from `alignment-fusion/frozen-parameters.json`, which shows threshold 0.7 and α=0.25 for hybrid, not 0.3/1.0. This discrepancy is unexplained.

3. **What is the correct threshold for CS papers?** No calibration or sensitivity study was done on a CS paper collection. The thresholds are book-text optima.

4. **Is the context-pooling score in `contextualReviewLeads()` calibrated at all?** The function sums (not averages) vectors across a paragraph span without re-normalising, then computes cosine. No threshold gate is applied; all leads below the main detection threshold are shown. The relationship between this score and the retrieval cosine score is undefined.

5. **How does the vocabulary OOV rate affect lexical recall on CS papers?** The PAN vocabulary covers book-domain words. No OOV analysis was done on the 12 external CS papers.

6. **What happens with scanned PDFs?** The code throws: "Scanned PDFs require OCR, which is not included." Many older CS papers are scanned. This limitation is not surfaced in the UI until upload.

7. **Are source offsets in the report valid after reference stripping for non-QUIC papers?** For non-QUIC papers, `stripReferences()` shortens `doc.text` by slicing, shifting all offsets. The displayed character offset labels reference the stripped text, not the original PDF page content. A user trying to locate a passage in the original PDF by offset would get the wrong position.

8. **Why is `isMeaninglessBoilerplate()` applied only to individual spans, not to pairs?** A pair of spans could each individually contain ≥12 real words, but both contain the same ubiquitous boilerplate sentence. The filter would pass them through. No shared-boilerplate list is maintained.

---

## Questions I want advice on

1. **Threshold calibration for CS papers.** The current thresholds were chosen to maximise PlagDet on PAN-PC-11 book text. What would be a practical methodology to estimate appropriate thresholds for CS research papers, given the absence of a CS-domain annotated dataset?

2. **Boilerplate suppression.** The tool scores shared venue names, benchmark table headers, and standard method sections highly. Should a fixed block-list of common academic boilerplate phrases be maintained (e.g., "All authors read and approved", "The authors declare no conflict", GLUE/benchmark table headers), or is there a data-driven way to identify and suppress such phrases without a CS-domain corpus?

3. **Improving paraphrase recall without lowering the threshold globally.** The MiniLM paraphrase score of 0.5265 is below the 0.6 threshold. Would fine-tuning on positive/negative paraphrase pairs from PAN-PC-11 lift paraphrase scores enough to justify a lower threshold? What would be needed to avoid inflating false positives on same-topic negatives?

4. **Same-subfield false positive rate.** No measurement exists of how many alerts are produced between two completely unrelated CS papers in the same subfield (e.g., two different NLP papers). What proportion of alerts on same-topic negative pairs would you expect, and how should this be reported to users?

5. **Hybrid divergence from benchmark.** The app's hybrid method (α=0.25, threshold=0.7, PlagDet 0.337) performs substantially worse on PAN-PC-11 than the original benchmark TF-IDF (PlagDet 0.603). Is there a principled way to select the application configuration, or should the app revert to the primary benchmark configuration for honesty in reporting?

6. **Coverage metric.** Should the tool report what fraction of the query document's character span is covered by confirmed detections? A coverage percentage would help users distinguish a paper with minor verbatim overlap from one where most paragraphs are flagged.

7. **PDF extraction quality.** For two-column CS papers, the current column-interleaving problem produces garbled passages. Would switching to a layout-aware extractor (e.g., using PDF.js bounding-box information to separate columns) meaningfully reduce false positives from extraction artifacts?

8. **Lexical-only single-best-match limitation.** The lexical path keeps only the top-1 source passage per query window. For a query document with many passages, some ground-truth source passages may lose to irrelevant passages that happen to share more vocabulary. Should lexical mode also use a top-k union to match the coverage of the hybrid path?
