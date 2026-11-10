import { ZodError } from 'zod';
import { analyzeDocuments } from '@/lib/application/analysis';
import { boundedFormData, parseAnalysisRequest, RequestError } from '@/lib/application/request';
// Cache Components uses the default Node.js runtime for native ONNX inference.
let busy = false;
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  // Next can normalize request.url to localhost even when the browser used 127.0.0.1.
  const host = request.headers.get('host') ?? url.host;
  if (origin && origin !== `${url.protocol}//${host}`)
    return Response.json(
      { error: 'Cross-origin analysis requests are not supported' },
      { status: 403 },
    );
  if (busy)
    return Response.json(
      { error: 'A local analysis is already running. Please try again when it finishes.' },
      { status: 429 },
    );
  busy = true;
  try {
    const form = await boundedFormData(request);
    let input;
    try {
      input = await parseAnalysisRequest(form);
    } catch (e) {
      if (e instanceof ZodError) throw new RequestError(e.issues.map((i) => i.message).join('; '));
      if (e instanceof RequestError) throw e;
      throw new RequestError(e instanceof Error ? e.message : 'Document extraction failed');
    }
    const result = await analyzeDocuments(input.query, input.sources, input.method);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Analysis failed';
    return Response.json(
      { error: message },
      {
        status: e instanceof RequestError ? e.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } finally {
    busy = false;
  }
}
