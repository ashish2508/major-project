#!/usr/bin/env bun
import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function testExtract() {
  const bytes = new Uint8Array(readFileSync('.cache/quic-pdfs/QUIC_Delay_Control_2025.pdf'));
  const task = getDocument({
    data: bytes,
    useSystemFonts: true,
    disableFontFace: true,
  });

  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();

    console.log('First 20 items from page 1:');
    for (let i = 0; i < Math.min(20, content.items.length); i++) {
      const item = content.items[i];
      if ('str' in item) {
        console.log(`  [${i}] "${item.str.substring(0, 30)}" @ y=${item.transform[5].toFixed(1)}`);
      }
    }

    console.log('\nText extraction comparison:');
    let extracted = '';
    for (const item of content.items) {
      if ('str' in item) {
        extracted += item.str + (item.hasEOL ? '\n' : ' ');
      }
    }
    console.log(`First 200 chars: ${extracted.substring(0, 200)}`);

    page.cleanup();
  } finally {
    await task.destroy();
  }
}

testExtract();
