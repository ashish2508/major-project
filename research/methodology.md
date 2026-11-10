# Experimental methodology

Last updated: 10 November 2026. This is the authoritative experimental protocol record. It is incomplete where decisions remain pending; those gaps must not be filled by assumption. Root [AGENTS.md](../AGENTS.md) supplies project constraints, and [decisions.md](decisions.md) records approvals and rationale.

## Approved research design

Investigate whether combining lexical and semantic similarity improves textual plagiarism detection compared with either technique independently. Improvement is a research question, not an established finding.

Use PAN-PC-11 as the single primary benchmark, with the external detection corpus as the primary focus. Preserve annotation relationships and character offsets. The intended application domain is CS research publications; the book-based benchmark does not establish performance in that domain.

Evaluate three methods independently:

1. TF-IDF with cosine similarity, passage segmentation and thresholding.
2. Pretrained all-MiniLM-L6-v2 with local Transformers.js/ONNX execution, 384-dimensional embeddings and cosine similarity, without updating model weights.
3. Hybrid scoring: `alpha * lexical + (1 - alpha) * semantic`. Select alpha and decision thresholds through validation experiments.

Use validation data for parameter selection; prevent leakage between training, validation and test data. Evaluate final methods on the same held-out test data. Record configurations and experimental parameters. Optional fine-tuning follows completion of all three methods and requires a separate suitability assessment and any necessary approval.

Use official PAN passage-level precision, recall, F1, granularity and PlagDet. Accuracy and false-positive rate may be reported where appropriate, with their definitions and denominators stated. Do not substitute document/pair classification metrics for the required passage-level evaluation. Protocol reference: [PAN external detection 2011](https://pan.webis.de/clef11/pan11-web/external-plagiarism-detection.html).

## Observed corpus facts — evidence, not new approvals

Dataset location:

```text
data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011/
```

The [audit report](../reports/pan-pc-11/report.md), [machine-readable results](../reports/pan-pc-11/results.json) and [offline tokenizer probe](../reports/pan-pc-11/token-probe.json) contain the detailed evidence and reproduction instructions.

- External corpus: 11,093 sources, 11,093 suspicious documents, 49,621 instances; 5,547 positive and 5,546 unannotated suspicious documents.
- Instances: 39,870 artificial, 4,609 simulated and 5,142 translation. `obfuscation` and `manual_obfuscation` are distinct attributes.
- All suspicious documents are labeled English. Sources include English, German and Spanish; languages here are metadata labels.
- All external text files have UTF-8 BOMs. Passage-comparison evidence supports decoded-character offsets after excluding the initial BOM. UTF-16/code-point indices coincide throughout this extraction because no non-BMP characters were found. Seven unobfuscated pairs retain endpoint discrepancies.
- One annotation has zero suspicious length. No source references are missing. Eighty shortened MD5 values match after zero-padding.
- Source reuse produces a giant connected component. Balanced whole-component splits retaining all cases are infeasible under the audited relationships.
- The model card's 256-word-piece default differs from the exported tokenizer/model configuration values. Explicit token budgeting must be settled for model evaluation; silently truncating whole documents is unsuitable.

External text/XML fingerprint:

```text
5408fc446e1eded99c9e5e361f4e735e168c199b392f9c64066456e17bc5c0e7
```

The audit defines fingerprint construction. Repeated full scans produced this fingerprint. These measurements are dataset/functionality findings, not detector performance results.

## Protocol decisions still pending

| Area | Current state |
|---|---|
| Language scope | English-only primary evaluation and separate translation reporting are proposed, not approved. |
| Parser architecture | Types and responsibilities are proposed in the audit; production parser not implemented. |
| Coordinates and anomalies | Production BOM mapping, endpoint discrepancy policy and zero-length evaluation treatment require explicit documentation/approval. |
| Leakage grouping | Source relationships are measured; book-family candidates need verification and a grouping policy. |
| Split design | No split assignment, approved ratio, seed or quarantine policy exists. Feasibility analysis is recommended first. |
| TF-IDF configuration | Tokenization, normalization, vocabulary/IDF fitting scope and parameters are not finalized. |
| Semantic configuration | Exact model revision, inference dtype/provider, token budget, segmentation/windowing and pooling configuration must be frozen for experiments. Existing functionality checks do not finalize an experimental configuration. |
| Hybrid and thresholds | Alpha and thresholds remain unset; choose through validation only. |
| Evaluation implementation | PAN-compatible evaluator and edge-case checks are not implemented. |

The audit proposes training-only fitting of data-dependent preprocessing, splitting before chunk/negative generation, identical candidate collections across methods and transparent quarantine reporting. These details remain recommendations until approved. Do not supply annotation-known source pairs to an end-to-end detector without explicitly redefining the experiment as given-pair alignment.

## Experiment and milestone records

For each experiment, save the dataset fingerprint/scope, split manifest, code revision and working-tree state, commands, runtime/dependency versions, random seeds, preprocessing/model settings, validation choices, execution provider actually used, outputs and metric definitions/results under `reports/`. Record failures, exclusions and deviations. Keep datasets and downloaded model files out of Git.

Before closing a major milestone, update this protocol where applicable, record approved decisions, and save a report covering accomplishments, actual verification, unresolved issues and the next recommended step. If checks were not run, say so. Do not present earlier functionality results as current tests or benchmark measurements.

Current evidence: the dataset audit is complete. Earlier project instructions record successful build, ONNX loading and 384-dimensional embedding functionality checks; they were not rerun for this documentation update. No lexical, semantic or hybrid plagiarism benchmark has been run. The [continuity milestone record](../reports/project-continuity.md) records the documentation setup and its verification.
