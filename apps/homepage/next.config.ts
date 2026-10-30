import type { NextConfig } from "next";
import { APP_CURATOR_APPLY_URL, WAITLIST_URL } from "./lib/app-urls";

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
      // The /for-labels persona page was removed on 2026-09-11 (founder call:
      // the product is for artists and managers). It sat in the sitemap at 0.8
      // for weeks, so inbound links exist; /pricing is where the Label plan it
      // sold still lives. Temporary on purpose: a 308 is cached by the reader's
      // browser forever, and a copy decision is the kind that can be reversed.
      {
        source: "/for-labels",
        destination: "/pricing",
        permanent: false,
      },
      // Short links printed on the end card of the walkthrough videos (#908),
      // so they must keep working for as long as the videos circulate.
      // /curator is the curator video's link to the application form;
      // /pitch is the team video's link to the waitlist.
      {
        source: "/curator",
        destination: APP_CURATOR_APPLY_URL,
        permanent: false,
      },
      {
        source: "/pitch",
        destination: WAITLIST_URL,
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
