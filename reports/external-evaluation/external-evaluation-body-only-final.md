# External evaluation after bibliography removal

The evaluation compares the same 12 canonical papers in 132 directed comparisons, or 66 unordered pairs. The full-text baseline and the final body-only run use DirectML and CPU operators, the same MiniLM model, and the same evaluation settings. Lexical and hybrid use a threshold of 0.30 and lexical weight 1.0. MiniLM uses a threshold of 0.70. All three use a merge gap of 120 characters. The semantic and hybrid evaluation branches also require at least 12 distinct words containing letters on each side.

Reference extraction reported high confidence for all 12 papers. The two QUIC papers used PDF-coordinate masks that preserve offsets and body text in adjacent columns, including the results section, conclusion, figures, and appendix. The other ten used the existing text-based boundary detector.

| Method                   | Full-text alerts | Earlier body-only alerts | Final body-only alerts | Change from full text | Directed pairs with alerts, full → final |
| ------------------------ | ---------------: | -----------------------: | ---------------------: | --------------------: | ---------------------------------------: |
| TF-IDF                   |            2,509 |                    1,726 |                  1,719 |         −790 (−31.5%) |                                130 → 130 |
| MiniLM                   |              742 |                      223 |                    231 |         −511 (−68.9%) |                                  65 → 31 |
| Hybrid                   |            4,182 |                    2,360 |                  2,326 |       −1,856 (−44.4%) |                                131 → 128 |
| **Total across methods** |        **7,433** |                **4,309** |              **4,276** |   **−3,157 (−42.5%)** |                                          |

The total sums method outputs, so a passage reported by multiple methods can contribute multiple times. Compared with the earlier body-only run, TF-IDF emitted 7 fewer alerts, MiniLM emitted 8 more, and hybrid emitted 34 fewer. The earlier run used CPU inference, so that comparison does not isolate the effect of the two QUIC masks.

## Highest-scoring remaining alerts

Each row shows a representative excerpt from a maximum-scoring alert. The JSON retains the top 20 per method, including ties, and all directed comparisons.

| Method and score    | Submitted paper → source                  | Submitted excerpt                                                               | Source excerpt                                                                                       | Review observation                                              |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| TF-IDF **0.587566** | BERTAC → Online Sketch Query Optimization | “discriminator D and two CNN-based generators” amid symbols                     | “Figure 5: Fast-AGMS sketches for multi-way join cardinality estimation” after numbers and operators | Unrelated methods with flattened figures, numbers, and symbols. |
| MiniLM **0.954316** | BERTAC → Compact Transformers             | “Models MNLI QNLI QQP RTE SST-2 MRPC CoLA STS-B Avg.”                           | “Model COLA MRPC QNLI MNLI QQP SST2 STSB RTE Avg.”                                                   | Shared GLUE benchmark column labels in different result tables. |
| Hybrid **1.000000** | Compact Transformers → BERTAC             | “Proceedings of the 27th Conference on Computational Natural Language Learning” | “Proceedings of the 59th Annual Meeting of the Association for Computational Linguistics”            | Standard publication metadata in different conference notices.  |

Three hybrid alerts scored 1.000. The other two paired a Compact Transformers discussion of ELECTRA-Small with Pushdown Layers prose on syntactic generalization, and Online Sketch Query Optimization prose with a NoREC database-generator mention. A score can describe a contributing window inside a merged excerpt, so the full displayed ranges can differ considerably.

## Patterns that remained

- **Shared terminology.** MiniLM paired discussion of “TCP Westwood+ congestion control” in Delay Control with “CUBIC or NewReno as the congestion control algorithm” in Dual Connectivity at **0.797799**. The terms describe related networking methods. The two QUIC papers still produced 59 MiniLM alerts across both directions.
- **Common academic phrasing.** MiniLM paired Online Sketch Query Optimization’s “We present the results of our extensive experimental evaluation” with Review4Repair’s “we discuss the experimental results and findings of our research” at **0.795837**. Both are standard evaluation transitions.
- **Extraction artifacts.** Numeric tables, equations, mixed-column prose, and publication notices still appeared in high-scoring alerts. The TF-IDF maximum and the MiniLM table-header match illustrate this.
- **Bibliography cues.** A scan of the stored excerpts for `arXiv preprint`, `arXiv abs`, DOI prefixes, and `In Proc. of` found 110 TF-IDF, 20 MiniLM, and 97 hybrid alerts with those cues in the full-text report and zero in the final report. This is a cue count, not a bibliography classification. Inline citations and publication metadata still appear.

Alert counts measure review workload on this collection. Without annotated plagiarism cases, the comparison cannot estimate accuracy, precision, or recall.

The three prior reports were copied to the workspace cache and verified byte for byte against their backups. All 75 tests, typecheck, and lint passed.

[Full-text baseline](external-evaluation.json) · [Earlier body-only run](external-evaluation-body-only.json) · [Final results](external-evaluation-body-only-final.json)
