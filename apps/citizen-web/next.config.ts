import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@smart-light/ui', '@smart-light/shared'],
};

export default nextConfig;
