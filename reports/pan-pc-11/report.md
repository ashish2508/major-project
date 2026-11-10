# PAN-PC-11 dataset exploration and research audit

Audit date: 10 November 2026. Scope: the entire extracted **external detection corpus**. This report records corpus measurements, documentation findings, and proposed methodology separately. No detector, production parser, split, or application change has been implemented.

The supplied annotation and positive-document totals are correct. The main corrections are that `obfuscation` and `manual_obfuscation` are different attributes; offsets require explicit BOM handling; and source reuse makes a conventional balanced, document-disjoint split impossible if every annotation-connected group is retained intact.

## 1. Dataset structure

Audited root:

```text
data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011/
├── readme.txt
├── document.xsd
├── external-detection-corpus/
│   ├── retrieval-task.txt
│   ├── source-document/
│   │   └── part1/ ... part23/
│   │       ├── source-documentNNNNN.txt
│   │       └── source-documentNNNNN.xml
│   └── suspicious-document/
│       └── part1/ ... part23/
│           ├── suspicious-documentNNNNN.txt
│           └── suspicious-documentNNNNN.xml
└── intrinsic-detection-corpus/  # outside the main audit
```

Actual directory names are singular. The bundled README uses plural names and a six-digit placeholder, so its example paths must not be copied literally. Source XML provides metadata; suspicious XML provides metadata and zero or more plagiarism annotations. Every external text file has a corresponding XML file.

Both roles have 500 text/XML pairs in each of parts 1–22 and 93 pairs in part23. These directories are storage partitions, not established training/validation/test assignments. The complete suspicious distribution is:

| Part | Text files | XML files | With annotations | Without annotations | Instances |
|---|---:|---:|---:|---:|---:|
| 1 | 500 | 500 | 258 | 242 | 1,967 |
| 2 | 500 | 500 | 252 | 248 | 2,452 |
| 3 | 500 | 500 | 246 | 254 | 2,151 |
| 4 | 500 | 500 | 243 | 257 | 2,553 |
| 5 | 500 | 500 | 271 | 229 | 2,255 |
| 6 | 500 | 500 | 251 | 249 | 2,458 |
| 7 | 500 | 500 | 271 | 229 | 1,948 |
| 8 | 500 | 500 | 238 | 262 | 2,261 |
| 9 | 500 | 500 | 237 | 263 | 1,896 |
| 10 | 500 | 500 | 259 | 241 | 2,509 |
| 11 | 500 | 500 | 243 | 257 | 2,045 |
| 12 | 500 | 500 | 237 | 263 | 1,987 |
| 13 | 500 | 500 | 243 | 257 | 2,184 |
| 14 | 500 | 500 | 247 | 253 | 2,009 |
| 15 | 500 | 500 | 235 | 265 | 1,961 |
| 16 | 500 | 500 | 254 | 246 | 2,479 |
| 17 | 500 | 500 | 258 | 242 | 1,989 |
| 18 | 500 | 500 | 248 | 252 | 2,512 |
| 19 | 500 | 500 | 256 | 244 | 2,403 |
| 20 | 500 | 500 | 257 | 243 | 2,338 |
| 21 | 500 | 500 | 259 | 241 | 2,383 |
| 22 | 500 | 500 | 240 | 260 | 2,480 |
| 23 | 93 | 93 | 44 | 49 | 401 |
| **Total** | **11,093** | **11,093** | **5,547** | **5,546** | **49,621** |

“Without annotations” is the operational meaning of clean here, not a guarantee that every natural textual resemblance has been exhaustively annotated. `suspicious-document/part1/suspicious-document00001.xml`, for example, contains only `about` and `md5Hash` features. The complete 5,546-reference clean-document list is in `results.json`, under `cleanSuspicious`.

## 2. Verified statistics and comparison

| Quantity | Verified external-corpus count |
|---|---:|
| Source documents / source metadata XML | 11,093 / 11,093 |
| Suspicious documents / suspicious annotation XML | 11,093 / 11,093 |
| Total text documents | 22,186 |
| Total XML files, both roles | 22,186 |
| Plagiarism instances | 49,621 |
| Suspicious documents with / without annotations | 5,547 / 5,546 |
| Source documents referenced by annotations | 7,990 |
| Source documents not referenced by annotations | 3,103 |
| Sources referenced by multiple suspicious documents | 4,523 |
| Maximum distinct suspicious documents sharing one source | 15 |

All supplied totals agree: artificial **39,870**, simulated **4,609**, translation **5,142**, total **49,621**, and positive documents **5,547**. Independent `rg` counts agree with the audit program.

| Construction type | Instances | Suspicious documents containing that type |
|---|---:|---:|
| Artificial | 39,870 | 4,887 |
| Simulated | 4,609 | 105 |
| Translation | 5,142 | 555 |

No suspicious document mixes these three construction types in this extraction. Thus the document counts in that table sum to 5,547. In particular, the 4,609 simulated cases are concentrated in only 105 documents; they are not 4,609 independent document-level examples.

Published corpus-wide totals can differ legitimately from external-only totals. As a scope cross-check, the intrinsic directory contains 4,753 XML files and 11,443 plagiarism features. Adding these gives **26,939 documents and 61,064 cases**, matching Table 1 of the [PAN 2011 overview](https://ceur-ws.org/Vol-1177/CLEF2011wn-PAN-PotthastEt2011a.pdf). The intrinsic corpus was not otherwise fully audited.

## 3. XML annotations, references, and offsets

### Observed XML vocabulary

Every external XML document has a `document` element with `reference`. Observed features are exclusively `about`, `md5Hash`, and `plagiarism`.

| Element/feature | Attributes actually observed | Presence |
|---|---|---|
| `document` | `reference` | 22,186 |
| `about` | `name`, `title`, `lang` | All 22,186 documents |
| `about` | `authors` | 17,935 documents; missing from 4,251 sources |
| `md5Hash` | `name`, `value` | All 22,186 documents |
| `plagiarism` | `name`, `type`, `this_language`, `this_offset`, `this_length`, `source_reference`, `source_language`, `source_offset`, `source_length` | All 49,621 instances |
| `plagiarism` | `obfuscation` | All 39,870 artificial instances only |
| `plagiarism` | `manual_obfuscation` | All 5,142 translation instances only |

`this_*` describes the suspicious passage; `source_*` describes its source passage. `reference` identifies the text file described by the XML. `source_reference` is a filename, not a part-relative path. Build an inventory-wide filename lookup: for example, `source-document05924.txt` resolves to `source-document/part12/source-document05924.txt`, even when the suspicious document is in part1. All 49,621 source references resolve uniquely to actual source files. All document references agree with their paired text filenames, and annotation language fields agree with the corresponding document metadata.

Actual features inspected include the following (attribute values are copied from the dataset):

```xml
<!-- suspicious-document/part1/suspicious-document00005.xml -->
<feature name="plagiarism" type="artificial" obfuscation="low" this_language="en" this_offset="19254" this_length="1557" source_reference="source-document00178.txt" source_language="en" source_offset="3835" source_length="1560" />

<!-- suspicious-document/part1/suspicious-document00010.xml -->
<feature name="plagiarism" type="artificial" obfuscation="high" this_language="en" this_offset="2464" this_length="15786" source_reference="source-document07440.txt" source_language="en" source_offset="55319" source_length="19482" />

<!-- suspicious-document/part1/suspicious-document00032.xml -->
<feature name="plagiarism" type="simulated" this_language="en" this_offset="12390" this_length="306" source_reference="source-document08605.txt" source_language="en" source_offset="222038" source_length="230" />

<!-- suspicious-document/part1/suspicious-document00047.xml -->
<feature name="plagiarism" type="translation" manual_obfuscation="false" this_language="en" this_offset="1" this_length="1346" source_reference="source-document01152.txt" source_language="es" source_offset="33445" source_length="1449" />
<feature name="plagiarism" type="translation" manual_obfuscation="true" this_language="en" this_offset="2850" this_length="234" source_reference="source-document04073.txt" source_language="es" source_offset="1277" source_length="259" />

<!-- suspicious-document/part1/suspicious-document00126.xml -->
<feature name="plagiarism" type="artificial" obfuscation="none" this_language="en" this_offset="1277" this_length="266" source_reference="source-document05924.txt" source_language="en" source_offset="11789" source_length="267" />
```

The bundled XSD requires `document.reference` and `feature.name` but otherwise permits arbitrary feature attributes. Schema validity alone therefore cannot ensure valid plagiarism spans or enforce type-specific attributes. The audit uses a guarded scan of this release's simple XML shape, not a general XML parser or a formal XSD validator.

### Passage lengths are independent

| Type | Equal source/suspicious lengths | Different lengths |
|---|---:|---:|
| Artificial | 472 | 39,398 |
| Simulated | 19 | 4,590 |
| Translation | 12 | 5,130 |
| **Total** | **503** | **49,118** |

Never reuse `this_length` as `source_length`. Even unobfuscated text can be rewrapped, changing whitespace and character counts.

### Offset investigation: supported result and remaining uncertainty

All **22,186 text files are valid UTF-8 and begin with a three-byte UTF-8 BOM**, decoded as one U+FEFF character by `Buffer.toString('utf8')`. No supplementary-plane characters occur anywhere in the external texts: all decoded characters fit in one UTF-16 code unit. Therefore **Unicode code-point indexing and JavaScript UTF-16 indexing are numerically equivalent on this corpus**. This extraction cannot distinguish which of those two units the original generator intended for hypothetical non-BMP text.

To distinguish bytes from decoded characters and test BOM handling, the audit compares all 976 `artificial/none` pairs. Whitespace removal is used only as an audit comparison; corpus text is never rewritten.

| Extraction interpretation | Pairs equal after whitespace removal |
|---|---:|
| Character offsets applied directly to BOM-inclusive JS strings | 9 / 976 |
| Character offsets applied after excluding the initial BOM | **969 / 976** |
| UTF-8 byte offsets after excluding the three BOM bytes | 203 / 976 |

The +1 shift in BOM-inclusive strings is equivalent to removing exactly one leading U+FEFF and then applying the original offsets. Shifts -1, 0, +1, +2 were tested; +1 was strongly supported. This is empirical evidence for **zero-based decoded-character offsets in BOM-excluded content**, compatible with JS `slice(offset, offset + length)` on that view. It does not establish a universal UTF-16 contract beyond this corpus. The PAN paper describes evaluation in terms of character passages, rather than byte passages. [PAN 2011 overview](https://ceur-ws.org/Vol-1177/CLEF2011wn-PAN-PotthastEt2011a.pdf)

Only one BOM-excluded pair is exactly string-equal without whitespace adjustment. The other comparisons demonstrate why a strict raw string-equality assertion is unsuitable even for `obfuscation="none"`. Seven pairs still differ after whitespace removal. Inspection shows corresponding passage content but small endpoint truncations; for example, `suspicious-document00886.txt` ends its annotated passage with `all his m`, while the source annotation includes `all his men.`. All seven full passage pairs and their original annotations are retained in `offsetEvidence.bomExcluded.mismatchExamples`. Their cause is not established; do not repair their lengths silently.

All recorded spans fit within both the decoded BOM-inclusive documents and the BOM-excluded content view, with no negative or non-integer offsets. The proposed production parser should enforce these bounds and test endpoints against these fixtures. Bounds validity does not certify every boundary as perfectly aligned ground truth.

## 4. Plagiarism-type and obfuscation analysis

The bundled `readme.txt` explains that artificial cases were generated by inserting source passages with automatic transformations, whereas simulated cases were rewritten by Mechanical Turk participants to change wording while preserving meaning. Automatic transformations may produce unnatural text. These are constructed benchmark cases, not accusations against the original book authors. The [Zenodo record](https://zenodo.org/records/3250095) independently confirms automatic and crowdsourced construction.

Translation cases involve German or Spanish source text translated into English. `manual_obfuscation="false"` represents automatic translation; `true` identifies the manually corrected translation category, rather than a separate degree of English paraphrasing. The automatic/manual-correction distinction is documented in Table 1 of the [PAN 2011 overview](https://ceur-ws.org/Vol-1177/CLEF2011wn-PAN-PotthastEt2011a.pdf).

| Type | `obfuscation` | `manual_obfuscation` | Instances |
|---|---|---|---:|
| Artificial | `low` | Absent | 19,779 |
| Artificial | `high` | Absent | 19,115 |
| Artificial | `none` | Absent | 976 |
| Simulated | Absent | Absent | 4,609 |
| Translation | Absent | `false` | 4,709 |
| Translation | Absent | `true` | 433 |

The proposed 4,609-to-4,609 relationship needs a precise correction:

- **9,751** annotations lack the literal `obfuscation` attribute: 4,609 simulated plus 5,142 translation.
- **Exactly 4,609** lack both `obfuscation` and `manual_obfuscation`, and these are exactly the simulated cases.
- `false` and `true` are values of `manual_obfuscation`; they never appear as values of `obfuscation`.

The supplied numbers are correct as a combined categorization, but labeling all five values as one XML attribute would lose information. Missing obfuscation in simulated cases does not mean an unobfuscated passage. Retain absence explicitly.

## 5. Languages and MiniLM compatibility

| Document role | English (`en`) | German (`de`) | Spanish (`es`) |
|---|---:|---:|---:|
| Source | 10,420 | 471 | 202 |
| Suspicious | 11,093 | 0 | 0 |

| Annotation relationship | Cases |
|---|---:|
| Artificial, English → English | 39,870 |
| Simulated, English → English | 4,609 |
| Translation, German → English | 2,222 |
| Translation, Spanish → English | 2,920 |

These are metadata-language counts, not an independent language-identification assessment. Translated passages can contain poor translations and residual foreign words even when labeled English. The corpus is English-centered and multilingual on the source side; it should not be described as exclusively English. It remains a book-based benchmark, not a CS-paper corpus.

**Recommended primary scope, subject to owner approval:** English-to-English detection with the selected `all-MiniLM-L6-v2`. Its official model card identifies English and sentence/short-paragraph encoding. It is not a validated multilingual plagiarism classifier. [Official model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

Use the 10,420 English sources and the 10,538 suspicious documents that are either clean or contain only artificial/simulated cases. This preserves **44,479 annotations**, **4,992 positive suspicious documents**, and **5,546 clean suspicious documents**. Because types do not mix within suspicious documents here, excluding the 555 translation-only suspicious documents does not remove English-to-English cases or require altering text.

Keep German and Spanish sources and translation documents in the inventory. Reserve them for a separately labeled cross-language stress evaluation, divided by source language and manual correction. Do not mix that score into the primary English comparison, silently translate the corpus, change the model, or claim cross-language competence without evidence. Any future translation preprocessing would require separate methodological approval and an offset-alignment design.

### The 256-token issue

The model card documents default truncation beyond **256 word pieces**. This is not 256 characters or necessarily 256 whitespace-delimited words. The cached ONNX export has `model_max_length: 512`, `max_length: 128` in its tokenizer configuration, and `max_position_embeddings: 512` in its model configuration. Those configuration values do not ensure that Transformers.js enforces the sentence-transformer convention automatically. Future model evaluation should explicitly set and record a total input budget of 256 tokens, including special tokens. [Model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [export tokenizer configuration](https://huggingface.co/onnx-community/all-MiniLM-L6-v2-ONNX/raw/main/tokenizer_config.json), [export model configuration](https://huggingface.co/onnx-community/all-MiniLM-L6-v2-ONNX/raw/main/config.json)

An offline probe of the already cached tokenizer, with truncation disabled and no model inference, measured:

| Actual suspicious passage | Characters | Tokens including special tokens |
|---|---:|---:|
| `00005`, artificial/low, offset 19254 | 1,557 | 319 |
| `00010`, artificial/high, offset 2464 | 15,786 | 3,897 |
| `00032`, simulated, offset 12390 | 306 | 78 |
| `00047`, translation/false, offset 1 | 1,346 | 393 |
| `00047`, translation/true, offset 2850 | 234 | 54 |
| `00126`, artificial/none, offset 1277 | 266 | 65 |

These are inspection examples, not a representative token-length distribution or benchmark results. Across all annotations, suspicious character lengths have minimum 0, median 2,593, 95th percentile 21,384, and maximum 28,728. Character lengths cannot establish exact token overflow rates.

Later segmentation must use sentence/paragraph boundaries with tokenizer-aware subdivision for long sentences, overlapping windows where appropriate, and original span mappings. Do not embed an entire document and accept silent truncation. Ground-truth annotations must be used for scoring, not to define the detector's input chunks. Window matching and merging rules need validation because producing many detections for one true passage affects granularity.

## 6. Data quality and research risks

| Check | Finding and implication |
|---|---|
| Required annotation attributes | None missing among the common required fields, including both language fields. Type-dependent absences are expected. |
| Source references | None missing, ambiguous, or mapped to the wrong document role. |
| Numeric attributes | One zero-length suspicious span; no negative, non-integer, or unsafe-integer values found. |
| Zero-length case | `suspicious-document/part16/suspicious-document07880.xml`: simulated, `this_offset=1580`, `this_length=0`, source `source-document10522.txt`, `source_offset=330631`, `source_length=256`. Preserve it in raw records and flag it; decide evaluation handling explicitly before scoring. |
| Hash metadata | 22,106 MD5 values match literally; 80 match after left-padding the XML value with zeroes to 32 hex characters; no other checksum mismatch. A literal mismatch alone is not evidence of corruption. |
| Optional metadata | `authors` absent for 4,251 sources. Do not make author mandatory or invent it. |
| Encoding | All texts decode as valid UTF-8; every text has a BOM; 69 contain CRLF; no non-BMP characters. Preserve newline sequences. |
| Existing replacement characters | 12 documents already contain U+FFFD despite valid UTF-8. Preserve and flag them; original intended characters cannot be recovered from this audit. References are in `results.json`. |
| Duplicate annotations / overlapping suspicious spans | None found. |
| Duplicate documents | No identical SHA-256 text-file groups among the 22,186 files. This does not rule out near-duplicates or shared book content. |
| Repeated book metadata | 2,508 groups share the exact `(authors, title)` tuple. Treat as conservative grouping candidates, not proof of identical editions or content. |
| Annotation endpoints | Seven unobfuscated pairs have small residual boundary discrepancies after BOM handling and whitespace removal. Keep original annotations. |
| Constructed benchmark | Automated wording artifacts, book-domain language, and concentrated simulated cases limit generalization to real CS research submissions. |

The guarded scan accepted every XML file's document/feature structure. This is not a formal assertion of complete XML/XSD conformance. No lexical, semantic, hybrid, or performance evaluation was conducted.

## 7. Proposed leakage-resistant experimental strategy

Leakage occurs when evaluation examples share source content with examples used to fit or tune a method. Splitting annotation rows, generated chunks, or suspicious documents independently would allow this here: **4,523 sources occur in multiple suspicious documents**. Source filename grouping alone also misses different files originating from the same book.

### Connectivity feasibility finding

Model documents as nodes and each annotated source–suspicious relationship as an edge. A connected component contains documents linked directly or transitively; to preserve all relationships while keeping documents disjoint, the entire component must stay together.

| Graph | Largest component | Annotations in that component |
|---|---|---:|
| All external annotation links | 6,485 sources + 4,150 suspicious documents | 40,584 / 49,621 |
| English-to-English annotation links | Same 6,485 sources + 4,150 suspicious documents | 40,584 / 44,479 |
| All external links plus exact author/title grouping candidates | 9,781 sources + 8,457 suspicious documents | 49,073 / 49,621 |

The annotation-only external graph has 9,389 components, including 740 with multiple documents; many singleton components are clean or unused documents. Adding conservative metadata links produces 3,606 components. The enlarged graph is a sensitivity analysis, not a verified book-identity map. Near-duplicate analysis could add more links.

**A balanced 60/20/20 or 70/15/15 split cannot retain every whole connected component:** the largest annotation component already holds over 90% of English-to-English cases. Keeping all components intact is leakage-resistant but leaves strongly unequal, potentially unrepresentative partitions. Adding clean singleton documents cannot balance positive cases.

### Recommended design to assess before assigning a split

1. Freeze an approved language scope and anomaly policy. Keep the original corpus immutable and retain all raw annotations in the inventory.
2. Establish document families using available author/title candidates plus a reproducible content-based near-duplicate audit. Do not assume titles alone prove shared origin. Consider shared author/style as an additional reported dependence; author-disjointness is a stricter optional constraint, not a promise of this design.
3. First report the distribution achievable by whole-component allocation. Do not silently break the giant component to meet a target ratio.
4. If balanced source/book-disjoint partitions are required, obtain approval for a derived evaluation subset: deterministically partition book families, and retain a suspicious document only when its own book family and **all** annotated source families belong to one partition. Quarantine entire documents whose relationships cross partitions. Never remove only their inconvenient annotations or call them clean.
5. Before freezing that subset, report retained/quarantined documents and cases by type, language, passage length and clean/positive status. Source partitioning can discard many multi-source documents and bias the retained sample. Feasibility and adequate simulated-case coverage must be demonstrated; no retention rate is claimed here.
6. Freeze the selected seed, algorithm version, complete membership manifest, quarantine reasons, corpus fingerprint, and actual proportions. If the retained sample is inadequate, return to the owner with the measured tradeoff rather than relaxing leakage rules silently.

This proposes a decision procedure, not a claim that a balanced subset has already been obtained. An alternative is accepting uneven whole-component partitions and limiting conclusions accordingly. Neither approach creates a new dataset; both require transparent reporting of the PAN-PC-11 scope used.

For the eventual experiments:

- **Train:** fit TF-IDF vocabulary/IDF and any data-dependent preprocessing on training data. Pretrained MiniLM remains frozen; “train split” does not imply fine-tuning it. Keep optional future fine-tuning separate.
- **Validation:** choose segmentation, thresholds, hybrid alpha and merging settings. Use the same scope and evaluation rules across methods.
- **Test:** evaluate the three final methods once on the same frozen held-out queries and candidate-source collection. Prevent source and book-family reuse across partitions under the chosen strict protocol. Include clean suspicious documents and unused sources as realistic negatives/distractors.
- Create chunks and negative examples only after splitting, within their parent partition. Ground-truth source pairs must not be supplied to an end-to-end detector as an oracle. If a later experiment evaluates only given-pair alignment, label that narrower task explicitly.
- Avoid test-based choices, including selecting a seed for good detector performance. Family sizes and annotation strata can inform split feasibility; test similarity outcomes cannot.

Use official passage-level macro precision/recall, harmonic F1, granularity and PlagDet. Classification accuracy is not a substitute. The PAN task defines the passage-output format and links its reference evaluator; later TypeScript metric work should be checked against documented reference cases without introducing Python into this project. [Official PAN external-detection task](https://pan.webis.de/clef11/pan11-web/external-plagiarism-detection.html)

## 8. Proposed TypeScript parser architecture

These interfaces are a proposal contained in this report, not implemented application code. Keep corpus coordinates separate from byte offsets and derived token coordinates.

```ts
type Language = "en" | "de" | "es";
type DocumentReference = string;

interface DocumentRecord {
  reference: DocumentReference;
  textPath: string;                 // corpus-relative path
  xmlPath: string;
  part: string;
  language: Language;
  title: string;
  authors?: string;
  byteLength: number;               // includes the three BOM bytes
  utf16Length: number;              // BOM-excluded text view
  sha256: string;                   // hash of original bytes
  declaredMd5: string;              // preserve original XML spelling
  hasUtf8Bom: boolean;
  coordinateSystem: "bom-excluded-unicode-characters";
  issues: readonly string[];
}

interface SourceDocument extends DocumentRecord {
  role: "source";
}

interface SuspiciousDocument extends DocumentRecord {
  role: "suspicious";
  annotationIds: readonly string[];
  hasAnnotations: boolean;
}

interface CharacterSpan {
  offset: number;                   // original annotation offset
  length: number;                   // independent on each side
}

interface PlagiarismAnnotation {
  id: string;                       // reference + feature ordinal
  suspiciousReference: DocumentReference;
  sourceReference: DocumentReference;
  suspiciousLanguage: Language;
  sourceLanguage: Language;
  suspiciousSpan: CharacterSpan;
  sourceSpan: CharacterSpan;
  construction:
    | { type: "artificial"; obfuscation: "none" | "low" | "high" }
    | { type: "simulated" }
    | { type: "translation"; manualObfuscation: boolean };
  rawAttributes: Readonly<Record<string, string>>;
  issues: readonly string[];        // e.g. zero-length span
}

interface DatasetStatistics {
  corpusFingerprint: string;
  sourceDocuments: number;
  suspiciousDocuments: number;
  sourceXmlFiles: number;
  suspiciousXmlFiles: number;
  plagiarismInstances: number;
  withAnnotations: number;
  withoutAnnotations: number;
  byType: Record<"artificial" | "simulated" | "translation", number>;
  byObfuscation: Record<"none" | "low" | "high" | "missing", number>;
  byManualObfuscation: Record<"true" | "false" | "missing", number>;
  documentLanguages: {
    source: Partial<Record<Language, number>>;
    suspicious: Partial<Record<Language, number>>;
  };
  annotationLanguagePairs: Readonly<Record<string, number>>;
  perPart: readonly {
    role: "source" | "suspicious";
    part: string;
    documents: number;
    withAnnotations: number;
    plagiarismInstances: number;
  }[];
  qualityIssues: Readonly<Record<string, number>>;
}

interface SplitPartition {
  sourceReferences: readonly DocumentReference[];
  suspiciousReferences: readonly DocumentReference[];
  annotationIds: readonly string[];
  familyIds: readonly string[];
}

interface DatasetSplit {
  corpusFingerprint: string;
  schemaVersion: string;
  algorithmVersion: string;
  seed: string;
  scope: "english-to-english" | "full-external";
  policy: "whole-components" | "family-partition-with-quarantine";
  groupingManifestSha256: string;
  train: SplitPartition;
  validation: SplitPartition;
  test: SplitPartition;
  quarantined: readonly {
    reference: DocumentReference;
    reasons: readonly string[];
  }[];
}
```

Use ordinary numbers at the interchange boundary, then validate safe integers, nonnegative offsets, independent source/suspicious bounds, type-dependent attributes and reference resolution. Preserve anomalous raw records separately from evaluation eligibility. Unknown future language/type values should produce an explicit validation issue rather than being coerced to English or a known type.

Recommended responsibilities, following the existing repository's `src/lib` organization:

- `src/lib/dataset/pan-pc-11/`: inventory, XML validation, references, raw annotation records and statistics.
- `src/lib/dataset/`: later split manifests and leakage checks.
- `src/lib/preprocessing/`: later segmentation with original-coordinate mappings.
- `src/lib/evaluation/`: later PAN-compatible metrics and experiment configuration.
- `scripts/`: independent Bun commands for inventory/evaluation; no dependency on the Next.js interface.

Finalize filenames and any XML dependency only during the approved parser stage. The audit's corpus-specific regular-expression scan must not become the production XML parser by default.

### Preservation rules

Read original bytes, validate UTF-8, and compute hashes before decoding. Keep the original file untouched. Decode once with a documented BOM policy; maintain both the immutable BOM-inclusive raw string if needed and a content view excluding exactly the initial BOM. Do not use `.trim()`, Unicode NFC/NFKC normalization, newline conversion, whitespace collapse, lowercasing or punctuation removal on the coordinate-bearing text.

In this extraction, corpus character spans can be sliced directly in the BOM-excluded JS string because there are no surrogate pairs. If slicing the BOM-inclusive string, add one to the starting index and retain the original length. Keep original annotation numbers unchanged. Record this as verified compatibility for this corpus, not an assumption that all future Unicode corpora behave identically.

Derived normalization for TF-IDF or tokenization should operate on separate views with mappings back to original spans. Token indices, normalized-string indices, UTF-8 bytes and original character indices are distinct coordinate systems. CRLF must remain two original characters; supplementary characters in future inputs need an explicit code-point/UTF-16 mapping if the corpus contract requires it.

Load document text lazily rather than retaining the roughly 4.1 GiB external directory in memory. Preserve optional metadata and exact raw attribute strings, including shortened MD5 values. Do not use dataset hashes or annotations as model features.

## 9. Recommended next implementation milestone

After owner approval, implement a **read-only, typed PAN-PC-11 inventory and annotation validator** as a standalone Bun command, with no detector or UI work:

1. Define production types and XML validation with explicit BOM/offset behavior.
2. Emit a versioned inventory and quality report, preserving all original annotation relationships and raw values.
3. Verify the full counts against this audit; add focused fixtures for BOMs, accented text, CRLF, independent lengths, optional authors, shortened MD5 values, missing references, non-BMP mapping behavior, and the zero-length case.
4. Resolve and document the seven endpoint anomalies and the zero-length evaluation policy without editing the corpus.
5. Produce a **split-feasibility report** for approved language and family-grouping rules. Return for approval of the actual partition/subset policy before implementing split assignment.

TF-IDF implementation and benchmarking should follow only after the inventory, scope, offset policy, split feasibility and evaluation protocol are settled. MiniLM and hybrid benchmarks follow afterward. No results or performance advantages are predicted by this audit.

## Reproducibility and limits

New artifacts are confined to `reports/pan-pc-11/`:

- `audit.mjs`: corpus-specific read-only inventory/statistics/connectivity exploration.
- `results.json`: measured counts, all clean suspicious references, attribute distributions, anomaly examples, Unicode findings and graph summaries.
- `token-probe.mjs` and `token-probe.json`: offline checks using the already cached tokenizer, including tokenizer/config SHA-256 hashes.
- `report.md`: this report.

Run from the repository root with existing Bun and dependencies:

```sh
bun reports/pan-pc-11/audit.mjs
bun reports/pan-pc-11/token-probe.mjs
```

The audit accepts optional corpus-root and output-JSON arguments. It reads the dataset and writes only the selected report output; use the supplied defaults for the commands above. The tokenizer probe is offline (`allowRemoteModels=false`, `local_files_only=true`) and requires the already cached model tokenizer. No new dataset, dependency or model download is required.

Independent shell cross-checks:

```sh
rg --no-filename --only-matching 'type="(artificial|simulated|translation)"' data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011/external-detection-corpus/suspicious-document | sort | uniq -c
find data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011/external-detection-corpus -type f -name '*.xml' | wc -l
rg 'this_length="0"' data/raw/pan-pc-11/unrar-extracted/pan-plagiarism-corpus-2011/external-detection-corpus
```

External-corpus fingerprint:

```text
5408fc446e1eded99c9e5e361f4e735e168c199b392f9c64066456e17bc5c0e7
```

Fingerprint construction is documented by the audit code: deterministic role/part/filename traversal, and SHA-256 over newline-separated records containing each relative text/XML path, a NUL separator, and its original-file SHA-256. Repeated full audit runs produced the same corpus fingerprint; later runs added diagnostics, including BOM-excluded span-bound checks. The fingerprint covers external text/XML files, not README, task description, or XSD.

Runtime recorded by Bun: Bun 1.2.20, Node compatibility version 24.3.0; Transformers.js 4.3.2. This is the runtime used by these commands, not a claim about the separately installed Node binary.

No application/configuration files or original dataset files were modified. Pre-existing changes to root `AGENTS.md` and `.gitignore` were left intact. No Python was introduced or executed. No training, fine-tuning, split assignment, detector implementation, or measured plagiarism-detection result is part of this work.
