import { decodeCorpusText } from '../dataset/parser';
import { repairText, type OffsetMapEntry } from './repair';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_DOCUMENT_CHARACTERS = 250000;
export interface ExtractedDocument {
  reference: string;
  title: string;
  text: string;
  format: 'text' | 'pdf';
  pages?: { page: number; start: number; end: number }[];
  paragraphBreaks?: number[];
  /** Offset map from repaired text positions back to original extracted text
   *  positions, populated after PDF text repair.  May be absent for plain-text
   *  documents or when no repairs were applied. */
  offsetMap?: OffsetMapEntry[];
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
    throw new Error('Each file must be nonempty and at most 15 MB');
  const title = file.name.replace(/[\r\n\0]/g, ' ').slice(0, 200),
    bytes = new Uint8Array(await file.arrayBuffer());
  const pdfHeader = Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-';
  const extensionIsPdf = /\.pdf$/i.test(title);
  const extensionIsText = /\.txt$/i.test(title);
  const mimeType = file.type.split(';', 1)[0].trim().toLowerCase();
  const mimeIsPdf = mimeType === 'application/pdf' || mimeType === 'application/x-pdf';
  const mimeIsText = mimeType === 'text/plain';
  const isPdf = extensionIsPdf || mimeIsPdf;
  const isText = extensionIsText || mimeIsText;

  if ((extensionIsPdf || mimeIsPdf) && (extensionIsText || mimeIsText))
    throw new Error('The uploaded file extension and MIME type disagree');

  if (isPdf) {
    if (!pdfHeader) throw new Error('The uploaded PDF does not have a valid PDF signature');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 80) throw new Error('PDF exceeds the 80-page local processing limit');
      let text = '';
      const pages: { page: number; start: number; end: number }[] = [];
      const paragraphBreaks: number[] = [];
      const globalOffsetMap: OffsetMapEntry[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number),
          content = await page.getTextContent();
        let previous: { y: number; height: number } | undefined;
        let part = '';
        paragraphBreaks.push(text.length);
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const y = item.transform[5];
          if (previous && Math.abs(y - previous.y) > Math.max(previous.height, item.height) * 1.6)
            paragraphBreaks.push(text.length + part.length);
          // PDF.js can emit NUL for an unmapped glyph in an embedded font.
          // That is an extraction placeholder, not evidence that this PDF's
          // binary bytes were decoded as text. Replace one-for-one so passage
          // and page offsets remain aligned; TXT input remains strictly validated.
          part += item.str.replace(/\0/g, ' ') + (item.hasEOL ? '\n' : ' ');
          if (item.str.trim()) previous = { y, height: item.height };
        }
        // Apply text repair per-page so pages[] boundaries stay aligned with
        // the repaired concatenated text.
        const repairedPage = repairText(part);
        // Shift any per-page offset-map entries by the current text offset.
        const baseOffset = text.length;
        for (const entry of repairedPage.offsetMap) {
          globalOffsetMap.push({
            repairedOffset: baseOffset + entry.repairedOffset,
            originalOffset: baseOffset + entry.originalOffset,
            delta: entry.delta,
          });
        }
        const start = text.length;
        text += repairedPage.text;
        pages.push({ page: number, start, end: text.length });
        if (number < pdf.numPages) text += '\n\n';
        if (text.length > MAX_DOCUMENT_CHARACTERS)
          throw new Error(
            `PDF exceeds ${MAX_DOCUMENT_CHARACTERS.toLocaleString()} extracted characters`,
          );
        page.cleanup();
      }
      return {
        reference,
        title,
        text: validateText(text),
        format: 'pdf',
        pages,
        paragraphBreaks,
        ...(globalOffsetMap.length > 0 ? { offsetMap: globalOffsetMap } : {}),
      };
    } catch (e) {
      throw new Error(`PDF extraction failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await task.destroy();
    }
  }
  if (!isText || pdfHeader)
    throw new Error('Supported uploads are UTF-8 .txt files and .pdf files');
  let text: string;
  try {
    text = decodeCorpusText(bytes).text;
  } catch {
    throw new Error('Text files must use valid UTF-8 encoding');
  }
  return { reference, title, text: validateText(text), format: 'text' };
}
