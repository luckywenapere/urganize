import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The Android app is served as a plain static file (see /download).
        // Without an explicit type, Next serves it as application/octet-stream,
        // which some Android browsers won't hand to the package installer —
        // the download appears to work and then nothing opens it.
        source: "/downloads/urganize.apk",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: 'attachment; filename="urganize.apk"' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "community.urganize.app" }],
        destination: "https://urganize.app/community",
        permanent: false,
      },
    ];
  },
  // Stamped at BUILD time and read at request time by /api/version, so the
  // deployed site can say when it was built. Evaluated once per build, which
  // is the point: a request-time `new Date()` would just report now.
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
  serverExternalPackages: ["@libsql/client", "libsql"],
  // @urganize/ui ships TypeScript source (its exports map points at
  // src/index.ts), so it must be transpiled here exactly as apps/web does.
  // The homepage imports only the Chappi mascot from it.
  transpilePackages: ["@urganize/ui"],
  turbopack: {
    // Empty config to silence the warning
  },
};

export default nextConfig;
