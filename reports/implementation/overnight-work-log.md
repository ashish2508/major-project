# Overnight Work Log

Date: 11 November 2026

## Completed

- Reconciled `AGENTS.md`, research decisions, methodology, implementation reports and current Git state.
- Confirmed the existing frozen PAN configuration and prior CPU/DirectML paraphrase findings.
- Added below-threshold semantic review-lead selection without changing confirmed detections or thresholds.
- Added selector tests for below-threshold, above-threshold and empty candidate collections.
- Added the neutral review-lead UI card with source/range evidence and navigation to highlighted passages.
- Extended `scripts/diagnose-demo.ts` to record API review leads and actual providers.
- Updated README and controlled-demo instructions.
- Created `final-handoff-report.md` with the completion scorecard requested by the project owner.

## Commands and actual results

- `bun test --run tests/detection.test.ts`: 6 passed, 0 failed.
- `bun run format:check`: passed.
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun test --run`: 38 passed, 2 skipped, 0 failed; 40 tests across 8 files.
- `INFERENCE_TESTS=1 bun test --run tests/model.integration.test.ts tests/paragraph-review.test.ts`: 3 passed, 0 failed.
- `bun run build`: passed with `next build --webpack`.
- Native DirectML `bun scripts/smoke-app.ts http://127.0.0.1:3100`: passed homepage, readiness, exact PDF/text analysis, all three methods, invalid PDF and cross-origin checks.
- Native DirectML `bun scripts/diagnose-demo.ts after http://127.0.0.1:3100`: completed all nine controlled method/scenario requests.
- Native browser inspection: paraphrase result displayed `REVIEW LEAD - NOT A CONFIRMED DETECTION`, score `0.527`, source/ranges, highlights and `DmlExecutionProvider + CPUExecutionProvider`.

## Measured findings

- Direct copy: 3/3 confirmed for TF-IDF, MiniLM and Hybrid.
- Paraphrase: 0/3 confirmed; MiniLM review lead `0.5265148046` in the final DirectML run.
- Negative control: 0 confirmed alerts for all methods; semantic ranking lead `0.4225629000` remained neutral and below threshold.
- Frozen semantic threshold: `0.60`.
- Production DirectML provider: `DmlExecutionProvider + CPUExecutionProvider`.
- Existing CPU/GPU probe maximum absolute embedding difference: `1.155e-7`.

## Failures and resolutions

- Browser access to the WSL-bound development server was unavailable from the integrated browser; switched to the native Windows server, which is the required DirectML path.
- The first browser page remained in calibration loading after a cross-origin HMR warning; reloaded on `localhost`, after which readiness and the UI behaved correctly.
- The default Turbopack production bundle had previously emitted an unresolved Transformers.js external alias; the standard build uses the verified Webpack path.

## Remaining work

The only partial acceptance item is breadth of manual edge-case execution. Automated coverage and production validation cover the important rejection and limit paths, but every requested failure mode was not separately exercised manually. The MiniLM paraphrase limitation remains a documented scientific limitation, not an implementation blocker. No benchmark thresholds or PAN parameters were changed.
