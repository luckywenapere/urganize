import type { Metadata } from "next";

const SITE_URL = "https://urganize.app";
const SITE_NAME = "Urganize";

// The landing page's title and description live here, not in the two files
// that render them: app/layout.tsx needs them for the four JSON-LD schemas
// and the root metadata defaults, app/page.tsx needs them for the home
// page's own tags, and until 2026-08-14 both files carried their own copy of
// each string. Two hardcoded copies of a search snippet is a drift hazard on
// the one page brand queries land on.
//
// TITLE: names the audience rather than a generic "for Teams" — the searcher
// should see themselves in the result. Kept ≤60 characters (currently 51),
// so Google renders it whole instead of truncating mid-phrase. Query intent
// lives in the title ("label teams" is what buyers actually search); the
// locked positioning line ("AI workspace for music executives") lives in
// the description.
//
// DESCRIPTION: written at ~150-160 characters on purpose. A shorter one was
// 106 characters and opened with "How", and Google was ignoring it entirely —
// it substituted the landing CommunitySection's group-chat paragraph, so the
// result for "urganize" described a group chat rather than release software.
// That section was removed from the landing page on 2026-08-19, but KEEP the
// description full-length: a short or weak one invites Google to substitute
// any other page text (the /community page still carries group-chat copy).
export const LANDING_TITLE =
  "Urganize | Music Release Workspace for Label Teams";
export const LANDING_DESCRIPTION =
  "Urganize is the AI workspace for music executives. Run each release on a full rollout plan, put an owner on every task and see status without chasing anyone.";

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
const SHARE_IMAGE_VERSION = "2026-08-19";

const SHARE_IMAGE = {
  url: `${SITE_URL}/opengraph-image.png?v=${SHARE_IMAGE_VERSION}`,
  width: 1200,
  height: 630,
  // Alt mirrors the text baked into the PNG (regenerated 2026-08-19 for the
  // executive repositioning — the old card said "One home", a banned
  // container metaphor). If the card's tagline changes, change both.
  alt: "Every artist. Every release. On plan. The AI workspace for music executives. Urganize.",
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
