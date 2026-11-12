# Phase 1 — PDF Text Repair

## Summary

Implemented `src/lib/documents/repair.ts` with three ordered repairs:

1. **Ligature rejoining** — splits like `"ef fi cacy"` → `"efficacy"` (word-list checked; also joined if the joined form appears ≥ 2× elsewhere in the document).
2. **Hyphenated line-break rejoining** — `"meta-\nanalysis"` → `"meta-analysis"` (only when the continuation starts with a lowercase letter).
3. **Repeated space normalisation** — runs of 2+ spaces collapsed to one; a warning is added to the offset-map result.

Repairs are applied **per page** inside `extractFile()` so `pages[]` boundaries remain aligned with the repaired text. An `offsetMap?: OffsetMapEntry[]` field is added to `ExtractedDocument` (optional, never breaks existing code).

## Files changed

| File | Change |
|------|--------|
| `src/lib/documents/repair.ts` | New — `repairText()`, `mapOffset()`, types |
| `src/lib/documents/ligature-words.txt` | New — 46 deduplicated, alphabetically sorted words |
| `src/lib/documents/extract.ts` | Import `repairText`; apply per-page; propagate `offsetMap` |
| `tests/repair.test.ts` | New — 13 tests covering all specified cases |

## Test results

All 13 new tests pass. Full suite: **211 pass, 10 skip, 0 fail**.

```
(pass) ligature rejoining (word-list) > repairs "ef fi cacy" → "efficacy"
(pass) ligature rejoining (word-list) > repairs "con fl icts" → "conflicts"
(pass) ligature rejoining (word-list) > repairs "signi fi cant" → "significant"
(pass) ligature rejoining (word-list) > repairs "scienti fi cally" → "scientifically"
(pass) ligature rejoining (word-list) > repairs "in fl uenza" → "influenza"
(pass) ligature rejoining (word-list) > repairs "ef fi ciency" → "efficiency"
(pass) ligature rejoining (unchanged) > leaves "a fi rst" unchanged (not in word list, not repeated ≥2 times)
(pass) hyphenated line-break rejoining > repairs "meta-\nanalysis" → "meta-analysis" (next char lowercase)
(pass) hyphenated line-break rejoining > leaves "Meta-\nAnalysis" unchanged (next char uppercase A)
(pass) offset map > mapOffset(0, []) returns 0
(pass) offset map > offset map has at least one entry after a ligature join
(pass) offset map > offset map entry has non-negative repairedOffset
(pass) multi-repair pass > repairs "The ef fi cacy  of meta-\nanalysis" to "The efficacy of meta-analysis"
```

## Before / after alert counts (eval:papers)

The evaluation set uses one PDF source (`liu-2020-e21808.pdf`) and one PDF query (`qiu-2020-e22022.pdf`) for P1; controls C1–C4-light are plain `.txt` files derived from the same source PDF. Alert counts are unchanged because:

- The ligature tokens (`ef fi cacy`) appear identically in both query and source PDFs, so cosine similarity between paired passages is unaffected.
- Plain-text controls contain no PDF ligature artefacts.
- Boilerplate and threshold changes are reserved for later phases.

The primary effect of Phase 1 is **improved human-readable snippet display** (joined words instead of split fragments) and **correct tokenisation for the Phase 2 IDF refit** (joined words will now be counted as single vocabulary items).

| pair | method | before_informativeAlerts | after_informativeAlerts | change |
|------|--------|-------------------------:|------------------------:|--------|
| P1 | lexical | 8 | 8 | 0 |
| P1 | semantic | 97 | 97 | 0 |
| P1 | hybrid | 36 | 36 | 0 |
| C1 | lexical | 4 | 4 | 0 |
| C1 | semantic | 273 | 273 | 0 |
| C1 | hybrid | 162 | 162 | 0 |
| C2 | lexical | 4 | 4 | 0 |
| C2 | semantic | 262 | 262 | 0 |
| C2 | hybrid | 142 | 142 | 0 |
| C3 | lexical | 67 | 67 | 0 |
| C3 | semantic | 367 | 367 | 0 |
| C3 | hybrid | 202 | 202 | 0 |
| C4-light | lexical | 4 | 4 | 0 |
| C4-light | semantic | 267 | 267 | 0 |
| C4-light | hybrid | 156 | 156 | 0 |

## Offset map behaviour

- **Ligature and hyphen joins**: each join records an `OffsetMapEntry` with exact `repairedOffset`, `originalOffset`, and cumulative `delta`. Use `mapOffset(pos, offsetMap)` to convert a repaired-text position back to the original extracted position.
- **Space normalisation**: exact tracking is not feasible without recording every collapsed run; a warning string `'offset tracking approximate after space normalization'` is added to `result.warnings`.
- Offsets relative to the **original PDF.js extracted text** are recorded, not page image coordinates.

## Conservative decisions

- Ligature joins are **not forced** when the joined form is absent from the word list and appears fewer than 2× in the document. This avoids false joins (e.g. `"a fi rst"` stays unchanged).
- The word list is a plain text file (`ligature-words.txt`), easily extended without code changes.
- Repair is applied **per page** inside the PDF extraction loop, so page boundary offsets in `pages[]` are always consistent with the repaired text.
