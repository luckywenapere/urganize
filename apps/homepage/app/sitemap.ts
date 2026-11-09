import { MetadataRoute } from "next";
import { GUIDES } from "@/content/guides";

const SITE_URL = "https://urganize.app";

// lastModified is a REAL per-page date, written by hand (since 2026-10-18,
// founder approved). It is never the build time: stamping every URL with the
// build time claims "everything changed" on every deploy, which teaches
// crawlers (Bing especially) to distrust the sitemap. Each date is the last
// day that page's own content or metadata changed (taken from git on
// 2026-10-18). WHEN YOU CHANGE A PAGE, BUMP ITS DATE HERE in the same commit.
const LAST_MODIFIED = {
  home: "2026-11-09",
  signup: "2026-11-09",
  features: "2026-11-09",
  pricing: "2026-11-09",
  whyUrganize: "2026-11-09",
  forExecutives: "2026-11-09",
  forManagers: "2026-11-09",
  forCurators: "2026-11-09",
  brand: "2026-11-09",
  guides: "2026-11-09",
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: LAST_MODIFIED.home,
      changeFrequency: "monthly",
      priority: 1,
    },
    // Ahead of the product pages on purpose: it exists to be found by people
    // searching the brand to get in, and to be a sitelink candidate above
    // Features (founder call, 2026-08-09). /login used to sit here too; it
    // became a redirect into the app on 2026-11-03 (#1057).
    {
      url: `${SITE_URL}/signup`,
      lastModified: LAST_MODIFIED.signup,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/features`,
      lastModified: LAST_MODIFIED.features,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: LAST_MODIFIED.pricing,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/why-urganize`,
      lastModified: LAST_MODIFIED.whyUrganize,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // The three persona pages (/for-labels left on 2026-09-11, founder call;
    // its URL redirects to /pricing; /for-ai-artists was hidden on 2026-10-18,
    // URG-385, and 404s, so it must not be listed). Same priority across all of them — the
    // ProductMenu's link order is where the executive-first preference is
    // expressed (that's a sitelink signal we control); sitemap priority is
    // not, and inventing a split here would just be noise.
    {
      url: `${SITE_URL}/for-executives`,
      lastModified: LAST_MODIFIED.forExecutives,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for-managers`,
      lastModified: LAST_MODIFIED.forManagers,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for-curators`,
      lastModified: LAST_MODIFIED.forCurators,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // /brand is indexed and listed since 2026-09-30: it is the one page that
    // states what the company is, what it is called and how it is spelled, and
    // a brand search was being answered by third-party listings because no page
    // we control did. /press is NOT listed and should not come back: it is a
    // 308 redirect to /brand, so the entry would ask crawlers to index a URL
    // that resolves somewhere else.
    {
      url: `${SITE_URL}/brand`,
      lastModified: LAST_MODIFIED.brand,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // The guides (2026-09-30): plain answers to what a stranger searches before
    // they know Urganize exists. Each guide carries its own dateModified, which
    // only moves when the guide's own text does.
    {
      url: `${SITE_URL}/guides`,
      lastModified: LAST_MODIFIED.guides,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...GUIDES.map((guide) => ({
      url: `${SITE_URL}/guides/${guide.slug}`,
      lastModified: guide.dateModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    //
    // Deliberately absent, and it must stay that way: /privacy, /team,
    // /community, /changelog, /terms and /subprocessors all emit
    // `noindex` (see lib/seo.ts) so the homepage's sitelinks stay commercial.
    // Listing a noindexed URL here would ask crawlers to index the very page
    // that tells them not to. They stay crawlable via robots.txt and their
    // footer links — that access is exactly what lets a crawler read the
    // noindex and drop them from results. Adding any of them back here
    // re-opens the problem. What's left below is the full indexable surface.
  ];
}
