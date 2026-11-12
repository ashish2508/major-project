#!/usr/bin/env bun
/**
 * generate-controls.ts
 *
 * Extracts text from liu-2020-e21808.pdf and writes programmatic control
 * fixtures to tests/fixtures/papers/:
 *
 *   c1-exact-copy.txt          — verbatim copy of the extracted text
 *   c2-synonym-replace.txt     — 10 % synonym replacement (1 per 10-word window)
 *   c3-sentence-shuffle.txt    — sentence-order shuffled within each paragraph (seed 42)
 *   c4-light-auto-paraphrase.txt — ~30 % synonym replacement (every 3rd replaceable word)
 *   c4-medium.txt              — placeholder for hand-paraphrase
 *   c4-heavy.txt               — placeholder for paragraph-level rewrite
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(__dirname, '..');
const FIXTURES = join(ROOT, 'tests/fixtures/papers');
const SOURCE_PDF = join(FIXTURES, 'liu-2020-e21808.pdf');

// ---------------------------------------------------------------------------
// Synonym map (fixed, deterministic)
// ---------------------------------------------------------------------------
const SYNONYM_MAP: Record<string, string> = {
  study: 'investigation',
  patients: 'subjects',
  treatment: 'therapy',
  significant: 'notable',
  results: 'findings',
  analysis: 'examination',
  data: 'information',
  clinical: 'medical',
  outcomes: 'endpoints',
  infection: 'disease',
  children: 'pediatric patients',
  compared: 'contrasted',
  reported: 'documented',
  showed: 'demonstrated',
  used: 'employed',
  groups: 'cohorts',
  effect: 'impact',
  method: 'approach',
  evidence: 'proof',
  review: 'assessment',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Preserve the capitalisation of the original first letter on the replacement. */
function preserveCase(original: string, replacement: string): string {
  if (original.length > 0 && original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Tokenise text into an array of segments, each tagged as a "word" or
 * "non-word" (spaces, punctuation, numbers). This lets us rebuild the string
 * character-for-character while still operating on word positions.
 */
interface Segment {
  kind: 'word' | 'non-word';
  text: string;
}

function tokeniseToSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  // Split on word boundaries while keeping the separators
  const parts = text.split(/(\b[A-Za-z]+\b)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^[A-Za-z]+$/.test(part)) {
      segments.push({ kind: 'word', text: part });
    } else {
      segments.push({ kind: 'non-word', text: part });
    }
  }
  return segments;
}

/**
 * C2: replace exactly 1 in every 10 words scanning left-to-right.
 * Pick the FIRST replaceable word in each window of 10 words.
 */
function c2SynonymReplace(text: string): string {
  const segments = tokeniseToSegments(text);
  let wordIndex = 0;
  // Track which word position (mod 10) we are in and whether we already
  // replaced in this window.
  let windowStart = 0; // word index of the start of the current 10-word window
  let replacedInWindow = false;

  for (const seg of segments) {
    if (seg.kind !== 'word') continue;
    const posInWindow = wordIndex - windowStart;

    // Start a new window every 10 words
    if (posInWindow >= 10) {
      windowStart = wordIndex;
      replacedInWindow = false;
    }

    if (!replacedInWindow) {
      const lower = seg.text.toLowerCase();
      const replacement = SYNONYM_MAP[lower];
      if (replacement !== undefined) {
        seg.text = preserveCase(seg.text, replacement);
        replacedInWindow = true;
      }
    }

    wordIndex++;
  }

  return segments.map((s) => s.text).join('');
}

/**
 * Seeded PRNG (xorshift32) — returns a function that produces floats in [0, 1).
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

/** Fisher-Yates shuffle with a seeded RNG. */
function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split text into sentences (simple heuristic: split on '. ', '! ', '? '
 * followed by an uppercase letter or end-of-string).
 */
function splitSentences(text: string): string[] {
  // Split but keep the delimiter attached to the preceding sentence
  const result: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const match = remaining.match(/[.!?]\s+(?=[A-Z])/);
    if (!match || match.index === undefined) {
      result.push(remaining);
      break;
    }
    const end = match.index + match[0].length;
    result.push(remaining.slice(0, end).trimEnd());
    remaining = remaining.slice(end);
  }
  return result.filter((s) => s.trim().length > 0);
}

/**
 * C3: sentence-order shuffled within each paragraph. Paragraph boundaries =
 * double-newlines. Seed 42.
 */
function c3SentenceShuffle(text: string): string {
  const rng = makeRng(42);
  const paragraphs = text.split(/\n\n+/);
  const shuffled = paragraphs.map((para) => {
    const sentences = splitSentences(para);
    if (sentences.length <= 1) return para;
    return shuffleArray(sentences, rng).join(' ');
  });
  return shuffled.join('\n\n');
}

/**
 * C4-light: replace every 3rd replaceable word (deterministic, seed 42).
 * Targets approximately 30 % of replaceable words.
 */
function c4LightAutoParaphrase(text: string): string {
  const rng = makeRng(42);
  // We don't actually need the RNG for deterministic "every 3rd" selection,
  // but we use the seed to shuffle which occurrence index triggers replacement
  // (we simply count replaceable word encounters and replace on 1-indexed 3n).
  void rng; // keep reference in case we extend later

  const segments = tokeniseToSegments(text);
  let replaceableCount = 0;

  for (const seg of segments) {
    if (seg.kind !== 'word') continue;
    const lower = seg.text.toLowerCase();
    if (SYNONYM_MAP[lower] !== undefined) {
      replaceableCount++;
      if (replaceableCount % 3 === 0) {
        seg.text = preserveCase(seg.text, SYNONYM_MAP[lower]);
      }
    }
  }

  return segments.map((s) => s.text).join('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(SOURCE_PDF)) {
    console.error(`ERROR: Source PDF not found: ${SOURCE_PDF}`);
    process.exit(1);
  }

  console.log(`Extracting text from ${SOURCE_PDF} …`);

  // Use pdfjs-dist directly (same logic as src/lib/documents/extract.ts)
  const bytes = new Uint8Array(await readFile(SOURCE_PDF));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true });
  let extractedText = '';
  try {
    const pdf = await task.promise;
    console.log(`  PDF has ${pdf.numPages} pages`);
    const paragraphBreaks: number[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let previous: { y: number; height: number } | undefined;
      let part = '';
      paragraphBreaks.push(extractedText.length);
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform[5];
        if (previous && Math.abs(y - previous.y) > Math.max(previous.height, item.height) * 1.6) {
          paragraphBreaks.push(extractedText.length + part.length);
        }
        part += item.str.replace(/\0/g, ' ') + (item.hasEOL ? '\n' : ' ');
        if (item.str.trim()) previous = { y, height: item.height };
      }
      extractedText += part;
      if (n < pdf.numPages) extractedText += '\n\n';
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }

  console.log(`  Extracted ${extractedText.length} characters`);

  await mkdir(FIXTURES, { recursive: true });

  // --- C1: exact copy ---
  const c1 = extractedText;
  await writeFile(join(FIXTURES, 'c1-exact-copy.txt'), c1, 'utf8');
  console.log('  Wrote c1-exact-copy.txt');

  // --- C2: 10 % synonym replacement ---
  const synonymMapComment =
    `// Synonym map used for C2 and C4-light controls:\n` +
    `// ${JSON.stringify(SYNONYM_MAP)}\n` +
    `//\n` +
    `// C2 rule: replace exactly 1 in every 10 words scanning left-to-right;\n` +
    `// pick the first replaceable word in each window. Case of first letter preserved.\n\n`;
  const c2 = c2SynonymReplace(extractedText);
  await writeFile(join(FIXTURES, 'c2-synonym-replace.txt'), synonymMapComment + c2, 'utf8');
  console.log('  Wrote c2-synonym-replace.txt');

  // --- C3: sentence-order shuffle within paragraphs, seed 42 ---
  const c3Header =
    `// C3 control: sentence-order shuffled within each paragraph.\n` +
    `// Paragraph boundaries = double-newlines. Shuffle seed = 42.\n\n`;
  const c3 = c3SentenceShuffle(extractedText);
  await writeFile(join(FIXTURES, 'c3-sentence-shuffle.txt'), c3Header + c3, 'utf8');
  console.log('  Wrote c3-sentence-shuffle.txt');

  // --- C4-light: ~30 % synonym replacement ---
  const c4LightHeader =
    `// C4-light control: automated paraphrase — ~30 % synonym replacement.\n` +
    `// Every 3rd replaceable word is replaced. Deterministic, seed 42.\n` +
    `// Synonym map: ${JSON.stringify(SYNONYM_MAP)}\n\n`;
  const c4Light = c4LightAutoParaphrase(extractedText);
  await writeFile(join(FIXTURES, 'c4-light-auto-paraphrase.txt'), c4LightHeader + c4Light, 'utf8');
  console.log('  Wrote c4-light-auto-paraphrase.txt');

  // --- C4-medium: placeholder ---
  const c4Medium =
    `PLACEHOLDER: Hand-paraphrase required.\n` +
    `C4-medium should rewrite sentences preserving meaning but changing structure.\n` +
    `Base source: liu-2020-e21808.pdf\n`;
  await writeFile(join(FIXTURES, 'c4-medium.txt'), c4Medium, 'utf8');
  console.log('  Wrote c4-medium.txt (placeholder)');

  // --- C4-heavy: placeholder ---
  const c4Heavy =
    `PLACEHOLDER: Hand-paraphrase required.\n` +
    `C4-heavy should rephrase at paragraph level.\n` +
    `Base source: liu-2020-e21808.pdf\n`;
  await writeFile(join(FIXTURES, 'c4-heavy.txt'), c4Heavy, 'utf8');
  console.log('  Wrote c4-heavy.txt (placeholder)');

  console.log('\nAll control files written successfully.');
}

main().catch((e) => {
  console.error('generate-controls failed:', e);
  process.exit(1);
});
