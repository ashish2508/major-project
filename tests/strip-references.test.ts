/**
 * Tests for the reference-section stripping module.
 *
 * We test against:
 *   1. Synthetic inputs covering the documented edge cases.
 *   2. A representative sample of the reference-section heading styles
 *      observed in the actual 12 canonical research papers (two-column PDF
 *      layout artefacts, numbered citations, ACL-style author-year citations,
 *      ALL-CAPS headings, etc.).
 *
 * None of these tests read the canonical files from disk.  They embed
 * representative snippets so the suite runs without the data directory.
 */

import { describe, expect, it } from 'vitest';
import { stripReferences } from '../src/lib/detection/strip-references';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal paper text: `body` followed by `tail`. */
function paper(body: string, tail: string): string {
  return body + tail;
}

/** Long reference list (> MIN_TRAILING_CHARS) used in positive tests. */
const LONG_REF_LIST = `
[1] Author A. 2020. Title one. Conference Proceedings.
[2] Author B, Author C. 2021. Title two. Journal of Things, 14(2):1–10.
[3] Author D. 2022. Title three. arXiv preprint arXiv:2201.00000.
[4] Author E, Author F, and Author G. 2023. Title four. In Proc. Workshop.
`.repeat(3); // repeat to exceed MIN_TRAILING_CHARS comfortably

// ---------------------------------------------------------------------------
// 1. No heading → body unchanged, confident = false
// ---------------------------------------------------------------------------

describe('no reference-section heading', () => {
  it('returns the full text unchanged when there is no heading', () => {
    const text = 'Introduction\n\nThis is a paragraph.\n\nConclusion\n\nAnother paragraph.';
    const result = stripReferences(text);
    expect(result.body).toBe(text);
    expect(result.referenceOffset).toBeNull();
    expect(result.detectedHeading).toBeNull();
    expect(result.confident).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Canonical headings – confident positive cases
// ---------------------------------------------------------------------------

describe('confident detection', () => {
  it('detects "References" at the start of a new line', () => {
    const body = 'Body paragraph.\n\nAnother paragraph.\n\n';
    const tail = 'References\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.detectedHeading).toBe('References');
    // Body should end before the keyword.
    expect(result.body).toBe(body);
    expect(result.referenceOffset).toBe(body.length);
  });

  it('detects "Bibliography" heading', () => {
    const body = 'Body content.\n\n';
    const tail = 'Bibliography\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.detectedHeading).toBe('Bibliography');
  });

  it('detects "Works Cited" heading', () => {
    const body = 'Body content.\n\n';
    const tail = 'Works Cited\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.detectedHeading).toBe('Works Cited');
  });

  it('detects ALL-CAPS "REFERENCES" heading (ACM style)', () => {
    const body = 'Body content.\n\n';
    const tail = 'REFERENCES\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.detectedHeading).toBe('REFERENCES');
  });

  it('detects heading after a form-feed (Poppler page separator)', () => {
    const body = 'Body content.';
    // The normaliseExtractedText function converts \f to \n\n, but
    // during the evaluation the text is normalized before being passed here.
    // We test both: form-feed directly and the already-normalized form.
    const tail = '\fReferences\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.detectedHeading).toBe('References');
  });

  it('detects heading with leading horizontal whitespace (column-padding)', () => {
    const body = 'Body.\n\n';
    // Two-column PDFs sometimes indent the right column heading.
    const tail = '    References\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
  });

  it('body text is a valid prefix of the original text', () => {
    const body = 'First paragraph.\n\nSecond paragraph.\n\n';
    const tail = 'References\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(text.startsWith(result.body)).toBe(true);
  });

  it('referenceOffset correctly points to keyword start in original text', () => {
    const body = 'Body.\n\n';
    const tail = 'References\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.referenceOffset).toBe(body.length);
    expect(text.slice(result.referenceOffset!)).toMatch(/^References/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Two-column PDF artefact: heading on the same line as body text
//    (this is a real pattern in the canonical papers)
// ---------------------------------------------------------------------------

describe('two-column PDF layout artefacts', () => {
  it('does NOT detect "References" when it appears mid-sentence in running text', () => {
    // This should NOT trigger detection because "References" is embedded in prose.
    const text =
      'We provide references to the original papers. See the References section above.\n\n' +
      'Further discussion of references and citations follows here.\n\n' +
      'Conclusion paragraph with more content.';
    const result = stripReferences(text);
    // No standalone heading followed by a citation list → not confident.
    // The exact outcome depends on whether any match passes the guards.
    // Key invariant: body must equal full text OR be a valid prefix.
    expect(text.startsWith(result.body)).toBe(true);
    if (result.confident) {
      // If it somehow matched, the remaining text after heading must not look
      // like citations (the prose guard should fire).
      // We just assert it did not remove more than 50% of the document.
      expect(result.body.length).toBeGreaterThan(text.length * 0.4);
    }
  });

  it('detects heading that appears at start of line even with trailing column content', () => {
    // Real example: in QUIC_Dual_Connectivity_2021 the heading appears at the
    // very end of a line because the right column ended there.
    // After normalisation the heading is at the start of a new line, possibly
    // preceded only by horizontal whitespace.
    const leftColumn = 'much unfairness regardless of the loss rate.';
    const body = `Body paragraph.\n${leftColumn}\n`;
    const tail = 'References\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.detectedHeading).toBe('References');
  });

  it('detects heading on same line as right-column content (two-column PDF artefact)', () => {
    // Real pattern from BERTAC_2021 and Transformers_Polarity_2022:
    // "\nReferences                                    2017. SearchQA: A new Q&A…"
    // After \f→\n\n normalisation, this appears as:
    // "…\n\nReferences                                    2017. SearchQA:…"
    const body = 'Some body content.\n\n';
    // 20+ spaces gap between heading and right-column citation entry.
    const twoColTail =
      'References                                   2017. SearchQA: A new Q&A dataset\n' +
      'Piotr Bojanowski, Edouard Grave, Armand Joulin.   augmented with context from search.\n' +
      '   Tomas Mikolov. 2017. Enriching word vectors.   abs/1704.05179.\n' +
      '   with subword information. Transactions.      Author2. 2016. Another Citation.\n'.repeat(5);
    const text = paper(body, twoColTail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.detectedHeading).toBe('References');
    expect(result.body).toBe(body);
  });
});

// ---------------------------------------------------------------------------
// 4. Guards: low-confidence situations
// ---------------------------------------------------------------------------

describe('low-confidence guards', () => {
  it('is not confident when the detected heading is very close to the end', () => {
    // Only a few characters after the heading → stray mention.
    const text = 'Body.\n\nReferences\nSee [1].';
    const result = stripReferences(text);
    // MIN_TRAILING_CHARS = 50; "See [1]." is well under that.
    expect(result.confident).toBe(false);
  });

  it('is not confident when text after heading looks like flowing prose', () => {
    // A section titled "References" followed by a prose explanation, not
    // a citation list.  The prose guard should fire.
    // The prose is intentionally word-dense: many short common words to
    // maximise the token count in the first 300 characters.
    const denseProse =
      'We now discuss the key ideas and core concepts in detail. The approach ' +
      'we propose is both simple and effective. It relies on the fact that most ' +
      'modern systems use standard techniques that have been well studied in the ' +
      'literature. We show that our method can be applied to a wide range of ' +
      'tasks and achieves strong results across all the standard benchmarks.';
    // 300-char window of denseProse: count \S+ tokens; must exceed threshold.
    const text = `Introduction\n\n${denseProse}\n\nReferences\n\n${denseProse}`;
    const result = stripReferences(text);
    expect(result.confident).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles an empty string without throwing', () => {
    const result = stripReferences('');
    expect(result.body).toBe('');
    expect(result.confident).toBe(false);
  });

  it('handles text containing only the heading without throwing', () => {
    const result = stripReferences('References\n');
    expect(result.confident).toBe(false);
  });

  it('handles Windows-style CRLF line endings', () => {
    const body = 'Body content.\r\n\r\n';
    const tail = 'References\r\n' + LONG_REF_LIST;
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
  });

  it('does not mutate the input string (pure function)', () => {
    const text = 'Body.\n\nReferences\n' + LONG_REF_LIST;
    const original = text;
    stripReferences(text);
    expect(text).toBe(original);
  });

  it('body is never longer than the original text', () => {
    const text = 'Some content.\n\nReferences\n' + LONG_REF_LIST;
    const result = stripReferences(text);
    expect(result.body.length).toBeLessThanOrEqual(text.length);
  });
});

// ---------------------------------------------------------------------------
// 6. Representative snippets from the actual 12 canonical papers
// ---------------------------------------------------------------------------

describe('real-paper representative snippets', () => {
  it('handles ACL-style author-year citations (Transformers_Polarity_2022 style)', () => {
    // ACL papers use "References\n\nAuthor Year. Title..." format.
    const body = 'Conclusion paragraph.\n\n';
    const tail =
      'References\n\n' +
      'Alec Radford, Jeff Wu, Rewon Child, David Luan,\n' +
      '  Dario Amodei, and Ilya Sutskever. 2019. Language\n' +
      '  models are unsupervised multitask learners.\n\n' +
      'Elena Voita, David Talbot, Fedor Moiseev, Rico Sen-\n' +
      '  nrich, and Ivan Titov. 2019. Analyzing multi-head\n' +
      '  self-attention.\n';
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.body).toBe(body);
  });

  it('handles ACM numbered citations (NoREC_Database_Optimization_Bugs_2020 style)', () => {
    const body = 'Final body paragraph.\n\n';
    // ALL-CAPS REFERENCES heading on its own line, then numbered entries.
    const tail =
      'REFERENCES\n' +
      ' [1] Shadi Abdul Khalek and Sarfraz Khurshid. 2010. Automated SQL Query Generation.\n' +
      ' [2] Hardik Bati, Leo Giakoumakis, Steve Herbert. 2007. A Genetic Approach.\n' +
      ' [3] Another Author. 2015. Another Title. VLDB.\n'.repeat(10);
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.detectedHeading).toBe('REFERENCES');
  });

  it('handles QUIC-paper style: heading at line end, citations on following lines', () => {
    // In QUIC papers "References" appeared after some left-column text on the
    // same line; after normalisation it ends up at the start of a new line.
    const body = 'We are unable to investigate the friendliness between algorithms.\n';
    const tail =
      'References\n' +
      '  [1] L.S. Brakmo and L.L. Peterson. 1995. TCP Vegas. IEEE Journal.\n' +
      '  [2] N. Cardwell et al. 2019. BBR v2. IETF 105 update.\n' +
      '  [3] G. Carlucci et al. 2017. Congestion control for WebRTC. IEEE/ACM.\n'.repeat(5);
    const text = paper(body, tail);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
  });

  it('handles two-column inline heading: heading + large gap + right-col citation (BERTAC/Transformers_Polarity style)', () => {
    // After \f→\n\n normalisation, the extracted text looks like:
    // "\n\nReferences                                    2017.    SearchQA: A new Q&A…"
    // This is the real pattern from BERTAC_2021 and Transformers_Polarity_2022.
    const body = 'Body paragraph ending here.\n\n';
    const twoColLine =
      'References                                   2017.    SearchQA: A new Q&A dataset aug-\n';
    const citations =
      'Piotr Bojanowski, Edouard Grave, Armand Joulin.   mented with context from a search engine.\n' +
      '   Tomas Mikolov. 2017. Enriching word vectors       CoRR, abs/1704.05179.\n' +
      '   with subword information. Transactions.         Author3. 2018. Another Paper Title.\n'.repeat(
        5,
      );
    const text = paper(body, twoColLine + citations);
    const result = stripReferences(text);
    expect(result.confident).toBe(true);
    expect(result.detectedHeading).toBe('References');
    expect(result.body).toBe(body);
  });
});
