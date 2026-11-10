# Does semantic similarity improve passage-level plagiarism detection?

## Abstract

External plagiarism detection locates passages in a submitted document and the corresponding passages in possible sources. We compared TF-IDF cosine similarity, frozen all-MiniLM-L6-v2 cosine similarity, and a weighted combination of both on a bounded English subset of PAN-PC-11. The family-disjoint design retained 48 held-out queries, 36 candidate sources, and 57 annotated cases. Validation selected a lexical weight of 1.0 for the hybrid. TF-IDF and the selected hybrid therefore tied at 0.6033 PlagDet, while MiniLM reached 0.3047. The tested combination yielded no observed improvement over TF-IDF. The subset is book-based and contains one held-out simulated case, limiting conclusions about paraphrasing and Computer Science publications. A local review interface presents both passages, offsets, and similarity scores for human assessment.

## Introduction and research objectives

Word overlap gives a reviewer a traceable signal for copied or lightly modified text. Substantial rewriting can weaken that signal even when a passage conveys the same idea. Embeddings offer a complementary representation, but semantic similarity can also arise when independent authors discuss the same topic. The research question is whether combining these signals improves passage localization over either signal alone under identical retrieval and evaluation conditions.

The study has three objectives. First, implement independent lexical and semantic baselines and an interpretable weighted hybrid. Second, compare them using held-out character spans and source identities. Third, expose the resulting evidence through a local interface for research documents. The intended application is textual review of Computer Science papers. The experiment measures performance on a derived benchmark of book text.

## Background and related work

TF-IDF gives greater weight to words that occur in relatively few passages. Cosine similarity compares the direction of the weighted word vectors. Reimers and Gurevych demonstrated how independently encoded sentences can be compared with cosine similarity. MiniLM uses attention distillation to produce a compact transformer. The all-MiniLM-L6-v2 checkpoint used here represents short passages as 384-dimensional vectors. It was trained for representation learning, so a high score alone cannot establish the provenance of a passage. [1–3]

PAN framed external plagiarism detection as finding both the submitted span and the source span. Its evaluation framework accounts for partial character overlap and penalizes splitting one annotated case into many detections. PAN-PC-11 provides paired annotations for artificial, simulated, and translation cases. This study uses the external task's metrics on a new bounded partition, so the scores cannot be compared directly with the PAN 2011 competition leaderboard. [4–6]

## Dataset and split construction

The external corpus contains 11,093 source documents, 11,093 suspicious documents, and 49,621 annotations. Of the suspicious documents, 5,546 have no plagiarism annotations. The validator preserved the supplied source references, lengths, and offsets. It verified the original file hashes, removed the leading UTF-8 byte-order mark from the coordinate-bearing text, and retained line endings. The query containing the zero-length annotation was excluded as a whole. Seven small annotated endpoint discrepancies were retained. Translation cases were inventoried and excluded from primary scoring.

Source reuse connects 40,584 English annotations in one component, making a balanced whole-component split impractical. The implemented split grouped documents connected by normalized author or title, reserved disjoint rare-case bundles, and assigned remaining families using the fixed seed `pan-pc11-v1-20261110`. A query was eligible only when its family and all annotated source families belonged to one partition. The split includes 12 unreferenced source distractors per partition. Document and query-count caps limited compute. A cross-partition check of normalized five-word shingles covered all 304 selected documents. The highest observed containment was about 0.0071, below the preregistered flag threshold of 0.2 with at least 20 shared shingles.

| Partition  | Queries | Candidate sources | Annotated cases |
| ---------- | ------: | ----------------: | --------------: |
| Training   |      80 |                57 |             126 |
| Validation |      48 |                35 |              72 |
| Test       |      48 |                36 |              57 |

Each evaluation partition included 24 positive and 24 unannotated queries. The collections retained the annotated sources of selected queries, and each method searched every supplied candidate. The resulting task measures source and span selection within this controlled collection. The [dataset audit](../reports/pan-pc-11/report.md), [split summary](../reports/implementation/split-summary.json), and [leakage checks](../reports/implementation/leakage-check.json) document the exclusions and selection biases.

## Methodology and architecture

**Passage segmentation.** The detector uses sentence- and paragraph-aware windows of up to 80 whitespace-delimited words, with up to 20 words of overlap. The actual model tokenizer subdivides windows that exceed 256 tokens including special tokens. Each window retains its original character coordinates. All methods use identical windows, and annotations are used only for split construction and evaluation.

**Lexical baseline.** Features are normalized lowercase Unicode alphanumeric tokens. The TF-IDF fit uses only training query and source windows. Term frequency is scaled by `1 + log(count)`, and inverse document frequency is `1 + log((1 + N) / (1 + df))`. The implementation L2-normalizes the sparse vectors and scores them with cosine similarity. The recorded vocabulary contains 29,293 terms fitted over 10,659 training passages.

**Semantic baseline.** Transformers.js runs the frozen all-MiniLM-L6-v2 FP32 ONNX export with mean pooling and L2 normalization. Cosine similarity compares the resulting 384-dimensional vectors. Inference uses batches of up to 16 and four intra-operation threads. Native ONNX profiling observed `CPUExecutionProvider`. The experiment records SHA-256 hashes for the model graph, external weights, tokenizer, and model configuration. The original download did not record a repository revision, so those hashes establish the exact bytes used.

**Hybrid.** The combined score is `α × lexical + (1 − α) × semantic`. Both inputs are normalized-vector cosines, with the semantic score retaining any negative values. Each method retrieves its best candidate per query window over the same collection. It applies its chosen threshold and merges nearby windows for the same document pair when their gaps are at most 120 characters on both sides.

**Selection and evaluation.** Validation searched lexical weights of 0, 0.25, 0.50, 0.75, and 1.0 and thresholds from 0.2 to 0.9 in increments of 0.1. Higher PlagDet was the primary selection criterion, with ties resolved by precision, threshold, and fixed grid order. Selected parameters were written before held-out scoring. PAN macro precision averages annotated coverage of each detection, and macro recall averages detected coverage of each annotation. Coverage uses the union of matched characters across both documents and requires positive overlap on both sides. F1 is the harmonic mean of precision and recall. Granularity measures detections per detected case, and PlagDet divides F1 by `log₂(1 + granularity)`. The TypeScript evaluator implements these definitions and was checked with reference-derived fixtures. [4, 6]

## Results

| Method | Threshold | Lexical weight | Precision | Recall |     F1 | Granularity | PlagDet |
| ------ | --------: | -------------: | --------: | -----: | -----: | ----------: | ------: |
| TF-IDF |      0.30 |           1.00 |    0.7607 | 0.8601 | 0.8074 |      1.5283 |  0.6033 |
| MiniLM |      0.60 |           0.00 |    0.3541 | 0.5273 | 0.4237 |      1.6216 |  0.3047 |
| Hybrid |      0.30 |           1.00 |    0.7607 | 0.8601 | 0.8074 |      1.5283 |  0.6033 |

The best validation PlagDet at each hybrid lexical weight was 0.2867, 0.4267, 0.5282, 0.5854, and 0.6260 in ascending weight order. Validation therefore assigned zero weight to MiniLM in the final hybrid. The selected hybrid reproduced TF-IDF's held-out detections. Intermediate weights were evaluated on validation only. The comparison gives no held-out estimate for an interior weight.

| Held-out case type | Total | TF-IDF matched | MiniLM matched | Hybrid matched |
| ------------------ | ----: | -------------: | -------------: | -------------: |
| Artificial, none   |     2 |              2 |              2 |              2 |
| Artificial, low    |    31 |             31 |             28 |             31 |
| Artificial, high   |    23 |             19 |              7 |             19 |
| Simulated          |     1 |              1 |              0 |              1 |

TF-IDF and hybrid missed 4 of 57 cases (7.0%) and flagged 3 of 24 unannotated queries (12.5%). MiniLM missed 20 of 57 cases (35.1%) and flagged 9 of 24 unannotated queries (37.5%). Those rates respectively describe missed annotated cases and unannotated queries with any alert. Six TF-IDF and 91 MiniLM detections had no jointly overlapping annotation.

The recorded Linux x64 run used an Intel Core i5-12450HX environment with four visible logical CPUs. Total elapsed time was 263.04 seconds with 1,027.7 MiB peak process RSS. With all embedding caches cold, held-out source and query embedding generation took 45.85 and 33.01 seconds respectively. Held-out shared score generation took 54.93 seconds. Those stages share work among methods. The experiment did not measure independent end-to-end latency or GPU speedups. See the [full measurements](../reports/implementation/benchmark-results.json) and [frozen parameters](../reports/implementation/frozen-parameters.json).

## Error analysis and discussion

- **Wrong source.** MiniLM paired query `suspicious-document00214.txt` at offset 9061 with `source-document08961.txt` at offset 188914, scoring 0.604. The corresponding annotated region points to `source-document10521.txt`. The flagged excerpts both contain moral or religious vocabulary, but the prediction does not align the annotated source. This illustrates how a semantically plausible match can fail source attribution.
- **Missed high-obfuscation case.** Both baselines missed `suspicious-document01510.txt#4`, which points to `source-document01564.txt`. The obfuscated span contains substitutions and awkward phrasing, while preserving parts of the source wording. The observed miss provides a concrete case for investigating window alignment and retrieval errors.
- **Simulated case.** For `suspicious-document02098.txt#2`, the lexical method retrieved the correct source and covered almost all annotated characters on both sides. The rewrite retained distinctive language about an elder man's mood and his plans. The prediction spans extended beyond the annotation, reducing precision for the case. MiniLM missed it. One example cannot establish general paraphrase performance.

Lexical evidence was stronger under the chosen passage windows, retrieval procedure, and validation objective. The result is consistent with distinctive surface wording being useful in this subset. The design does not establish whether another semantic model, weighting grid, or context window would improve the comparison. Both segmentation and merging can affect overlap and granularity, and the single best candidate rule can suppress valid alternatives when two sources match one query window.

## Local application and ethical considerations

The Next.js interface accepts pasted text and text-bearing PDF or UTF-8 text files. PDF.js extracts text and records page ranges. A Node.js route validates uploads with Zod and runs the detector against the supplied candidate documents. Results show both highlighted spans, source filenames, available page information, separate scores, and a downloadable evidence report. Processing takes place on the local server, and the user can inspect the cited source before acting on a flag.

Similarity can reflect a quotation, standard terminology, reuse with attribution, or independent writing. Scores should be treated as review evidence. Reviewers need the original documents, citation context, and institutional procedures to assess a concern. The tool supports local handling of sensitive documents. Downloaded evidence reports contain submitted and source text and should be shared accordingly.

## Limitations and future work

The candidate collection, family quarantine, size caps, and balanced clean-query sample change the population being measured. The set contains 56 artificial cases and one simulated case. Translations, full-corpus retrieval, and Computer Science papers were outside the measured scope. Metadata grouping and shingle checks reduce observable leakage but cannot identify all common provenance or pretraining exposure. The comparison reports one fixed split and descriptive results. Statistical uncertainty across families or alternate splits was not estimated.

Future work can use a larger family-disjoint sample, retain more simulated cases, and measure the contribution of semantic similarity under stricter candidate retrieval conditions. The current training partition contains artificial low- and high-obfuscation examples and zero simulated cases. It can provide weakly labeled training pairs, but it is insufficient to justify fine-tuning for realistic paraphrase detection. The existing comparison uses frozen weights throughout.

## Conclusion

The validation-selected hybrid matched TF-IDF on the bounded PAN-PC-11 experiment, and both exceeded frozen MiniLM on the recorded passage metrics. The observed evidence supports TF-IDF as the stronger baseline for this configuration. The local application makes the matched passages and source context available for human review. Setup, frozen parameters, and reproducibility commands are documented in the [repository guide](../README.md).

## References

1. Reimers, N., and Gurevych, I. (2019). Sentence-BERT. [EMNLP-IJCNLP proceedings](https://aclanthology.org/D19-1410/)
2. Wang, W., Wei, F., Dong, L., Bao, H., Yang, N., and Zhou, M. (2020). MiniLM. [Research paper](https://arxiv.org/abs/2002.10957)
3. Sentence Transformers. all-MiniLM-L6-v2. [Model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2). [ONNX export](https://huggingface.co/onnx-community/all-MiniLM-L6-v2-ONNX)
4. Potthast, M., Stein, B., Barrón-Cedeño, A., and Rosso, P. (2010). An Evaluation Framework for Plagiarism Detection. [COLING proceedings](https://aclanthology.org/C10-2115/)
5. Potthast, M., Eiselt, A., Barrón-Cedeño, A., Stein, B., and Rosso, P. (2011). Overview of the 3rd International Competition on Plagiarism Detection. [CLEF working notes](https://ceur-ws.org/Vol-1177/CLEF2011wn-PAN-PotthastEt2011a.pdf). [PAN-PC-11 archive](https://zenodo.org/records/3250095)
6. PAN at CLEF 2011. External Plagiarism Detection. [Task and output format](https://pan.webis.de/clef11/pan11-web/external-plagiarism-detection.html). [Reference evaluator](https://github.com/pan-webis-de/pan-code/blob/master/sepln09/pan09-plagiarism-detection-performance-measures.py)
