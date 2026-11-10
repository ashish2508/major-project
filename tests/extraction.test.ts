import { it, expect } from 'vitest';
import { extractFile, validateText, MAX_FILE_BYTES } from '../src/lib/documents/extract';
import { textPdf } from './pdf-fixture';
it('extracts real PDF text and records page-relative boundaries', async () => {
  const doc = await extractFile(
    new File([textPdf()], 'paper.pdf', { type: 'application/pdf' }),
    'q',
  );
  expect(doc.text).toContain('researcher compares documents');
  expect(doc.pages).toHaveLength(1);
  expect(doc.pages![0].end).toBe(doc.text.length);
}, 20000);
it('preserves UTF-8 text/newlines after stripping an initial BOM', async () => {
  const d = await extractFile(new File(['\ufeffé\r\n😀 text '], 'paper.txt'), 's');
  expect(d.text).toBe('é\r\n😀 text ');
});
it('rejects invalid types, UTF-8, PDF signatures, empty files and size limits', async () => {
  await expect(extractFile(new File(['x'], 'file.exe'), 'q')).rejects.toThrow('Supported');
  await expect(extractFile(new File([new Uint8Array([255])], 'file.txt'), 'q')).rejects.toThrow(
    'UTF-8',
  );
  await expect(extractFile(new File(['x'], 'file.pdf'), 'q')).rejects.toThrow('signature');
  await expect(extractFile(new File([], 'empty.txt'), 'q')).rejects.toThrow('nonempty');
  await expect(
    extractFile(new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'large.txt'), 'q'),
  ).rejects.toThrow('5 MB');
  expect(() => validateText(' ')).toThrow('no extractable');
  expect(() => validateText('x'.repeat(50001))).toThrow('exceeds');
  expect(() => validateText('\0')).toThrow();
});
