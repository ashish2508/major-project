# Phase 0 — Evaluation Set and Harness

**Status: AWAITING PDF UPLOAD**

## Missing Files

Both required PDF fixtures are absent from `tests/fixtures/papers/`. Phase 0 cannot proceed
until they are placed there. The evaluation script (`scripts/eval-papers.ts`) and the control
text files will be generated once the PDFs are present.

---

## Expected Files

Place the following two PDFs in:

```
tests/fixtures/papers/
```

### 1. `liu-2020-e21808.pdf` — **SOURCE** document

> Liu et al., *Medicine* 2020;99(35):e21808 — the **original** published article.
> This file is used as the **SOURCE** (the document that was allegedly copied from).

PMC link: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7484510/>

Download the full-text PDF from the above link and save it as:

```
tests/fixtures/papers/liu-2020-e21808.pdf
```

---

### 2. `qiu-2020-e22022.pdf` — **QUERY** document

> Qiu et al., *Medicine* 2020;99(37):e22022 — the **retracted** article (the suspected copy).
> This file is used as the **QUERY** (the document being checked for plagiarism).

PMC link: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7523037/>

Download the full-text PDF from the above link and save it as:

```
tests/fixtures/papers/qiu-2020-e22022.pdf
```

---

## Optional Negative-Pair PDFs

These two PDFs are optional negative controls (same journal/month, NOT plagiarised).
If present they will be run as negative pairs; if absent they are skipped automatically.

| Filename | Role | PMC |
|---|---|---|
| `zhu-2020-e22356.pdf` (N1) | QUERY vs liu SOURCE | <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7505387/> |
| `tanreqing-2020-pmc7458256.pdf` (N2) | QUERY vs liu SOURCE | <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7458256/> |

---

## Role Assignments

| Pair | Query (suspect) | Source (original) | Type |
|------|-----------------|-------------------|------|
| P1   | `qiu-2020-e22022.pdf`         | `liu-2020-e21808.pdf` | Positive — retracted copy |
| C1   | `c1-exact-copy.txt`           | `liu-2020-e21808.pdf` | Control — exact copy |
| C2   | `c2-synonym-replace.txt`      | `liu-2020-e21808.pdf` | Control — 10 % synonym replacement |
| C3   | `c3-sentence-shuffle.txt`     | `liu-2020-e21808.pdf` | Control — sentence-order shuffle |
| C4-light | `c4-light-auto-paraphrase.txt` | `liu-2020-e21808.pdf` | Control — ~30 % synonym replacement |
| C4-medium | `c4-medium.txt`           | `liu-2020-e21808.pdf` | Control — hand-paraphrase (placeholder) |
| C4-heavy  | `c4-heavy.txt`            | `liu-2020-e21808.pdf` | Control — paragraph-level rewrite (placeholder) |
| N1   | `zhu-2020-e22356.pdf`         | `liu-2020-e21808.pdf` | Negative — same topic, not plagiarised |
| N2   | `tanreqing-2020-pmc7458256.pdf` | `liu-2020-e21808.pdf` | Negative — same topic, not plagiarised |

---

## Synonym Map (for Controls C2 and C4-light)

The following fixed map will be applied deterministically once the PDFs are present:

```json
{
  "study":       "investigation",
  "patients":    "subjects",
  "treatment":   "therapy",
  "significant": "notable",
  "results":     "findings",
  "analysis":    "examination",
  "data":        "information",
  "clinical":    "medical",
  "outcomes":    "endpoints",
  "infection":   "disease",
  "children":    "pediatric patients",
  "compared":    "contrasted",
  "reported":    "documented",
  "showed":      "demonstrated",
  "used":        "employed",
  "groups":      "cohorts",
  "effect":      "impact",
  "method":      "approach",
  "evidence":    "proof",
  "review":      "assessment"
}
```

**C2 rule:** replace exactly 1 in every 10 words scanning left-to-right; pick the first
replaceable word in each window of 10 words. Case of the first letter is preserved.

**C4-light rule:** replace every 3rd replaceable word (deterministic, seed 42); targets
approximately 30 % of replaceable words.

---

## Next Step

Once both PDFs (at minimum `liu-2020-e21808.pdf` and `qiu-2020-e22022.pdf`) are present,
re-run the Phase 0 workflow step. It will:

1. Extract text from `liu-2020-e21808.pdf` and generate C1–C4 control files.
2. Create `scripts/eval-papers.ts`.
3. Run `bun run eval:papers` and record baseline measurements.
4. Update this file with the baseline results table.
