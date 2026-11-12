export default function ContextPanel() {
  return (
    <aside className="context-panel">
      <p className="eyebrow">READ BEFORE INTERPRETING</p>
      <h2>Similarity is a starting point.</h2>
      <p>
        A match can reflect quotation, common language, shared subject matter, or textual reuse.
        Scores are not calibrated probabilities and do not establish plagiarism or misconduct.
      </p>
      <div className="context-divider" />
      <h3>What the methods measure</h3>
      <dl>
        <dt>TF-IDF</dt>
        <dd>Overlap in weighted words.</dd>
        <dt>MiniLM</dt>
        <dd>Similarity in sentence and short-passage meaning.</dd>
        <dt>Hybrid</dt>
        <dd>
          A weighted score selected using validation data. It may reduce to a single baseline.
        </dd>
      </dl>
      <div className="context-divider" />
      <p className="small-copy">
        Research calibration uses a bounded, book-based PAN-PC-11 subset. Performance on Computer
        Science research publications is not established. Scanned PDFs and OCR are not supported.
      </p>
    </aside>
  );
}
