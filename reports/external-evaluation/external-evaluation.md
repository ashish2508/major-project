# External Research-Paper Evaluation

Generated: 2026-11-11T15:05:17.176Z

## Scope

- Papers: 12
- Unique unordered paper pairs: 66
- Directional comparisons: 132
- Methods: lexical (TF-IDF), semantic (MiniLM), and hybrid
- Semantic model: onnx-community/all-MiniLM-L6-v2-ONNX
- Execution device: dml
- Verified execution provider: DmlExecutionProvider + CPUExecutionProvider
- Unique semantic passages embedded: 15832
- Informative-evidence minimum: 12 distinct letter-containing words on each side

## Frozen operating points

| Method   | Threshold | Alpha | Merge gap |
| -------- | --------: | ----: | --------: |
| lexical  |       0.3 |     1 |       120 |
| semantic |       0.7 |     0 |       120 |
| hybrid   |       0.3 |     1 |       120 |

## Observed alerts

| Method   | Directional comparisons with alerts | Total alerts | Papers receiving alerts |
| -------- | ----------------------------------: | -----------: | ----------------------: |
| lexical  |                             130/132 |         2509 |                      12 |
| semantic |                              65/132 |          742 |                      12 |
| hybrid   |                             131/132 |         4182 |                      12 |

## Interpretation and limitations

- These are real research papers, but no verified plagiarism ground truth is available for the cross-paper comparisons.
- Alert counts measure review workload; they are not false-positive counts.
- Precision, recall, F1, PlagDet, and accuracy cannot be calculated from this experiment.
- Shared terminology, standard definitions, citations, references, equations, and common academic phrasing may generate legitimate matches.
- A high similarity score is evidence for human review, not proof of plagiarism or misconduct.
- This experiment evaluates only the supplied 12-paper collection. It does not establish performance on the wider research-paper population.
- Text was extracted separately with Poppler and normalized in memory. Page boundaries are represented as paragraph breaks; the original canonical TXT files remain unchanged.

## Paper inventory

| Paper                                 | Extracted words | Characters |
| ------------------------------------- | --------------: | ---------: |
| BERTAC 2021                           |            9732 |      77602 |
| CERT Cardinality Estimation 2024      |           13837 |     118247 |
| Compact Transformers 2023             |            7887 |      57773 |
| Human Language Modeling 2022          |           10769 |      83273 |
| NoREC Database Optimization Bugs 2020 |           13912 |     108576 |
| Online Sketch Query Optimization 2021 |           20414 |     197858 |
| PaperMage 2023                        |            8856 |      76010 |
| Pushdown Layers 2023                  |            8558 |      76660 |
| QUIC Delay Control 2025               |            4829 |      45960 |
| QUIC Dual Connectivity 2021           |           11939 |     203609 |
| Review4Repair 2020                    |           13464 |     109121 |
| Transformers Polarity 2022            |            6653 |      53353 |

## Highest-scoring alerts

### lexical

1. BERTAC_2021 → PaperMage_2023 (score 0.6794)
   - Query: to 3 af- rameter settings as GAN-style CNNs (see Sec- ter preliminary experiments. See Table 9 in Ap- tion 3.3). We confirm from the results in Table 4 2109 Models MNLI QNLI QQP RTE SST-2 MRPC CoLA STS-B Avg. RoBERTaL ARGE 90.2/90.2 94.7 92.2 86.6 96.4 90.9 68.0 92.4 88.9 XLNETLARGE 90.8/90.8 94.9 92.3 85.9 97.0 90.8 69.0 92.5 89.2 ELECTRAL ARGE 90.9/- 95.0
   - Source: 79.9 65.5 96.9 78.2 Bibliography 96.5 98.6 97.5 95.5 97.6 96.5 93.6 93.3 93.5 99.7 98.2 99.0 Caption 70.3 70.0 70.2 70.2 69.7 70.0 80.0 77.3 78.6 93.1 89.6 91.3 Equation 71.1 85.3 77.6 71.1 85.3 77.6 55.0 85.7 67.0 90.7 94.2 92.4 Figure 0.0 0.0 0.0 0.0 0.0 0.0 88.9 82.3 85.4 99.8 96.8 98.3 Footer 0.0 0.0 0.0 0.0 0.0 0.0 56.1 59.9 57.9 96.8 78.1 86.5 Footnote

2. PaperMage_2023 → BERTAC_2021 (score 0.6794)
   - Query: 79.9 65.5 96.9 78.2 Bibliography 96.5 98.6 97.5 95.5 97.6 96.5 93.6 93.3 93.5 99.7 98.2 99.0 Caption 70.3 70.0 70.2 70.2 69.7 70.0 80.0 77.3 78.6 93.1 89.6 91.3 Equation 71.1 85.3 77.6 71.1 85.3 77.6 55.0 85.7 67.0 90.7 94.2 92.4 Figure 0.0 0.0 0.0 0.0 0.0 0.0 88.9 82.3 85.4 99.8 96.8 98.3 Footer 0.0 0.0 0.0 0.0 0.0 0.0 56.1 59.9 57.9 96.8 78.1 86.5 Footnote
   - Source: ELECTRAL ARGE 90.9/- 95.0 92.4 88.0 96.9 90.8 69.1 92.6 89.5 ALBERTX XLARGE 90.8/- 95.3 92.2 89.2 96.9 90.9 71.4 93.0 90.0 DeBERTaL ARGE 91.1/91.1 95.3 92.3 88.3 96.8 91.9 70.5 92.8 90.0 BERTACX XLARGE 91.3/91.1 95.7 92.3 89.9 97.2 92.4 73.7 93.1 90.7 Table 2: GLUE dev set results.

3. BERTAC_2021 → PaperMage_2023 (score 0.6681)
   - Query: 71.7 92.5 91.8 89.4 ERNIE 91.4/91.0 96.6 90.9 90.9 97.5 91.4 74.4 92.6 94.5 90.4 StructBERT+TAPT 90.9/90.7 97.4 91.0 91.2 97.3 91.9 75.3 92.7 94.5 90.6 MacALBERT+DKM 91.3/91.1 97.8 90.6 92.0 97.0 92.6 74.8 92.6 94.5 90.7 DeBERTa/TuringNLRv4 91.9/91.6 99.2 90.8 93.2 97.5 92.0 71.5 92.6 94.5 90.8 BERTAC 91.1/91.6 97.9 90.6 90.4 97.5 91.7 72.3 92.8 94.5 90.3 Ta
   - Source: 79.4 Paragraph 94.5 89.8 92.1 94.4 89.9 92.1 93.5 93.0 93.3 98.7 97.9 98.3 Section 83.0 79.4 81.1 83.0 79.4 81.1 67.7 82.7 74.4 96.2 91.6 93.9 Table 97.3 58.6 73.2 97.9 58.6 73.3 94.7 71.8 81.7 96.1 94.9 95.5 Title 0.0 0.0 0.0 0.0 0.0 0.0 76.3 96.7 85.3 98.7 99.9 99.3 Macro Avg (Full S2-VL) 40.6 38.3 39.1 42.0 36.5 37.6 75.9 80.0 76.8 92.0 94.1 92.7 Macro Av

4. PaperMage_2023 → BERTAC_2021 (score 0.6681)
   - Query: 79.4 Paragraph 94.5 89.8 92.1 94.4 89.9 92.1 93.5 93.0 93.3 98.7 97.9 98.3 Section 83.0 79.4 81.1 83.0 79.4 81.1 67.7 82.7 74.4 96.2 91.6 93.9 Table 97.3 58.6 73.2 97.9 58.6 73.3 94.7 71.8 81.7 96.1 94.9 95.5 Title 0.0 0.0 0.0 0.0 0.0 0.0 76.3 96.7 85.3 98.7 99.9 99.3 Macro Avg (Full S2-VL) 40.6 38.3 39.1 42.0 36.5 37.6 75.9 80.0 76.8 92.0 94.1 92.7 Macro Av
   - Source: 71.7 92.5 91.8 89.4 ERNIE 91.4/91.0 96.6 90.9 90.9 97.5 91.4 74.4 92.6 94.5 90.4 StructBERT+TAPT 90.9/90.7 97.4 91.0 91.2 97.3 91.9 75.3 92.7 94.5 90.6 MacALBERT+DKM 91.3/91.1 97.8 90.6 92.0 97.0 92.6 74.8 92.6 94.5 90.7 DeBERTa/TuringNLRv4 91.9/91.6 99.2 90.8 93.2 97.5 92.0 71.5 92.6 94.5 90.8 BERTAC 91.1/91.6 97.9 90.6 90.4 97.5 91.7 72.3 92.8 94.5 90.3 Ta

5. BERTAC_2021 → PaperMage_2023 (score 0.6357)
   - Query: EM (the percentage of the predic- 4 Available at https://github.com/thunlp/OpenQA tions matching exactly one of the ground truth an- 2110 CNNs used in BERTAC MNLI QNLI QQP RTE SST-2 MRPC CoLA STS-B Avg. Proposed (GAN-style CNN) 91.3/91.1 95.7 92.3 89.9 97.2 92.4 73.7 93.1 90.7 Self-supervised CNN 91.0/90.8 95.3 91.5 88.4 96.6 90.9 71.1 93.0 89.8 Randomly ini
   - Source: 79.9 65.5 96.9 78.2 Bibliography 96.5 98.6 97.5 95.5 97.6 96.5 93.6 93.3 93.5 99.7 98.2 99.0 Caption 70.3 70.0 70.2 70.2 69.7 70.0 80.0 77.3 78.6 93.1 89.6 91.3 Equation 71.1 85.3 77.6 71.1 85.3 77.6 55.0 85.7 67.0 90.7 94.2 92.4 Figure 0.0 0.0 0.0 0.0 0.0 0.0 88.9 82.3 85.4 99.8 96.8 98.3 Footer 0.0 0.0 0.0 0.0 0.0 0.0 56.1 59.9 57.9 96.8 78.1 86.5 Footnote

6. NoREC_Database_Optimization_Bugs_2020 → CERT_Cardinality_Estimation_2024 (score 0.6265)
   - Query: Cardinality Assurance. In Proceed- [48] P. Griffiths Selinger, M. M. Astrahan, D. D. Chamberlin, R. A. Lorie, and T. G. ings of the 2010 ACM SIGMOD International Conference on Management of Data (In- Price. 1979. Access Path Selection in a Relational Database Management System. dianapolis, Indiana, USA) (SIGMOD âĂŹ10). Association for Computing Machin- In Pr
   - Source: Access Path Selection in a Relational Database Sampling over Joins Revisited. In Proceedings of the 2018 International Conference Management System. In Proceedings of the 1979 ACM SIGMOD International on Management of Data, SIGMOD Conference 2018, Houston, TX, USA, June 10-15, Conference on Management of Data, Boston, Massachusetts, USA, May 30 - June 1, 201

7. CERT_Cardinality_Estimation_2024 → NoREC_Database_Optimization_Bugs_2020 (score 0.6265)
   - Query: Tables. Proc. plementation, OSDI 2020, Virtual Event, November 4-6, 2020. USENIX Association, VLDB Endow. 14, 1 (2020), 61–73. https://doi.org/10.14778/3421424.3421432 667–682. https://www.usenix.org/conference/osdi20/presentation/rigger [64] Zongheng Yang, Eric Liang, Amog Kamsetty, Chenggang Wu, Yan Duan, Xi Chen, [45] Sergio Segura and Zhi Quan Zhou. 2018
   - Source: In Construction". https://doi.org/10.5281/zenodo.3947858 Proceedings of the 2020 ACM SIGMOD International Conference on Management [46] Manuel Rigger and Zhendong Su. 2020. Testing Database Engines via Pivoted of Data (Portland, OR, USA) (SIGMOD âĂŹ20). International Foundation for Query Synthesis. Autonomous Agents and Multiagent Systems, Richland, SC, 1493

8. BERTAC_2021 → Transformers_Polarity_2022 (score 0.6004)
   - Query: Chen, Yuwei Fang, Siqi Sun, Yu Cheng, and Bo Shao, Yeyun Gong, Weizhen Qi, Nan Duan, and Jingjing Liu. 2020b. Cluster-former: Clustering- Xiaola Lin. 2019. Aggregating bidirectional en- based sparse transformer for long-range dependency coder representations using MatchLSTM for se- encoding. arXiv preprint arXiv:2009.06097. quence matching. In Proceedings of
   - Source: Alsop, Shikha Bordia, Haokun Liu, Alicia Parrish, et al. 2019. Investigating bert’s knowledge of language: Five analysis methods with npis. In Proceedings of the 2019 Conference on Empirical Methods in Natural Language Processing and the 9th International Joint Conference on Natu- ral Language Processing (EMNLP-IJCNLP), pages 2877–2887. Lucas Weber, Jaap Jum

9. Transformers_Polarity_2022 → BERTAC_2021 (score 0.6004)
   - Query: Alsop, Shikha Bordia, Haokun Liu, Alicia Parrish, et al. 2019. Investigating bert’s knowledge of language: Five analysis methods with npis. In Proceedings of the 2019 Conference on Empirical Methods in Natural Language Processing and the 9th International Joint Conference on Natu- ral Language Processing (EMNLP-IJCNLP), pages 2877–2887. Lucas Weber, Jaap Jum
   - Source: Zhiguo Wang, Patrick Ng, Xiaofei Ma, Ramesh Nalla- Processing and the 9th International Joint Confer- pati, and Bing Xiang. 2019. Multi-passage BERT: ence on Natural Language Processing (EMNLP- A globally normalized BERT model for open-do- IJCNLP), pages 6059–6063. main question answering. In Proceedings of the 2019 Conference on Empirical Methods in Natu- R

10. Review4Repair_2020 → Online_Sketch_Query_Optimization_2021 (score 0.5880)

- Query: Category Size Fixed by model_cc Fixed by model_c Super Category Number (501) Total Fixed by Total Fixed by Sub Category model_cc model_c overflow 1 0 0 timeout 2 0 0 security 11 1 3 thread 3 0 0 different function 13 0 0 resource leak 1 0 0 bug fix logic 9 2 2 9 10 75 sanity checking 7 1 1 (12%) (13.3%) operation change 1 0 1 import 3 1 1 api calling 1 0 0 i
- Source: as: X X Est (|e1 ∪ e2|) = skk [i] · skpart (mk)[i, j] · skt [j] 0≤i<b1 0≤j<b2 10 k.id 0 1 3 4 5 8 9 13 mk.keyword_id 1 1 1 4 4 8 9 2 6 2 t.id 1 2 3 4 5 6 mk.movie_id 1 2 7 5 7 6 9 1 3 9 (k.id) ℎ 1 ( ) = %4 1 (mk.keyword_id) 0 1 2 3 1 ({1, 4, 5, 6, 8, 13}) = +1 0 1 2 3 1 2 0 -1 1 ({0, 2, 3, 9}) = −1 3 2 -1 0 mk.movie_id Sketch Partitioning mk.movie_id Sketch

11. Online_Sketch_Query_Optimization_2021 → Review4Repair_2020 (score 0.5880)

- Query: 1 ( ) = %4 1 (mk.keyword_id) 0 1 2 3 1 ({1, 4, 5, 6, 8, 13}) = +1 0 1 2 3 1 2 0 -1 1 ({0, 2, 3, 9}) = −1 3 2 -1 0 mk.movie_id Sketch Partitioning mk.movie_id Sketch Merging 0 1 2 3 0 1 2 3 mk.keyword_id mk.keyword_id 0 -1 1 0 -1 0 -2 3 0 -1 1 -1 1 0 2 1 2 2 0 -1 2 0 1 0 0 2 -1 -1 0 -1 3 0 0 0 0 3 0 0 0 0 ( ) ( 1 ⊕ 2) (t.id) 2 (mk.movie_id) 2 ℎ ( ) = ( + 2)%4
- Source: security 11 1 3 thread 3 0 0 different function 13 0 0 resource leak 1 0 0 bug fix logic 9 2 2 9 10 75 sanity checking 7 1 1 (12%) (13.3%) operation change 1 0 1 import 3 1 1 api calling 1 0 0 inheritance 1 0 0 exception handling 19 3 1 debugging 3 1 1 coding convention 5 4 4 value change 1 0 0 string value change 9 0 2 different variable 2

12. BERTAC_2021 → Online_Sketch_Query_Optimization_2021 (score 0.5876)

- Query: 1–6, 2021. ©2021 Association for Computational Linguistics 2%+(340*%025(.+4 discriminator D and two CNN-based generators R !"#$%"&"'()_% ! and F . Once the training is done, we use the gen- "!$"#$%+(30%+7%+#+')()"_'0 #!%"#$5(.+0%+7%+#+')()"*'0 erator F as CNN in BERTAC. The training data *50):+0+')"),0! *50):+0+')"),0! consists of pairs of an entity mention
- Source: -1 -1 0 -1 3 0 0 0 0 3 0 0 0 0 ( ) ( 1 ⊕ 2) (t.id) 2 (mk.movie_id) 2 ℎ ( ) = ( + 2)%4 0 1 2 3 0 1 2 3 2 -2 1 1 0 ({1, 3, 4, 7}) = +1 -2 3 0 -1 2 ({2, 5, 6, 9}) = −1 Figure 5: Fast-AGMS sketches for multi-way join cardinality estimation on query JOB 6a.

13. Online_Sketch_Query_Optimization_2021 → BERTAC_2021 (score 0.5876)

- Query: as: X X Est (|e1 ∪ e2|) = skk [i] · skpart (mk)[i, j] · skt [j] 0≤i<b1 0≤j<b2 10 k.id 0 1 3 4 5 8 9 13 mk.keyword_id 1 1 1 4 4 8 9 2 6 2 t.id 1 2 3 4 5 6 mk.movie_id 1 2 7 5 7 6 9 1 3 9 (k.id) ℎ 1 ( ) = %4 1 (mk.keyword_id) 0 1 2 3 1 ({1, 4, 5, 6, 8, 13}) = +1 0 1 2 3 1 2 0 -1 1 ({0, 2, 3, 9}) = −1 3 2 -1 0 mk.movie_id Sketch Partitioning mk.movie_id Sketch
- Source: an entity mention and a sen- 6+(3-+')"),-%+7%+#+')()"_'0 9(.+-+')"),-%+7%+#+')()"_'0 tence in which the entity mention is masked with 8+'+%()_%0" 8+'+%()_%0# a special token [EM]. For example, the entity- #10+')"), !" +')"),-&(#.+/0#+')+'$+0 masked sentence m1 in Table 1 is obtained by !$%&'()'*+%!,-.,(/0(1" ![EM] ,2-3+',4')562-!',)- masking the entity menti

14. PaperMage_2023 → BERTAC_2021 (score 0.5870)

- Query: of state-of-the-art models. difficult to evaluate as it is developed with tight coupling between the PDF parser (pdfalto) and 506 Structure GROBIDCRF GROBIDNN RoBERTa I-VILA Category P R F1 P R F1 P R F1 P R F1 Abstract 81.9 89.1 85.3 85.3 89.8 87.5 89.2 93.7 91.4 97.4 98.3 97.8 Author 55.2 42.6 48.1 75.1 14.0 23.6 87.5 73.5 79.9 65.5 96.9 78.2 Bibliography
- Source: EM (the percentage of the predic- 4 Available at https://github.com/thunlp/OpenQA tions matching exactly one of the ground truth an- 2110 CNNs used in BERTAC MNLI QNLI QQP RTE SST-2 MRPC CoLA STS-B Avg. Proposed (GAN-style CNN) 91.3/91.1 95.7 92.3 89.9 97.2 92.4 73.7 93.1 90.7 Self-supervised CNN 91.0/90.8 95.3 91.5 88.4 96.6 90.9 71.1 93.0 89.8 Randomly ini

15. Compact_Transformers_2023 → PaperMage_2023 (score 0.5865)

- Query: model compression methods, ing interest in computational linguistics (Warstadt such as model distillation are not necessarily et al., 2023; Huebner et al., 2021).2,3 superior to pretraining reduced size transformer models from scratch. Most research for creating efficient transformers has focused on distillation, which trains a smaller 1 Introduction student
- Source: or sum- first step in pretraining language models of sci- maries (August et al., 2023; Rachatasumrit et al., ence (Beltagy et al., 2019; Lee et al., 2019; Gu et al., 2022; Kim et al., 2023), automatic span highlight- 2020; Luo et al., 2022; Taylor et al., 2022; Tre- ing (Chang et al., 2023; Fok et al., 2023b), interac- wartha et al., 2022; Hong et al., 2023)

16. PaperMage_2023 → Compact_Transformers_2023 (score 0.5865)

- Query: there is increasing inter- est in developing new tools for extracting knowl- edge from these visually-rich documents. Recent and more. Further, extracting clean, properly- research has explored, for example, AI-powered structured scientific text from PDF documents (Lo reading support for math symbol definitions (Head et al., 2020; Wang et al., 2020) forms a
- Source: al., 2019; Wang et al., 2020; In the space of a few years, transformers have revo- Sun et al., 2020; Jiao et al., 2019). While these lutionized natural language processing. Their suc- efforts have produced more efficient models, they cess has been driven by increasingly large models require the same large datasets and the use of larger and more training data

17. BERTAC_2021 → PaperMage_2023 (score 0.5828)

- Query: answer 5.2 Open-domain QA span selector, where [CLS] and [SEP] are spe- We also tested BERTAC on open-domain cial tokens. In the passage selector, the represen- QA (Chen et al., 2017) with the publicly available tation of [CLS] in the top TIER layer is fed into datasets Quasar-T (Dhingra et al., 2017) and a linear layer with a softmax, which computes the Sea
- Source: or sum- first step in pretraining language models of sci- maries (August et al., 2023; Rachatasumrit et al., ence (Beltagy et al., 2019; Lee et al., 2019; Gu et al., 2022; Kim et al., 2023), automatic span highlight- 2020; Luo et al., 2022; Taylor et al., 2022; Tre- ing (Chang et al., 2023; Fok et al., 2023b), interac- wartha et al., 2022; Hong et al., 2023)

18. PaperMage_2023 → BERTAC_2021 (score 0.5828)

- Query: or sum- first step in pretraining language models of sci- maries (August et al., 2023; Rachatasumrit et al., ence (Beltagy et al., 2019; Lee et al., 2019; Gu et al., 2022; Kim et al., 2023), automatic span highlight- 2020; Luo et al., 2022; Taylor et al., 2022; Tre- ing (Chang et al., 2023; Fok et al., 2023b), interac- wartha et al., 2022; Hong et al., 2023)
- Source: Quasar-T (Dhingra et al., 2017) and a linear layer with a softmax, which computes the SearchQA (Dunn et al., 2017). We used the probability that the passage contains a correct an- pre-processed version4 of the datasets provided swer to the question. Our BERTAC answer span by Lin et al.

19. Transformers_Polarity_2022 → Pushdown_Layers_2023 (score 0.5770)

- Query: Proceedings of the 58th Annual Meeting of Shammur Absar Chowdhury and Roberto Zamparelli. the Association for Computational Linguistics, pages 2018. RNN simulations of grammaticality judgments 1725–1744. on long-distance dependencies. In Proceedings of the 27th international conference on computational Jaap Jumelet, Milica Denic, Jakub Szymanik, Dieuwke ling
- Source: 2021. Structural guidance for ing of the Association for Computational Linguistics, transformer language models. In Proceedings of the pages 3499–3505. 59th Annual Meeting of the Association for Compu- tational Linguistics and the 11th International Joint Karol Kurach, Marcin Andrychowicz, and Ilya Conference on Natural Language Processing (Vol- Sutskever. 2

20. Pushdown_Layers_2023 → Transformers_Polarity_2022 (score 0.5770)

- Query: Ma- 1 (Long and Short Papers), pages 1105–1117. chine Learning Research, 22(75):1–35. Nikita Kitaev, Steven Cao, and Dan Klein. 2019. Multi- lingual constituency parsing with self-attention and Peng Qian, Tahira Naseem, Roger Levy, and Ramón pre-training. In Proceedings of the 57th Annual Meet- Fernandez Astudillo. 2021. Structural guidance for ing of the As
- Source: Proceedings of the 58th Annual Meeting of Shammur Absar Chowdhury and Roberto Zamparelli. the Association for Computational Linguistics, pages 2018. RNN simulations of grammaticality judgments 1725–1744. on long-distance dependencies. In Proceedings of the 27th international conference on computational Jaap Jumelet, Milica Denic, Jakub Szymanik, Dieuwke ling

### semantic

1. Online_Sketch_Query_Optimization_2021 → NoREC_Database_Optimization_Bugs_2020 (score 1.0000)
   - Query: M. Astrahan, D. D. Chamberlain, R. A. Lorie, and T. G. Price. Access Path Selection in a Relational Database Management System. In SIGMOD 1979, pages 23–34.
   - Source: M. Astrahan, D. D. Chamberlin, R. A. Lorie, and T. G. ings of the 2010 ACM SIGMOD International Conference on Management of Data (In- Price. 1979. Access Path Selection in a Relational Database Management System. dianapolis, Indiana, USA) (SIGMOD âĂŹ10).

2. Online_Sketch_Query_Optimization_2021 → QUIC_Dual_Connectivity_2021 (score 1.0000)
   - Query: [32] T. Malik, R. C. Burns, and N. V. Chawla. A Black-Box Approach to Query Cardinality Estimation. In CIDR 2007. [33] R.
   - Source: [32] K. L. McMillan, L. D. Zuck, Formal Specification and Testing of QUIC, in: Proc. of ACM SIGCOMM, 2019. [33] R.

3. Pushdown_Layers_2023 → Human_Language_Modeling_2022 (score 1.0000)
   - Query: As- arXiv preprint arXiv:1511.06392. sociation for Computational Linguistics. Yair Lakretz, Théo Desbordes, Dieuwke Hupkes, and Alec Radford, Jeff Wu, Rewon Child, David Luan, Stanislas Dehaene.
   - Source: As- Steven Piantadosi, David P Byar, and Sylvan B Green. sociation for Computational Linguistics.

4. QUIC_Dual_Connectivity_2021 → Online_Sketch_Query_Optimization_2021 (score 1.0000)
   - Query: [32] K. L. McMillan, L. D. Zuck, Formal Specification and Testing of QUIC, in: Proc. of ACM SIGCOMM, 2019. [33] R.
   - Source: [32] T. Malik, R. C. Burns, and N. V. Chawla. A Black-Box Approach to Query Cardinality Estimation. In CIDR 2007. [33] R.

5. CERT_Cardinality_Estimation_2024 → NoREC_Database_Optimization_Bugs_2020 (score 1.0000)
   - Query: 2018. Metamorphic Testing: A Review of Challenges Chaminade, CA, USA, January 8-11, 2017, Online Proceedings. www.cidrdb.org. and Opportunities. ACM Comput. Surv.
   - Source: 2018. Metamorphic Testing: A Review of Challenges and Tim Kraska, Olga Papaemmanouil, and Nesime Tatbul. 2019. Neo: A Learned Opportunities. ACM Comput. Surv.

6. CERT_Cardinality_Estimation_2024 → NoREC_Database_Optimization_Bugs_2020 (score 1.0000)
   - Query: Selinger, Morton M. Astrahan, Donald D. Chamberlin, Raymond A. [66] Zhuoyue Zhao, Robert Christensen, Feifei Li, Xiao Hu, and Ke Yi. 2018. Random Lorie, and Thomas G. Price. 1979. Access Path Selection in a Relational Database Sampling over Joins Revisited.
   - Source: Griffiths Selinger, M. M. Astrahan, D. D. Chamberlin, R. A. Lorie, and T. G. ings of the 2010 ACM SIGMOD International Conference on Management of Data (In- Price. 1979. Access Path Selection in a Relational Database Management System.

7. NoREC_Database_Optimization_Bugs_2020 → CERT_Cardinality_Estimation_2024 (score 1.0000)
   - Query: 2018. Metamorphic Testing: A Review of Challenges and Tim Kraska, Olga Papaemmanouil, and Nesime Tatbul. 2019. Neo: A Learned Opportunities. ACM Comput. Surv.
   - Source: 2018. Metamorphic Testing: A Review of Challenges Chaminade, CA, USA, January 8-11, 2017, Online Proceedings. www.cidrdb.org. and Opportunities. ACM Comput. Surv.

8. NoREC_Database_Optimization_Bugs_2020 → CERT_Cardinality_Estimation_2024 (score 1.0000)
   - Query: Griffiths Selinger, M. M. Astrahan, D. D. Chamberlin, R. A. Lorie, and T. G. ings of the 2010 ACM SIGMOD International Conference on Management of Data (In- Price. 1979. Access Path Selection in a Relational Database Management System. dianapolis, Indiana, USA) (SIGMOD âĂŹ10).
   - Source: Selinger, Morton M. Astrahan, Donald D. Chamberlin, Raymond A. [66] Zhuoyue Zhao, Robert Christensen, Feifei Li, Xiao Hu, and Ke Yi. 2018. Random Lorie, and Thomas G. Price. 1979. Access Path Selection in a Relational Database Sampling over Joins Revisited.

9. PaperMage_2023 → Compact_Transformers_2023 (score 1.0000)
   - Query: Yiheng Xu, Minghao Li, Lei Cui, Shaohan Huang, Furu Wei, and Ming Zhou. 2019.
   - Source: Xiaoqi Jiao, Yichun Yin, Lifeng Shang, Xin Jiang, Xiao Chen, Linlin Li, Fang Wang, and Qun Liu. 2019.

10. Transformers_Polarity_2022 → Compact_Transformers_2023 (score 1.0000)

- Query: Alex Warstadt, Yu Cao, Ioana Grosu, Wei Peng, Ha- gen Blix, Yining Nie, Anna Alsop, Shikha Bordia, Haokun Liu, Alicia Parrish, et al. 2019.
- Source: Xiaoqi Jiao, Yichun Yin, Lifeng Shang, Xin Jiang, Xiao Chen, Linlin Li, Fang Wang, and Qun Liu. 2019.

11. BERTAC_2021 → Pushdown_Layers_2023 (score 1.0000)

- Query: 2018. GLUE: A multi-task benchmark and analysis plat- form for natural language understanding. In Pro- Colin Raffel, Noam Shazeer, Adam Roberts, Katherine ceedings of the 2018 EMNLP Workshop Black- Lee, Sharan Narang, Michael Matena, Yanqi Zhou, boxNLP: Analyzing and Interpreting Neural Net- Wei Li, and Peter J.
- Source: 2019a. GLUE: A multi-task benchmark and analysis plat- form for natural language understanding.

12. Pushdown_Layers_2023 → BERTAC_2021 (score 1.0000)

- Query: 2019a. GLUE: A multi-task benchmark and analysis plat- form for natural language understanding. In Interna- tional Conference on Learning Representations.
- Source: 2018. GLUE: A multi-task benchmark and analysis plat- form for natural language understanding.

13. CERT_Cardinality_Estimation_2024 → NoREC_Database_Optimization_Bugs_2020 (score 1.0000)

- Query: 2020. Detecting optimization bugs in database org/abs/2011.09020 engines via non-optimizing reference engine construction.
- Source: 2020. Detecting Optimization Bugs in approach is to compare the results of an optimizing version of a Database Engines via Non-Optimizing Reference Engine Construction.

14. Compact_Transformers_2023 → BERTAC_2021 (score 1.0000)

- Query: Alexander Bondarenko, Magdalena Wolska, Ste- fan Heindorf, Lukas Blübaum, Axel-Cyrille Jared Kaplan, Sam McCandlish, Tom Henighan, Tom B Ngonga Ngomo, Benno Stein, Pavel Braslavski, Brown, Benjamin Chess, Rewon Child, Scott Gray, Matthias Hagen, and Martin Potthast. 2022. Alec Radford, Jeffrey Wu, and Dario Amodei. 2020.
- Source: Clemens Winter, Christopher Hesse, Mark Chen, Eric Sigler, Mateusz Litwin, Scott Gray, Benjamin Bin He, Di Zhou, Jinghui Xiao, Xin Jiang, Qun Chess, Jack Clark, Christopher Berner, Sam Mc- Liu, Nicholas Jing Yuan, and Tong Xu. 2020.

15. Human_Language_Modeling_2022 → Compact_Transformers_2023 (score 1.0000)

- Query: arXiv preprint arXiv:1909.05858. Matthew Matero, Nikita Soni, Niranjan Balasubra- Milton King and Paul Cook. 2020.
- Source: arXiv preprint arXiv:1909.10351. Alexander Bondarenko, Magdalena Wolska, Ste- fan Heindorf, Lukas Blübaum, Axel-Cyrille Jared Kaplan, Sam McCandlish, Tom Henighan, Tom B Ngonga Ngomo, Benno Stein, Pavel Braslavski, Brown, Benjamin Chess, Rewon Child, Scott Gray, Matthias Hagen, and Martin Potthast. 2022. Alec Radford, Jeffrey Wu, and Dario Amodei. 2020.

16. PaperMage_2023 → BERTAC_2021 (score 1.0000)

- Query: https://github.com/ Winter, Chris Hesse, Mark Chen, Eric Sigler, Ma- kermitt2/grobid. teusz Litwin, Scott Gray, Benjamin Chess, Jack Yu Gu, Robert Tinn, Hao Cheng, Michael R. Lucas, Clark, Christopher Berner, Sam McCandlish, Alec Naoto Usuyama, Xiaodong Liu, Tristan Naumann, Radford, Ilya Sutskever, and Dario Amodei. 2020.
- Source: Clemens Winter, Christopher Hesse, Mark Chen, Eric Sigler, Mateusz Litwin, Scott Gray, Benjamin Bin He, Di Zhou, Jinghui Xiao, Xin Jiang, Qun Chess, Jack Clark, Christopher Berner, Sam Mc- Liu, Nicholas Jing Yuan, and Tong Xu. 2020.

17. PaperMage_2023 → Compact_Transformers_2023 (score 1.0000)

- Query: teusz Litwin, Scott Gray, Benjamin Chess, Jack Yu Gu, Robert Tinn, Hao Cheng, Michael R. Lucas, Clark, Christopher Berner, Sam McCandlish, Alec Naoto Usuyama, Xiaodong Liu, Tristan Naumann, Radford, Ilya Sutskever, and Dario Amodei. 2020. Jianfeng Gao, and Hoifung Poon. 2020.
- Source: Alexander Bondarenko, Magdalena Wolska, Ste- fan Heindorf, Lukas Blübaum, Axel-Cyrille Jared Kaplan, Sam McCandlish, Tom Henighan, Tom B Ngonga Ngomo, Benno Stein, Pavel Braslavski, Brown, Benjamin Chess, Rewon Child, Scott Gray, Matthias Hagen, and Martin Potthast. 2022. Alec Radford, Jeffrey Wu, and Dario Amodei. 2020.

18. PaperMage_2023 → QUIC_Delay_Control_2025 (score 1.0000)

- Query: IEEE Trans- Bailey Kuehl, Madeleine van Zuylen, Linda M. Wag- actions on Pattern Analysis and Machine Intelligence, ner, and Daniel S. Weld. 2021.
- Source: IEEE, 213–221. Research in Networking. Springer, 328–341. [16] Larry L Peterson and Bruce S Davie. 2021.

19. Transformers_Polarity_2022 → Pushdown_Layers_2023 (score 1.0000)

- Query: 2021. Language modelling as a multi-task problem. In Proceedings of the 16th Conference of the European Chapter of the Association for Compu- tational Linguistics: Main Volume, pages 2049–2060, Online.
- Source: 2021. Structural guidance for ing of the Association for Computational Linguistics, transformer language models. In Proceedings of the pages 3499–3505. 59th Annual Meeting of the Association for Compu- tational Linguistics and the 11th International Joint Karol Kurach, Marcin Andrychowicz, and Ilya Conference on Natural Language Processing (Vol- Sutskever.

20. CERT_Cardinality_Estimation_2024 → Online_Sketch_Query_Optimization_2021 (score 1.0000)

- Query: Astrahan, Donald D. Chamberlin, Raymond A. [66] Zhuoyue Zhao, Robert Christensen, Feifei Li, Xiao Hu, and Ke Yi. 2018. Random Lorie, and Thomas G. Price. 1979. Access Path Selection in a Relational Database Sampling over Joins Revisited. In Proceedings of the 2018 International Conference Management System.
- Source: Astrahan, D. D. Chamberlain, R. A. Lorie, and T. G. Price. Access Path Selection in a Relational Database Management System.

### hybrid

1. BERTAC_2021 → Human_Language_Modeling_2022 (score 1.0000)
   - Query: In Ad- Roberta: A robustly optimized bert pretraining ap- vances in Neural Information Processing Systems proach. arXiv preprint arXiv:1907.11692. 22, pages 1821–1828.
   - Source: tional Linguistics and the 7th International Joint Roberta: A robustly optimized bert pretraining ap- Conference on Natural Language Processing (Vol- proach. arXiv preprint arXiv:1907.11692.

2. BERTAC_2021 → Online_Sketch_Query_Optimization_2021 (score 1.0000)
   - Query: 2018. Unsupervised learning Domain-adversarial training of neural networks. of sentence representations using sequence consis- Journal of Machine Learning Research, 17(59):1– tency. CoRR, abs/1808.04217. 35.
   - Source: Stoica. Learning to Optimize Join Queries With Deep Reinforcement Learning. CoRR, arXiv:1808.03196v2, 2018.

3. BERTAC_2021 → PaperMage_2023 (score 1.0000)
   - Query: In Proceedings of cessing Systems 30, pages 5998–6008. Curran As- the 57th Annual Meeting of the Association for Com- sociates, Inc. putational Linguistics, pages 4227–4237. Giorgos Vernikos, Katerina Margatina, Alexandra Matthew E.
   - Source: In Proceedings of the 6544–6555, Online. Association for Computational 58th Annual Meeting of the Association for Compu- Linguistics. tational Linguistics, pages 4969–4983, Online.

4. BERTAC_2021 → Pushdown_Layers_2023 (score 1.0000)
   - Query: 2018. GLUE: A multi-task benchmark and analysis plat- form for natural language understanding. In Pro- Colin Raffel, Noam Shazeer, Adam Roberts, Katherine ceedings of the 2018 EMNLP Workshop Black- Lee, Sharan Narang, Michael Matena, Yanqi Zhou, boxNLP: Analyzing and Interpreting Neural Net- Wei Li, and Peter J.
   - Source: 2019a. GLUE: A multi-task benchmark and analysis plat- form for natural language understanding.

5. BERTAC_2021 → Review4Repair_2020 (score 1.0000)
   - Query: Learning tions. phrase representations using RNN encoder–decoder for statistical machine translation. In Proceedings of Sepp Hochreiter and Jürgen Schmidhuber.
   - Source: Bengio, Learning phrase representations using rnn encoder- decoder for statistical machine translation, arXiv preprint arXiv:1406.1078 (2014).

6. CERT_Cardinality_Estimation_2024 → NoREC_Database_Optimization_Bugs_2020 (score 1.0000)
   - Query: 2017. Cardinality Estimation Done Right: Index-Based Join Sam- [8] Tsong Yueh Chen, Fei-Ching Kuo, Huai Liu, Pak-Lok Poon, Dave Towey, T. H. pling. In 8th Biennial Conference on Innovative Data Systems Research, CIDR 2017, Tse, and Zhi Quan Zhou. 2018. Metamorphic Testing: A Review of Challenges Chaminade, CA, USA, January 8-11, 2017, Online Proceedings. www
   - Source: https://doi.org/10.1007/s00778-009-0157-y [12] Tsong Yueh Chen, Fei-Ching Kuo, Huai Liu, Pak-Lok Poon, Dave Towey, T. H. [35] Ryan Marcus, Parimarjan Negi, Hongzi Mao, Chi Zhang, Mohammad Alizadeh, Tse, and Zhi Quan Zhou. 2018. Metamorphic Testing: A Review of Challenges and Tim Kraska, Olga Papaemmanouil, and Nesime Tatbul.

7. CERT_Cardinality_Estimation_2024 → Online_Sketch_Query_Optimization_2021 (score 1.0000)
   - Query: Selinger, Morton M. Astrahan, Donald D. Chamberlin, Raymond A. [66] Zhuoyue Zhao, Robert Christensen, Feifei Li, Xiao Hu, and Ke Yi. 2018. Random Lorie, and Thomas G. Price. 1979. Access Path Selection in a Relational Database Sampling over Joins Revisited. In Proceedings of the 2018 International Conference Management System.
   - Source: M. Astrahan, D. D. Chamberlain, R. A. Lorie, and T. G. Price. Access Path Selection in a Relational Database Management System.

8. CERT_Cardinality_Estimation_2024 → Pushdown_Layers_2023 (score 1.0000)
   - Query: 2016. Performance Monitoring in SAP [60] Ziniu Wu, Rong Zhu, Andreas Pfadler, Yuxing Han, Jiangneng Li, Zhengping HANA’s Continuous Integration Process. SIGMETRICS Perform. Evaluation Rev. Qian, Kai Zeng, and Jingren Zhou. 2020.
   - Source: Association for Computational Genewein, Li Kevin Wenliang, Elliot Catt, Chris Linguistics. 3242 Armand Joulin and Tomas Mikolov.

9. Compact_Transformers_2023 → BERTAC_2021 (score 1.0000)
   - Query: At 2 https://babylm.github.io the time of this writing, the on-demand cost of this 3 https://sites.google.com/view/learning-with-small- much compute would be a little less than $20,000 data/home 521 Proceedings of the 27th Conference on Computational Natural Language Learning (CoNLL), pages 521–531 December 6–7, 2023. ©2023 Association for Computational Ling
   - Source: 2103 Proceedings of the 59th Annual Meeting of the Association for Computational Linguistics and the 11th International Joint Conference on Natural Language Processing, pages 2103–2115 August 1–6, 2021. ©2021 Association for Computational Linguistics

10. Compact_Transformers_2023 → Human_Language_Modeling_2022 (score 1.0000)

- Query: language modeling with pathways. arXiv preprint Roberta: A robustly optimized bert pretraining ap- arXiv:2204.02311. proach. arXiv preprint arXiv:1907.11692. Kevin Clark, Minh-Thang Luong, Quoc V Le, and Louis Martin, Benjamin Muller, Pedro Javier Ortiz Christopher D Manning.
- Source: 2019. tional Linguistics and the 7th International Joint Roberta: A robustly optimized bert pretraining ap- Conference on Natural Language Processing (Vol- proach. arXiv preprint arXiv:1907.11692.

11. Compact_Transformers_2023 → Review4Repair_2020 (score 1.0000)

- Query: 2019. Camembert: a tasty french language Jacob Devlin, Ming-Wei Chang, Kenton Lee, and model. arXiv preprint arXiv:1911.03894. Kristina Toutanova. 2018. Bert: Pre-training of deep bidirectional transformers for language understand- Paul Michel, Omer Levy, and Graham Neubig. 2019. ing. arXiv preprint arXiv:1810.04805. Are sixteen heads really better than one?
- Source: Lee, K. Toutanova, Bert: Pre-training of deep bidirectional transformers for language understanding (2018). arXiv:1810.

12. Human_Language_Modeling_2022 → BERTAC_2021 (score 1.0000)

- Query: tional Linguistics and the 7th International Joint Roberta: A robustly optimized bert pretraining ap- Conference on Natural Language Processing (Vol- proach. arXiv preprint arXiv:1907.11692. ume 1: Long Papers), pages 752–762, Beijing, Veronica Lynn, Niranjan Balasubramanian, and H.
- Source: In Ad- Roberta: A robustly optimized bert pretraining ap- vances in Neural Information Processing Systems proach. arXiv preprint arXiv:1907.11692.

13. Human_Language_Modeling_2022 → BERTAC_2021 (score 1.0000)

- Query: In factor adaptation for text classification: Learning to Proceedings of the Third Workshop on Natural Lan- generalize across author demographics. In Proceed- guage Processing and Computational Social Sci- ings of the Eighth Joint Conference on Lexical and ence, pages 18–28, Minneapolis, Minnesota. Asso- Computational Semantics (* SEM 2019). ciation for Comp
- Source: In Ad- Joint Conference on Natural Language Processing vances in Neural Information Processing Systems, (EMNLP-IJCNLP), pages 5878–5882. Association volume 28, pages 2377–2385. for Computational Linguistics.

14. Human_Language_Modeling_2022 → Review4Repair_2020 (score 1.0000)

- Query: Carbonell, Quoc V. Le, and R. Salakhut- els may risk release of private research partici- dinov. 2018.
- Source: V. Gorp, A. Amsel, N. V. Eetvelde, H. Stenten, S. Demeyer, T. Mens, A discussion of refactoring in research and practice, 2004.

15. NoREC_Database_Optimization_Bugs_2020 → CERT_Cardinality_Estimation_2024 (score 1.0000)

- Query: 2010), 203–230. https://doi.org/10.1007/s00778-009-0157-y [12] Tsong Yueh Chen, Fei-Ching Kuo, Huai Liu, Pak-Lok Poon, Dave Towey, T. H.
- Source: 2017. Cardinality Estimation Done Right: Index-Based Join Sam- [8] Tsong Yueh Chen, Fei-Ching Kuo, Huai Liu, Pak-Lok Poon, Dave Towey, T. H.

16. Online_Sketch_Query_Optimization_2021 → BERTAC_2021 (score 1.0000)

- Query: Xu, Z. Yu, V. Corvinelli, and C. Zuzarte. Cardinality Estimation Using Neural Networks. In CASCON 2015, pages 53–59. [32] T. Malik, R. C.
- Source: V. Luxburg, S. Bengio, Ryu Iida, and Kentaro Torisawa. 2019. Open– H. Wallach, R.

17. Online_Sketch_Query_Optimization_2021 → BERTAC_2021 (score 1.0000)

- Query: Burns, and N. V. Chawla. A Black-Box Approach to Query Cardinality Estimation. In CIDR 2007. [33] R. Marcus, P.
- Source: V. Luxburg, S. Bengio, Ryu Iida, and Kentaro Torisawa. 2019. Open– H. Wallach, R.

18. Online_Sketch_Query_Optimization_2021 → CERT_Cardinality_Estimation_2024 (score 1.0000)

- Query: In CIDR 2007. [33] R. Marcus, P. Negi, H. Mao, C. Zhang, M. Alizadeh, T. Kraska, O. Papaemmanouil, and N. Tatbul.
- Source: c1 IN ( t1 . c1 ) obtained by concatenating the flattened child nodes: flatten(𝑁 ) = WHERE CASE WHEN t1 . rowid > 2 THEN false ELSE [𝑂 𝑁 , flatten(𝐶 1 ), flatten(𝐶 2 ) .

19. Online_Sketch_Query_Optimization_2021 → Human_Language_Modeling_2022 (score 1.0000)

- Query: Boncz, and A. Kemper. Learned Cardinalities: Estimating Correlated Joins with Deep Learning. In CIDR 2019. [25] A. Kipf, D.
- Source: A. Schwartz, J. Eichstaedt, Mar- the 28th annual international ACM SIGIR confer- garet L. Kern, M. Kosinski, D.

20. Online_Sketch_Query_Optimization_2021 → Human_Language_Modeling_2022 (score 1.0000)

- Query: Ré, and A. Rudra. Worst-Case Optimal Join Algorithms. In PODS 2012, pages 37–48. [42] J. Ortiz, M.
- Source: A. Schwartz, J. Eichstaedt, Mar- the 28th annual international ACM SIGIR confer- garet L. Kern, M.
