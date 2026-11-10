import { createHash } from 'node:crypto';

export const digest = (data: string | Uint8Array, algorithm = 'sha256') =>
  createHash(algorithm).update(data).digest('hex');
