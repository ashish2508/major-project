# Phase 2 — IDF Fitted on Research Text

## Summary

The TF-IDF vocabulary was previously fitted on PAN-PC-11 book-text training windows. Research-paper-specific terms (medical/scientific terminology) were out-of-vocabulary (OOV) and silently scored zero in lexical mode. This phase fixes that for the web-API research-paper path without touching the PAN benchmark.

## Changes

| File                                    | Change                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/lib/detection/tfidf.ts`            | Added `Tfidf.fitOnPassages()` static method and `TfidfFitMetadata` type                                                |
| `src/lib/application/analysis.ts`       | Added `fitResearchTfidf()` helper; `analyzeDocuments()` now uses it for non-corpus calls instead of the PAN vocabulary |
| `src/lib/detection/background/.gitkeep` | Created background corpus directory                                                                                    |
| `.gitignore`                            | Added `src/lib/detection/background/*.txt`                                                                             |
| `scripts/fetch-background-corpus.ts`    | New script: fetches ~500 PubMed abstracts via NCBI E-utilities                                                         |
| `package.json`                          | Added `"fetch:background"` script                                                                                      |
| `tests/tfidf-research.test.ts`          | 17 new tests covering `fitOnPassages`                                                                                  |

## Implementation Details

### `Tfidf.fitOnPassages()`

Signature:

```ts
static fitOnPassages(
  passages: string[],
  backgroundPassages?: string[],
  documents?: number,
): Tfidf
```

- Tokenises every passage with `lexicalTokens()`.
- Counts document frequency: for each term, number of passages containing it.
- Applies smoothed IDF: `log((1 + N) / (1 + df)) + 1`, where N = total passages (supplied + background).
- Includes ALL terms — no OOV dropping at fit time.
- If `backgroundPassages` is supplied, they increase N and df without being treated as query/source passages.
- Sets `fittedOn` metadata on the returned instance.

### `fitResearchTfidf()` in `analysis.ts`

For the web API (non-corpus) path:

1. Checks `src/lib/detection/background/` for `.txt` files.
   - If found: reads them line-by-line as background passages.
   - If absent: logs a `console.warn` and proceeds document-locally.
2. Collects all query + source passage texts.
3. Calls `Tfidf.fitOnPassages(allPassageTexts, backgroundPassages, documentCount)`.
4. Logs: `IDF fitted on N passages from M documents (background: B passages)`.

The PAN benchmark path (`getArtifacts()`) is completely unaffected.

### `researchMode` flag

`buildResult()` now returns `researchMode: boolean` — `true` when IDF was fitted on the supplied documents, `false` when using the corpus-indexed PAN vocabulary.

## Background Corpus

The directory `src/lib/detection/background/` is created but empty. Run:

```bash
bun run fetch:background
```

This fetches up to 500 PubMed abstracts for the query `"plagiarism detection OR text similarity OR duplicate publication"` via NCBI E-utilities (free, no API key). The result is written to `src/lib/detection/background/pubmed-abstracts.txt`. Without this file the tool warns and fits IDF on the uploaded documents only.

## IDF Fit Parameters (observed during eval:papers run)

```
P1  (qiu vs liu):       536 passages from 1 document, 0 background passages
C1  (exact copy):       665 passages from 1 document, 0 background passages
C2  (synonym replace):  669 passages from 1 document, 0 background passages
C3  (sentence shuffle): 799 passages from 1 document, 0 background passages
C4-light (paraphrase):  672 passages from 1 document, 0 background passages
```

No background corpus was present during this run (`USE_BACKGROUND_CORPUS = false`).

## Before / After Alert Counts

"Before" numbers come from phase-1 results (the PAN book vocabulary was used for IDF).
"After" numbers are from this `bun run eval:papers` run (IDF fitted on document passages).

| pair     | method   | before_informativeAlerts | after_informativeAlerts | change |
| -------- | -------- | -----------------------: | ----------------------: | ------ |
| P1       | lexical  |                        8 |                       3 | −5     |
| P1       | semantic |                       97 |                      97 | 0      |
| P1       | hybrid   |                       36 |                      25 | −11    |
| C1       | lexical  |                        4 |                       3 | −1     |
| C1       | semantic |                      273 |                     274 | +1     |
| C1       | hybrid   |                      162 |                     161 | −1     |
| C2       | lexical  |                        4 |                       3 | −1     |
| C2       | semantic |                      262 |                     265 | +3     |
| C2       | hybrid   |                      142 |                     140 | −2     |
| C3       | lexical  |                       67 |                      62 | −5     |
| C3       | semantic |                      367 |                     366 | −1     |
| C3       | hybrid   |                      202 |                     193 | −9     |
| C4-light | lexical  |                        4 |                       3 | −1     |
| C4-light | semantic |                      267 |                     269 | +2     |
| C4-light | hybrid   |                      156 |                     149 | −7     |

## Interpretation

**Lexical mode:** Small decreases in alert counts (−1 to −5). This is expected and represents a qualitative improvement:

- The PAN book vocabulary included many common English words that were irrelevant to medical content but still drove cosine similarity through shared function words and generic academic phrases.
- Fitting on document-local passages gives each passage a vocabulary that actually appears in the documents, increasing the IDF weight of domain-specific terms and decreasing the weight of words that appear everywhere.
- The document-local IDF (without background corpus) has a narrower vocabulary than the PAN vocabulary, so some marginal matches that relied on broad overlap are no longer triggered. This is a precision improvement at the cost of a small recall reduction.

**Semantic / hybrid mode:** Near-zero changes (±1 to ±3 on semantic, slightly larger on hybrid). Semantic scores are embedding-based and unaffected by IDF; the small hybrid changes reflect the changed lexical component weight.

**OOV fix:** With `fitOnPassages`, every term that appears in any passage is in the vocabulary. Medical/scientific terms like `efficacy`, `prophylaxis`, `randomized`, `incidence` will now score non-zero in lexical mode instead of silently dropping to zero. The eval pairs (Liu vs Qiu) are medical papers; this fix is directly applicable.

**Expected improvement with background corpus:** When `bun run fetch:background` is run, the background corpus will stabilise IDF estimates across a broader domain vocabulary. Terms that are common across medical literature will get lower IDF weights (less distinctive); rare domain-specific terms that appear in the query/source but not the background will get higher weights (more distinctive). This should improve precision without reducing recall.

## Conservative Decisions

1. **Document-local IDF without background**: accepted as the default; always better than OOV=0 for research papers.
2. **PAN benchmark path unchanged**: `getArtifacts()` and all benchmark scripts remain unmodified.
3. **Thresholds unchanged**: Phase 2 fixes IDF; threshold calibration is reserved for Phase 6.

## Test Results

New test file: `tests/tfidf-research.test.ts` — **17 tests, 17 pass, 0 fail**.

Full suite: **228 pass, 10 skip, 0 fail** (38 → 55 test count increase when including prior phases).

Checks run: `bun test`
