import { analyzeDocuments } from '@/lib/application/analysis';
import {
  assertSameOrigin,
  boundedFormData,
  parseAnalysisRequest,
  RequestError,
} from '@/lib/application/request';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const type = request.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('multipart/form-data;'))
      throw new RequestError('Use multipart form data', 415);
    let form: FormData;
    try {
      form = await boundedFormData(request);
    } catch (e) {
      if (e instanceof RequestError) throw e;
      throw new RequestError('Malformed upload body');
    }
    let input: Awaited<ReturnType<typeof parseAnalysisRequest>>;
    try {
      input = await parseAnalysisRequest(form);
    } catch (e) {
      if (e instanceof RequestError) throw e;
      throw new RequestError(e instanceof Error ? e.message : 'Document extraction failed');
    }
    const result = await analyzeDocuments(input.query, input.sources, input.method, {
      useCorpus: input.useCorpus,
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Analysis failed';
    const status = e instanceof RequestError ? e.status : 500;
    return Response.json({ error: message }, { status });
  }
}
