import { it, expect } from 'vitest';
import { embedTexts, tokenCounter } from '../src/lib/embeddings/model';
import { denseCosine } from '../src/lib/detection/tfidf';
it.skipIf(process.env.INFERENCE_TESTS !== '1')(
  'loads local MiniLM, produces normalized embeddings and enforces the token limit',
  async () => {
    const texts = [
      'A researcher compares two scientific documents.',
      'Two academic texts are compared by a researcher.',
      'A purple bicycle is parked beside a river.',
    ];
    const vectors = await embedTexts(texts);
    expect(vectors).toHaveLength(3);
    for (const v of vectors) {
      expect(v).toHaveLength(384);
      expect(v.reduce((s, x) => s + x * x, 0)).toBeCloseTo(1, 4);
    }
    expect(denseCosine(vectors[0], vectors[1])).toBeGreaterThan(
      denseCosine(vectors[0], vectors[2]),
    );
    const count = await tokenCounter();
    expect(count('a '.repeat(300))).toBeGreaterThan(256);
    await expect(embedTexts(['a '.repeat(300)])).rejects.toThrow('256');
    await expect(embedTexts([' '])).rejects.toThrow();
  },
  60000,
);
