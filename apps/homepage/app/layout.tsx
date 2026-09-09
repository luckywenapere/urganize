import type { Metadata } from "next";
import Script from "next/script";
import {
  Cormorant_Garamond,
  IBM_Plex_Mono,
  Instrument_Sans,
  Roboto_Mono,
} from "next/font/google";
import "./globals.css";
import { PRODUCT_CATEGORY } from "@/lib/positioning";
import { LANDING_DESCRIPTION, LANDING_TITLE } from "@/lib/seo";
import { Suspense } from "react";
import FormbricksProvider from "./formbricks-provider";
import CursorRefresher from "./components/CursorRefresher";
import { Analytics } from "@vercel/analytics/next";
import { LandingAnalytics } from "./components/landing/LandingAnalytics";

const SITE_URL = "https://urganize.app";
const LEGAL_NAME = "The Urganization Ltd";
// AI Music Manager positioning (2026-09-09). The category leads, because it
// is now the thing we want to be found for rather than a description of the
// software. Two terms left with it: "music release management" is a retired
// category label, and "A&R software" named an audience the brief replaced
// with artists, managers and labels. "artist manager software" stays, since
// managers are the middle of the new audience list rather than gone from it.
//
// THE TWO "release" TERMS SURVIVED THE 2026-09-09 rollout rename ON PURPOSE.
// Every string a person reads now says rollout, but these are not read —
// they are what somebody types into a search box, and nobody is searching
// for a word we coined last week. Revisit once the term has an audience.
const LANDING_KEYWORDS = [
  "AI music manager",
  "music manager app",
  "artist manager software",
  "music release planning",
  "release rollout plan",
  "label management software",
  "record label software",
] as const;

// Typography
const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-urg-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-urg-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-urg-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-urg-data",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// JSON-LD Schema Data
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Urganize",
  "legalName": LEGAL_NAME,
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
  "url": SITE_URL,
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

// Price left out deliberately: @urganize/pricing is the source of truth for
// amounts and they can change independently of a deploy that touches this
// file. Point at the pricing page instead of hardcoding a number that could
// drift from what a shopper actually sees.
const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Urganize",
  // The product category, not schema.org's broad "BusinessApplication" that
  // stood here before. The field is free Text, so this is valid, and the
  // 2026-09-09 brief asks the schema to carry the positioning: the whole point
  // of naming a category is that machines and people read the same one. The
  // trade-off, recorded rather than hidden: a crawler grouping apps by the
  // conventional enumerated values will not find Urganize among them.
  "applicationCategory": PRODUCT_CATEGORY,
  "operatingSystem": "Web",
  "description": LANDING_DESCRIPTION,
  "url": SITE_URL,
  "offers": {
    "@type": "Offer",
    "url": `${SITE_URL}/pricing`,
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
      suppressHydrationWarning
      className={`${cormorantGaramond.variable} ${instrumentSans.variable} ${ibmPlexMono.variable} ${robotoMono.variable}`}
    >
      <head>
        <meta name="apple-mobile-web-app-title" content="Urganize" />

        {/* The header's Login / Start-free links leave for app.urganize.app —
            a different origin, so the visitor pays a fresh DNS lookup, TCP
            handshake and TLS negotiation before the app's first byte moves.
            On a high-latency mobile link that's several round trips of dead
            time. Opening the connection now, while they're still reading,
            means the click starts at the request rather than at DNS. */}
        <link rel="preconnect" href="https://app.urganize.app" />
        <link rel="dns-prefetch" href="https://app.urganize.app" />

        {/* Resolves and applies the visitor's theme before first paint, so
            there's no flash of the wrong theme. Falls back to system
            preference (prefers-color-scheme) when nothing is stored yet —
            the SSR default above is dark for no-JS clients and crawlers. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var key = 'urganize.theme';
                  var stored = localStorage.getItem(key);
                  var resolved = stored === 'light' || stored === 'dark'
                    ? stored
                    : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
                  document.documentElement.dataset.marketingTheme = resolved;
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
