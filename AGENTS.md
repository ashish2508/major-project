<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Research Misconduct Detection Project

## 1. Project Overview

We are developing an AI-based textual plagiarism detection system for academic research documents, with Computer Science publications as the intended application domain.

The system will identify:

- Direct textual copying.
- Near-exact textual overlap.
- Paraphrased passages with similar meanings.

The application must identify suspicious passages and possible source passages. It must not make definitive academic misconduct accusations.

The primary research objective is to investigate whether combining lexical and semantic similarity improves plagiarism detection compared with using either technique independently.

## 2. Finalized Research Decisions

Do not change these decisions without discussing them with the project owner.

| Component           | Selected approach                    |
| ------------------- | ------------------------------------ |
| Research misconduct | Textual plagiarism                   |
| Primary dataset     | PAN-PC-11                            |
| Lexical method      | TF-IDF + cosine similarity           |
| Semantic model      | all-MiniLM-L6-v2                     |
| Hybrid method       | Combined lexical and semantic scores |
| Model execution     | Local                                |
| Frontend            | Next.js + React                      |
| Language            | TypeScript                           |
| Package manager     | Bun                                  |
| Model integration   | Transformers.js                      |
| Inference runtime   | ONNX Runtime                         |
| PDF extraction      | PDF.js                               |
| Input validation    | Zod                                  |

### Dataset limitation

PAN-PC-11 is an English-centered plagiarism benchmark based on book texts obtained from Project Gutenberg. Its external corpus also contains German and Spanish sources used in translation cases; it is not exclusively English.

It is NOT a Computer Science-specific research-paper dataset.

CS-specific alternatives were investigated, but an accessible dataset with verified passage-level plagiarism annotations suitable for our experiments could not be established.

We have deliberately selected PAN-PC-11 as our single primary benchmark.

Never describe it as a CS-specific dataset or claim that benchmark performance automatically generalizes to Computer Science research publications.

Do not introduce additional datasets or replace PAN-PC-11 without discussing it with the project owner.

Dataset source:
https://zenodo.org/records/3250095

## 3. AI Model

Selected model:

all-MiniLM-L6-v2

Official model:
https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

ONNX model:
https://huggingface.co/onnx-community/all-MiniLM-L6-v2-ONNX

The model generates 384-dimensional sentence embeddings.

Important:

- This is a pretrained embedding model, not a plagiarism classifier.
- Use embeddings to calculate semantic similarity.
- Use cosine similarity for vector comparisons.
- Do not assume a high similarity score proves plagiarism.
- Respect the model's input-length limitations.
- Preserve meaningful passage boundaries.

Use Transformers.js for local inference.

Do not introduce external paid AI APIs.

Do not introduce Python into the application or experimental pipeline unless technically necessary and explicitly approved.

If fine-tuning requires a separate Python/PyTorch workflow, explain why and request approval first.

## 4. Research Methodology

We must implement and evaluate three approaches independently.

### Experiment 1: Lexical baseline

Implement:

- TF-IDF vectorization.
- Cosine similarity.
- Appropriate passage segmentation.
- Similarity thresholding.

Purpose: Establish the performance of traditional lexical similarity.

### Experiment 2: Pretrained semantic model

Implement:

- MiniLM model loading.
- Embedding generation.
- Cosine similarity.
- Passage-level comparison.

Purpose: Evaluate the pretrained model without modifying its weights.

### Experiment 3: Hybrid detection

Combine lexical and semantic similarity.

Conceptual formula:

S_hybrid = α × S_lexical + (1 - α) × S_semantic

Determine α and the decision thresholds through validation experiments.

Do not assume hybrid detection performs better. Demonstrate this through measured results.

### Optional Experiment 4: Fine-tuning

Only investigate fine-tuning after completing the first three experiments.

First determine whether PAN-PC-11 provides suitable training examples for the proposed learning objective.

Do not confuse pretrained model evaluation with fine-tuning.

## 5. Evaluation Requirements

Use PAN-PC-11 annotations as ground truth.

Primary evaluation metrics:

- Precision
- Recall
- F1-score
- Granularity
- PlagDet

Accuracy and false-positive rate may also be reported where appropriate.

Follow the official PAN evaluation protocol for passage-level detection.

Important experimental requirements:

- Preserve source and suspicious passage relationships.
- Preserve character offsets.
- Avoid data leakage between training, validation and test sets.
- Use validation data for threshold selection.
- Evaluate final methods on the same held-out test data.
- Record model configurations and experiment parameters.
- Make experiments reproducible.

Never invent accuracy, precision, recall, F1-score or other experimental results.

Never present expected results as measured results.

## 6. Technology and Coding Rules

This project is TypeScript-first.

Preferred tools:

- Bun for dependency management and scripts.
- Next.js App Router.
- TypeScript.
- Transformers.js.
- ONNX Runtime.
- PDF.js.
- Zod.

Rules:

1. Always use Bun commands instead of npm commands.
2. Prefer TypeScript over Python.
3. Avoid unnecessary dependencies.
4. Do not introduce another frontend framework.
5. Keep AI inference and document processing separate from UI components.
6. Use proper TypeScript types.
7. Validate uploaded files and user inputs.
8. Handle errors and model-loading failures properly.
9. Keep model inference on the server where appropriate.
10. Use the Node.js runtime for routes requiring native ONNX Runtime functionality; do not assume Edge Runtime compatibility.
11. Do not assume NVIDIA GPU acceleration is enabled. Verify available execution providers before claiming GPU inference.
12. Keep large datasets and downloaded model files out of Git.
13. Use the repository's existing Prettier configuration for generated and edited source files. Run `bun run format:check` before closing a milestone.

Do not rewrite existing project configuration without understanding its purpose.

## 7. Suggested Architecture

Inspect the existing repository before introducing directories or moving files.

The intended separation of responsibilities is:

- preprocessing: document extraction, cleaning and segmentation.
- models: embedding generation and model management.
- similarity: TF-IDF, cosine similarity and hybrid scoring.
- evaluation: metrics, benchmarking and experiment results.
- dataset: PAN-PC-11 parsing and annotation handling.
- application: Next.js interface and API routes.

Keep research experiments independently executable without requiring the web interface.

## 8. Current Project Status

The project has already been initialized.

Environment:

- Ubuntu 24.04 under WSL2.
- 16 GB RAM.
- NVIDIA RTX 3050 Laptop GPU with 6 GB VRAM.
- Bun 1.2.20.
- Node.js 26.
- TypeScript.

Installed dependencies include:

- Next.js 16.
- React 19.
- @huggingface/transformers.
- pdfjs-dist.
- zod.

Initial validation already completed:

- ONNX Runtime successfully loads.
- Next.js production build succeeds.
- MiniLM embedding generation succeeds.
- Embedding dimension verified as 384.
- Initial semantic similarity calculation succeeds.

A previous embedding test produced:

Sentence 1 vs 2: 0.8035
Sentence 1 vs 3: 0.0612

These are functionality-test results, not plagiarism benchmark results.

PAN-PC-11 has been downloaded, verified and extracted at:

`data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011/`

The external detection corpus is the primary focus. A completed read-only audit found 11,093 source documents, 11,093 suspicious documents, 49,621 annotations and 5,546 suspicious documents without annotations. Detailed evidence and reproducible commands are in [reports/pan-pc-11/report.md](reports/pan-pc-11/report.md).

The typed full-corpus validator, bounded family-disjoint English split, three detectors, PAN metrics and held-out benchmark are complete. The local demo uses the benchmark's frozen parameters. The owner prioritized a working academic demonstration by 11 November morning, followed by final verification and submission work by 16 November. See [status](research/status.md), [methodology](research/methodology.md), and [benchmark summary](reports/implementation/benchmark-summary.md).

## 9. Development Workflow

Follow this order:

1. Inspect the existing repository and dependencies.
2. Understand PAN-PC-11 archive structure and annotations.
3. Implement dataset parsing.
4. Prepare evaluation splits and preserve annotation offsets.
5. Implement TF-IDF baseline.
6. Benchmark TF-IDF.
7. Implement pretrained MiniLM evaluation.
8. Benchmark MiniLM.
9. Implement and benchmark hybrid detection.
10. Investigate optional fine-tuning.
11. Build the web application.
12. Prepare experimental results and visualizations.
13. Complete the research paper.

Do not skip directly to frontend development while the detection methodology remains unvalidated.

## 10. Working Agreement With the Project Owner

The project owner is an advanced TypeScript developer but a beginner in machine learning and NLP.

Therefore:

- Explain important ML concepts when introducing them.
- Explain why a particular implementation is necessary.
- Prefer straightforward, maintainable code.
- Do not overwhelm the project with unnecessary abstractions.
- Work in small, verifiable stages.
- Inspect existing code before modifying it.
- Explain important architectural decisions.
- Ask before changing finalized research decisions.
- Never silently replace dependencies or datasets.
- Run appropriate checks after making changes.
- Report exactly what was changed and what remains incomplete.

The owner explicitly authorized autonomous execution of the complete roadmap on 10 November 2026, with submission due 16 November 2026. Proceed through routine milestones and make routine technical/methodological decisions without repeated approval. Ask before deleting original datasets or important files, destructive Git operations, committing/pushing, paid services, additional datasets or changing the research objective. Explain major scientific limitations and alternatives. This authorization supersedes earlier routine milestone approval gates in historical reports and research records.

The objective is not merely to produce working software. The project owner must understand the research methodology, implementation and experimental results well enough to explain and defend the work academically.

## 11. Academic Integrity

This is an academic research project.

All literature references must be genuine and verifiable.

Never:

- Invent academic references.
- Fabricate experimental results.
- Claim an untested method works.
- Misrepresent dataset characteristics.
- Present similarity scores as proof of misconduct.

Clearly distinguish established research, proposed methodology, implementation progress and measured experimental findings.

## 12. Workspace Continuity and Research Records

This Codex workspace is the primary environment for implementation, experiments and research documentation. Maintain continuity within the repository; do not require the owner to manually transfer information between ChatGPT and Codex.

Persistent records:

- `AGENTS.md`: finalized project decisions, important constraints, working agreement and concise current status.
- [research/decisions.md](research/decisions.md): important approved decisions, their reasoning, provenance and superseded decisions.
- [research/methodology.md](research/methodology.md): authoritative experimental methodology, with approved rules clearly separated from pending proposals.
- `reports/`: detailed findings, milestone verification, experiment configurations, commands and measured outputs. Link to evidence instead of relying on conversation history.

Before completing each major milestone, update the relevant records and report what was accomplished, actual checks and their results, remaining issues and the recommended next step. If checks were not run, state that explicitly; never turn historical checks into current test results. Save large outputs to files and summarize them in conversation.

After context compaction or when resuming work, read this file, both research records and the relevant milestone reports before assuming previous decisions or continuing implementation. Inspect the current working tree as well. Distinguish approved decisions, observed findings, unapproved proposals and incomplete work. Do not infer approval from a recommendation or a documentation-only request.

When the owner approves an important architectural or methodological decision, update the decision record, methodology where relevant and this file before closing the milestone. Keep those records consistent, retain the rationale for superseded decisions and ask the owner if a material conflict cannot be resolved from recorded approval.
