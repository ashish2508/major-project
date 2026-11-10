# Execution status

Updated: 10 November 2026. Full roadmap authorized under D003; continue automatically.

1. Dataset infrastructure: complete. Typed XML/parser/reference/hash/span validation reproduced all 49,621 labels and original corpus fingerprint. 14 parser tests passed; full validation used 43.177 seconds and ~602 MB peak RSS.
2. Splits: complete for bounded English experiment. Conservative author/title family groups, rare-case reservations, deterministic hashing and whole-query quarantine; manifest frozen before scoring. 80/48/48 train/validation/test queries, 57/35/36 sources. All 304 selected documents passed cross-partition content checks. See D004–D005 and split summary for selection bias/limited rare-case coverage.
3. Lexical: implemented. Training-only TF-IDF fit and validation threshold search running as part of benchmark.
4. Semantic: implemented. Local FP32 model, tokenizer-aware 256-token windows. Native profiling verified CPUExecutionProvider; do not claim CUDA. Embedding generation/benchmark running.
5. Hybrid: implemented. Validation-only alpha/threshold search, freeze-before-test flow in `scripts/benchmark.ts`.
6. Evaluation: TypeScript PAN macro metrics and external-reference fixtures implemented. Actual held-out results pending current run. Core suite: 33 tests passed; typecheck passed after fixture correction.
7. Application: next after comparison; existing Next.js checkout, local inference, TXT/PDF uploads. PDF.js imports successfully on Bun.
8. Research article/setup: next after actual measurements; report limitations and exact subset population.

Current command: `bun scripts/benchmark.ts`, log `reports/implementation/benchmark.log`. It reuses content/model-hashed embedding caches if interrupted. Do not alter detector configuration in response to held-out outcomes. No Git commit/push is authorized.
