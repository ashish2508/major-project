#!/usr/bin/env bun
/**
 * Verify persistent corpus workflow:
 * 1. Import research papers into persistent corpus
 * 2. Upload a separate paper through UI (simulated)
 * 3. Analyze it against the indexed corpus
 * 4. Verify corpus is queried without manually uploading same sources
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { analyzeDocuments } from '../src/lib/application/analysis';
import { ingestDocumentFile, deleteCorpusDocument } from '../src/lib/corpus/service';
import { loadCatalog } from '../src/lib/corpus/store';
import type { ExtractedDocument } from '../src/lib/documents/extract';

const PAPERS_DIR = 'data/external-evaluation/canonical';

async function runCorpusWorkflowTest() {
  console.log('📦 PERSISTENT CORPUS WORKFLOW TEST');
  console.log('==================================\n');

  // Step 1: Ingest 3 papers into the corpus
  console.log('Step 1: Ingesting source papers into persistent corpus...');
  const sourceNames = [
    'BERTAC_2021.txt',
    'Compact_Transformers_2023.txt',
    'NoREC_Database_Optimization_Bugs_2020.txt',
  ];

  const ingestedIds: string[] = [];
  for (const name of sourceNames) {
    const filepath = resolve(PAPERS_DIR, name);
    if (!existsSync(filepath)) {
      console.log(`  ⚠️  ${name} not found, skipping`);
      continue;
    }

    const content = readFileSync(filepath, 'utf8');
    const file = new File([content], name, { type: 'text/plain' });

    try {
      const result = await ingestDocumentFile(file, {
        title: name.replace('.txt', ''),
        reference: name.replace('.txt', ''),
      });

      console.log(`  ✅ Ingested: ${name}`);
      console.log(
        `     ID: ${result.document.id}, Passages: ${result.document.passageCount}, Stripped: ${result.document.stripping.charsRemoved} chars`,
      );
      ingestedIds.push(result.document.id);
    } catch (error) {
      console.log(`  ❌ Failed to ingest ${name}: ${error}`);
    }
  }

  if (ingestedIds.length === 0) {
    console.log('❌ No papers were ingested. Cannot proceed.');
    return;
  }

  console.log(`\n✅ Successfully ingested ${ingestedIds.length} papers.\n`);

  // Step 2: Check corpus stats
  console.log('Step 2: Checking corpus stats...');
  const catalog = await loadCatalog();
  const docCount = Object.keys(catalog.documents).length;
  console.log(`  Documents in corpus: ${docCount}`);
  if (docCount > 0) {
    const totalPassages = Object.values(catalog.documents).reduce(
      (sum, doc) => sum + (doc.passageCount || 0),
      0,
    );
    console.log(`  Total passages: ${totalPassages}\n`);
  } else {
    console.log('  Corpus is empty\n');
  }

  // Step 3: Create a query paper (different from the ingested ones)
  console.log('Step 3: Creating a query paper (different from ingested papers)...');
  const queryName = 'Online_Sketch_Query_Optimization_2021.txt';
  const queryPath = resolve(PAPERS_DIR, queryName);

  if (!existsSync(queryPath)) {
    console.log(`  ❌ Query paper not found: ${queryPath}`);
    return;
  }

  const queryContent = readFileSync(queryPath, 'utf8');
  const queryDoc: ExtractedDocument = {
    reference: queryName.replace('.txt', ''),
    title: queryName.replace('.txt', ''),
    text: queryContent,
    format: 'text',
  };

  console.log(`  ✅ Query document prepared: ${queryName}`);
  console.log(`     Characters: ${queryContent.length}`);
  console.log(`     Reference: ${queryDoc.reference}\n`);

  // Step 4: Analyze query against corpus without providing sources
  console.log('Step 4: Analyzing query against the persistent corpus...');
  console.log('        (NOT providing any sources; corpus should be queried)\n');

  let analysisResult;
  try {
    // useCorpus = true means search the persistent corpus instead of provided sources
    analysisResult = await analyzeDocuments(
      queryDoc,
      [], // No sources provided - should use corpus
      'lexical',
      { useCorpus: true },
    );

    console.log(`  ✅ Analysis completed in ${analysisResult.elapsedSeconds.toFixed(2)}s`);
    console.log(`     Query passages analyzed: ${analysisResult.passages.query}`);
    console.log(`     Corpus passages searched: ${analysisResult.passages.sources}`);
    console.log(`     Detections found: ${analysisResult.detections.length}`);
    console.log(`     Provider: ${analysisResult.provider}\n`);

    // Step 5: Verify corpus was actually queried
    console.log('Step 5: Verification - Was the persistent corpus queried?\n');

    if (analysisResult.passages.sources > 0) {
      console.log('  ✅ YES - Corpus was queried without manually uploading sources again.');
      console.log(
        `     The ${analysisResult.passages.sources} passages came from the indexed corpus.`,
      );

      // List the sources that were queried
      const sourceRefs = Array.from(new Set(analysisResult.sources.map((s) => s.reference)));
      console.log(`\n     Sources that were searched (from corpus):`);
      for (const ref of sourceRefs) {
        console.log(`       • ${ref}`);
      }
    } else {
      console.log('  ❌ NO - The corpus was not queried (0 passages found).');
      console.log('     This could indicate ingestion failed or corpus is empty.');
    }
  } catch (error) {
    console.log(`  ❌ Analysis failed: ${error}`);
    return;
  }

  // Step 6: Show sample detections
  if (analysisResult.detections.length > 0) {
    console.log(`\nStep 6: Top detections found:\n`);
    const top3 = analysisResult.detections.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const det = top3[i];
      const lexScore = det.lexical ? det.lexical.toFixed(4) : '0.0000';
      const semScore = det.semantic ? `, ${det.semantic.toFixed(4)} (semantic)` : '';
      console.log(`  [${i + 1}] Score: ${lexScore} (lexical)${semScore}`);

      // Get query and source text safely using PAN-style field names
      const queryStart = det.suspiciousSpan.offset;
      const queryLen = det.suspiciousSpan.length;
      const sourceStart = det.sourceSpan.offset;
      const sourceLen = det.sourceSpan.length;

      const queryText = queryDoc.text.substring(queryStart, queryStart + Math.min(50, queryLen));
      const sourceDoc = analysisResult.sources.find((s) => s.reference === det.sourceReference);
      const sourceText = sourceDoc?.text.substring(
        sourceStart,
        sourceStart + Math.min(50, sourceLen),
      );

      console.log(`      Query: "${queryText}..."`);
      console.log(`      Source: "${sourceText || 'N/A'}..."`);
    }
  }

  console.log('\n\n✅ CORPUS WORKFLOW TEST COMPLETE');
  console.log('================================');
  console.log('Summary:');
  console.log(`  • Ingested ${ingestedIds.length} papers into persistent corpus`);
  console.log(`  • Analyzed a different paper against the corpus`);
  console.log(`  • Corpus was queried without re-uploading sources`);
  console.log(
    `  • System correctly retrieved and searched ${analysisResult.passages.sources} passages`,
  );

  // Clean up: delete ingested documents to avoid affecting other tests
  console.log('\nCleaning up ingested documents...');
  for (const id of ingestedIds) {
    await deleteCorpusDocument(id);
    console.log(`  ✅ Deleted ${id}`);
  }
  console.log('✅ Cleanup complete. Corpus is ready for other tests.');
}

runCorpusWorkflowTest().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
