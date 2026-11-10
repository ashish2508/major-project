# Project decision record

Last updated: 10 November 2026.

This record captures approved decisions and their reasoning. Dataset observations belong in reports; recommendations remain pending until the owner approves them. Existing approved constraints are inherited from root [AGENTS.md](../AGENTS.md), rather than newly approved by creating this file.

## D001 — Research scope and technical baseline

Status: approved, inherited. Original approval date is not recorded here.

Investigate textual plagiarism using PAN-PC-11 as the single primary benchmark. Compare TF-IDF/cosine, frozen all-MiniLM-L6-v2/cosine and a weighted hybrid independently. Select thresholds and hybrid weight using validation data, and evaluate on the same held-out test data. Use official PAN passage-level metrics. Fine-tuning is optional and follows completion of the first three experiments.

The intended application is CS research publications, but PAN-PC-11 is book-based and does not establish CS-domain generalization. An accessible CS-specific dataset with suitable verified passage annotations was not established during prior investigation. No additional dataset or replacement is authorized.

Use local inference with Transformers.js and ONNX Runtime, TypeScript, Bun, Next.js/React, PDF.js and Zod. External paid AI APIs are excluded. Python requires technical necessity and explicit approval. Preserve offsets, source relationships and reproducibility; report suspicious similarities without definitive misconduct accusations.

Reasoning and provenance: the owner's existing project instructions in [AGENTS.md](../AGENTS.md), sections 1–11. Further historical rationale should not be invented.

## D002 — Repository-based continuity

Status: approved on 10 November 2026 by explicit owner instruction following the dataset audit.

Use this Codex workspace as the primary environment for the whole project. Keep finalized constraints in `AGENTS.md`, decision rationale in this file, the authoritative experimental protocol in [methodology.md](methodology.md), and detailed evidence in `reports/`. Update the relevant documentation before closing each major milestone. Summarize large terminal outputs and preserve detailed results in files.

At each milestone, report accomplishments, actual checks/results, remaining issues and the recommended next step. After compaction, consult project records before assuming prior decisions. Maintain continuity without asking the owner to transfer context manually between ChatGPT and Codex.

Reasoning: this is a long-term research project; development and academic reproducibility must survive conversation compaction. Explicit approval status prevents exploratory recommendations from becoming methodology accidentally.

## Historical audit proposals — superseded by D003–D006

At the audit milestone, the following recommendations were pending. D003 subsequently delegated their resolution; D004–D006 record the adopted scope, policies and experiment configuration:

- English-to-English primary evaluation and separate translation stress evaluation.
- Production parser interfaces, file organization and XML validation approach.
- Explicit production BOM/offset policy and handling of endpoint discrepancies.
- Evaluation treatment of the zero-length annotation.
- Verified document-family grouping and the precise leakage-resistant split policy.
- Accepting uneven whole-component partitions versus an approved derived subset with quarantined documents; split ratios and seed remain unset.

The earlier implementation approval gate was superseded by D003. Refer to research/status.md for current progress; this historical list does not impose a new milestone approval requirement.

## Recording future decisions

Append a stable decision ID, approval date/provenance, status, the concrete decision, rationale, consequences and supporting evidence. Mark replaced decisions as superseded and link their replacements. Keep proposals separate from approved entries, and update methodology and `AGENTS.md` when their scope is affected.

## D003 — Autonomous end-to-end implementation

Status: approved on 10 November 2026 by the owner's explicit full-roadmap instruction.

Proceed through dataset infrastructure, defensible splits, lexical/semantic/hybrid experiments, PAN evaluation, the local Next.js application and final research documentation. Routine technical and methodological choices are delegated to the lead research engineer; record their rationale and evidence without requesting approval at each milestone. This supersedes the routine approval gates in the pending section above and historical audit reports; those recommendations are not automatically adopted as facts.

Submission deadline: 16 November 2026. Prioritize correct parsing, scientifically valid evaluation and actual comparisons before application polish or optional fine-tuning. Do not commit/push, delete important files/original datasets, perform destructive Git operations, introduce paid services/additional datasets or change the research objective without approval. Keep all work in this repository.

## D004 — Primary evaluation scope and annotation policy

Status: adopted under D003 delegated authority on 10 November 2026, before model scoring.

Use English-to-English cases for primary lexical/semantic/hybrid evaluation. Preserve translations in the full inventory but exclude translation-only queries and non-English sources from primary experiments. No cross-language competence is claimed for English MiniLM. Keep all original annotation values; exclude the one zero-length annotation's entire suspicious document from benchmark eligibility. Retain the seven endpoint discrepancies unchanged and score against the supplied spans. Decode UTF-8 strictly, exclude exactly the initial BOM from the coordinate-bearing view, preserve Unicode and CRLF, and reject unverified non-BMP corpus coordinates during PAN inventory validation.

Reasoning: the full-corpus audit supports this coordinate view and language scope. The zero-length case is not a meaningful positive passage. Whole-document exclusion avoids treating the exceptional span as clean text. See `reports/implementation/dataset-validation.json` and the original audit for evidence.

## D005 — Bounded, family-disjoint evaluation

Status: adopted under D003 on 10 November 2026, before similarity scoring.

Use conservative normalized-title OR normalized-author connected groups, deterministic rare-category family-bundle reservation, then a fixed seeded 60/20/20 family hash assignment. Quarantine a suspicious document unless its own family and every annotated source family belong to the same partition. Never split annotated passages out of documents or drop inconvenient labels. Reserve the smallest feasible independent simulated and verbatim bundles for validation and test before hashing other families. Selection uses corpus metadata, annotations and text size only, never model outcomes.

The bounded experiment fixes 80 training queries (40 positive/40 clean), 48 validation and 48 test queries (24 positive/24 clean each), at most 50,000 characters per query, 100,000 per source, with a 500,000-character source allowance for rare simulated cases. Add 12 unreferenced source distractors per partition. Keep all annotated sources of selected queries and compare against every source in that partition. The limited candidate collection is assembled using annotations as an experimental collection-design step, not passed as an oracle query/source pairing to the detector. Results describe this reduced-candidate, size-limited derived PAN subset, not full-corpus retrieval.

Reasoning: whole-component splitting retains a giant component with most annotations; deterministic quarantine plus conservative family separation yields an executable minimum experiment on the available hardware. Budgets and rare-case oversampling bias the sample and must be reported. Only one simulated case per evaluation partition is retained; it cannot establish robust paraphrase performance. Author grouping deliberately overgroups some unrelated books for stronger separation.

Validate disjoint references, conservative families and complete annotation relationships. Audit ALL selected documents across partitions using full normalized five-word shingle sets; flag at least 20 shared shingles with containment >=0.2. The current 304 selected documents pass, maximum observed containment about 0.0071. This is an observed contamination check, not a proof of absence of every semantic/ancestral relationship. Do not claim guaranteed author-alias or provenance independence.

Evidence: `reports/implementation/split-feasibility.json`, `split-manifest.json`, `split-summary.json`, `leakage-check.json`. No seed was selected using detector performance. This supersedes the earlier pending language/split/anomaly approval gates.

## D006 — Frozen representation and validation search

Status: adopted under D003 on 10 November 2026, before similarity scoring.

Use sentence/paragraph-aware overlapping windows up to 80 whitespace words, overlap 20 words, subdividing with the actual MiniLM tokenizer to at most 256 tokens INCLUDING specials. Derive all windows from text, never annotations. Use identical windows and candidate collections across methods. TF-IDF fits only training-source and training-query windows; sublinear TF, smoothed IDF and L2 normalization, Unicode alphanumeric tokens, no stemming/stop-word removal. MiniLM stays frozen, FP32, mean pooling, L2 normalization, CPU explicitly selected, batch 16, intra-op threads 4. Native ONNX profiling observed CPUExecutionProvider; NVIDIA hardware alone does not imply CUDA inference.

Retrieve each query window's highest scoring source window over the whole bounded candidate collection independently for lexical, semantic and hybrid scores. Hybrid uses the unmodified weighted cosine formula. Validate alpha in [0, 0.25, 0.5, 0.75, 1] and thresholds in [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]. Merge accepted windows for the same document pair only when their spans on BOTH sides are within 120 characters. Select by validation PlagDet, then higher precision, then higher threshold; alpha ties follow the fixed grid order. Freeze selections before test evaluation. Endpoints allow hybrid to reduce to a baseline if validation favors it; report this plainly.

## D007 — Academic demo priority

Status: approved by the owner on 10 November 2026. Prioritize a local, end-to-end academic demonstration by the morning of 11 November. Reuse the bounded experiment and preserve its frozen comparison. Use supplied sources and synthetic demo fixtures. Final verification, evaluation write-up and submission work follow by 16 November. Deployment, authentication and production infrastructure are outside this scope.

## D008 — Passage alignment follow-up

The 11 November app update uses paragraph-bounded sentence windows and contiguous evidence merging. The follow-up PAN experiment uses the same frozen split and selects parameters from validation before scoring the test partition. The original comparison retains its original windowing, thresholds, and results. PDF layout cues apply only to uploaded PDFs, since PAN supplies TXT. Native Windows DirectML is an explicit app option verified with an ONNX profile. The original benchmark used CPU inference. [Milestone evidence](../reports/implementation/alignment-and-directml.md)
