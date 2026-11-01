import type { Metadata } from "next";
import {
  BRAND_LINE,
  CANONICAL_DESCRIPTION,
  SHARE_DESCRIPTION,
  SHARE_HEADLINE,
  SHARE_TITLE,
} from "./positioning";

export const SITE_URL = "https://urganize.app";
const SITE_NAME = "Urganize";

// The Organization node every other schema points at (publisher, provider,
// author). Defined here rather than in app/layout.tsx because a layout cannot
// export anything but its metadata, and the guide pages need the same id.
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

// The share image, for schemas that want an image URL.
export const SHARE_IMAGE_URL = `${SITE_URL}/opengraph-image.jpg`;

// The landing page's title and description live here, not in the two files
// that render them: app/layout.tsx needs them for the four JSON-LD schemas
// and the root metadata defaults, app/page.tsx needs them for the home
// page's own tags, and until 2026-08-14 both files carried their own copy of
// each string. Two hardcoded copies of a search snippet is a drift hazard on
// the one page brand queries land on.
//
// TITLE: the brand line, and nothing else: "Urganize: From idea to
// execution", the founder's short line after the name (2026-10-31, #944;
// "Every release, on plan" from 2026-10-17, "Everything after the music"
// from 2026-09-24). 32 characters,
// well inside the ~60 Google renders whole. Before this it was "Urganize, AI
// Music Business Manager" (2026-09-09 to 2026-09-24).
//
// DESCRIPTION: the long description (since 2026-10-17 the short line, the
// promise and the audience, about 150 characters, so it fits whole; since
// 2026-10-18 the audience is "Built for artist managers."; the
// founder's 2026-09-24 description ran about 230). A
// description this full is on purpose. A 106-character one that opened with
// "How" was ignored by Google entirely, which substituted the landing page's
// old group-chat paragraph, so the result for "urganize" described a group
// chat rather than the product. A short or weak description invites that.
//
// The same string feeds the JSON-LD and the tags.
export const LANDING_TITLE = BRAND_LINE;
export const LANDING_DESCRIPTION = CANONICAL_DESCRIPTION;

// What a shared urganize.app link previews as (#939): the share card's line,
// while search keeps LANDING_TITLE and LANDING_DESCRIPTION above.
export const LANDING_SHARE_TITLE = SHARE_TITLE;
export const LANDING_SHARE_DESCRIPTION = SHARE_DESCRIPTION;

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
// Bump this string every time public/opengraph-image.jpg changes so the
// URL is new to every platform and the very next fetch pulls fresh bytes,
// instead of depending on a manual re-scrape request or an unknown TTL.
const SHARE_IMAGE_VERSION = "2026-10-31-idea-to-execution";

const SHARE_IMAGE = {
  url: `${SITE_URL}/opengraph-image.jpg?v=${SHARE_IMAGE_VERSION}`,
  width: 1200,
  height: 630,
  // Alt mirrors the text baked into the image, and is the ONLY machine-readable
  // record of what that image says, so a regeneration that skipped this line
  // would leave the two describing different products with nothing to catch
  // it. `apps/web/lib/positioning-guard.test.ts` reads this string for exactly
  // that reason. It composes from SHARE_HEADLINE (the card's headline since
  // 2026-10-31) and SHARE_DESCRIPTION; from 2026-10-17 it was ONE_LINER and
  // PROMISE_LINE,
  // so it follows the positioning automatically; the VERSION above does not
  // and has to be bumped by hand whenever the card is regenerated.
  //
  // The generator is `apps/homepage/scripts/generate-og-image.mjs`.
  // Regenerated 2026-10-31 for the centred "From idea to execution." card
  // (#939, founder approved; a JPEG since, see the generator); the alt now
  // composes from SHARE_HEADLINE and SHARE_DESCRIPTION instead.
  // Before that, regenerated 2026-10-19 for the new promise line (URG-400, founder approved);
  // 2026-10-17 for "Every release, on plan." (URG-334); on
  // 2026-09-24 for "Everything after the music"; twice on
  // 2026-09-11 for the widened category and the audience narrowing; on
  // 2026-09-09 for the release-to-rollout rename and before that for the
  // first category line. Earlier cards used retired taglines, including a
  // banned container metaphor.
  alt: `Urganize. ${SHARE_HEADLINE} ${SHARE_DESCRIPTION}`,
};

// Each main page's own share card (#964, mock approved by the founder
// 2026-11-01): the page's real H1 over a small slice of the product, drawn in
// the app's light theme with the made-up Northline Music demo team. Pages not
// listed here keep SHARE_IMAGE above. Static JPEGs in public/share/ for the
// same reason as SHARE_IMAGE (stable absolute URLs, no host resolution), and
// like it the words are baked into the picture, so:
//  - if a page's H1 changes, redraw its card (mock: claude.ai artifact
//    Do7SrY1rfUe9AnuvdARCMu) and update its alt here in the same commit;
//  - bump SHARE_CARDS_VERSION whenever any file in public/share/ changes, or
//    WhatsApp and X keep showing the old picture.
const SHARE_CARDS_VERSION = "2026-11-01-page-cards";

const SHARE_CARDS = {
  home: "Urganize. From idea to execution. A rollout timeline for Harmattan Gold by Kanmi Gold, with tasks dated to release day and today marked.",
  pricing: "Urganize pricing. Pay for the roster, not the headcount. The Northline Music team list on one plan.",
  features: "Urganize features. Everything your release needs. None of the chasing. A task list where every task has an owner and a due date.",
  "for-managers": "Urganize for artist managers. Every artist’s release. One screen, not five chats. Five artists’ rollouts on one list, with progress.",
  "for-executives": "Urganize for executives. Every artist. Every rollout. On plan. The roster with each artist’s next release and its status.",
  "for-curators": "Urganize for curators. People pitch you all day. Answer in one tap. The pitch inbox with one pitch marked Added.",
  "for-ai-artists": "Urganize for AI artists. You can make a song in an hour. Releasing one still takes weeks. A three-week plan up to release day.",
  guides: "Urganize guides. Plan a music release, step by step. A list of steps by week and role.",
  "guide-how-to-plan-a-music-release": "How to plan a music release in 11 weeks. The plan’s three phases, pre-release, release and post-release, with their milestones.",
} as const;

export type ShareCard = keyof typeof SHARE_CARDS;

function shareCardImage(card: ShareCard) {
  return {
    url: `${SITE_URL}/share/${card}.jpg?v=${SHARE_CARDS_VERSION}`,
    width: 1200,
    height: 630,
    alt: SHARE_CARDS[card],
  };
}

/** A page's share image URL for schemas: its own card, or the default. */
export function shareImageUrl(card?: ShareCard): string {
  return card ? shareCardImage(card).url : SHARE_IMAGE_URL;
}

/** The guide whose slug has its own card, if any; the others keep the default. */
export function guideShareCard(slug: string): ShareCard | undefined {
  const card = `guide-${slug}`;
  return card in SHARE_CARDS ? (card as ShareCard) : undefined;
}

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
  shareTitle = title,
  shareDescription = description,
  shareCard,
}: {
  title: string;
  description: string;
  path: string;
  /**
   * What link previews (WhatsApp, X, LinkedIn) show, when it should differ
   * from the search title and description. The homepage passes the share
   * lines (#939); every other page shows its own title in its preview.
   */
  shareTitle?: string;
  shareDescription?: string;
  /** This page's own share card (see SHARE_CARDS); omitted, the default card. */
  shareCard?: ShareCard;
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
  const image = shareCard ? shareCardImage(shareCard) : SHARE_IMAGE;

  return {
    title,
    description,
    alternates: { canonical: url },
    ...(noIndex
      ? { robots: { index: false, follow: true } }
      : {}),
    openGraph: {
      title: shareTitle,
      description: shareDescription,
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: shareDescription,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}
