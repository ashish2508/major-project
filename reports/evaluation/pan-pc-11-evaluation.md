# PAN-PC-11 evaluation

Generated from the saved run completed at 2026-11-10T15:15:14.739Z. This report does not rerun detection or alter frozen parameters.

## Evaluation design

The evaluation is character-span macro evaluation using PAN-style interval coverage. A prediction overlaps a ground-truth plagiarism instance only when the suspicious-document reference and source-document reference match and both half-open character intervals overlap. Precision and recall average union coverage over predicted and annotated spans, respectively; F1 is their harmonic mean. The saved result also includes granularity and PlagDet.

Thresholds were selected on the validation partition and frozen before scoring the held-out test partition. Documents are assigned by connected document families so a suspicious/source family cannot cross train, validation, and test. This run uses the bounded English-to-English split, not the full corpus.

False-positive rate here means the fraction of suspicious query documents with no PAN annotations that received at least one alert. It is a clean-document rate, not span-level specificity. Unmatched detection count is separately taken from the PAN span-pair overlap rule.

## Held-out test results

| Method | Threshold | Lexical weight | Precision | Recall |     F1 | Clean-query FPR | Unmatched spans | Method-specific postprocessing (s) |
| ------ | --------: | -------------: | --------: | -----: | -----: | --------------: | --------------: | ---------------------------------: |
| TF-IDF |       0.3 |              1 |    0.7607 | 0.8601 | 0.8074 |   12.50% (3/24) |               6 |                           0.000369 |
| MiniLM |       0.6 |              0 |    0.3541 | 0.5273 | 0.4237 |   37.50% (9/24) |              91 |                           0.000386 |
| Hybrid |       0.3 |              1 |    0.7607 | 0.8601 | 0.8074 |   12.50% (3/24) |               6 |                           0.000248 |

Saved shared test candidate scoring took 54.931 s. MiniLM source and query embedding compute took 78.856 s combined. The benchmark computed shared candidate scores and embeddings once for all methods, so isolated end-to-end per-method time was not measured. Per-method postprocessing times alone must not be read as end-to-end comparisons. Total recorded benchmark wall time was 263.04 s.

## Limits

- PAN-PC-11 is a book-text plagiarism corpus. Results do not establish accuracy on research-paper writing, terminology, citation conventions, or PDF extraction artifacts.
- The evaluation is a bounded subset with reduced source candidates; it is not a full-corpus search.
- Semantic similarity is not itself a plagiarism label. Ground truth comes from PAN annotations.
- The test partition contains only one simulated case, so its type-specific result is not a stable estimate.
- Clean-query FPR uses the 24 unannotated test queries as its denominator and should be interpreted with that small sample size.

Full saved measurements and configurations: [source benchmark](../implementation/benchmark-results.json), [frozen parameters](../implementation/frozen-parameters.json), [split manifest](../implementation/split-manifest.json), and [predictions](../implementation/test-predictions.json).
