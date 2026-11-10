# Passage Review

Passage Review compares a submitted document with possible sources supplied by the reviewer. It extracts PDF or UTF-8 text, segments passages, and runs TF-IDF, MiniLM, or a validation-selected hybrid locally. The interface highlights both passages and shows source names, page numbers when available, and similarity scores.

## Run the demo

From the repository root with the existing dependencies and local model cache:

```sh
bun run build
bun run start --hostname 127.0.0.1
```

Open [Passage Review](http://127.0.0.1:3000). Select **Try an example** to load a sample comparison, or upload `demo/submitted.pdf` as the submitted document and `demo/possible-source.txt` as its possible source. Run **TF-IDF**, **MiniLM**, and **Hybrid** in turn. Select a result to highlight the submitted and source passages. The bundled files are synthetic demonstration inputs.

The app requires text-bearing PDFs and at least one possible source. It searches the supplied collection. Similarity scores are evidence for review and cannot establish misconduct.

## Setup and verification

Use Bun and a current Node.js release supported by the installed Next.js and PDF.js versions. The production server was verified with Bun 1.3.14 and Node.js 24.18 on Windows. The recorded benchmark ran on Linux with Bun 1.2.20.

```sh
bun install --frozen-lockfile
bun run setup:model
```

The setup command downloads the local ONNX model and checks the saved file hashes. The app and benchmark use local model files during analysis. Place the extracted [PAN-PC-11 corpus](https://zenodo.org/records/3250095) at `data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011/`. If the calibrated vocabulary at `.cache/research/tfidf.json` is absent, run `bun run reproduce` from the repository root to prepare the default local artifacts.

```sh
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run test:inference
```

With the production server running, run `bun run test:app` to check the homepage, PDF and text analysis, all three methods, and invalid input handling. The command accepts a different local server URL as an argument.

## Measured comparison

| Method | Precision | Recall |     F1 | PlagDet |
| ------ | --------: | -----: | -----: | ------: |
| TF-IDF |    0.7607 | 0.8601 | 0.8074 |  0.6033 |
| MiniLM |    0.3541 | 0.5273 | 0.4237 |  0.3047 |
| Hybrid |    0.7607 | 0.8601 | 0.8074 |  0.6033 |

The held-out subset contains 48 English queries, 36 candidate sources, and 57 annotated cases. Validation tested mixed weights and selected a lexical weight of 1.0. The calibrated hybrid therefore reproduces TF-IDF. PAN-PC-11 uses book text, and the subset includes only one simulated held-out case. These results describe this experiment's candidate collection and do not establish accuracy on Computer Science papers.

See the [benchmark summary](reports/implementation/benchmark-summary.md), [research methodology](research/methodology.md), and [research article](research/article.md). `bun run report:research` regenerates the summary from the saved outputs. To run the experiment separately without overwriting those outputs, set `RESEARCH_RUN_DIRECTORY` to an ignored location such as `.cache/research-reproduction` before running `bun run reproduce`. The output directory contains the generated reports and a dedicated cache. Keep the model, raw corpus, and derived caches out of Git.

## License

Project code is licensed under the [Universal Permissive License 1.0](LICENSE). Third-party datasets, model weights, and dependencies have their own terms.
