# Final Engineering Handoff

Date: 11 November 2026

## 1. Executive summary

Passage Review is a local Next.js application for reviewing possible textual similarity between one submitted document and supplied sources. It supports UTF-8 TXT and text-bearing PDF input, TF-IDF, local all-MiniLM-L6-v2 semantic similarity, and a validation-selected hybrid method.

The main remaining product issue was handled honestly: when MiniLM retrieves a related candidate below the frozen detection threshold, the application now shows a neutral `REVIEW LEAD - NOT A CONFIRMED DETECTION` card with its score, source, character ranges and highlighted evidence. Confirmed detections remain the only red positive state. The global threshold and frozen PAN parameters were not changed.

The final native Windows production build uses Webpack. The default Turbopack production bundle produced an unresolved Transformers.js external alias at runtime; the verified Webpack build resolves it correctly.

## 2. Architecture

- `src/app`: Next.js App Router UI, API routes and styling.
- `src/lib/documents`: PDF.js and UTF-8 TXT extraction with source/page metadata.
- `src/lib/detection`: segmentation, TF-IDF, cosine scoring, candidate retrieval and thresholded detection merging.
- `src/lib/embeddings`: local Transformers.js MiniLM loading, tokenizer limits, provider selection and profiling.
- `src/lib/application`: calibrated artifact loading, model hash verification and analysis orchestration.
- `src/lib/evaluation`: PAN-style span matching and metrics.
- `scripts`: dataset preparation, benchmarking, diagnostics, provider checks and smoke tests.

Inference stays local in the Node.js server. No external inference API, Qwen model or Ollama dependency was introduced.

## 3. Work inherited from Codex

The existing project already supplied the PAN-PC-11 parser and split, TF-IDF baseline, MiniLM integration, hybrid scoring, PDF/TXT extraction, paragraph-aware alignment, DirectML profiling, provider reporting, calibrated artifacts, evidence highlighting, controlled fixtures and research documentation. The prior session also switched the production build script to `next build --webpack` after verifying the Turbopack runtime failure.

## 4. Changes implemented in this session

- Added `selectSemanticReviewLead` to choose the highest semantic candidate only when it is below the calibrated threshold.
- Added `semanticReviewLead` to API analysis results without changing `detections`.
- Added focused selector tests for below-threshold, above-threshold and empty candidate sets.
- Added the neutral review-lead UI card with explicit label, score, threshold, source, ranges and evidence navigation.
- Kept confirmed detections as the only red positive banner and kept review leads out of confirmed counts.
- Extended controlled-demo diagnostics to record API review leads.
- Updated README and demo instructions.
- Added this report and `overnight-work-log.md`.

## 5. Detection methods

### TF-IDF

The baseline uses Unicode alphanumeric tokenization, NFKC/lowercase feature views, sublinear term frequency, smoothed IDF, L2 normalization and sparse cosine similarity. The vocabulary is loaded from the calibrated training artifact and checked by SHA-256.

### MiniLM

The application uses the local `onnx-community/all-MiniLM-L6-v2-ONNX` export with FP32 weights, 384-dimensional mean-pooled and normalized embeddings. Inputs are token-counted with the actual tokenizer and rejected when they exceed 256 tokens rather than silently truncated.

### Hybrid

The formula is `alpha * lexical + (1 - alpha) * semantic`. The frozen application configuration selected `alpha = 1` for hybrid, so the recorded hybrid benchmark reduces to the lexical baseline. This was preserved rather than tuned against the demonstration.

## 6. Segmentation and alignment

The detector uses sentence/word windows with tokenizer-aware subdivision. Semantic analysis uses paragraph-bounded one- and two-sentence windows for uploaded documents, preserving extracted offsets and PDF layout boundaries. Evidence merging requires compatible suspicious and source spans. The review lead uses the same candidate spans as the semantic detector, so its highlighted evidence is inspectable and not annotation-derived.

## 7. Paraphrase investigation and findings

The controlled paraphrase case retrieves the intended source candidate, but its best annotated semantic score is below the frozen MiniLM threshold:

- CPU: `0.5265146731`
- DirectML: `0.5265148047` in the focused comparison; final production run: `0.5265148046`
- Frozen semantic threshold: `0.60`

The difference is approximately `1.3e-7`, so the behavior is not a CPU-versus-DirectML discrepancy. The result is treated as a limitation of this fixed model/example combination. No threshold was lowered and no claim of confirmed plagiarism is made.

## 8. Semantic review lead

For semantic-capable analysis, the API now returns the highest-ranked candidate by semantic cosine only when that score is below the method threshold. It remains separate from `detections`. The UI labels it `REVIEW LEAD - NOT A CONFIRMED DETECTION`, displays the score and source ranges, and highlights both passages. The negative control may show a neutral semantic ranking lead, but it produces no confirmed detection.

## 9. GPU execution and consistency

Native Windows production inference reported `DmlExecutionProvider + CPUExecutionProvider`. This is mixed execution, not an exclusive GPU claim. The startup probe verifies that at least one ONNX operator ran on DirectML and fails initialization if that cannot be confirmed. CPU remains supported and is the WSL/default path.

Recorded evidence reports 384-dimensional normalized embeddings. The existing DirectML probe measured a maximum absolute CPU/GPU output difference of `1.155e-7`; its latency and telemetry measurements are documented in [alignment-and-directml.md](alignment-and-directml.md). The corrected controlled diagnostics produced identical scenario decisions on CPU and DirectML.

## 10. Controlled demonstrations

Final native production run through `/api/analyze`:

| Scenario         | TF-IDF                     | MiniLM                                    | Hybrid                                         |
| ---------------- | -------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Direct copy      | 3/3 confirmed, 0 unmatched | 3/3 confirmed, 0 unmatched                | 3/3 confirmed, 0 unmatched                     |
| Paraphrase       | 0/3 confirmed              | 0/3 confirmed; review lead `0.5265`       | 0/3 confirmed; hybrid uses lexical alpha `1`   |
| Negative control | 0 confirmed alerts         | 0 confirmed alerts; neutral lead `0.4226` | 0 confirmed alerts; hybrid score path `0.2433` |

The MiniLM and hybrid production requests reported `DmlExecutionProvider + CPUExecutionProvider`; TF-IDF reported `TF-IDF on CPU`. Direct-copy exact smoke fixtures scored `1.000` for all three methods.

## 11. PAN-PC-11 benchmark

The primary benchmark remains the bounded, family-disjoint English subset of PAN-PC-11. It is book-based and does not establish performance on Computer Science research papers.

| Method |    Threshold | Test precision | Test recall | Test F1 | Test PlagDet |
| ------ | -----------: | -------------: | ----------: | ------: | -----------: |
| TF-IDF |          0.3 |         0.7607 |      0.8601 |  0.8074 |       0.6033 |
| MiniLM |          0.6 |         0.3541 |      0.5273 |  0.4237 |       0.3047 |
| Hybrid | 0.3, alpha 1 |         0.7607 |      0.8601 |  0.8074 |       0.6033 |

The held-out subset contains 48 English queries, 36 candidate sources and 57 annotated cases. Validation selected the lexical hybrid endpoint. These are measured results for the bounded experiment, not full-corpus results and not a claim that hybrid is superior.

## 12. Verification commands and results

- `bun run format:check`: passed.
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun test --run`: 38 passed, 2 skipped, 0 failed; 40 tests across 8 files.
- `INFERENCE_TESTS=1 bun test --run tests/model.integration.test.ts tests/paragraph-review.test.ts`: 3 passed, 0 failed.
- `bun run build`: passed using `next build --webpack`.
- `bun scripts/smoke-app.ts http://127.0.0.1:3100`: passed page, readiness, PDF/text analysis, all three methods, invalid PDF and cross-origin checks.
- `bun scripts/diagnose-demo.ts after http://127.0.0.1:3100`: passed all nine controlled method/scenario requests and recorded review leads.
- Native browser check: paraphrase PDF/TXT showed the review lead label, score `0.527`, source/ranges, highlights and actual DirectML provider.
- `bun test --run tests/detection.test.ts`: 6 passed, 0 failed during implementation.

## 13. Files modified, created and deleted

Modified during this session:

- `src/lib/detection/detector.ts`
- `src/lib/application/analysis.ts`
- `src/app/page.tsx`
- `src/app/globals.css`
- `tests/detection.test.ts`
- `scripts/diagnose-demo.ts`
- `README.md`
- `demo/README.md`
- `reports/implementation/demo-diagnostics-after.json`

Created during this session:

- `reports/implementation/final-handoff-report.md`
- `reports/implementation/overnight-work-log.md`

Deleted during this session: none. Original datasets and model files were not deleted. The retained paragraph-experiment result artifacts remain separate from the primary benchmark.

## 14. Known limitations and partial items

- MiniLM does not reliably cross the frozen threshold for the supplied paraphrase; the review lead improves usefulness but is not a classifier or proof of misconduct.
- The negative-control semantic ranking can still produce a neutral review lead; it is explicitly not a confirmed alert.
- The edge-case suite covers invalid files, empty/short content, UTF-8, PDF signatures, size limits, token limits and repeated request protection in code paths, but a separate unattended manual run for every listed failure mode was not performed.
- OCR/scanned PDFs are unsupported.
- DirectML uses mixed execution and is Windows-specific; WSL uses CPU.
- PAN-PC-11 is book-based and the benchmark is a bounded reduced-candidate experiment.

## 15. Startup and demonstration instructions

```sh
bun install --frozen-lockfile
bun run setup:model
bun run build
bun run start --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000`. For native Windows DirectML, set `$env:MINILM_DEVICE = 'dml'` before `bun run start --hostname 127.0.0.1`. Select each method and use the three pairs in `demo/README.md`. Direct copy should show red confirmed detections, paraphrase should show the neutral review lead, and the negative control should show no confirmed alerts.

## 16. Completion scorecard

Status meanings: **Completed** = fully implemented and verified; **Partial** = implemented but not fully verified; **Failed** = attempted but unsuccessful; **Not attempted** = not addressed.

| Acceptance criterion                   | Status    | Evidence                                                                          |
| -------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| Working production application         | Completed | Webpack build and native production smoke passed                                  |
| PDF input                              | Completed | PDF smoke and controlled PDF diagnostics passed                                   |
| TXT input                              | Completed | TXT source smoke and controlled diagnostics passed                                |
| TF-IDF method                          | Completed | Unit, benchmark and production checks passed                                      |
| MiniLM method                          | Completed | Focused inference and production checks passed                                    |
| Hybrid method                          | Completed | Production smoke and benchmark evidence passed                                    |
| Direct-copy confirmed detections       | Completed | 3/3 for all methods                                                               |
| Semantic paraphrase review lead        | Completed | Live UI and API showed `0.527` lead                                               |
| No confirmed negative-control alert    | Completed | 0 confirmed alerts for all methods                                                |
| Red confirmed-detection banner         | Completed | Existing UI and production smoke evidence                                         |
| Side-by-side highlighted evidence      | Completed | Browser result inspection passed                                                  |
| Actual provider reporting              | Completed | DirectML mixed provider displayed                                                 |
| DirectML execution                     | Completed | Native profile and production provider passed                                     |
| CPU fallback                           | Completed | CPU diagnostics and provider evidence passed                                      |
| CPU/GPU numerical consistency          | Completed | Maximum absolute difference `1.155e-7`                                            |
| Model loading and hash protection      | Completed | Integration test and calibrated hash checks passed                                |
| Listed edge-case matrix                | Partial   | Automated coverage exists; not every manual failure mode was separately exercised |
| PAN configuration integrity            | Completed | Frozen parameters unchanged and benchmark retained                                |
| Documentation and startup instructions | Completed | README, methodology, status and handoff report updated                            |
| Full final verification                | Completed | Formatting, typecheck, lint, tests, build, smoke and browser checks passed        |

Fully completed criteria: 19/20. Partial criteria: 1/20. Failed: 0. Not attempted: 0. Acceptance criteria fully satisfied: **19**. Weighted completion percentage, counting a partial criterion as half complete: **97.5%**.

## 17. Final unresolved work

No implementation blocker remains. The remaining partial item is the breadth of manual edge-case execution; the automated paths and production validation are in place. The scientific limitation of the fixed MiniLM paraphrase example remains intentionally unresolved and is transparently surfaced through review-lead evidence rather than hidden by threshold changes.
