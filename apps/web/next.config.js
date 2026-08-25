/** @type {import('next').NextConfig} */

// The /_next/image optimizer fetches whatever host remotePatterns allows, so a
// '**' wildcard turns it into an open proxy anyone can drive to burn image-
// optimization quota. Both next/image call sites (workspace release cover art,
// settings workspace logo) load signed Supabase Storage URLs, so only that
// host/path is allowed. Derived from env at build time; a malformed URL fails
// the build loudly rather than shipping a broken allowlist.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : null;

const nextConfig = {
  transpilePackages: ['@urganize/ui'],
  // Version skew (2026-08-16). A tab opened before a deploy holds that build's
  // chunk URLs; once the new deployment takes the production alias those 404,
  // and the next client-side navigation — browser Back included — leaves the
  // page painted but inert (see lib/chunk-recovery.ts). Stamping the build's
  // deployment id onto asset requests is what lets Vercel Skew Protection
  // route an old client back to the deployment that owns its chunks.
  //
  // REQUIRES Skew Protection to be switched on for the project in the Vercel
  // dashboard — this line alone does nothing. Undefined outside Vercel (local,
  // CI), where Next simply omits the stamp, so it is safe everywhere.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  // The recap card renderer reads static font binaries off disk at request
  // time (satori cannot use next/font). Output tracing only follows imports, so
  // a bare fs.readFile would leave the .ttf files out of the deployed lambda
  // and every generate would fail with ENOENT. Declare them explicitly.
  outputFileTracingIncludes: {
    '/api/releases/[releaseId]/recap': ['./assets/fonts/*.ttf'],
  },
  // /.well-known/* CANNOT be an app/ directory: Next's router ignores
  // dot-prefixed path segments, so app/.well-known/oauth-.../route.ts never
  // resolves. There is no middleware.ts in this app either (and adding one has
  // app-wide implications), so a rewrite is the mechanism.
  //
  // Both the bare and the path-suffixed forms are mapped for the
  // protected-resource document, because RFC 9728 has a client try
  // /.well-known/oauth-protected-resource/api/mcp FIRST for a resource that
  // lives at a path, and only then fall back to the root document. Serving one
  // and not the other works with some clients and silently fails with others.
  async rewrites() {
    return [
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/well-known/oauth-protected-resource',
      },
      {
        source: '/.well-known/oauth-protected-resource/:path*',
        destination: '/api/well-known/oauth-protected-resource',
      },
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/well-known/oauth-authorization-server',
      },
      {
        source: '/.well-known/oauth-authorization-server/:path*',
        destination: '/api/well-known/oauth-authorization-server',
      },
    ];
  },
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: 'https',
            hostname: supabaseHostname,
            pathname: '/storage/v1/object/**',
          },
        ]
      : [],
  },
};

module.exports = nextConfig;
