import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { LANDING_DESCRIPTION, LANDING_TITLE, ORGANIZATION_ID } from "@/lib/seo";
import { PRICING_TIER_ORDER, getTier, getTierPrice } from "@urganize/pricing";
import { Suspense } from "react";
import FormbricksProvider from "./formbricks-provider";
import CursorRefresher from "./components/CursorRefresher";
import { Analytics } from "@vercel/analytics/next";
import { LandingAnalytics } from "./components/landing/LandingAnalytics";
import { homeFontVariables } from "./components/landing/home-fonts";

const SITE_URL = "https://urganize.app";
const LEGAL_NAME = "Urganize Technologies Limited";
// AI Music Manager positioning (2026-09-09). The category leads, because it
// is now the thing we want to be found for rather than a description of the
// software. Two terms left with it: "music release management" is a retired
// category label, and "A&R software" named an audience the brief replaced
// with artists, managers and labels (labels went too on 2026-09-11, see the
// last paragraph). "artist manager software" stays, since managers are still
// in the audience list rather than gone from it.
//
// THE TWO "release" TERMS SURVIVED THE 2026-09-09 rollout rename ON PURPOSE.
// Every string a person reads now says rollout, but these are not read —
// they are what somebody types into a search box, and nobody is searching
// for a word we coined last week. Revisit once the term has an audience.
//
// THE WHOLE LIST SURVIVED THE 2026-09-11 CATEGORY WIDENING for the same
// reason, and this is the case where the rule is hardest to keep: "AI music
// manager" was chosen BECAUSE it was the category, and the category is now
// "AI Music Business Manager". It stays anyway, because search volume does not
// move when we change our own words — a searcher still types the short form.
// Adding the long form would cost nothing and find nobody, so it waits for the
// same signal the release terms are waiting for.
//
// TWO MORE LEFT ON 2026-09-11, when the audience narrowed to artists and
// managers (founder call: it is not for labels): "label management software"
// and "record label software". That is the A&R rule from the first paragraph,
// not a reversal of the two between it and here: a CATEGORY rename keeps its
// keywords because the searcher still types the old word, but a keyword that
// recruits an AUDIENCE the brief no longer names sends the wrong person to a
// page that tells them so.
//
// THE LIST SURVIVED THE 2026-09-24 POSITIONING TOO ("Everything after the
// music"), by the category rule above: nobody searches for our new line, and
// "AI music manager" is still what a searcher types. Labels came back into the
// audience that day, so the two label terms that left on 2026-09-11 could
// return by the A&R rule; that is a founder call, not done here.
//
// 2026-10-18: ARTIST-MANAGERS-FIRST POSITIONING (founder approved). The
// description now ends "Built for artist managers.", the pricing title names
// artist managers and their teams, and the list was rewritten around the
// buyer rather than kept by the category rule above. "AI music manager" and
// "music manager app" left (the product is no longer introduced as an AI
// manager, and the second recruits artists looking for a manager); "music
// rollout plan" and "artist management app" joined as the words a manager
// types when looking for a plan. Meta keywords carry little ranking weight;
// the list is kept so it states the same audience the copy does.
const LANDING_KEYWORDS = [
  "artist manager software",
  "music release planning",
  "release rollout plan",
  "music rollout plan",
  "artist management app",
  "music task tracker",
  "record label software",
  "music team task management",
] as const;

// Typography (2026-11-15, #1312): every marketing page wears DM Sans, the
// logo's lettering, and DM Mono for meta. Both come from
// components/landing/home-fonts.ts, the same instances the homepage uses.

// JSON-LD Schema Data
// Entity facts (2026-09-30, global-branding pass). A brand search for
// "urganize" is ambiguous to a search engine: it is one letter from "urbanize"
// and "organize", and the only things that say which entity this is are the
// facts attached to it. `@id` gives the other schemas below a stable node to
// point at (publisher, provider); `foundingDate` is the "Started December 2025"
// the brand page already states; the country is the registration the terms
// already state. Nothing here is new information, it is existing copy made
// machine-readable. Do not add a street address, employee count or founder
// list without the founder confirming them: a knowledge panel repeats
// whatever this says.
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  "name": "Urganize",
  "legalName": LEGAL_NAME,
  "foundingDate": "2025-12",
  "address": { "@type": "PostalAddress", "addressCountry": "NG" },
  "url": SITE_URL,
  "logo": "https://urganize.app/images/urganize-logo.png",
  "description": LANDING_DESCRIPTION,
  "sameAs": [
    "https://x.com/urganize",
    "https://linkedin.com/company/urganize",
    "https://instagram.com/urganize",
    "https://tiktok.com/@urganize",
    "https://youtube.com/@urganize",
    "https://threads.net/@urganize"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "contact@urganize.app",
    "contactType": "Customer Support"
  }
} as const;

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Urganize",
  // Google builds the site name shown above a result from this pair. The bare
  // domain is how people type and say the brand, so it is offered as the
  // alternate form.
  "alternateName": "urganize.app",
  "url": SITE_URL,
  "inLanguage": "en",
  "publisher": { "@id": ORGANIZATION_ID },
  "description": LANDING_DESCRIPTION
} as const;

const homepageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": LANDING_TITLE,
  "description": LANDING_DESCRIPTION,
  "url": SITE_URL,
  "breadcrumb": {
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": SITE_URL
      }
    ]
  }
} as const;

// The offer states a price range, and the range is COMPUTED from
// @urganize/pricing rather than written here, so it cannot drift from what the
// pricing page shows. It was a bare Offer with no price until 2026-09-30, which
// Google's structured-data report flags as invalid (an Offer must carry a
// price), so the rich-result eligibility this schema exists for was never
// actually available. Monthly figures, because monthly is the price each tier
// declares; the yearly one is arithmetic on top of it.
// Contact-us tiers (Label, a custom deal from a starting price) are left out,
// so the range is the self-serve plans a visitor can buy by card.
const monthlyPrices = PRICING_TIER_ORDER.filter((id) => !getTier(id).contactSales)
  .map((id) => getTierPrice(id, "monthly")?.amount)
  .filter((amount): amount is number => typeof amount === "number");

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Urganize",
  // schema.org's enumerated "BusinessApplication". From 2026-09-09 until
  // 2026-09-24 this carried the product category as free text instead, so the
  // schema said what the copy said. The 2026-09-24 positioning introduces the
  // product by what it holds rather than by a category, so there is no category
  // name left to carry and the conventional value, which crawlers group by,
  // comes back. The positioning still reaches machines through "description".
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "description": LANDING_DESCRIPTION,
  "url": SITE_URL,
  "provider": { "@id": ORGANIZATION_ID },
  "offers": {
    "@type": "AggregateOffer",
    "url": `${SITE_URL}/pricing`,
    "lowPrice": Math.min(...monthlyPrices),
    "highPrice": Math.max(...monthlyPrices),
    "offerCount": monthlyPrices.length,
    // NGN, not USD. Every price Urganize actually charges is in Naira: the
    // pricing tiers carry NGN amounts only, the Paystack account offers NGN
    // alone in plan creation, and USD checkout has never worked. This said USD
    // from the day it was written (corrected 2026-08-24).
    "priceCurrency": "NGN"
  }
} as const;

export const metadata: Metadata = {
  title: {
    default: "Urganize",
    template: "%s | Urganize",
  },
  description: LANDING_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  keywords: [...LANDING_KEYWORDS],
  robots: {
    index: true,
    follow: true,
  },
  // Favicons at FIXED root paths (2026-10-12: Bing showed a blank globe
  // instead of the logo). They used to sit in app/ as Next's file-convention
  // icons, which emit fingerprinted hrefs ("/favicon.ico?favicon.10-...ico")
  // and an SVG Bing does not use. Bing reads the plain /favicon.ico and a PNG
  // whose size is a multiple of 48, so those lead; the SVG stays for browsers.
  // The files live in public/, so these hrefs never change between deploys.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  // Bing Webmaster Tools ownership proof. Renders nothing until the env var
  // is set in Vercel (Production), so this is inert for local/preview builds.
  ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? {
        verification: {
          other: {
            "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
          },
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-marketing-theme="dark"
      data-site-wallpaper="night-sky"
      suppressHydrationWarning
      className={homeFontVariables}
    >
      <head>
        <meta name="apple-mobile-web-app-title" content="Urganize" />

        {/* The header's Login / Start-free links leave for team.urganize.app —
            a different origin, so the visitor pays a fresh DNS lookup, TCP
            handshake and TLS negotiation before the app's first byte moves.
            On a high-latency mobile link that's several round trips of dead
            time. Opening the connection now, while they're still reading,
            means the click starts at the request rather than at DNS. */}
        <link rel="preconnect" href="https://team.urganize.app" />
        <link rel="dns-prefetch" href="https://team.urganize.app" />

        {/* Picks the wallpaper before first paint, so it never flashes
            (#1325; the rule is lib/theme.ts, change both together). The site
            always draws its dark look over the picture. The sun and moon
            button's choice wins (light = forest, dark = night sky); with
            nothing stored, the visitor's clock decides: the forest from
            05:00 to 17:59, the night sky otherwise. No-JS clients and
            crawlers get the night sky from the attributes above. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var root = document.documentElement;
                  var stored = localStorage.getItem('urganize.theme');
                  var hour = new Date().getHours();
                  var wall = stored === 'light' ? 'forest'
                    : stored === 'dark' ? 'night-sky'
                    : (hour >= 5 && hour < 18 ? 'forest' : 'night-sky');
                  root.dataset.marketingTheme = 'dark';
                  root.dataset.siteWallpaper = wall;
                } catch (_) {}
              })();
            `,
          }}
        />

        {/* Prices in the visitor's currency from the first paint (#1301).
            proxy.ts sets urg_currency from the visitor's country. Outside
            Nigeria this hides every price (data-visitor-price) until the page
            has swapped it to dollars, so naira never shows. The timeout is a
            safety net: if the page's scripts never run, prices still appear. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  if (/(?:^|; *)urg_currency=USD(?:;|$)/.test(document.cookie)) {
                    var root = document.documentElement;
                    root.dataset.currency = 'USD';
                    setTimeout(function () { root.dataset.currencyReady = '1'; }, 3000);
                  }
                } catch (_) {}
              })();
            `,
          }}
        />

        {/* JSON-LD STRUCTURED DATA */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
          key="organization-schema"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
          key="website-schema"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageSchema) }}
          key="homepage-schema"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
          key="software-application-schema"
        />
      </head>
      <body className="font-sans antialiased">
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-X4PX21EV8K"
          strategy="afterInteractive"
        />
        <Script id="urganize-ga" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-X4PX21EV8K');
          `}
        </Script>
        <CursorRefresher />
        <Suspense>
          <FormbricksProvider />
        </Suspense>
        {children}
        <Analytics />
        {/* One delegated listener for the site's funnel events (trial clicks
            on every page, FAQ opens on the homepage). Mounted here and nowhere
            else, or a click reports twice. */}
        <LandingAnalytics />
      </body>
    </html>
  );
}
