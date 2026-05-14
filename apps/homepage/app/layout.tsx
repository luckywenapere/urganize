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
const LANDING_TITLE = "Urganize — Your release deserves a process.";
const LANDING_DESCRIPTION =
  "One workspace for music release workflows — task assignment, versioned asset storage, and pipeline visibility from demo to drop. Built for music management teams.";
const LANDING_KEYWORDS = [
  "music release management",
  "artist release tool",
  "release playbook",
  "music credits",
  "release workflow",
  "artist team software",
  "music SaaS",
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
      className={`${cormorantGaramond.variable} ${instrumentSans.variable} ${ibmPlexMono.variable} ${robotoMono.variable}`}
    >
      <head>
        <meta name="apple-mobile-web-app-title" content="Urganize" />

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
