import { z } from 'zod';
import { extractFile, validateText, type ExtractedDocument } from '../documents/extract';
const MAX_BODY = 150 * 1024 * 1024;
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
/** Bound streamed bodies even if Content-Length is absent or dishonest. */
export async function boundedFormData(request: Request): Promise<FormData> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data;'))
    throw new RequestError('Use multipart form data', 415);
  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_BODY) throw new RequestError('Upload exceeds the 150 MB request limit', 413);
  if (!request.body) throw new RequestError('Missing request body');
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new RequestError('Upload exceeds the 150 MB request limit', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return await new Response(bytes, { headers: { 'content-type': type } }).formData();
  } catch {
    throw new RequestError('Malformed multipart request');
  }
}
export async function parseAnalysisRequest(form: FormData) {
  const method = z.enum(['lexical', 'semantic', 'hybrid']).parse(form.get('method') ?? 'hybrid');
  const useCorpus =
    form.get('useCorpus') === 'true' ||
    form.get('target') === 'corpus' ||
    form.get('useCanonicalCorpus') === 'true';

  const queryText = z
      .string()
      .max(250000)
      .parse(form.get('queryText') ?? ''),
    sourceText = z
      .string()
      .max(250000)
      .parse(form.get('sourceText') ?? '');
  const queryFiles = form
    .getAll('queryFile')
    .filter((f): f is File => typeof f !== 'string' && f.size > 0);
  const sourceFiles = form
    .getAll('sourceFiles')
    .filter((f): f is File => typeof f !== 'string' && f.size > 0);
  if (queryFiles.length > 1 || Number(Boolean(queryText.trim())) + queryFiles.length !== 1)
    throw new RequestError('Provide either pasted query text or one query file');
  if (!useCorpus && !sourceFiles.length && !sourceText.trim())
    throw new RequestError('Provide at least one possible source, or search against your corpus');
  if (!useCorpus && sourceFiles.length + Number(Boolean(sourceText.trim())) > 6)
    throw new RequestError('Provide at most six source documents');
  const query: ExtractedDocument = queryFiles.length
    ? await extractFile(queryFiles[0], 'query')
    : {
        reference: 'query',
        title: 'Pasted document',
        text: validateText(queryText),
        format: 'text',
      };
  const sources: ExtractedDocument[] = [];
  if (sourceText.trim())
    sources.push({
      reference: 'source-1',
      title: 'Pasted source',
      text: validateText(sourceText),
      format: 'text',
    });
  for (const file of sourceFiles)
    sources.push(await extractFile(file, `source-${sources.length + 1}`));
  if ([query, ...sources].reduce((s, d) => s + d.text.length, 0) > 2500000)
    throw new RequestError('Combined documents exceed 2,500,000 extracted characters');
  return { query, sources, method, useCorpus };
}
