# Research-Paper Validation (Controlled Synthetic Tests)

Generated: 2026-11-11T18:08:29.426Z

## Scope and caveats

- Two source papers with confidently detected reference sections and clean body prose: Review4Repair_2020 and Online_Sketch_Query_Optimization_2021.
- Four genuine body passages (two per paper) with exact character offsets located by whitespace-tolerant anchor matching.
- Four synthetic suspicious documents: two verbatim-copy assemblies and two documents with hand-written, meaning-preserving paraphrases of the same passages.
- Six directed comparisons: two direct-copy, two paraphrase, and two negative controls (genuine passages scored against the wrong source paper).
- Production detection code, calibrated thresholds, alpha values, and model configuration were NOT modified.
- These are CONTROLLED SYNTHETIC results. They do not establish real-world plagiarism accuracy, and fewer alerts must not be read as better accuracy.

## Frozen operating points (read-only)

| Method   | Threshold | Alpha | Merge gap |
| -------- | --------: | ----: | --------: |
| lexical  |       0.3 |     1 |       120 |
| semantic |       0.7 |     0 |       120 |
| hybrid   |       0.3 |     1 |       120 |

- Semantic model: onnx-community/all-MiniLM-L6-v2-ONNX (local, CPUExecutionProvider on cpu)
- Shared embedding batch: 2927 unique passages in 19.0s

## Ground truth

| Passage | Source paper                          | Offset | Length |
| ------- | ------------------------------------- | -----: | -----: |
| R4R-A   | Review4Repair_2020                    |    815 |   2171 |
| R4R-B   | Review4Repair_2020                    |  29407 |   1076 |
| OS-C    | Online_Sketch_Query_Optimization_2021 |   9948 |    777 |
| OS-D    | Online_Sketch_Query_Optimization_2021 |  12516 |   1144 |

| Comparison    | Arm              | Suspicious document | Source paper                          | Cases |
| ------------- | ---------------- | ------------------- | ------------------------------------- | ----: |
| copy-r4r      | direct-copy      | SYNTH_COPY_R4R      | Review4Repair_2020                    |     2 |
| copy-os       | direct-copy      | SYNTH_COPY_OS       | Online_Sketch_Query_Optimization_2021 |     2 |
| para-r4r      | paraphrase       | SYNTH_PARA_R4R      | Review4Repair_2020                    |     2 |
| para-os       | paraphrase       | SYNTH_PARA_OS       | Online_Sketch_Query_Optimization_2021 |     2 |
| neg-r4r-vs-os | negative-control | SYNTH_COPY_R4R      | Online_Sketch_Query_Optimization_2021 |     0 |
| neg-os-vs-r4r | negative-control | SYNTH_COPY_OS       | Review4Repair_2020                    |     0 |

## Results by method (PAN passage-level metrics)

| Comparison    | Method   | Precision | Recall |     F1 | Granularity | PlagDet | Detections | Missed | False positives | Detect time (s) |
| ------------- | -------- | --------: | -----: | -----: | ----------: | ------: | ---------: | -----: | --------------: | --------------: |
| copy-r4r      | lexical  |    0.8308 | 0.9683 | 0.8943 |      1.0000 |  0.8943 |          2 |      0 |               0 |            0.00 |
| copy-r4r      | semantic |    0.9997 | 0.9956 | 0.9976 |      1.0000 |  0.9976 |          2 |      0 |               0 |            0.00 |
| copy-r4r      | hybrid   |    0.9997 | 0.9956 | 0.9976 |      1.0000 |  0.9976 |          2 |      0 |               0 |            0.00 |
| copy-os       | lexical  |    0.8546 | 0.9114 | 0.8821 |      1.0000 |  0.8821 |          2 |      0 |               0 |            0.00 |
| copy-os       | semantic |    0.6660 | 1.0000 | 0.7995 |      1.0000 |  0.7995 |          3 |      0 |               1 |            0.00 |
| copy-os       | hybrid   |    0.9990 | 1.0000 | 0.9995 |      1.0000 |  0.9995 |          2 |      0 |               0 |            0.00 |
| para-r4r      | lexical  |    0.5358 | 0.8049 | 0.6434 |      1.0000 |  0.6434 |          3 |      0 |               1 |            0.00 |
| para-r4r      | semantic |    0.5712 | 0.9986 | 0.7267 |      2.0000 |  0.4585 |          7 |      0 |               3 |            0.00 |
| para-r4r      | hybrid   |    0.6000 | 0.6964 | 0.6446 |      1.5000 |  0.4876 |          5 |      0 |               2 |            0.00 |
| para-os       | lexical  |    0.5143 | 0.7406 | 0.6070 |      1.0000 |  0.6070 |          3 |      0 |               1 |            0.00 |
| para-os       | semantic |    0.6663 | 0.9369 | 0.7788 |      2.0000 |  0.4913 |          6 |      0 |               2 |            0.00 |
| para-os       | hybrid   |    0.5453 | 0.7243 | 0.6222 |      3.0000 |  0.3111 |         11 |      0 |               5 |            0.00 |
| neg-r4r-vs-os | lexical  |    1.0000 |    n/a |    n/a |         n/a |     n/a |          0 |      0 |               0 |            0.00 |
| neg-r4r-vs-os | semantic |    1.0000 |    n/a |    n/a |         n/a |     n/a |          0 |      0 |               0 |            0.00 |
| neg-r4r-vs-os | hybrid   |    0.0000 |    n/a |    n/a |         n/a |     n/a |          1 |      0 |               1 |            0.00 |
| neg-os-vs-r4r | lexical  |    1.0000 |    n/a |    n/a |         n/a |     n/a |          0 |      0 |               0 |            0.00 |
| neg-os-vs-r4r | semantic |    1.0000 |    n/a |    n/a |         n/a |     n/a |          0 |      0 |               0 |            0.00 |
| neg-os-vs-r4r | hybrid   |    1.0000 |    n/a |    n/a |         n/a |     n/a |          0 |      0 |               0 |            0.00 |

Negative controls have no ground-truth cases, so recall is undefined; any detection there is a false positive by construction.

## Representative detections

### copy-r4r / lexical

1. Score 0.8776: suspicious "Field notes for the controlled experiment log. The survey team recorded water temperature and salinity at each station before collecting samples. Abstract Context: Learning-based automatic program repair techniques are showing promise to provide quality fix suggestions for detected bugs in the sourc" || source "techniques are showing promise to provide quality fix suggestions for detected bugs in the source code of the soft- ware. These tools mostly exploit historical data of buggy and fixed code changes and are heavily dependent on bug localizers while applying to a new piece of code. With the increasing "

2. Score 1.0000: suspicious "stylistics and non-code errors unaddressed by prior techniques All sampling equipment was rinsed with distilled water and calibrated each morning. Measurements were repeated three times to reduce observer error. We mark focus with two special tokens, i.e., <|startfocus|> and <|endfocus|>. We call th" || source "code change. After deciding on the relevancy of code change and review comments, we explicitly concentrate on the code change. We term the buggy source code as 10 code before change, and the lines changed there as focus. We mark focus with two special tokens, i.e., <|startfocus|> and <|endfocus|>. W"

### copy-r4r / semantic

1. Score 1.0000: suspicious "Abstract Context: Learning-based automatic program repair techniques are showing promise to provide quality fix suggestions for detected bugs in the source code of the soft- ware. These tools mostly exploit historical data of buggy and fixed code changes and are heavily dependent on bug localizers w" || source "Abstract Context: Learning-based automatic program repair techniques are showing promise to provide quality fix suggestions for detected bugs in the source code of the soft- ware. These tools mostly exploit historical data of buggy and fixed code changes and are heavily dependent on bug localizers w"

2. Score 1.0000: suspicious "two special tokens, i.e., <|startfocus|> and <|endfocus|>. We call the fixed code as code after change and changed portion within the focus as the target. We elaborate on the terms in an example presented in Figure 6. Observing the data, the model learns to change the content of the focus into the t" || source "We mark focus with two special tokens, i.e., <|startfocus|> and <|endfocus|>. We call the fixed code as code after change and changed portion within the focus as the target. We elaborate on the terms in an example presented in Figure 6. Observing the data, the model learns to change the content of t"

### copy-r4r / hybrid

1. Score 1.0000: suspicious "Abstract Context: Learning-based automatic program repair techniques are showing promise to provide quality fix suggestions for detected bugs in the source code of the soft- ware. These tools mostly exploit historical data of buggy and fixed code changes and are heavily dependent on bug localizers w" || source "Abstract Context: Learning-based automatic program repair techniques are showing promise to provide quality fix suggestions for detected bugs in the source code of the soft- ware. These tools mostly exploit historical data of buggy and fixed code changes and are heavily dependent on bug localizers w"

2. Score 1.0000: suspicious "two special tokens, i.e., <|startfocus|> and <|endfocus|>. We call the fixed code as code after change and changed portion within the focus as the target. We elaborate on the terms in an example presented in Figure 6. Observing the data, the model learns to change the content of the focus into the t" || source "We mark focus with two special tokens, i.e., <|startfocus|> and <|endfocus|>. We call the fixed code as code after change and changed portion within the focus as the target. We elaborate on the terms in an example presented in Figure 6. Observing the data, the model learns to change the content of t"

### copy-os / lexical

1. Score 0.9038: suspicious "All sampling equipment was rinsed with distilled water and calibrated each morning. Measurements were repeated three times to reduce observer error. We investigate how to design a lightweight – yet effective – query optimizer for modern in-memory databases. We have two design principles. First, we a" || source "We have two design principles. First, we aim to capitalize on the highly-parallel execution engine in the query optimization process. Since query execution is already fast, it is challenging to minimize the overhead incurred by the additional optimization. Second, the type and number of synopses inc"

2. Score 0.7896: suspicious "specimen counts appears in the appendix. We introduce two novel strategies to extend Fast-AGMS sketches to multi-way join cardinality estimation. The first strategy – sketch partitioning – is a theoretically sound estimator for a given multi-way join. Since it does not support composition, sketch pa" || source "join cardinality estimation. The first strategy – sketch partitioning – is a theoretically sound estimator for a given multi-way join. Since it does not support composition, sketch partitioning is not scalable for join order enumeration. The second strategy – sketch merging – addresses scalability b"

### copy-os / semantic

1. Score 1.0000: suspicious "We investigate how to design a lightweight – yet effective – query optimizer for modern in-memory databases. We have two design principles. First, we aim to capitalize on the highly-parallel execution engine in the query optimization process. Since query execution is already fast, it is challenging " || source "We investigate how to design a lightweight – yet effective – query optimizer for modern in-memory databases. We have two design principles. First, we aim to capitalize on the highly-parallel execution engine in the query optimization process. Since query execution is already fast, it is challenging "

2. Score 0.9990: suspicious "We introduce two novel strategies to extend Fast-AGMS sketches to multi-way join cardinality estimation. The first strategy – sketch partitioning – is a theoretically sound estimator for a given multi-way join." || source "We present two strategies to extend Fast-AGMS sketches to multi-way join cardinality estimation. The first strategy – sketch partitioning – is a theoretically sound estimator for a given multi-way join."

3. Score 1.0000: suspicious "We introduce two novel strategies to extend Fast-AGMS sketches to multi-way join cardinality estimation. The first strategy – sketch partitioning – is a theoretically sound estimator for a given multi-way join. Since it does not support composition, sketch partitioning is not scalable for join order" || source "• We introduce two novel strategies to extend Fast-AGMS sketches to multi-way join cardinality estimation. The first strategy – sketch partitioning – is a theoretically sound estimator for a given multi-way join. Since it does not support composition, sketch partitioning is not scalable for join ord"

### copy-os / hybrid

1. Score 1.0000: suspicious "We investigate how to design a lightweight – yet effective – query optimizer for modern in-memory databases. We have two design principles. First, we aim to capitalize on the highly-parallel execution engine in the query optimization process. Since query execution is already fast, it is challenging " || source "We investigate how to design a lightweight – yet effective – query optimizer for modern in-memory databases. We have two design principles. First, we aim to capitalize on the highly-parallel execution engine in the query optimization process. Since query execution is already fast, it is challenging "

2. Score 1.0000: suspicious "We introduce two novel strategies to extend Fast-AGMS sketches to multi-way join cardinality estimation. The first strategy – sketch partitioning – is a theoretically sound estimator for a given multi-way join. Since it does not support composition, sketch partitioning is not scalable for join order" || source "• We introduce two novel strategies to extend Fast-AGMS sketches to multi-way join cardinality estimation. The first strategy – sketch partitioning – is a theoretically sound estimator for a given multi-way join. Since it does not support composition, sketch partitioning is not scalable for join ord"

### para-r4r / lexical

1. Score 0.3169: suspicious "Preliminary observations are summarized in this section. A complete tabulation of specimen counts appears in the appendix. Abstract. Background: machine-learning methods for automated program repair show potential for recommending high-quality patches for faults found in software source code. Most s" || source "summarized node information and the sub-tree difference 28 before and after the change are used to learn the code transformation. Additionally, they also deploy a classification model to re-rank the generated patches. Although there has been plenty of noticeable works in Machine Learning-based progr"

2. Score 0.5130: suspicious "localization when applied to unseen code. As code review becomes more widespread, the need for a separate fault localizer decreases. Moreover, localizing faults through code review is more reliable because it reflects the knowledge and experience of human reviewers. Objective: review comments writte" || source "reduced. Besides, the code review-based bug localization is more trustworthy since reviewers’ expertise and experience are reflected in these suggestions. Objective: The natural language instructions scripted on the review comments are enormous sources of information about the bug’s nature and expec"

3. Score 0.6323: suspicious "to several open questions for the next field season. A broader comparison across coastal sites is left to future work. We mark the boundaries of the focus with two dedicated tokens, namely <|startfocus|> and <|endfocus|>. The corrected program is referred to as the code after change, and the edited " || source "code change. After deciding on the relevancy of code change and review comments, we explicitly concentrate on the code change. We term the buggy source code as 10 code before change, and the lines changed there as focus. We mark focus with two special tokens, i.e., <|startfocus|> and <|endfocus|>. W"

### para-r4r / semantic

1. Score 0.8013: suspicious "Abstract. Background: machine-learning methods for automated program repair show potential for recommending high-quality patches for faults found in software source code." || source "Along with classic approaches of dynamic and static analysis based repair, Machine Learning based techniques are also showing immense promise. Classic Automatic Program Repair (APR): Researchers have been trying to automatically repair software systems by generating an actual fix for more than two d"

2. Score 0.7950: suspicious "Background: machine-learning methods for automated program repair show potential for recommending high-quality patches for faults found in software source code." || source "Machine Learning-based Automatic Program Repair: Applying a Deep learning-based approach to detect and fix bugs has shown promising results in recent years, mainly due to the availability of large datasets. Pu et al."

3. Score 0.8883: suspicious "Background: machine-learning methods for automated program repair show potential for recommending high-quality patches for faults found in software source code. Most such tools learn from historical records of defective and corrected code edits and rely strongly on fault localization when applied to" || source "Abstract Context: Learning-based automatic program repair techniques are showing promise to provide quality fix suggestions for detected bugs in the source code of the soft- ware. These tools mostly exploit historical data of buggy and fixed code changes and are heavily dependent on bug localizers w"

### para-r4r / hybrid

1. Score 0.3806: suspicious "Most such tools learn from historical records of defective and corrected code edits and rely strongly on fault localization when applied to unseen code." || source "Instead of relying on a test suite, these techniques rely on previous code fixes in similar code defects."

2. Score 0.5472: suspicious "Moreover, localizing faults through code review is more reliable because it reflects the knowledge and experience of human reviewers. Objective: review comments written in natural language contain rich information about the character of a defect and the remedy that is expected. Yet, to our knowledge" || source "Besides, the code review-based bug localization is more trustworthy since reviewers’ expertise and experience are reflected in these suggestions. Objective: The natural language instructions scripted on the review comments are enormous sources of information about the bug’s nature and expected solut"

3. Score 0.5828: suspicious "In this work we study how much repair quality improves when code review remarks are used." || source "How effective is code review in automatic code repair? In this study, we aim to show whether code review can improve automatic code repair performance."

### para-os / lexical

1. Score 0.4360: suspicious "In summary, the survey results point to several open questions for the next field season. A broader comparison across coastal sites is left to future work. Research question. We study how to build a query optimizer that is both lightweight and effective for contemporary main-memory database systems." || source "optimizers rely on crude formulas that assume uniformity, inclusion, and independence—which are likely to produce highly sub-optimal execution plans [28]. Since implementing and maintaining these many statistics requires considerable effort, it is completely understandable that only mature systems i"

2. Score 0.5211: suspicious "log. The survey team recorded water temperature and salinity at each station before collecting samples. Our contributions are the following. First, we present two new approaches for generalizing Fast-AGMS sketches to cardinality estimation over multi-way joins. The first approach, sketch partitionin" || source "sketch. 5 FAST-AGMS SKETCH MULTI-WAY JOIN ESTIMATION We present two strategies to extend Fast-AGMS sketches to multi-way join cardinality estimation. The first strategy – sketch partitioning – is a theoretically sound estimator for a given multi-way join. Its limitation is that it cannot be composed"

3. Score 0.4846: suspicious "multi-way join, every multi-way join of the same size is affected identically. This characteristic ensures consistent estimates throughout plan enumeration. Second, we implement a prototype called COMPASS inside MapD and test it thoroughly on the full JOB benchmark of 113 queries. The measurements c" || source "done heuristically for a certain multi-way join taken separately, all the multi-way joins with a given size are equally impacted. This property guarantees estimation consistency in plan enumeration. • We prototype COMPASS in MapD and perform extensive experiments over the complete JOB benchmark—113 "

### para-os / semantic

1. Score 0.9036: suspicious "Research question. We study how to build a query optimizer that is both lightweight and effective for contemporary main-memory database systems. Two design guidelines shape our work. First, the optimization process itself should exploit the highly parallel execution engine. Because query execution i" || source "We investigate how to design a lightweight – yet effective – query optimizer for modern in-memory databases. We have two design principles. First, we aim to capitalize on the highly-parallel execution engine in the query optimization process. Since query execution is already fast, it is challenging "

2. Score 0.8601: suspicious "Two design guidelines shape our work. First, the optimization process itself should exploit the highly parallel execution engine. Because query execution is already quick, the extra cost introduced by optimization must be kept as small as possible." || source "We have two design principles. First, we aim to capitalize on the highly-parallel execution engine in the query optimization process. Since query execution is already fast, it is challenging to minimize the overhead incurred by the additional optimization."

3. Score 0.8595: suspicious "Because query execution is already quick, the extra cost introduced by optimization must be kept as small as possible. Second, the optimizer may rely on only a minimal set of statistics: our aim is to use just one kind of synopsis, constructed for individual attributes only, with no need for auxilia" || source "Second, the type and number of synopses included in the optimizer has to be minimal. Our goal is to employ a single type of synopsis built exclusively for single-attributes and without the requirement of additional data structures such as indexes. The challenge is to design a composable – and consis"

### para-os / hybrid

1. Score 0.5221: suspicious "Research question. We study how to build a query optimizer that is both lightweight and effective for contemporary main-memory database systems. Two design guidelines shape our work." || source "We investigate how to design a lightweight – yet effective – query optimizer for modern in-memory databases."

2. Score 0.6822: suspicious "Two design guidelines shape our work. First, the optimization process itself should exploit the highly parallel execution engine. Because query execution is already quick, the extra cost introduced by optimization must be kept as small as possible." || source "We have two design principles. First, we aim to capitalize on the highly-parallel execution engine in the query optimization process."

3. Score 0.4239: suspicious "Because query execution is already quick, the extra cost introduced by optimization must be kept as small as possible. Second, the optimizer may rely on only a minimal set of statistics: our aim is to use just one kind of synopsis, constructed for individual attributes only, with no need for auxilia" || source "query runtime, as well as only the query execution time without optimization—these are the same in MapD."

### neg-r4r-vs-os / lexical

No detections.

### neg-r4r-vs-os / semantic

No detections.

### neg-r4r-vs-os / hybrid

1. Score 0.3749: suspicious "With the increasing popularity of code review, dependency on bug localizers can be reduced. Besides, the code review-based bug localization is more trustworthy since reviewers’ expertise and experience are reflected in these suggestions." || source "Given that this is only a prototype, we believe that the sketch overhead can be further reduced with more optimized code."

### neg-os-vs-r4r / lexical

No detections.

### neg-os-vs-r4r / semantic

No detections.

### neg-os-vs-r4r / hybrid

No detections.

## Missed detections and false positives (interpretation)

- No planted passage was fully missed: missedCases is 0 in all four positive comparisons for every method.
- copy-os / semantic reports one formal false positive that is actually fragmentation: the extra detection pairs the copied OS-D opening against the same section under its body heading ("We present two strategies ..."), so its source span does not overlap the ground-truth source span and the PAN both-sides rule counts it as a false positive.
- para-r4r / semantic (score ~0.80) matches the paraphrased abstract against related-work prose about ML-based program repair. Topically related generic discussion, not the planted passage, so it is a genuine false positive by construction.
- para-os / hybrid emits 11 detections with granularity 3.0: at the frozen hybrid operating point (threshold 0.3, lexical weight 1.0) paraphrased windows fragment into several overlapping alerts, costing precision while keeping recall at 0.72.
- neg-r4r-vs-os / hybrid is the only negative-control alert (score 0.3749, just above threshold): generic wording about reducing overhead ("bug localizers can be reduced" vs "sketch overhead can be further reduced"). Lexical and semantic stayed silent in both negative controls.

## Limitations

- Only four passages from two papers: no claim about the wider research-paper population.
- Synthetic paraphrases were written for this experiment; real paraphrase plagiarism may differ in style and extent.
- Fillers use unrelated field-survey prose; other filler choices could shift negative-control outcomes.
- Detection latency excludes the shared embedding batch unless stated; per-method times cover retrieval, merging, and evidence filtering.

## Relation to prior evaluations

- PAN-PC-11 held-out benchmark (book-based): TF-IDF and hybrid reached F1 0.8074 / PlagDet 0.6033; MiniLM reached F1 0.4237 / PlagDet 0.3047 at its earlier operating point. Those figures describe book-text plagiarism, not CS papers.
- External 12-paper evaluation (no ground truth, alert counts only): body-only run reported 1,719 TF-IDF, 231 MiniLM, and 2,326 hybrid alerts across 132 directed comparisons. Alert counts measure review workload, not accuracy.
- This validation adds small-scale ground truth on genuine CS prose but remains synthetic and small; it complements rather than replaces either prior evaluation.
