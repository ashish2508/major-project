# Dataset infrastructure and preparation

10 November 2026. Production XML parsing uses fast-xml-parser 5.12.0 (one necessary dependency) plus Zod field validation; the audit regex scanner is not reused as the parser. UTF-8/BOM decoding, independent spans, source mapping, hashes, type-specific attributes and anomalies are validated. The entire external corpus passed in 43.177 seconds with recorded peak RSS 602,206,208 bytes and exactly reproduced the original fingerprint and counts. See `dataset-validation.json`.

The initial tests exposed an XML BOM/whitespace-node handling error; it was corrected before full validation. Current core suite: 33 tests pass, including parser/Unicode, reference-style PAN metrics, segmentation/TF-IDF/retrieval and split guards. A test-fixture TypeScript completeness issue was corrected; final typecheck is recorded separately.

The split preserves whole documents, references and labels. Deterministic conservative family grouping, rare-case reservation, cross-partition quarantine and size/query budgets replace unsafe random query splitting. Final membership is in `split-manifest.json`; 304 documents are used across all partitions. Every selected document was checked with cross-partition five-word shingles: no containment guard violation, maximum observed containment 0.0070126227208976155. This is not a proof of no latent dependence or author aliases.

Validation: 48 queries, 35 sources, 72 cases. Test: 48 queries, 36 sources, 57 cases. Both have one simulated case and verbatim/low/high artificial cases; type-level conclusions are limited by tiny rare-case counts. Training: 80 queries, 57 sources, 126 cases. See `split-summary.json` for exclusions and character budgets.

Remaining limitations: selection favors shorter/fewer-source documents; reduced candidate collection; approximate supplied endpoints; only one simulated case per evaluation partition; no translation performance claim. Next: train TF-IDF only on training windows, generate independent lexical/semantic/hybrid validation scores, freeze hyperparameters and run held-out evaluation without tuning on test outcomes.
