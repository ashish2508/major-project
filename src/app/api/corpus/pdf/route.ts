import { getDocumentRawBytes, loadCatalog } from '@/lib/corpus/store';

export async function GET(request: Request) {
  const reference = new URL(request.url).searchParams.get('reference');
  const catalog = await loadCatalog();
  const matches = Object.values(catalog.documents).filter(
    (d) => d.reference === reference && d.format === 'pdf' && d.status === 'ready',
  );
  if (matches.length !== 1) return new Response('PDF unavailable or ambiguous', { status: 404 });
  const bytes = await getDocumentRawBytes(matches[0].id);
  if (!bytes) return new Response('PDF unavailable', { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="source.pdf"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
