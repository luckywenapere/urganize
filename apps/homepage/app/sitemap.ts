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
      url: `${SITE_URL}/team`,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/press`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    // /privacy is deliberately absent: it emits `noindex` (see lib/seo.ts) so
    // it stops outranking the homepage for "urganize". Listing a noindexed
    // URL here would ask crawlers to index the very page that tells them not
    // to. It stays crawlable via robots.txt and the footer link — that's what
    // lets crawlers read the noindex and drop it from the results.
    {
      url: `${SITE_URL}/terms`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/subprocessors`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
