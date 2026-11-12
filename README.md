# Passage Review

A local, AI-assisted textual plagiarism detection system for comparing research documents using lexical and semantic similarity.

Passage Review compares a submitted document against one or more reviewer-provided source documents. It identifies potentially matching passages, displays similarity scores, and highlights supporting evidence for manual review.

The project investigates whether combining TF-IDF and pretrained MiniLM embeddings improves plagiarism detection compared with either method independently.

## Features

- PDF and UTF-8 text document support
- Direct-copy and near-exact text matching
- Semantic similarity analysis for potential paraphrasing
- Passage-level comparison and highlighting
- Source attribution and page references when available
- Three detection methods: TF-IDF, MiniLM, and Hybrid
- Local model inference without a paid AI API
- Reproducible evaluation using PAN-PC-11
- CPU inference and optional DirectML acceleration on Windows

Similarity does not establish plagiarism or academic misconduct. All results require human interpretation.

## Technology Stack

| Component | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19, Tailwind CSS 4 |
| Language | TypeScript |
| Package manager | Bun |
| Lexical detection | TF-IDF and cosine similarity |
| Semantic detection | all-MiniLM-L6-v2 |
| Model integration | Transformers.js |
| Inference runtime | ONNX Runtime |
| PDF processing | PDF.js |
| Input validation | Zod |
| Benchmark dataset | PAN-PC-11 |

## How It Works

1. Upload a submitted document and at least one potential source document.
2. Extract and preprocess the document text.
3. Segment the text into passages.
4. Compare passages using the selected detection method.
5. Rank candidate matches by similarity.
6. Display matching passages, scores, and supporting evidence.

### Detection Methods

#### TF-IDF

Represents passages using term-frequency and inverse-document-frequency features, then computes cosine similarity.

This approach is particularly useful for direct copying and lexical overlap.

#### MiniLM

Uses the pretrained `all-MiniLM-L6-v2` model to generate 384-dimensional embeddings.

Cosine similarity between embeddings helps identify passages with similar meanings, including potential paraphrasing.

MiniLM is a sentence embedding model, not a trained plagiarism classifier.

#### Hybrid

Combines lexical and semantic similarity:

`S_hybrid = α × S_lexical + (1 − α) × S_semantic`

The combination weight and detection thresholds are selected using validation data rather than assumed in advance.

## Installation

### Prerequisites

- Bun
- A Node.js version compatible with the installed Next.js and PDF.js dependencies
- Sufficient memory and disk space for local model inference

The production application has been verified on Windows using Bun 1.3.14 and Node.js 24.18.

### Setup

Clone the repository:

```bash
git clone https://github.com/ashish2508/major-project.git
cd major-project
```

Install dependencies:

```bash
bun install --frozen-lockfile
```

Download and verify the local embedding model:

```bash
bun run setup:model
```

### Start the Application

Build the application:

```bash
bun run build
```

Start the production server:

```bash
bun run start --hostname 127.0.0.1
```

Open http://127.0.0.1:3000.

For development, use the development script configured in `package.json`.

## Using the Application

Select **Try an example** to load the built-in demonstration, or upload your own submitted document and possible source documents.

Choose one of the available detection methods:

- TF-IDF
- MiniLM
- Hybrid

Run the analysis and select a result to inspect its matched passages, similarity scores, source information, and highlighted evidence.

When a MiniLM candidate does not meet its calibrated detection threshold, the interface may display it as a review lead rather than a confirmed detection.

### Controlled Examples

The [`demo/`](demo/README.md) directory contains three labeled demonstration cases:

| Case | Expected behavior |
|---|---|
| Direct copying | Confirmed matching passages |
| Paraphrasing | Semantic review lead below the calibrated threshold |
| Negative control | No confirmed alerts |

These examples help demonstrate system behavior but are not substitutes for benchmark evaluation.

## GPU Acceleration

On native Windows, DirectML inference can be requested using PowerShell:

```powershell
$env:MINILM_DEVICE = 'dml'
bun run start --hostname 127.0.0.1
```

By default, DirectML uses adapter index `0`. Set `MINILM_DML_ADAPTER` to request another adapter.

The application verifies GPU operator execution. ONNX Runtime may still execute some operations on the CPU.

For CPU inference:

```powershell
$env:MINILM_DEVICE = 'cpu'
bun run start --hostname 127.0.0.1
```

DirectML initialization or verification failures are reported rather than silently treated as successful GPU execution.

## Research Dataset

The primary benchmark is [PAN-PC-11](https://zenodo.org/records/3250095).

PAN-PC-11 provides annotated plagiarism cases and source-document relationships for evaluating passage-level detection.

The extracted dataset is expected at:

```text
data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011/
```

The dataset is needed for reproducing the PAN-PC-11 experiments, not for ordinary comparison of reviewer-uploaded documents.

### Dataset Limitations

PAN-PC-11 is primarily based on book texts and is not a Computer Science research-paper dataset.

A suitable, accessible CS-specific dataset with verified passage-level annotations was not established during dataset selection.

Consequently, benchmark performance must not be presented as demonstrated accuracy on Computer Science publications.

## Experimental Results

The held-out evaluation subset contains:

- 48 English query documents
- 36 candidate source documents
- 57 annotated plagiarism cases

### Method Comparison

| Method | Precision | Recall | F1-score | PlagDet |
|---|---:|---:|---:|---:|
| TF-IDF | 0.7607 | 0.8601 | 0.8074 | 0.6033 |
| MiniLM | 0.3541 | 0.5273 | 0.4237 | 0.3047 |
| Hybrid | 0.7607 | 0.8601 | 0.8074 | 0.6033 |

Validation selected a lexical weight of `α = 1.0` for the hybrid method.

As a result, the calibrated hybrid reproduces TF-IDF predictions and does not improve upon the lexical baseline in this evaluation.

The held-out subset includes only one simulated plagiarism case. These findings are specific to the evaluated subset and candidate-source collection.

The results do not establish performance on arbitrary research papers or demonstrate that semantic similarity always improves detection.

For details, see:

- [Benchmark Summary](reports/implementation/benchmark-summary.md)
- [Research Methodology](research/methodology.md)
- [Research Article](research/article.md)

## Reproducing the Experiments

After preparing the dataset and local model, run:

```bash
bun run reproduce
```

If the calibrated TF-IDF vocabulary is missing, this command can prepare the required local artifacts.

To avoid overwriting existing research outputs, specify a separate run directory.

PowerShell:

```powershell
$env:RESEARCH_RUN_DIRECTORY = ".cache/research-reproduction"
bun run reproduce
```

Regenerate the research summary from saved outputs:

```bash
bun run report:research
```

Model files, raw datasets, and generated caches should remain outside Git tracking.

## Testing and Verification

Run the available quality checks:

```bash
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run test:inference
bun run build
```

With the production server running, execute:

```bash
bun run test:app
```

This verifies the application homepage, document analysis, supported detection methods, and invalid-input handling.

## Research Integrity

This project is intended as a research and decision-support tool.

- Similarity scores are not proof of plagiarism.
- A high semantic similarity score does not necessarily indicate misconduct.
- Detection thresholds are calibrated using validation data.
- Experimental results must be reported with their dataset and evaluation limitations.
- Final judgments require human review and contextual assessment.

## License

Project code is licensed under the [Universal Permissive License 1.0](LICENSE).

Third-party datasets, pretrained model weights, and dependencies are governed by their respective licenses and usage terms.