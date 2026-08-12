import type { Metadata } from "next";

const SITE_URL = "https://urganize.app";
const SITE_NAME = "Urganize";

// Absolute, canonical share image. Served as a static asset from public/
// (NOT the app/opengraph-image.png file convention), so the URL is stable
// across deploys and always resolves on the public domain. This is the
// crux of URG-118: the file convention resolved og:image against the
// runtime deployment host, which on Vercel is an SSO-gated *.vercel.app
// preview URL — social crawlers hit a login redirect and showed no card.
// A hardcoded absolute URL sidesteps host resolution entirely.
//
// SHARE_IMAGE_VERSION cache-busts social crawlers (URG-156). X and other
// platforms cache whatever bytes they first fetch at a given image URL and
// don't reliably refetch on a silent file swap — after URG-149 replaced the
// PNG, X kept serving its old cached copy at the same unversioned URL.
// Bump this string every time public/opengraph-image.png changes so the
// URL is new to every platform and the very next fetch pulls fresh bytes,
// instead of depending on a manual re-scrape request or an unknown TTL.
const SHARE_IMAGE_VERSION = "2026-07-18";

const SHARE_IMAGE = {
  url: `${SITE_URL}/opengraph-image.png?v=${SHARE_IMAGE_VERSION}`,
  width: 1200,
  height: 630,
  alt: "Every artist. Every release. One home. Urganize.",
};

// Shared per-page metadata shape (canonical + OG + Twitter) so every
// marketing page gets the same fields instead of hand-rolling them.
// Root layout still owns metadataBase, keywords, and robots defaults.
// The share image is set here (not via file convention) so EVERY page —
// home and nested routes alike — emits og:image + twitter:image; nested
// segments do not inherit the app/ file-convention image.
export function buildPageMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  /**
   * Keep this page out of search results. Emits `noindex, follow` — the page
   * still passes link equity onward, it just never appears as a result
   * itself. Use for pages that must exist and be reachable but should never
   * compete with the marketing pages for a query like "urganize".
   *
   * Deliberately paired with robots.txt staying OPEN for these paths: a
   * `Disallow` would stop crawlers from FETCHING the page, so they'd never
   * read this tag, and an already-indexed URL would linger in results as a
   * bare link. Blocking the crawl is what keeps a page indexed; letting it
   * crawl and read `noindex` is what removes it.
   */
  noIndex?: boolean;
}): Metadata {
  const url = `${SITE_URL}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    ...(noIndex
      ? { robots: { index: false, follow: true } }
      : {}),
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SHARE_IMAGE.url],
    },
  };
}
