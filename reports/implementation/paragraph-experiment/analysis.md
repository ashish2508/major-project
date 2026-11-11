# PAN-PC-11 passage-window follow-up

The paragraph-bounded configuration gave MiniLM a small held-out PlagDet improvement and gave the hybrid a nonzero semantic contribution. The original TF-IDF baseline remained strongest overall.

Both runs used the same frozen split, verified by manifest SHA-256 `203a88a979bdfda36d75612c902b699b0a8fd7b2ee82e688d494a036b01f3908`. The follow-up used paragraph-bounded windows of up to two sentences, capped at 80 words and 256 model tokens. It merged only touching or overlapping evidence on both sides and fitted TF-IDF on the revised training windows. MiniLM weights, masked mean pooling, normalization, exhaustive search, and scoring formulas were held fixed. Both runs selected by validation PlagDet, precision, then higher threshold. The follow-up froze the winners before scoring the same 48 held-out queries against the same 36 sources and 57 labels.

| Method | Follow-up threshold | Lexical weight | Baseline validation PlagDet | Follow-up validation PlagDet | Baseline test PlagDet | Follow-up test PlagDet |
| ------ | ------------------: | -------------: | --------------------------: | ---------------------------: | --------------------: | ---------------------: |
| TF-IDF |                0.60 |           1.00 |                      0.6260 |                       0.3485 |                0.6033 |                 0.3179 |
| MiniLM |                0.70 |           0.00 |                      0.2867 |                       0.3882 |                0.3047 |                 0.3140 |
| Hybrid |                0.60 |           0.25 |                      0.6260 |                       0.4158 |                0.6033 |                 0.3370 |

| Follow-up method | Test precision | Test recall | Test F1 | Test granularity | Cases detected | Unmatched detections |
| ---------------- | -------------: | ----------: | ------: | ---------------: | -------------: | -------------------: |
| TF-IDF           |         0.5056 |      0.5739 |  0.5376 |           2.2292 |          48/57 |                   96 |
| MiniLM           |         0.7016 |      0.5484 |  0.6156 |           2.8913 |          46/57 |                   52 |
| Hybrid           |         0.7325 |      0.6727 |  0.7013 |           3.2308 |          52/57 |                   55 |

In the original validation sweep, the best PlagDet by lexical weight increased from 0.2867 at 0 to 0.4267, 0.5282, 0.5854, and 0.6260 at 1. The endpoint was the empirical winner, consistent with lexical overlap providing stronger evidence on that mix of cases. With the revised windows, the corresponding scores were 0.3882, 0.4158, 0.4115, 0.3856, and 0.3485. Semantic similarity now contributed useful evidence within the revised experiment. The higher test F1 of the revised hybrid relative to its revised baselines came with more fragments per detected case. The revised hybrid lost 0.2663 PlagDet relative to the original lexical baseline.

The MiniLM follow-up detected the sole held-out simulated case that original MiniLM missed. A single case is insufficient to estimate paraphrase performance. Synthetic diagnostics also show the correct source can rank first for part of a rewrite while falling below the alert threshold. The current training split contains zero simulated cases and the validation and test splits each have one. Defer fine-tuning until a separate, adequately sized set of family-disjoint genuine paraphrases and same-topic negatives can support training and independent evaluation. Improving alignment and calibrating on the existing artificial-heavy split cannot establish that fine-tuning would help.

The comparison is descriptive because the original held-out split already has published scores. The controlled synthetic examples motivated the window revision. They supplied no benchmark training examples or threshold choices. The application retains the original configuration for TF-IDF and the lexical-only hybrid, whose established validation scores were stronger. MiniLM uses the boundary fix and retains the original alert threshold in the app. Its live configuration is distinct from the follow-up benchmark.

[Original results](../benchmark-results.json) · [Follow-up results](benchmark-results.json) · [Validation search](validation-search.json) · [Frozen parameters](frozen-parameters.json) · [Predictions](test-predictions.json) · [Alignment diagnostics](../alignment-and-directml.md)

Final verification passed TypeScript, ESLint, all 40 tests including native inference, the production build, and all nine controlled method/pair API requests. The test split, original results and prior diagnostic snapshots were preserved.
