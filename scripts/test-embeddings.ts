
import { embedTexts } from "../src/lib/embeddings/model";
import { cosineSimilarity } from "../src/lib/embeddings/similarity";

const sentences = [
  "Machine learning algorithms identify patterns in large datasets.",
  "Algorithms can learn patterns from large collections of data.",
  "The university library closes at six in the evening.",
];

console.time("Embedding generation");

const embeddings = await embedTexts(sentences);

console.timeEnd("Embedding generation");

console.log("\nEmbedding dimensions:", embeddings[0].length);

console.log("\nSimilarity results:");

console.log(
  "Sentence 1 vs 2:",
  cosineSimilarity(embeddings[0], embeddings[1]).toFixed(4)
);

console.log(
  "Sentence 1 vs 3:",
  cosineSimilarity(embeddings[0], embeddings[2]).toFixed(4)
);
