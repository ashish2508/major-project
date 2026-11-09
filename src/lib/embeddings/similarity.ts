
export function cosineSimilarity(
  a: number[],
  b: number[]
): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error("Vectors must have equal, non-zero dimensions.");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] ** 2;
    magnitudeB += b[i] ** 2;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    throw new Error("Cannot compare zero vectors.");
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}
