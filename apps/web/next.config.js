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
