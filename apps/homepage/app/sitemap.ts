import { MetadataRoute } from "next";
import { GUIDES } from "@/content/guides";

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
    // The four persona pages (/for-labels left on 2026-09-11, founder call;
    // its URL redirects to /pricing). Same priority across all of them — the
    // ProductMenu's link order is where the executive-first preference is
    // expressed (that's a sitelink signal we control); sitemap priority is
    // not, and inventing a split here would just be noise.
    {
      url: `${SITE_URL}/for-executives`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for-managers`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for-curators`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for-ai-artists`,
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
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // The guides (2026-09-30): plain answers to what a stranger searches before
    // they know Urganize exists. Unlike the pages above these DO carry a real
    // lastModified, because each guide has one and it only moves when the
    // guide's own text does. The "omit it" rule at the top of this file is about
    // not stamping the build time on everything; this is the opposite case.
    {
      url: `${SITE_URL}/guides`,
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
