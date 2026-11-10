import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PDF.js resolves its worker relative to the installed module.
  serverExternalPackages: ['pdfjs-dist'],
};

export default nextConfig;
