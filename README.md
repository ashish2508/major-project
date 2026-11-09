# Research Misconduct Detector

> An AI-assisted research tool for identifying textual overlap and potential paraphrased plagiarism in computer science research papers.

**Project status:** Research and architecture planning  
**Primary language:** TypeScript  
**Application framework:** Next.js (App Router)  
**Package manager:** Bun  
**Initial inference approach:** Local model inference with Transformers.js

---

## Table of contents

- [Overview](#overview)
- [Research problem](#research-problem)
- [Research question](#research-question)
- [Scope](#scope)
- [Proposed methodology](#proposed-methodology)
- [System architecture](#system-architecture)
- [Technology stack](#technology-stack)
- [Datasets and reference corpus](#datasets-and-reference-corpus)
- [Evaluation plan](#evaluation-plan)
- [Ethical considerations](#ethical-considerations)
- [Planned repository structure](#planned-repository-structure)
- [Development roadmap](#development-roadmap)
- [Development environment](#development-environment)
- [Getting started](#getting-started)
- [Project limitations](#project-limitations)
- [Contributing](#contributing)
- [License](#license)

## Overview

The Research Misconduct Detector is a proposed AI-assisted system focused on **textual plagiarism in computer science research publications**.

The project will investigate whether combining traditional lexical matching with semantic text representations can improve the identification of:

- Direct textual copying.
- Lightly modified or rearranged copied passages.
- Semantically similar paraphrased passages.

The system will compare an uploaded paper or passage against a defined reference corpus. It will return potential matches, source evidence, and similarity measurements to support a human review process.

This project is not intended to make final academic misconduct decisions.

## Research problem

Conventional lexical methods can identify substantial word overlap but may miss paraphrased content. Semantic methods can identify passages with similar meanings despite different wording, but may also match legitimate discussion of common concepts, methods, and terminology.

The research problem is to evaluate a hybrid approach that uses both kinds of evidence while controlling false positives.

A submitted document cannot be reliably checked for source plagiarism in isolation: the detector needs access to a reference collection or a supplied comparison document.

## Research question

**Does combining lexical and semantic similarity improve the detection of direct and paraphrased textual plagiarism in computer science research papers compared with using either approach independently?**

The answer will be based on experiments against documented datasets and a clearly defined evaluation protocol. No performance improvement is assumed in advance.

## Scope

### Included in the initial version

- Text extraction from PDF documents.
- Text normalization and passage segmentation.
- Direct-overlap detection using lexical methods.
- Semantic passage comparison using locally generated embeddings.
- Candidate-source retrieval from a reference corpus.
- Passage-level match evidence and source references.
- Evaluation against labelled benchmark examples.
- A web interface for submitting documents and reviewing results.

### Out of scope for the initial version

The first version will not attempt to detect every form of research misconduct. In particular, it will not make claims about fabricated data, falsified results, image manipulation, authorship disputes, citation manipulation, or duplicate publication.

These are separate research problems and would require different evidence, datasets, and evaluation methods.

## Proposed methodology

The initial research will compare three approaches.

### 1. Lexical baseline

Use TF-IDF, token n-grams, and cosine similarity to identify passages with substantial textual overlap.

This provides a conventional baseline against which the semantic and hybrid approaches can be compared.

### 2. Semantic approach

Generate passage embeddings with a locally executed sentence-embedding model. Compare embeddings using cosine similarity to retrieve passages with similar meanings even when their wording differs.

The initial candidate is **all-MiniLM-L6-v2**, using a compatible ONNX model with Transformers.js. Model compatibility, licensing, runtime support, and performance will be verified before it is adopted for experiments.

### 3. Hybrid approach

Combine lexical and semantic evidence. An initial experimental scoring function may take the form:

`hybrid_score = alpha * lexical_score + beta * semantic_score`

The weights and decision thresholds will be selected using validation data, not chosen to produce a desired result. We will compare this approach with the individual baselines. A trained classifier may be considered only if the available labelled data and experiments justify it.

### Detection pipeline

1. Accept a PDF or text input.
2. Extract text and preserve page and passage positions where possible.
3. Normalize text without removing meaningful content.
4. Split the document into suitable passages.
5. Retrieve candidate source documents from the reference corpus.
6. Calculate lexical and semantic similarity.
7. Align suspicious passages with their candidate sources.
8. Present evidence and scores for human review.
9. Store experiment and analysis metadata where appropriate.

## System architecture

The application is planned as a TypeScript-first Next.js project.

```text
                         ┌──────────────────────────┐
                         │     Next.js interface    │
                         │ Upload · Review · Reports│
                         └────────────┬─────────────┘
                                      │
                         ┌────────────▼─────────────┐
                         │     Next.js API layer    │
                         │ Validation · Orchestration│
                         └────────────┬─────────────┘
                                      │
                 ┌────────────────────▼────────────────────┐
                 │             Detection engine            │
                 │                                          │
                 │  Preprocessing and passage segmentation │
                 │                  │                       │
                 │       ┌──────────┴──────────┐            │
                 │       ▼                     ▼            │
                 │  Lexical matching     Semantic matching │
                 │  TF-IDF / n-grams     Local embeddings  │
                 │       └──────────┬──────────┘            │
                 │                  ▼                       │
                 │       Hybrid scoring and alignment      │
                 └────────────────────┬─────────────────────┘
                                      │
                         ┌────────────▼─────────────┐
                         │      Reference corpus    │
                         │ Papers · Passages · IDs  │
                         └──────────────────────────┘
                                      │
                         ┌────────────▼─────────────┐
                         │ Results and persistence  │
                         │ Evidence · Metrics · DB  │
                         └──────────────────────────┘
```

The reference corpus is a required part of source-based detection. The first implementation will support a controlled, locally available corpus rather than claim to search every publication on the internet.

## Technology stack

| Area | Planned technology | Purpose |
|---|---|---|
| Language | TypeScript | Application and detection logic |
| Framework | Next.js App Router | Frontend and server-side API |
| Package manager | Bun | Dependencies and scripts |
| UI | React and Tailwind CSS | User interface |
| Model inference | Transformers.js | Local model execution |
| Model format | ONNX-compatible model | Portable inference runtime |
| Initial embedding model | all-MiniLM-L6-v2 | Semantic embeddings |
| PDF extraction | PDF.js (`pdfjs-dist`) | Extract PDF text |
| Lexical matching | TypeScript implementation | TF-IDF and n-grams |
| Validation | Zod | Validate inputs and API data |
| Database | SQLite and Prisma (planned) | Persist metadata and results |
| Testing | Vitest | Unit and integration tests |

The local model is the default. The application should not require a paid inference API to perform its core analysis.

GPU acceleration will be investigated on supported runtimes. CPU inference will remain the compatibility baseline; GPU support will not be assumed until tested on the target environment.

## Datasets and reference corpus

Potential benchmark sources include:

- **PAN plagiarism detection corpora**, including PAN-PC-11.
- More recent PAN tasks and corpora that include automatically or manually paraphrased cases, subject to access and usage terms.
- Academic text or paraphrase datasets where their licences and intended use permit the planned experiments.
- A separately documented collection of computer science research papers for domain-oriented evaluation.

Dataset selection is not final. Before use, each dataset must be checked for:

1. Access conditions and licence.
2. Document format and available labels.
3. Whether it contains direct copying, paraphrasing, or both.
4. Suitability for passage-level evaluation.
5. Whether its source documents can be redistributed or must remain local.

The dataset will be split at document/source level into training, validation, and test partitions where applicable. Related passages or versions of the same source must not leak across partitions.

Benchmark data and reference papers will not be committed to this repository unless their terms explicitly allow redistribution. Dataset acquisition instructions and metadata can be documented separately.

## Evaluation plan

The experiments will compare:

1. TF-IDF / lexical baseline.
2. Semantic embedding approach.
3. Hybrid lexical-semantic approach.

### Metrics

- Accuracy.
- Precision.
- Recall.
- F1-score.
- ROC-AUC, when the experiment produces suitable scores and labels.
- False-positive rate.
- Processing time and resource usage.
- PlagDet, if the selected PAN task and output format support a valid calculation.

For passage-level or source-retrieval tasks, evaluation must respect the benchmark's prescribed protocol. Metrics will be calculated on held-out test data after model and threshold selection.

Accuracy alone is insufficient. Precision and false-positive behaviour are especially important because incorrect flags can unfairly cast suspicion on legitimate academic writing.

No accuracy, F1-score, or other result will be stated as achieved until the corresponding experiment has actually been run.

## Ethical considerations

This system is an **assistance tool, not an automated misconduct adjudicator**.

- Similarity is not proof of plagiarism or intent.
- Common technical language, standard definitions, equations, references, quotations, and independently written explanations can produce matches.
- Reports must show the passages and sources that led to a flag.
- Users must be able to inspect and dismiss false positives.
- The system must not label an author as dishonest based solely on a score.
- Research documents may be unpublished or confidential. Local processing is preferred, and uploaded documents should not be shared without permission.
- Dataset and model licences must be respected.
- Evaluation should report limitations and false-positive cases, not only favourable metrics.

## Planned repository structure

The repository will evolve as the project is implemented. The following is the intended structure, not a claim that all files already exist.

```text
major-project/
├── article/
│   ├── research-article.md
│   └── references.bib
│
├── datasets/
│   ├── README.md
│   ├── raw/                 # ignored; obtain datasets separately
│   └── processed/           # ignored; generated locally
│
├── experiments/
│   └── evaluation-results/  # generated results; review before publishing
│
├── models/                  # ignored; downloaded model files
│
├── prisma/
│   └── schema.prisma
│
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── dashboard/
│   │   ├── documents/
│   │   └── reports/
│   ├── components/
│   ├── lib/
│   │   ├── preprocessing/
│   │   ├── detection/
│   │   ├── embeddings/
│   │   ├── similarity/
│   │   └── database/
│   ├── services/
│   └── types/
│
├── tests/
├── .env.example
├── .gitignore
├── LICENSE
├── package.json
├── README.md
└── bun.lock
```

## Development roadmap

### Phase 1 — Research foundation

- Review existing plagiarism detection literature.
- Compare lexical, semantic, and hybrid approaches.
- Inspect candidate datasets and their licences.
- Define the research gap and experimental protocol.

**Deliverable:** Literature review, dataset decision, and research methodology.

### Phase 2 — Proposed research article

- Define the problem and research question.
- Summarize related work with proper citations.
- Present the proposed architecture and methodology.
- Document datasets, evaluation metrics, ethical considerations, and limitations.
- Clearly distinguish expected outcomes from measured results.

**Deliverable:** An original proposed-method article draft for review.

### Phase 3 — Dataset preparation

- Obtain permitted benchmark data.
- Inspect document and annotation formats.
- Normalize text and prepare passages.
- Create leakage-resistant data splits.
- Document preprocessing decisions.

**Deliverable:** Reproducible dataset preparation workflow.

### Phase 4 — Baseline implementation

- Implement text preprocessing.
- Implement TF-IDF and n-gram matching.
- Calculate cosine similarity.
- Evaluate the lexical baseline.

**Deliverable:** Baseline detector and measured results.

### Phase 5 — Semantic and hybrid experiments

- Integrate the local embedding model.
- Generate and cache passage embeddings.
- Retrieve candidate source passages.
- Implement hybrid scoring.
- Tune thresholds on validation data.
- Compare all approaches on held-out test data.

**Deliverable:** Evaluated semantic and hybrid detection methods.

### Phase 6 — Application

- Implement document upload and validation.
- Display passage-level matches.
- Show source evidence and separate score types.
- Add report generation and analysis history.

**Deliverable:** Usable web application.

### Phase 7 — Final evaluation and documentation

- Run final experiments.
- Analyse false positives and false negatives.
- Report limitations and resource requirements.
- Finalize the research article and reproducibility instructions.

**Deliverable:** Final research report and project documentation.

## Development environment

The current development environment is:

- Ubuntu 24.04 LTS under WSL2.
- Node.js 26.x.
- Bun 1.2.x.
- TypeScript.
- NVIDIA GeForce RTX 3050 Laptop GPU with 6 GB VRAM.
- 16 GB system RAM.

The project is developed in the existing Git repository. Bun is the default package manager.

## Getting started

The application scaffold is a planned next step. Once the Next.js application and `package.json` have been created, install dependencies with Bun.

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Run tests after the test scripts have been added:

```bash
bun run test
```

The exact scripts will be defined in `package.json` during project initialization.

### Local model and data

Model weights, raw datasets, processed corpora, uploaded research papers, and generated reports are local artifacts. They should not be committed unless there is an explicit reason and permission to redistribute them.

## Project limitations

- Detection quality depends on the coverage and quality of the reference corpus.
- A local corpus cannot identify matches in papers it does not contain.
- Semantic similarity can confuse shared subject matter with copied expression.
- PDF extraction may lose reading order, equations, tables, or layout information.
- Dataset benchmarks may not fully represent real-world research misconduct.
- Model and threshold performance may vary across disciplines and writing styles.
- The system cannot establish intent or make institutional misconduct decisions.

These limitations will be revisited as experiments provide evidence.

## Contributing

This is an academic research project. Contributions should:

- Keep experiments reproducible.
- Include tests for detection logic.
- Document dataset and model provenance.
- Respect all third-party licences and research-data restrictions.
- Avoid presenting unverified performance claims.
- Preserve the human-review requirement.

## License

The project code is licensed under the **Universal Permissive License (UPL), Version 1.0**. See [`LICENSE`](LICENSE).

Third-party datasets, research papers, model weights, and dependencies remain subject to their own licences and terms. The project licence does not override those terms.
