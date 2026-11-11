/**
 * Canonical corpus loader for external evaluation papers.
 *
 * This module loads the 12 canonical research papers from
 * data/external-evaluation/canonical/*.txt and provides them to the analysis
 * pipeline as ExtractedDocument objects.
 *
 * Reference stripping:
 *   stripCanonicalReferences() is applied to every paper before returning.
 *   For the two QUIC papers (QUIC_Delay_Control_2025, QUIC_Dual_Connectivity_2021),
 *   this uses verified PDF-coordinate masks to blank out reference-list characters
 *   while preserving all character offsets in the stripped body text.
 *   For all other papers the standard heuristic stripReferences() fallback inside
 *   stripCanonicalReferences() is used.
 *
 *   IMPORTANT: character offsets in detection results always refer to the
 *   stripped body text, not the original on-disk text.  The UI also displays the
 *   stripped body, so offsets are consistent without any remapping.
 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ExtractedDocument } from '../documents/extract';
import { segmentParagraphs, type Passage } from '../detection/segmentation';
import { stripCanonicalReferences } from '../detection/strip-references';
import { embedTexts, tokenCounter } from '../embeddings/model';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Resolved path to the directory that holds the canonical .txt files. */
export const CANONICAL_CORPUS_DIR = resolve('data/external-evaluation/canonical');

// ---------------------------------------------------------------------------
// Text normalisation (mirrors normalizeExtractedText in
// scripts/external-evaluation-body-only.ts so ingestion is identical)
// ---------------------------------------------------------------------------

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n\n')
    .replace(/[\u0000-\u0008\u000B\u000E-\u001F]/g, ' ');
}

// ---------------------------------------------------------------------------
// Module-level singleton — corpus is loaded at most once per process
// ---------------------------------------------------------------------------

let corpusPromise: Promise<ExtractedDocument[]> | null = null;

async function readCorpusFromDirectory(dir: string): Promise<ExtractedDocument[]> {
  const names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith('.txt')).sort();

  if (names.length === 0)
    throw new Error(`No .txt files found in canonical corpus directory: ${dir}`);

  const docs: ExtractedDocument[] = [];
  for (const name of names) {
    const reference = name.slice(0, -4); // basename without .txt
    let rawText: string;
    try {
      rawText = await readFile(resolve(dir, name), 'utf8');
    } catch (err) {
      throw new Error(
        `Failed to load canonical paper "${name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const normalized = normalizeText(rawText);
    const stripResult = stripCanonicalReferences(reference, normalized);

    docs.push({
      reference,
      title: reference.replaceAll('_', ' '),
      text: stripResult.body,
      format: 'text',
      // TXT files have no PDF page mappings — page offsets are not invented.
      pages: undefined,
      paragraphBreaks: undefined,
    });
  }

  return docs;
}

/**
 * Returns the canonical corpus as ExtractedDocument objects.
 *
 * The list is sorted alphabetically by reference name and cached for the
 * lifetime of the process so the filesystem is read only once when using
 * the default CANONICAL_CORPUS_DIR.
 *
 * @param corpusDir - Optional custom directory path (defaults to CANONICAL_CORPUS_DIR).
 * @throws If the directory contains no .txt files or any file fails to load.
 */
export function loadCanonicalCorpus(
  corpusDir = CANONICAL_CORPUS_DIR,
): Promise<ExtractedDocument[]> {
  if (corpusDir !== CANONICAL_CORPUS_DIR) {
    return readCorpusFromDirectory(corpusDir);
  }
  if (!corpusPromise) {
    corpusPromise = readCorpusFromDirectory(CANONICAL_CORPUS_DIR).catch((err) => {
      // Reset so the next call retries (e.g. after a filesystem fix).
      corpusPromise = null;
      throw err;
    });
  }
  return corpusPromise;
}

/**
 * Resets the in-memory canonical corpus and embedding caches.
 * Intended for test isolation.
 */
export function resetCanonicalCorpusCache(): void {
  corpusPromise = null;
  embeddingCache.clear();
}

// ---------------------------------------------------------------------------
// Phase 4: Embedding cache
//
// Pre-segments and embeds all canonical passages so that subsequent requests
// do not repeat the expensive embedding step.  The cache is keyed by device
// so CPU and DML results are stored independently.
// ---------------------------------------------------------------------------

type EmbeddingCacheEntry = Promise<{ passages: Passage[]; embeddings: number[][] }>;
const embeddingCache = new Map<string, EmbeddingCacheEntry>();

/**
 * Returns pre-segmented passages and their embeddings for the entire canonical
 * corpus.  Results are cached per device; concurrent requests that arrive
 * before the first embedding completes share the same in-flight Promise.
 *
 * @param device - 'cpu' or 'dml' — must match the device used by the analysis.
 */
export function getCanonicalEmbeddings(
  device: 'cpu' | 'dml',
): Promise<{ passages: Passage[]; embeddings: number[][] }> {
  let pending = embeddingCache.get(device);
  if (!pending) {
    pending = (async () => {
      const corpus = await loadCanonicalCorpus();
      const countTokens = await tokenCounter();

      const passages: Passage[] = corpus.flatMap((doc) =>
        segmentParagraphs(doc.text, doc.reference, { countTokens }, doc.paragraphBreaks),
      );

      if (passages.length === 0)
        throw new Error('Canonical corpus produced no passages after segmentation');

      const uniqueTexts = [...new Set(passages.map((p) => p.text))];
      const uniqueVectors = await embedTexts(uniqueTexts, device);
      const vectorByText = new Map(uniqueTexts.map((text, i) => [text, uniqueVectors[i]]));
      const embeddings = passages.map((p) => vectorByText.get(p.text)!);

      return { passages, embeddings };
    })().catch((err) => {
      embeddingCache.delete(device);
      throw err;
    });
    embeddingCache.set(device, pending);
  }
  return pending;
}
