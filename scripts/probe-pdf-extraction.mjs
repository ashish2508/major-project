/**
 * Diagnostic script: measure raw PDF.js character extraction for QUIC PDFs.
 * Run with: bun scripts/probe-pdf-extraction.mjs
 */
import { readFile } from 'node:fs/promises';

const files = [
  { name: 'QUIC_Delay_Control_2025.pdf', path: '.cache/quic-pdfs/QUIC_Delay_Control_2025.pdf' },
  {
    name: 'QUIC_Dual_Connectivity_2021.pdf',
    path: '.cache/quic-pdfs/QUIC_Dual_Connectivity_2021.pdf',
  },
];

for (const { name, path } of files) {
  console.log(`\n=== ${name} ===`);
  const bytes = new Uint8Array(await readFile(path));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true });
  const pdf = await task.promise;
  console.log(`Pages: ${pdf.numPages}`);

  let fullText = '';
  const pages = [];
  const paragraphBreaks = [];

  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    let previous;
    let part = '';
    paragraphBreaks.push(fullText.length);
    let itemCount = 0;
    let itemsWithText = 0;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      itemCount++;
      if (item.str.trim()) itemsWithText++;
      const y = item.transform[5];
      if (previous && Math.abs(y - previous.y) > Math.max(previous.height, item.height) * 1.6) {
        paragraphBreaks.push(fullText.length + part.length);
      }
      part += item.str + (item.hasEOL ? '\n' : ' ');
      if (item.str.trim()) previous = { y, height: item.height };
    }
    const start = fullText.length;
    fullText += part;
    pages.push({ page: number, start, end: fullText.length });
    if (number < pdf.numPages) fullText += '\n\n';
    console.log(
      `  Page ${number}: ${part.length} chars (${itemCount} items, ${itemsWithText} with text)`,
    );
    page.cleanup();
  }
  await task.destroy();

  console.log(`Total extracted: ${fullText.length} chars`);
  console.log(`Paragraph breaks: ${paragraphBreaks.length}`);
  console.log(`Sample (first 300 chars): ${JSON.stringify(fullText.slice(0, 300))}`);
  console.log(`Sample (chars 10000-10200): ${JSON.stringify(fullText.slice(10000, 10200))}`);
}
