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

## Pending decisions — no implementation approval implied

The owner approved the dataset investigation, which is complete. The following recommendations in the [audit report](../reports/pan-pc-11/report.md) have not yet been approved:

- English-to-English primary evaluation and separate translation stress evaluation.
- Production parser interfaces, file organization and XML validation approach.
- Explicit production BOM/offset policy and handling of endpoint discrepancies.
- Evaluation treatment of the zero-length annotation.
- Verified document-family grouping and the precise leakage-resistant split policy.
- Accepting uneven whole-component partitions versus an approved derived subset with quarantined documents; split ratios and seed remain unset.

Next recommended milestone: approve and implement a typed, read-only dataset inventory/validator, followed by split-feasibility analysis before split assignment. The continuity instruction does not authorize this implementation.

## Recording future decisions

Append a stable decision ID, approval date/provenance, status, the concrete decision, rationale, consequences and supporting evidence. Mark replaced decisions as superseded and link their replacements. Keep proposals separate from approved entries, and update methodology and `AGENTS.md` when their scope is affected.
