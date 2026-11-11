import { retryDocumentIngestion } from '@/lib/corpus/service';
import { RequestError } from '@/lib/application/request';

export async function POST(request: Request) {
  try {
    let id: string | null = null;
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { id?: string };
      id = body.id ?? null;
    } else {
      const form = await request.formData();
      id = (form.get('id') ?? '').toString().trim() || null;
    }

    if (!id) {
      throw new RequestError('Document ID is required to retry ingestion', 400);
    }

    const result = await retryDocumentIngestion(id);
    return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof RequestError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : 'Retry ingestion failed';
    return Response.json({ error: message }, { status: 400 });
  }
}
