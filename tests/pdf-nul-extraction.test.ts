import { describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: [
            { str: 'First passage', transform: [1, 0, 0, 1, 10, 20], height: 10, hasEOL: false },
            { str: '\0', transform: [1, 0, 0, 1, 20, 20], height: 10, hasEOL: false },
            { str: 'continues here.', transform: [1, 0, 0, 1, 30, 20], height: 10, hasEOL: true },
          ],
        }),
        cleanup: vi.fn(),
      }),
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('PDF.js unmapped glyph handling', () => {
  it('replaces extracted NUL glyphs without shifting page offsets or weakening TXT validation', async () => {
    const { extractFile, validateText } = await import('../src/lib/documents/extract');
    const pdf = new File(['%PDF-1.7'], 'unmapped-glyph.pdf', { type: 'application/pdf' });
    const extracted = await extractFile(pdf, 'unmapped-glyph');

    expect(extracted.text).toBe('First passage   continues here.\n');
    expect(extracted.text).not.toContain('\0');
    expect(extracted.pages).toEqual([{ page: 1, start: 0, end: extracted.text.length }]);
    expect(() => validateText(`plain text\0invalid`)).toThrow(
      'Binary data is not supported as text',
    );
  });
});
