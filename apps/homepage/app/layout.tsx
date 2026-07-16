import type { Metadata } from "next";
import Script from "next/script";
import {
  Cormorant_Garamond,
  IBM_Plex_Mono,
  Instrument_Sans,
  Roboto_Mono,
} from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import FormbricksProvider from "./formbricks-provider";
import { Analytics } from "@vercel/analytics/next";

const SITE_URL = "https://urganize.app";
const LEGAL_NAME = "The Urganization Ltd";
const LANDING_TITLE = "Urganize | Music Release Management for Teams";
const LANDING_DESCRIPTION =
  "How labels and artist managers run releases across their team, so handoffs and tasks don't slip through WhatsApp and notes.";
const LANDING_KEYWORDS = [
  "music release management",
  "artist manager software",
  "music project management",
  "label management tool",
  "release rollout plan",
  "music release checklist",
  "artist team software",
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
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "description": LANDING_DESCRIPTION,
  "url": SITE_URL,
  "offers": {
    "@type": "Offer",
    "url": `${SITE_URL}/pricing`,
    "priceCurrency": "USD"
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
        <Suspense>
          <FormbricksProvider />
        </Suspense>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
