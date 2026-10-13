import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
  outputFileTracingRoot: __dirname,
  // Ensure road seed GeoJSON is present in the Vercel serverless bundle
  // (fs paths alone are often omitted from output file tracing).
  outputFileTracingIncludes: {
    '/pages/api/[[...path]]': ['./server/data/**/*'],
    '/api/[[...path]]': ['./server/data/**/*'],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.geojson$/,
      type: 'json',
    });
    return config;
  },
};

export default nextConfig;
