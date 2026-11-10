// Offline tokenizer-only exploration; does not load model weights or run inference.
import { AutoTokenizer, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
env.allowRemoteModels = false;
const result = JSON.parse(readFileSync('reports/pan-pc-11/results.json', 'utf8'));
const modelDir = resolve('.cache/transformers/onnx-community/all-MiniLM-L6-v2-ONNX');
const tokenizer = await AutoTokenizer.from_pretrained(modelDir, { local_files_only: true });
const examples = [];
for (const [category, e] of Object.entries(result.examples)) {
  const a = e.annotation;
  const path = resolve(result.root, 'external-detection-corpus', e.xml.replace(/\.xml$/, '.txt'));
  const raw = readFileSync(path).toString('utf8');
  const content = raw.replace(/^\uFEFF/, '');
  const passage = content.slice(
    Number(a.this_offset),
    Number(a.this_offset) + Number(a.this_length),
  );
  const encoded = tokenizer(passage, { truncation: false, padding: false });
  examples.push({
    category,
    reference: a.suspicious,
    offset: Number(a.this_offset),
    characters: passage.length,
    tokensIncludingSpecial: encoded.input_ids.data.length,
  });
}
const files = ['tokenizer.json', 'tokenizer_config.json', 'config.json'];
const modelConfigHashes = Object.fromEntries(
  files.map((f) => [
    f,
    createHash('sha256')
      .update(readFileSync(resolve(modelDir, f)))
      .digest('hex'),
  ]),
);
const output = {
  modelDirectory: modelDir,
  transformersVersion: JSON.parse(
    readFileSync('node_modules/@huggingface/transformers/package.json', 'utf8'),
  ).version,
  modelConfigHashes,
  examples,
};
writeFileSync('reports/pan-pc-11/token-probe.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
