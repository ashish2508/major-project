#!/usr/bin/env bun
/**
 * Diagnostic: compare PDF.js extraction vs canonical .txt files.
 * Run with: bun scripts/diagnose-extraction.mjs
 */
import { readFile } from 'node:fs/promises';

async function main() {
  const pdf1Text = new Uint8Array(await readFile('.cache/quic-pdfs/QUIC_Delay_Control_2025.pdf'));
  const txt1 = await readFile(
    'data/external-evaluation/canonical/QUIC_Delay_Control_2025.txt',
    'utf8',
  );

  const pdf2Bytes = new Uint8Array(
    await readFile('.cache/quic-pdfs/QUIC_Dual_Connectivity_2021.pdf'),
  );
  const txt2 = await readFile(
    'data/external-evaluation/canonical/QUIC_Dual_Connectivity_2021.txt',
    'utf8',
  );

  // Extract with PDF.js to get the actual text
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  console.log('=== QUIC_Delay_Control_2025 ===');
  let pdf1Extracted = '';
  const task1 = pdfjs.getDocument({
    data: pdf1Text,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf1 = await task1.promise;
  for (let n = 1; n <= pdf1.numPages; n++) {
    const page = await pdf1.getPage(n);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item) pdf1Extracted += item.str + (item.hasEOL ? '\n' : ' ');
    }
    if (n < pdf1.numPages) pdf1Extracted += '\n\n';
    page.cleanup();
  }
  await task1.destroy();

  console.log(`PDF.js extraction: ${pdf1Extracted.length} chars`);
  console.log(`Canonical .txt: ${txt1.length} chars`);
  console.log(`Ratio: ${((pdf1Extracted.length / txt1.length) * 100).toFixed(1)}%`);
  console.log(`Loss: ${txt1.length - pdf1Extracted.length} chars`);

  // Sample comparison
  const commonPrefix = Math.min(500, pdf1Extracted.length, txt1.length);
  const pdfStart = pdf1Extracted.slice(0, commonPrefix);
  const txtStart = txt1.slice(0, commonPrefix);
  console.log(`\nPDF first 300 chars:\n${pdfStart.slice(0, 300)}`);
  console.log(`\nTXT first 300 chars:\n${txtStart.slice(0, 300)}`);

  // Check for figure/table indicators
  const pdfFigureCount = (pdf1Extracted.match(/Figure|Table|[Ff]ig\.|[Tt]ab\./g) || []).length;
  const txtFigureCount = (txt1.match(/Figure|Table|[Ff]ig\.|[Tt]ab\./g) || []).length;
  console.log(`\nFigure/Table references in PDF: ${pdfFigureCount}`);
  console.log(`Figure/Table references in TXT: ${txtFigureCount}`);

  console.log('\n=== QUIC_Dual_Connectivity_2021 ===');
  let pdf2Extracted = '';
  const task2 = pdfjs.getDocument({
    data: pdf2Bytes,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf2 = await task2.promise;
  for (let n = 1; n <= pdf2.numPages; n++) {
    const page = await pdf2.getPage(n);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item) pdf2Extracted += item.str + (item.hasEOL ? '\n' : ' ');
    }
    if (n < pdf2.numPages) pdf2Extracted += '\n\n';
    page.cleanup();
  }
  await task2.destroy();

  console.log(`PDF.js extraction: ${pdf2Extracted.length} chars`);
  console.log(`Canonical .txt: ${txt2.length} chars`);
  console.log(`Ratio: ${((pdf2Extracted.length / txt2.length) * 100).toFixed(1)}%`);
  console.log(`Loss: ${txt2.length - pdf2Extracted.length} chars`);

  const pdfFigures2 = (pdf2Extracted.match(/Figure|Table|[Ff]ig\.|[Tt]ab\./g) || []).length;
  const txtFigures2 = (txt2.match(/Figure|Table|[Ff]ig\.|[Tt]ab\./g) || []).length;
  console.log(`\nFigure/Table references in PDF: ${pdfFigures2}`);
  console.log(`Figure/Table references in TXT: ${txtFigures2}`);
}

main().catch((e) => console.error(e));
