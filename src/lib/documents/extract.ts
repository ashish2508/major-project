import { decodeCorpusText } from '../dataset/parser';
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_CHARACTERS = 50000;
export interface ExtractedDocument {
  reference: string;
  title: string;
  text: string;
  format: 'text' | 'pdf';
  pages?: { page: number; start: number; end: number }[];
}
export function validateText(text: string): string {
  if (!text.trim())
    throw new Error(
      'The document contains no extractable text. Scanned PDFs require OCR, which is not included.',
    );
  if (text.length > MAX_DOCUMENT_CHARACTERS)
    throw new Error(
      `Document exceeds ${MAX_DOCUMENT_CHARACTERS.toLocaleString()} extracted characters. Split it into smaller documents.`,
    );
  if (text.includes('\0')) throw new Error('Binary data is not supported as text');
  return text;
}
export async function extractFile(file: File, reference: string): Promise<ExtractedDocument> {
  if (file.size === 0 || file.size > MAX_FILE_BYTES)
    throw new Error('Each file must be nonempty and at most 5 MB');
  const title = file.name.replace(/[\r\n\0]/g, ' ').slice(0, 200),
    bytes = new Uint8Array(await file.arrayBuffer());
  const pdfHeader = Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-';
  if (/\.pdf$/i.test(title)) {
    if (!pdfHeader) throw new Error('The uploaded PDF does not have a valid PDF signature');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 80) throw new Error('PDF exceeds the 80-page local processing limit');
      let text = '';
      const pages: { page: number; start: number; end: number }[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number),
          content = await page.getTextContent();
        const part = content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join('');
        const start = text.length;
        text += part;
        pages.push({ page: number, start, end: text.length });
        if (number < pdf.numPages) text += '\n\n';
        if (text.length > MAX_DOCUMENT_CHARACTERS)
          throw new Error('PDF exceeds 50,000 extracted characters');
        page.cleanup();
      }
      return { reference, title, text: validateText(text), format: 'pdf', pages };
    } catch (e) {
      throw new Error(`PDF extraction failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await task.destroy();
    }
  }
  if (!/\.txt$/i.test(title) || pdfHeader)
    throw new Error('Supported uploads are UTF-8 .txt files and .pdf files');
  let text: string;
  try {
    text = decodeCorpusText(bytes).text;
  } catch {
    throw new Error('Text files must use valid UTF-8 encoding');
  }
  return { reference, title, text: validateText(text), format: 'text' };
}
