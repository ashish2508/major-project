#!/usr/bin/env bun
/**
 * Investigate WHERE the text is being lost in PDF extraction.
 * Check for: multi-column layouts, invisible text, embedded fonts, rotation.
 */
import { readFile } from 'node:fs/promises';

async function main() {
  const pdfBytes = new Uint8Array(
    await readFile('.cache/quic-pdfs/QUIC_Dual_Connectivity_2021.pdf'),
  );
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const task = pdfjs.getDocument({
    data: pdfBytes,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await task.promise;

  console.log(`Total pages: ${pdf.numPages}`);
  console.log('\nAnalyzing text extraction per page:\n');

  let totalChars = 0;
  let totalHiddenText = 0;
  let multiColumnPages = 0;

  for (let pageNum = 1; pageNum <= Math.min(5, pdf.numPages); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Count visible text items
    let visibleChars = 0;
    let visibleItems = 0;
    const xPositions = new Set();

    for (const item of content.items) {
      if (!('str' in item)) continue;
      visibleItems++;
      visibleChars += item.str.length;
      // Track unique X positions to detect multi-column layout
      if (item.transform[4]) {
        // X position is in transform[4]
        xPositions.add(Math.round(item.transform[4]));
      }
    }

    // Count raw text content (including invisible text)
    const rawText = await page.getTextContent({ includeMarkedContent: true });
    let rawChars = 0;
    for (const item of rawText.items) {
      if ('str' in item) rawChars += item.str.length;
    }

    const hiddenChars = rawChars - visibleChars;
    totalChars += visibleChars;
    totalHiddenText += hiddenChars;

    const cols = xPositions.size;
    if (cols > 3) multiColumnPages++;

    console.log(`Page ${pageNum}:`);
    console.log(`  Visible: ${visibleChars} chars (${visibleItems} items)`);
    console.log(`  Hidden/Invisible: ${hiddenChars} chars`);
    console.log(`  Unique X positions (columns): ${cols}`);
    console.log(
      `  Text ratio: ${((visibleChars / (visibleChars + hiddenChars)) * 100).toFixed(1)}%`,
    );

    page.cleanup();
  }

  await task.destroy();

  console.log(`\n=== Summary ===`);
  console.log(`Multi-column pages (5 samples): ${multiColumnPages}`);
  console.log(`Total hidden text (5 pages): ${totalHiddenText} chars`);
  console.log(`Hidden % of visible: ${((totalHiddenText / totalChars) * 100).toFixed(1)}%`);
  console.log(
    `\nConclusion: If ${((totalHiddenText / totalChars) * 100).toFixed(1)}% of text is hidden in first 5 pages,`,
  );
  console.log(
    `extrapolating suggests ~${Math.round((totalHiddenText / totalChars) * 136401)} chars are invisible across entire document.`,
  );
}

main().catch((e) => console.error(e));
