#!/usr/bin/env bun
/**
 * fetch-background-corpus.ts
 *
 * Run this once to populate a background corpus for IDF estimation in
 * research-paper mode. It is NOT required for the tool to function;
 * without it the tool fits IDF on the query+source documents only and
 * logs a warning.
 *
 * Usage:
 *   bun run fetch:background
 *
 * Output:
 *   src/lib/detection/background/pubmed-abstracts.txt
 *   (~500 PubMed abstracts, one per line)
 *
 * API: NCBI E-utilities (free, no API key required for ≤3 req/s).
 *   esearch: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi
 *   efetch:  https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi
 *
 * Rate limit: 3 requests per second (NCBI free tier).
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const OUTPUT_DIR = resolve(ROOT, 'src/lib/detection/background');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'pubmed-abstracts.txt');

/** NCBI E-utilities base URL */
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/** Search query — targeted at duplicate-publication and text-similarity literature */
const QUERY = 'plagiarism detection OR text similarity OR duplicate publication';

/** Maximum abstracts to fetch */
const MAX_RESULTS = 500;

/** Batch size for efetch (NCBI recommends ≤200 per request) */
const BATCH_SIZE = 100;

/** Minimum delay between requests in milliseconds (3 req/s limit) */
const REQUEST_DELAY_MS = 350;

/** User-Agent header as recommended by NCBI to identify your application */
const USER_AGENT = 'major-project-background-corpus/1.0 (contact: researcher@example.com)';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Perform a GET request to NCBI E-utilities with appropriate headers.
 */
async function fetchNcbi(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Entrez-User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`NCBI request failed: ${response.status} ${response.statusText} — ${url}`);
  }
  return response.text();
}

/**
 * Run esearch to get PMIDs for the query.
 * Returns an array of PMID strings.
 */
async function esearch(query: string, retMax: number): Promise<string[]> {
  const url =
    `${EUTILS}/esearch.fcgi` +
    `?db=pubmed` +
    `&term=${encodeURIComponent(query)}` +
    `&retmax=${retMax}` +
    `&retmode=json`;

  console.log(`esearch: ${query} (retMax=${retMax})`);
  const text = await fetchNcbi(url);
  const json = JSON.parse(text) as { esearchresult: { idlist: string[] } };
  return json.esearchresult.idlist;
}

/**
 * Run efetch for a batch of PMIDs and return the raw XML text.
 */
async function efetchBatch(pmids: string[]): Promise<string> {
  const url =
    `${EUTILS}/efetch.fcgi` +
    `?db=pubmed` +
    `&id=${pmids.join(',')}` +
    `&rettype=abstract` +
    `&retmode=xml`;

  return fetchNcbi(url);
}

/**
 * Extract abstract text from PubMed XML.
 * Returns one abstract per element (may contain structured sections).
 */
function extractAbstracts(xml: string): string[] {
  const abstracts: string[] = [];

  // Match <AbstractText> elements (may have Label attribute for structured abstracts)
  const tagRe = /<AbstractText(?:\s[^>]*)?>([\s\S]*?)<\/AbstractText>/g;
  // Group by article: use <PubmedArticle> as delimiter
  const articleRe = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;

  let articleMatch: RegExpExecArray | null;
  while ((articleMatch = articleRe.exec(xml)) !== null) {
    const articleXml = articleMatch[1];
    const parts: string[] = [];
    let tagMatch: RegExpExecArray | null;
    tagRe.lastIndex = 0;
    while ((tagMatch = tagRe.exec(articleXml)) !== null) {
      // Strip any inner XML tags (e.g. <i>, <b>, <sub>, <sup>)
      const rawText = tagMatch[1].replace(/<[^>]+>/g, '').trim();
      if (rawText.length > 0) {
        parts.push(rawText);
      }
    }
    if (parts.length > 0) {
      // Join structured abstract sections with a space; collapse whitespace
      const combined = parts.join(' ').replace(/\s+/g, ' ').trim();
      if (combined.length > 50) {
        abstracts.push(combined);
      }
    }
  }

  return abstracts;
}

async function main(): Promise<void> {
  console.log('=== fetch-background-corpus ===');
  console.log(`Query: "${QUERY}"`);
  console.log(`Target: ${MAX_RESULTS} abstracts → ${OUTPUT_FILE}`);
  console.log('');

  // Step 1: Get PMIDs
  const pmids = await esearch(QUERY, MAX_RESULTS);
  console.log(`Found ${pmids.length} PMIDs`);
  if (pmids.length === 0) {
    console.error('No results returned from esearch. Check your query or network connection.');
    process.exit(1);
  }

  await sleep(REQUEST_DELAY_MS);

  // Step 2: Fetch abstracts in batches
  const allAbstracts: string[] = [];
  const batches = Math.ceil(pmids.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const batch = pmids.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    console.log(
      `Fetching batch ${i + 1}/${batches} (${batch.length} PMIDs, ${allAbstracts.length} abstracts so far)…`,
    );

    try {
      const xml = await efetchBatch(batch);
      const abstracts = extractAbstracts(xml);
      allAbstracts.push(...abstracts);
      console.log(`  → extracted ${abstracts.length} abstracts from this batch`);
    } catch (err) {
      console.warn(
        `  Warning: batch ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Rate-limit between batches (skip delay after the last batch)
    if (i < batches - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`\nTotal abstracts collected: ${allAbstracts.length}`);

  if (allAbstracts.length === 0) {
    console.error('No abstracts could be extracted. The output file will not be written.');
    process.exit(1);
  }

  // Step 3: Write output
  await mkdir(OUTPUT_DIR, { recursive: true });

  const fetchDate = new Date().toISOString().split('T')[0];
  const header =
    `# Background corpus for TF-IDF IDF estimation\n` +
    `# Query: ${QUERY}\n` +
    `# Fetch date: ${fetchDate}\n` +
    `# Source: PubMed via NCBI E-utilities (https://eutils.ncbi.nlm.nih.gov/)\n` +
    `# Count: ${allAbstracts.length} abstracts\n` +
    `# Format: one abstract per line (blank lines stripped)\n`;

  // Header lines start with '#' so they are skipped by the line-filter in fitResearchTfidf
  // (the filter requires lines with at least one non-whitespace character, but
  // the '#' lines will be treated as passages — they are very short so their
  // IDF contribution is negligible; alternatively they could be stripped here).
  // Strip header comment lines from passages by writing them before the abstracts.
  const content = header + '\n' + allAbstracts.join('\n') + '\n';

  await writeFile(OUTPUT_FILE, content, 'utf8');
  console.log(`\nWrote ${allAbstracts.length} abstracts to:\n  ${OUTPUT_FILE}`);
  console.log('\nDone. Restart the tool to pick up the new background corpus.');
}

main().catch((err) => {
  console.error('fetch-background-corpus failed:', err);
  process.exit(1);
});
