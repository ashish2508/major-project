import {
  deleteCorpusDocument,
  ingestBatchDocuments,
  ingestDocumentFile,
} from '@/lib/corpus/service';
import { getCorpusStats, loadCatalog } from '@/lib/corpus/store';
import { boundedFormData, RequestError } from '@/lib/application/request';

export async function GET() {
  try {
    const catalog = await loadCatalog();
    const stats = await getCorpusStats();
    const documents = Object.values(catalog.documents).sort(
      (a, b) => new Date(b.ingestedAt).getTime() - new Date(a.ingestedAt).getTime(),
    );
    return Response.json({ documents, stats }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to retrieve corpus';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await boundedFormData(request);
    const files = form
      .getAll('files')
      .concat(form.getAll('file'))
      .filter((f): f is File => typeof f !== 'string' && f.size > 0);

    const pastedText = (form.get('pastedText') ?? '').toString().trim();
    const title = (form.get('title') ?? '').toString().trim();
    const reference = (form.get('reference') ?? '').toString().trim();

    if (files.length === 0 && !pastedText) {
      throw new RequestError('Provide at least one file or non-empty text to ingest', 400);
    }

    const allFiles: File[] = [...files];
    if (pastedText) {
      const filename = `${reference || title || 'pasted-document'}.txt`;
      allFiles.push(new File([pastedText], filename, { type: 'text/plain' }));
    }

    if (allFiles.length === 1) {
      const res = await ingestDocumentFile(allFiles[0], {
        title: title || undefined,
        reference: reference || undefined,
      });
      return Response.json(
        { results: [res], failed: [] },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const batchRes = await ingestBatchDocuments(allFiles);
    return Response.json(batchRes, {
      status: batchRes.results.length > 0 ? 201 : 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof RequestError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : 'Corpus ingestion failed';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    let id = url.searchParams.get('id');

    if (!id && request.headers.get('content-type')?.includes('application/json')) {
      const body = (await request.json()) as { id?: string };
      id = body.id ?? null;
    }

    if (!id) {
      throw new RequestError('Document ID is required for deletion', 400);
    }

    const success = await deleteCorpusDocument(id);
    if (!success) {
      throw new RequestError(`Document with ID "${id}" not found`, 404);
    }

    return Response.json({ success: true, id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof RequestError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : 'Document deletion failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
