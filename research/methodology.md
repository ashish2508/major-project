# Experimental methodology

Updated: 10 November 2026. Authoritative protocol; approvals and delegated decisions are in [decisions.md](decisions.md), D001–D006. The owner's end-to-end authorization supersedes earlier routine milestone approval gates in historical audit reports.

## Objective and scope

Compare TF-IDF/cosine, frozen all-MiniLM-L6-v2/cosine and weighted hybrid passage detection. Determine observed differences empirically; do not assume hybrid superiority. PAN-PC-11 is the single benchmark. Primary scope is English-to-English external detection. Translation is inventoried but excluded from primary evaluation; no cross-language claim is made. Book-domain results do not establish CS-publication performance.

## Dataset and coordinates

Root: `data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011/`. Full inventory: 11,093 sources, 11,093 suspicious documents, 49,621 annotations, 5,547 positive and 5,546 unannotated suspicious documents. Fingerprint: `5408fc446e1eded99c9e5e361f4e735e168c199b392f9c64066456e17bc5c0e7`.

Strictly decode UTF-8, remove only the initial BOM for the coordinate view, preserve all other characters/newlines and original span numbers. PAN texts have no non-BMP characters, so UTF-16 and code-point indices coincide; reject unverified non-BMP corpus coordinates. Validate both span lengths independently and resolve sources through the inventory. Preserve the seven endpoint anomalies. Retain all raw records but exclude the entire document containing the single zero-length annotation from experimental eligibility. Shortened MD5 values are checked with zero-padding; original strings are retained. Full evidence: [dataset audit](../reports/pan-pc-11/report.md), [production validation](../reports/implementation/dataset-validation.json).

## Splits and experimental population

Use conservative connected groups sharing normalized author OR title. Fix seed `pan-pc11-v1-20261110`. Reserve disjoint family bundles for rare simulated/verbatim examples deterministically by smallest total document size before seeded hashing of remaining families (60/20/20). Retain whole queries only if every annotated source family and their own family belong to the same partition. No random query-row or passage split is used.

Bounded experiment: 80 training queries, 48 validation queries, 48 test queries. Evaluation partitions each contain 24 positives and 24 clean queries. Query cap 50,000 characters; source cap 100,000, except simulated-source allowance 500,000. Add 12 unreferenced source distractors per partition. Score each query over ALL sources in its partition, not annotation-known query pairs. This is a reduced-candidate derived PAN experiment, not a full 11,093-source retrieval benchmark. Collection design includes all annotated sources; document exclusions and bias are explicitly recorded.

Membership, original labels, exclusions and family assignments: [manifest](../reports/implementation/split-manifest.json). Counts and type coverage: [split summary](../reports/implementation/split-summary.json). Shared-family/reference checks and cross-partition normalized five-word shingle containment guard (20 shared shingles and containment >=0.2) are required before scoring. [Leakage results](../reports/implementation/leakage-check.json) cover every selected document; metadata/content checks cannot prove absence of all latent provenance/semantic dependence.

## Representations, retrieval and selection

Generate sentence/paragraph-aware windows with up to 80 whitespace words, 20-word overlap and actual-tokenizer subdivision at 256 total tokens including specials. Never use annotation boundaries to create windows. Use the same windows and candidate collections for every method.

TF-IDF: Unicode alphanumeric tokens with NFKC/lowercase in feature views only; sublinear TF `1+log(count)`, smoothed IDF `log((1+N)/(1+df))+1`, L2 normalization. Fit only training query/source windows. OOV terms contribute zero. No stemming or stop-word removal.

Semantic: cached local all-MiniLM-L6-v2 ONNX export, frozen FP32 weights, 384 dimensions, mean pooling and L2 normalization, batch 16, CPU, four intra-op threads. Remote inference/downloads disabled during execution. Native profiling observed `CPUExecutionProvider`; [provider evidence](../reports/implementation/inference-provider.json). Record hashes of cached model/config/tokenizer files with experiment results. Reject over-budget embeddings instead of silently truncating documents.

Retrieve each query window's best source window over the entire supplied collection independently for each method. Hybrid score is `alpha*lexical + (1-alpha)*semantic`, retaining cosine's possible negative semantic values. Threshold and merge accepted matches only for the same document pair with gaps <=120 characters on both sides; report the strongest window's similarity as evidence, not a calibrated probability.

Select thresholds from [0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9] and hybrid alpha from [0,0.25,0.5,0.75,1], using validation PlagDet, then precision, then higher threshold. Fixed alpha-grid order resolves any remaining tie. Freeze parameters before held-out test scoring. No test-based seed, threshold, weight or preprocessing selection.

## Evaluation

Use external PAN macro character precision/recall: each annotation/detection is the union of its suspicious and source character spans; matching requires correct document identities and positive overlap on both sides. Union overlapping coverage before dividing by the sum of the two independent span lengths. F1 is the harmonic mean. Granularity is detections per detected case; PlagDet is F1 / log2(1+granularity). Empty-set conventions follow the reference implementation. Zero-length spans are excluded by the documented dataset policy, not silently accepted by the evaluator.

Implementation is independently written in TypeScript against the official definitions and external-reference fixtures: [PAN reference implementation](https://github.com/pan-webis-de/pan-code/blob/master/sepln09/pan09-plagiarism-detection-performance-measures.py), [PAN task](https://pan.webis.de/clef11/pan11-web/external-plagiarism-detection.html). No Python execution is introduced.

Report missed cases (no jointly overlapping detection), false-positive detections (no jointly overlapping case), clean-query alerts, per-type coverage where supported, and actual wall time/resource use. One simulated case per partition provides only illustrative coverage, not a reliable type-level estimate. Do not infer full-corpus performance or statistical significance from this bounded experiment. Shared feature generation and per-method scoring/filtering timings must be distinguished; cached inference time is not cold-start time.

## Reproducibility and current status

The paragraph-window follow-up under D008 preserves the original PAN comparison. It uses the same split, representations, grid and selection order, and changes only window construction and merge distance. All three methods use paragraph-bounded windows of up to two sentences, subdivided by the existing word and model-token limits. Merge distance is zero, so windows must touch or overlap on both sides. Fit the TF-IDF vocabulary on the resulting training windows and freeze the validation choices before scoring the same held-out test set. The original experiment and this follow-up share the already inspected split. Treat their comparison as descriptive.

Store commands, code revision/working-tree state, fingerprints, split/config hashes, model hashes, versions, provider, seeds, validation selections, predictions, metrics and failure logs under `reports/implementation/`. Keep weights/raw data/large derived caches outside Git. See [status](status.md) for live progress. No commit or push is authorized.

The [recorded comparison](../reports/implementation/benchmark-summary.md) selected a lexical weight of 1.0 on validation. The hybrid tied TF-IDF at 0.6033 held-out PlagDet, with MiniLM at 0.3047. Interior weights remain validation results. To preserve the recorded comparison when repeating the experiment, set `RESEARCH_RUN_DIRECTORY` to an ignored path before running `bun run reproduce`.

The retained paragraph-window follow-up completed at `2026-11-10T20:58:32.965Z` and changed only window construction and merge distance. Its held-out PlagDet values were 0.3179 for lexical, 0.3140 for MiniLM and 0.3370 for hybrid. Because this follow-up uses a different representation/postprocessing configuration and has 16 clean-query alerts for lexical, it is descriptive evidence only; it does not alter the frozen PAN parameters or the primary comparison.

Validation selected a lexical weight of 0.25 and a threshold of 0.60 for the revised hybrid. The follow-up report compares the full weight sweeps, held-out errors and granularity, and explains why the current split gives little basis for fine-tuning on genuine paraphrases. [Follow-up analysis](../reports/implementation/paragraph-experiment/analysis.md)

Every major milestone closes with relevant documentation, actual checks/results, remaining issues and the next step. Historical functionality checks are not benchmark results. Optional fine-tuning is deferred; the first three methods and their actual comparisons take priority.
