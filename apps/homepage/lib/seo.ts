import type { Metadata } from "next";
import {
  BRAND_LINE,
  CANONICAL_DESCRIPTION,
  ONE_LINER,
  SHORT_DESCRIPTION,
} from "./positioning";

export const SITE_URL = "https://urganize.app";
const SITE_NAME = "Urganize";

// The Organization node every other schema points at (publisher, provider,
// author). Defined here rather than in app/layout.tsx because a layout cannot
// export anything but its metadata, and the guide pages need the same id.
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

// The share image, for schemas that want an image URL.
export const SHARE_IMAGE_URL = `${SITE_URL}/opengraph-image.png`;

// The landing page's title and description live here, not in the two files
// that render them: app/layout.tsx needs them for the four JSON-LD schemas
// and the root metadata defaults, app/page.tsx needs them for the home
// page's own tags, and until 2026-08-14 both files carried their own copy of
// each string. Two hardcoded copies of a search snippet is a drift hazard on
// the one page brand queries land on.
//
// TITLE: the brand line, and nothing else: "Urganize: Everything after the
// music", the founder's short line after the name (2026-09-24). 36 characters,
// well inside the ~60 Google renders whole. Before this it was "Urganize, AI
// Music Business Manager" (2026-09-09 to 2026-09-24).
//
// DESCRIPTION: the founder's long description, verbatim (2026-09-24). A
// description this full is on purpose. A 106-character one that opened with
// "How" was ignored by Google entirely, which substituted the landing page's
// old group-chat paragraph, so the result for "urganize" described a group
// chat rather than the product. A short or weak description invites that.
//
// It is about 230 characters, past the ~155 Google shows, so a search result
// cuts it off partway through the list of what the product does. That was
// accepted rather than trimmed: the first two sentences, which are the part
// that says what Urganize is, always survive the cut, and the founder's words
// stay whole everywhere else this string is used (the JSON-LD and the tags).
export const LANDING_TITLE = BRAND_LINE;
export const LANDING_DESCRIPTION = CANONICAL_DESCRIPTION;

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
const SHARE_IMAGE_VERSION = "2026-10-02-music-teams";

const SHARE_IMAGE = {
  url: `${SITE_URL}/opengraph-image.png?v=${SHARE_IMAGE_VERSION}`,
  width: 1200,
  height: 630,
  // Alt mirrors the text baked into the PNG, and is the ONLY machine-readable
  // record of what that image says, so a regeneration that skipped this line
  // would leave the two describing different products with nothing to catch
  // it. `apps/web/lib/positioning-guard.test.ts` reads this string for exactly
  // that reason. It composes from ONE_LINER (the short line, the card's
  // headline) and SHORT_DESCRIPTION (the core line, the card's second line),
  // so it follows the positioning automatically; the VERSION above does not
  // and has to be bumped by hand whenever the card is regenerated.
  //
  // The generator is `apps/homepage/scripts/generate-og-image.mjs`.
  // Regenerated 2026-09-24 for "Everything after the music"; twice on
  // 2026-09-11 for the widened category and the audience narrowing; on
  // 2026-09-09 for the release-to-rollout rename and before that for the
  // first category line. Earlier cards used retired taglines, including a
  // banned container metaphor.
  alt: `${ONE_LINER} ${SHORT_DESCRIPTION}`,
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
