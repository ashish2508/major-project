#!/usr/bin/env bun
/**
 * Compare PDF.js extraction with canonical text sources
 * to understand missing content in QUIC papers
 */
import { readFileSync, existsSync } from 'fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

interface ExtractionAnalysis {
  filename: string;
  pdfPath: string;
  canonicalPath: string;
  pdfExtractedLength: number;
  canonicalLength: number;
  percentageMissing: number;
  observations: string[];
}

async function extractPDFWithPdfjs(pdfPath: string): Promise<string> {
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  const bytes = new Uint8Array(readFileSync(pdfPath));
  const task = getDocument({
    data: bytes,
    useSystemFonts: true,
    disableFontFace: true,
  });

  try {
    const pdf = await task.promise;
    let text = '';
    const pageTexts: string[] = [];

    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();

      let pageText = '';
      let previous: { y: number; height: number } | undefined;

      for (const item of content.items) {
        if (!('str' in item)) continue;

        const y = item.transform[5];
        if (previous && Math.abs(y - previous.y) > Math.max(previous.height, item.height) * 1.6) {
          pageText += '\n';
        }

        pageText += item.str + (item.hasEOL ? '\n' : ' ');

        if (item.str.trim()) {
          previous = { y, height: item.height };
        }
      }

      pageTexts.push(pageText);
      text += pageText;
      if (number < pdf.numPages) text += '\n\n';

      page.cleanup();
    }

    return text;
  } finally {
    await task.destroy();
  }
}

async function analyzeExtractionDifference(
  filename: string,
  pdfPath: string,
  canonicalPath: string,
): Promise<ExtractionAnalysis> {
  const observations: string[] = [];

  if (!existsSync(canonicalPath)) {
    throw new Error(`Canonical text file not found: ${canonicalPath}`);
  }

  console.log(`\n📄 Analyzing ${filename}...`);

  // Extract from PDF
  console.log(`  Extracting from PDF...`);
  const pdfText = await extractPDFWithPdfjs(pdfPath);
  console.log(`  ✓ PDF extraction: ${pdfText.length} characters`);

  // Read canonical
  const canonicalText = readFileSync(canonicalPath, 'utf8');
  console.log(`  ✓ Canonical text: ${canonicalText.length} characters`);

  const pdfExtractedLength = pdfText.length;
  const canonicalLength = canonicalText.length;
  const missing = canonicalLength - pdfExtractedLength;
  const percentageMissing = (missing / canonicalLength) * 100;

  console.log(`  📊 Difference: ${missing} characters (${percentageMissing.toFixed(1)}% missing)`);

  // Analyze type of discrepancy
  if (percentageMissing > 50) {
    observations.push('CRITICAL: More than 50% of text is missing from PDF extraction');
  } else if (percentageMissing > 20) {
    observations.push('WARNING: More than 20% of text is missing from PDF extraction');
  }

  // Check for common patterns
  const pdfLines = pdfText.split('\n').length;
  const canonicalLines = canonicalText.split('\n').length;
  if (Math.abs(pdfLines - canonicalLines) > 50) {
    observations.push(
      `Line count difference: PDF has ${pdfLines} lines, canonical has ${canonicalLines}`,
    );
  }

  // Check for specific sections
  const hasAbstract = canonicalText.toLowerCase().includes('abstract');
  const pdfHasAbstract = pdfText.toLowerCase().includes('abstract');
  if (hasAbstract && !pdfHasAbstract) {
    observations.push('⚠️  Abstract section missing from PDF extraction');
  }

  const hasReferences = canonicalText.toLowerCase().includes('references');
  const pdfHasReferences = pdfText.toLowerCase().includes('references');
  if (hasReferences && !pdfHasReferences) {
    observations.push('⚠️  References section missing from PDF extraction');
  }

  const hasAppendix = canonicalText.toLowerCase().includes('appendix');
  const pdfHasAppendix = pdfText.toLowerCase().includes('appendix');
  if (hasAppendix && !pdfHasAppendix) {
    observations.push('⚠️  Appendix section missing from PDF extraction');
  }

  // Check for normalization vs. missing content
  const pdfNoWhitespace = pdfText.replace(/\s+/g, '');
  const canonicalNoWhitespace = canonicalText.replace(/\s+/g, '');

  if (pdfNoWhitespace.length / canonicalNoWhitespace.length > 0.95) {
    observations.push(
      '✓ Most character content is present (after whitespace normalization); discrepancy is likely whitespace/formatting',
    );
  } else if (pdfNoWhitespace.length / canonicalNoWhitespace.length > 0.8) {
    observations.push(
      'Moderate content difference remains after whitespace normalization; likely layout or column reconstruction',
    );
  } else {
    observations.push(
      'Significant content missing even after whitespace normalization; likely missing sections or columns',
    );
  }

  // Sample first difference
  const minLen = Math.min(pdfText.length, canonicalText.length);
  let firstDiffPos = -1;
  for (let i = 0; i < minLen; i++) {
    if (pdfText[i] !== canonicalText[i]) {
      firstDiffPos = i;
      break;
    }
  }

  if (firstDiffPos >= 0) {
    const context = 100;
    const start = Math.max(0, firstDiffPos - context);
    const end = Math.min(minLen, firstDiffPos + context);
    const pdfContext = pdfText.substring(start, end);
    const canonicalContext = canonicalText.substring(start, end);

    observations.push(`First difference at position ${firstDiffPos}:`);
    observations.push(`  PDF: "${pdfContext.replace(/\n/g, '\\n').substring(0, 80)}..."`);
    observations.push(
      `  Canonical: "${canonicalContext.replace(/\n/g, '\\n').substring(0, 80)}..."`,
    );
  }

  return {
    filename,
    pdfPath,
    canonicalPath,
    pdfExtractedLength,
    canonicalLength,
    percentageMissing,
    observations,
  };
}

async function main() {
  const papers = [
    {
      filename: 'QUIC_Delay_Control_2025',
      pdfPath: '.cache/quic-pdfs/QUIC_Delay_Control_2025.pdf',
      canonicalPath: 'data/external-evaluation/canonical/QUIC_Delay_Control_2025.txt',
    },
    {
      filename: 'QUIC_Dual_Connectivity_2021',
      pdfPath: '.cache/quic-pdfs/QUIC_Dual_Connectivity_2021.pdf',
      canonicalPath: 'data/external-evaluation/canonical/QUIC_Dual_Connectivity_2021.txt',
    },
  ];

  console.log('🔍 PDF Extraction Analysis');
  console.log('==========================\n');

  const results: ExtractionAnalysis[] = [];

  for (const paper of papers) {
    try {
      const analysis = await analyzeExtractionDifference(
        paper.filename,
        paper.pdfPath,
        paper.canonicalPath,
      );
      results.push(analysis);

      console.log(`\n📋 Analysis for ${paper.filename}:`);
      for (const obs of analysis.observations) {
        console.log(`  ${obs}`);
      }
    } catch (error) {
      console.error(`❌ Error analyzing ${paper.filename}:`, error);
    }
  }

  // Summary
  console.log('\n\n📊 SUMMARY');
  console.log('==========');
  for (const result of results) {
    console.log(
      `${result.filename}: ${result.pdfExtractedLength} / ${result.canonicalLength} chars (${(100 - result.percentageMissing).toFixed(1)}% extracted)`,
    );
  }

  // Save results
  const reportPath = 'reports/implementation/extraction-analysis.json';
  const report = {
    timestamp: new Date().toISOString(),
    method: 'PDF.js extraction vs canonical text sources',
    results,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n✅ Full analysis saved to ${reportPath}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
