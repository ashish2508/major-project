# Controlled passage review examples

Each pair contains original synthetic Computer Science text. Upload the PDF under **Document to review** and the matching TXT under **Possible sources**. Run TF-IDF, MiniLM, and Hybrid separately. The PDF headings and page numbers help locate the extracted highlights.

| Pair                                                                                                    | Subject                                                    | Expected evidence                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Direct copy PDF](01-direct-copy-suspicious.pdf) and [source](01-direct-copy-source.txt)                | Distributed key-value storage                              | Three verbatim paragraphs, reordered and separated by original prose.                                                                         |
| [Paraphrase PDF](02-paraphrase-suspicious.pdf) and [source](02-paraphrase-source.txt)                   | Evaluation of machine learning with delayed labels         | Three rewrites. A relevant MiniLM candidate can score below the alert threshold, and a shared topic alone can produce a misleading candidate. |
| [Negative control PDF](03-negative-control-suspicious.pdf) and [source](03-negative-control-source.txt) | Columnar databases compared with wireless gateway security | Zero intended correspondences. Any alert is a false positive for this control.                                                                |

[Ground truth](ground-truth.json) stores each authored correspondence using zero-based UTF-16 offsets and lengths in the text returned by the application. An end offset is exclusive. The one-based PDF page number identifies the submitted passage. Line breaks from PDF extraction can differ from the TXT source, even where the wording was copied.

These fixtures support demonstrations and regression checks. PAN-PC-11 supplies the benchmark data.

Measured limitation: in the paragraph-bounded run on 11 November 2026, the annotated paraphrase candidates reached a maximum MiniLM cosine score of 0.5265 on both CPU and DirectML, below the frozen 0.60 semantic alert threshold. The example therefore demonstrates evidence retrieval without a semantic alert; this synthetic result is separate from PAN-PC-11 benchmark metrics.
