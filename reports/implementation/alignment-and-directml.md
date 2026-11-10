# Passage alignment and DirectML

11 November 2026. The synthetic tests used the three labeled PDF/TXT pairs under [demo](../../demo/README.md). PAN-PC-11 results are reported separately.

## Alignment

The original exhaustive search used 80-word windows that could cross section boundaries and kept the highest-scoring source window per query window. In the paraphrase example, the source paragraph **Evaluation cohorts** begins at UTF-16 offset 545. For query offset 1702, the source window at 1077 scored 0.643 and mixed **Reference schedule** with **Correction records**. A window overlapping the intended paragraph at source offset 736 ranked fifth at 0.418 and was discarded before thresholding. There was no lexical prefilter. Both models used the same windows, and the tokenizer budget, masked mean pooling, and vector normalization were already in place.

The application now uses PDF layout gaps and TXT paragraph separators to bound one- and two-sentence windows. Long sentences are subdivided within the existing token budget. The PDF extractor adds boundary metadata while preserving its original text and offsets. Results merge only touching or overlapping spans on both sides. The fresh paragraph-bounded diagnostic retrieved annotated paraphrase candidates with semantic scores from 0.322 to 0.527; the maximum annotated candidate was 0.5265146731 on CPU and 0.5265148047 on DirectML. The earlier two query windows still rank another section first. These scores remain below the frozen 0.60 MiniLM threshold, consistent with a limitation of the fixed embedding model on this rewrite rather than a CPU/DirectML discrepancy.

[Before](demo-diagnostics-before.json) and [after](demo-diagnostics-after.json) record windows, token counts, embedding dimensions and norms, both pairwise scores, top-five semantic ranks and matched annotation IDs. The after file also records the production API output, thresholds, scores, spans and timings. The corrected diagnostic records the selected device and verified provider; the native CPU and DirectML snapshots are retained separately for comparison.

## Controlled application results

The production checks below used the archived thresholds of 0.30 for TF-IDF and hybrid and 0.60 for MiniLM. Hybrid used lexical weight 1.0. A correct alert overlaps the labeled submitted and source spans for the same pair.

| Pair             | TF-IDF                 | MiniLM                 | Hybrid                 |
| ---------------- | ---------------------- | ---------------------- | ---------------------- |
| Direct copy      | 3/3, 0 false positives | 3/3, 0 false positives | 3/3, 0 false positives |
| Paraphrase       | 0/3, 0 false positives | 0/3, 0 false positives | 0/3, 0 false positives |
| Negative control | 0 alerts               | 0 alerts               | 0 alerts               |

The wrong semantic alert disappeared. The correct semantic candidates remain below the archived threshold. Direct-copy highlights scored 1.000 and recovered all three source paragraphs. These results apply to the supplied pairs and do not justify lowering the PAN-calibrated threshold.

## GPU execution

Inference stays in the Next.js Node.js server. Native Windows ONNX Runtime 1.30.0 provides DirectML and Transformers.js accepts an explicit DML adapter index. On this machine, index 0 ran MiniLM on the RTX 3050 Laptop GPU with driver 616.92. The startup probe verifies that the ONNX profile contains a DirectML operator. The provider label also lists CPU when ONNX Runtime assigns some operations there. Initialization fails if the requested DirectML path cannot be verified. CPU remains the default for environments such as WSL that lack this DirectML provider. [ONNX Runtime Node.js provider support](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)

A Node.js 24.18 FP32 probe used identical batches of 16 inputs. The maximum absolute difference across the 384-dimensional outputs was 1.155e-7. Warm median latency was 88.3 ms over 51 DirectML batches and 185.5 ms over three CPU batches. The RTX 3050 telemetry rose from idle to 42% utilization during the DirectML workload, and reported memory rose from 1106 to 1341 MiB. These measurements describe the probe, with unequal sample counts, and do not establish a general speedup. The production API separately reported both providers on semantic and hybrid requests. [Probe log](directml-probe.log) and [GPU telemetry](directml-nvidia.csv)

## Verification

TypeScript, ESLint, the Next.js production build, and all 39 tests passed, including PDF and TXT extraction, short and over-budget text, source alignment, and local MiniLM inference. The production build uses the documented Webpack path because the default Turbopack server bundle emitted an unresolved Transformers.js external alias at runtime. The fixed DirectML server passed the exact-copy, readiness, invalid-upload and cross-origin smoke checks and processed all nine method/pair combinations. The corrected CPU and DirectML diagnostics produced identical method decisions for all three controlled pairs; the maximum annotated paraphrase score differed by approximately 1.3e-7.
