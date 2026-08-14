import { MetadataRoute } from "next";

const SITE_URL = "https://urganize.app";

// lastModified is deliberately omitted: stamping every URL with the build
// time claims "everything changed" on every deploy, which teaches crawlers
// (Bing especially) to distrust the sitemap. Omitting it beats lying.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "monthly",
      priority: 1,
    },
    // Ahead of the product pages on purpose: these two exist to be found by
    // people searching the brand to get in, and to be sitelink candidates
    // above Features (founder call, 2026-08-09). They're real pages here
    // rather than redirects to app.urganize.app because a redirect isn't
    // indexable and a subdomain can't be a sitelink of this one.
    {
      url: `${SITE_URL}/login`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/signup`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/features`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/pricing`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/why-urganize`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for-managers`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for-labels`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // /press was listed here until 2026-08-14 and should not come back: the
    // route is a 308 redirect to /brand (the press kit was folded in), and
    // /brand is one of the noindexed pages below. So the entry asked crawlers
    // to index a URL that resolves to a page telling them not to — the exact
    // contradiction the comment below warns about, arriving by redirect
    // instead of directly.
    //
    // Deliberately absent, and it must stay that way: /privacy, /team,
    // /community, /brand, /changelog, /terms and /subprocessors all emit
    // `noindex` (see lib/seo.ts) so the homepage's sitelinks stay commercial.
    // Listing a noindexed URL here would ask crawlers to index the very page
    // that tells them not to. They stay crawlable via robots.txt and their
    // footer links — that access is exactly what lets a crawler read the
    // noindex and drop them from results. Adding any of them back here
    // re-opens the problem. What's left below is the full indexable surface.
  ];
}
