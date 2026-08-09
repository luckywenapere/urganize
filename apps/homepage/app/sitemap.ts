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
    {
      url: `${SITE_URL}/press`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
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
