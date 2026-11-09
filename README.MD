**Project Direction**

Build an AI system that detects **textual plagiarism in computer science research papers**. This is the best first target because:

- It is a recognized form of research misconduct.
- Public benchmark datasets are available.
- It is non-medical and appropriate for a CSE project.
- Accuracy can be measured objectively.
- It can use a free API initially and switch to a local model when limits are reached.

The system will detect whether a passage appears copied, heavily paraphrased, or independently written.

**Proposed Solution**

Input:

- Research paper or text passage
- Optional comparison document or reference corpus

Output:

- Plagiarism probability
- Matching or suspicious passages
- Similar source passages
- Similarity score
- Explanation of the decision
- Confidence level

The initial model will focus only on plagiarism detection. Other misconduct types such as fabrication, falsification, image manipulation, duplicate publication, and citation manipulation can be added later, but including them in the first version would make the project difficult to evaluate properly.

**Dataset and Evaluation**

Use a public plagiarism dataset such as:

- PAN plagiarism corpora
- PAN-PC-11
- Academic paraphrase or semantic similarity datasets
- Public research-paper text collections for non-plagiarized examples

The final dataset selection will depend on license and accessibility. The data will be divided into training, validation, and test sets without allowing text from the same source document to appear in multiple splits.

Evaluation metrics:

- Accuracy
- Precision
- Recall
- F1-score
- ROC-AUC
- PlagDet, if the PAN dataset format supports it
- False-positive rate

Accuracy alone is not sufficient. For misconduct detection, precision and recall are especially important because falsely accusing a researcher is serious.

**AI Architecture**

The first version can use a hybrid pipeline:

1. Text extraction and cleaning
2. Sentence or paragraph segmentation
3. Semantic embedding generation
4. Similarity comparison against reference documents
5. Classification of suspicious and non-suspicious text
6. Highlighting of matching passages
7. Human-readable explanation

Possible models:

- API option: a free Hugging Face inference endpoint where available
- Local fallback: Sentence Transformers, such as `all-MiniLM-L6-v2`
- Stronger local option: a cross-encoder similarity model
- Optional research-text model: SciBERT, if the dataset and hardware support it

The system should not depend permanently on a paid API. The application will use a provider interface so that the API model and local model can be exchanged without changing the rest of the application.

**Planned Technology**

A practical CSE implementation would use:

- Python
- FastAPI for the backend
- Sentence Transformers and PyTorch
- scikit-learn for evaluation
- SQLite or PostgreSQL for stored results
- React or a simple HTML frontend
- Docker for reproducibility
- Hugging Face API as an optional external model provider
- Local downloaded model as the fallback provider

**Development Plan**

1. **Literature and problem definition**
   - Define research misconduct and textual plagiarism.
   - Review existing plagiarism-detection approaches.
   - Identify the research gap.
   - Select the final dataset and evaluation protocol.

2. **Article first**
   - Write the problem statement.
   - Explain why plagiarism is selected as the first misconduct type.
   - Describe the proposed architecture.
   - Discuss datasets, ethical risks, and limitations.
   - Include a planned experimental methodology.
   - Keep the article original and paraphrased.
   - Target less than 10% similarity, while recognizing that the final percentage depends on the checker and its database.

3. **Dataset preparation**
   - Download and inspect the selected dataset.
   - Normalize and clean text.
   - Create document-level train, validation, and test splits.
   - Generate positive and negative examples.
   - Prevent data leakage.

4. **Baseline system**
   - Implement TF-IDF plus cosine similarity.
   - Measure the baseline performance.
   - Use this as a comparison against the AI model.

5. **AI model**
   - Implement embedding-based similarity.
   - Add a classifier or thresholding strategy.
   - Compare API-based and local model results.
   - Select the model based on F1-score, speed, cost, and reproducibility.

6. **Application**
   - Create an upload or text-input interface.
   - Display the plagiarism score.
   - Highlight suspicious passages.
   - Show matching source passages.
   - Display confidence and warnings.
   - Make clear that the tool supports human review and does not make final misconduct judgments.

7. **Testing**
   - Test normal writing, paraphrasing, copied text, short passages, and formatting variations.
   - Measure false positives and false negatives.
   - Test API failure and automatic local-model fallback.
   - Test documents of different lengths.

8. **Final research report**
   - Present the methodology.
   - Compare baseline and AI models.
   - Report all evaluation metrics.
   - Discuss limitations and ethical concerns.
   - Include screenshots and reproducibility instructions.

**Article Structure**

The first article should contain:

1. Title  
2. Abstract  
3. Keywords  
4. Introduction  
5. Background on research misconduct  
6. Problem definition  
7. Related work  
8. Proposed AI-based solution  
9. Dataset and preprocessing  
10. Model architecture  
11. Evaluation methodology  
12. Ethical considerations  
13. Expected results  
14. Limitations  
15. Future work  
16. Conclusion  
17. References  

A suitable working title is:

**“An AI-Based System for Detecting Textual Plagiarism in Computer Science Research Publications”**

**Important Research Constraints**

The system should not describe a high similarity score as definitive proof of misconduct. It should report evidence for human investigation. Legitimate quotations, common terminology, standard algorithms, citations, and independently written similar text can all produce false positives.

The article should also avoid inventing experimental accuracy. Before implementation, it should use terms such as “proposed method” and “expected evaluation.” Measured results will be added only after the experiments are completed.

**How We Will Create It**

Because the workspace is currently empty, the project can be created in this order:

```text
research-misconduct-detector/
├── article/
│   └── plagiarism_detection_article.md
├── data/
├── notebooks/
├── src/
│   ├── preprocessing/
│   ├── models/
│   ├── evaluation/
│   └── api/
├── tests/
├── frontend/
├── requirements.txt
├── README.md
└── Dockerfile
```

The first implementation deliverable should be the article and project README. After that, we will add the dataset preparation code, baseline model, AI model, evaluation scripts, and user interface in small validated steps.

No files have been created yet because the workspace is empty and this turn is currently in planning mode.
