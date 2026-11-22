import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/** Baseline security headers (CERT-In / GIGW security audit expectations). */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/**
 * Production: the browser calls `/api/*` on this site and Vercel forwards it to
 * the API on Render (API_PROXY_TARGET, server-only). Same-origin calls keep the
 * httpOnly auth cookies first-party: *.vercel.app and *.onrender.com are
 * different sites, so cookies set by the API directly would never be sent back.
 * Forwarding only, no logic (AGENTS.md section 4).
 */
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');
if (apiProxyTarget && !/^https?:\/\/[^/]+$/.test(apiProxyTarget)) {
  throw new Error('API_PROXY_TARGET must be an origin such as https://api.example.in');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@smart-light/ui', '@smart-light/shared'],
  async rewrites() {
    return apiProxyTarget
      ? [{ source: '/api/:path*', destination: `${apiProxyTarget}/api/:path*` }]
      : [];
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
