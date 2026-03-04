/** @type {import('next').NextConfig} */
// HSTS: browsers ignore over HTTP (dev), so this is safe to set unconditionally.
// In production, can alternatively be set at the edge (Vercel/Cloudflare) if preferred.
const isProd = process.env.NODE_ENV === "production";

// CSP: tighten in production, relax in dev (HMR needs unsafe-eval + ws:)
const cspDirectives = [
  "default-src 'self'",
  // unsafe-inline required by Next.js inline scripts; unsafe-eval only for dev HMR
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // ws:/wss: only needed in dev for hot reload
  `connect-src 'self'${isProd ? " https:" : " http: https: ws: wss:"}`,
  "frame-ancestors 'none'",
];

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig = {
  transpilePackages: [
    "@barstock/api",
    "@barstock/database",
    "@barstock/types",
    "@barstock/validators",
    "@barstock/ui",
  ],
  serverExternalPackages: ["argon2", "@node-rs/argon2", "@prisma/client", "prisma"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Prevent caching of authenticated / tenant-specific pages.
      // Public pages (/menu/*, /artwork/*, /login) and /api/* (handled by middleware) are excluded.
      {
        source: "/((?!api|menu|artwork|login|_next).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
