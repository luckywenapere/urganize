import type { Metadata } from "next";
import {
  BRAND_LINE,
  CUSTOMER_LINE,
  ONE_LINER,
  PROMISE,
} from "./positioning";

const SITE_URL = "https://urganize.app";
const SITE_NAME = "Urganize";

// The landing page's title and description live here, not in the two files
// that render them: app/layout.tsx needs them for the four JSON-LD schemas
// and the root metadata defaults, app/page.tsx needs them for the home
// page's own tags, and until 2026-08-14 both files carried their own copy of
// each string. Two hardcoded copies of a search snippet is a drift hazard on
// the one page brand queries land on.
//
// TITLE: the brand line, and nothing else. The 2026-09-09 positioning makes
// this an acceptance criterion rather than a judgement call: the homepage
// title is "Urganize, AI Music Business Manager". It is 35 characters (26
// before the category was widened on 2026-09-11), still well inside the ~60
// Google renders whole, and it deliberately drops the keyword tail the
// previous title carried — the category IS the keyword now, and a searcher who
// has never heard of us learns what this is from three words.
//
// DESCRIPTION: written at ~150-160 characters on purpose. A shorter one was
// 106 characters and opened with "How", and Google was ignoring it entirely —
// it substituted the landing CommunitySection's group-chat paragraph, so the
// result for "urganize" described a group chat rather than release software.
// That section was removed from the landing page on 2026-08-19, but KEEP the
// description full-length: a short or weak one invites Google to substitute
// any other page text (the /community page still carries group-chat copy).
// It leads with the category and the audience, then the promise, which is the
// hierarchy the brief fixes for anything that introduces the product.
//
// Widening the category on 2026-09-11 took it from 150 characters to 159, which
// is the top of that band rather than past it. Anything added here from now on
// has to come out of the tail, not on top of it.
export const LANDING_TITLE = BRAND_LINE;
export const LANDING_DESCRIPTION =
  `Urganize is an ${CUSTOMER_LINE}. ${PROMISE}, with an owner on every activity.`;

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
const SHARE_IMAGE_VERSION = "2026-09-11-business-manager";

const SHARE_IMAGE = {
  url: `${SITE_URL}/opengraph-image.png?v=${SHARE_IMAGE_VERSION}`,
  width: 1200,
  height: 630,
  // Alt mirrors the text baked into the PNG, and is the ONLY machine-readable
  // record of what that image says, so a regeneration that skipped this line
  // would leave the two describing different products with nothing to catch
  // it. `apps/web/lib/positioning-guard.test.ts` reads this string for exactly
  // that reason. It composes from ONE_LINER and PROMISE, so it follows the
  // positioning automatically; the VERSION above does not and has to be bumped
  // by hand whenever the card is regenerated.
  //
  // The generator is `apps/homepage/scripts/generate-og-image.mjs` (the note
  // here said there was none until 2026-09-09, when one landed). Regenerated
  // 2026-09-11 for the widened category; before that 2026-09-09 for the
  // release-to-rollout rename, before that for the AI Music Manager
  // positioning, before that it said "The AI workspace for music executives",
  // and before that "One home", a banned container metaphor.
  alt: `${ONE_LINER} ${PROMISE}. Urganize.`,
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
