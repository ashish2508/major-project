import { getArtifacts } from '@/lib/application/analysis';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MODEL_DIRECTORY } from '@/lib/embeddings/model';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  // Read request state so this reports local readiness at request time with Cache Components.
  void request.url;
  try {
    const { configs } = await getArtifacts();
    let modelAvailable = true;
    try {
      await access(resolve(MODEL_DIRECTORY, 'onnx/model.onnx_data'));
    } catch {
      modelAvailable = false;
    }
    return Response.json(
      {
        ready: true,
        modelAvailable,
        configs,
        provider: 'CPUExecutionProvider',
        note: 'Weights are checked against calibration hashes when a semantic/hybrid analysis runs.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        ready: false,
        modelAvailable: false,
        error:
          'Run bun run setup:model and bun run reproduce to prepare calibrated local artifacts.',
      },
      { status: 503 },
    );
  }
}
