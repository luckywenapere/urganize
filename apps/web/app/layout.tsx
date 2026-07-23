import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Space_Grotesk, Fraunces, Space_Mono } from 'next/font/google';
import { AppShell } from '@/components/app/AppShell';
import { PostHogProvider } from '@/components/providers/PostHogProvider';
import './globals.css';

// Self-hosted via next/font (preloaded, no third-party request chain). Per
// the Urganize Brand Bible (URG 001): Space Grotesk is the body/UI workhorse
// (--font-sans), Fraunces is the display face used large and with restraint
// for headlines (--font-display), Space Mono carries the "catalog" metadata
// voice — dates, statuses, counts, IDs (--font-mono). IBM Plex Sans is
// retired; globals.css binds all three variables below.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-fraunces',
});
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-space-mono',
});

const appName = 'Urganize';
const appDescription =
  'Urganize is a music campaign execution workspace for planning releases, tracking tasks, and keeping your team aligned.';

function getMetadataBase() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!configuredUrl) {
    return new URL('http://localhost:3000');
  }

  const normalizedUrl = configuredUrl.startsWith('http') ? configuredUrl : `https://${configuredUrl}`;

  try {
    return new URL(normalizedUrl);
  } catch {
    return new URL('http://localhost:3000');
  }
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  openGraph: {
    type: 'website',
    siteName: appName,
    title: appName,
    description: appDescription,
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: `${appName} Open Graph image`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: appName,
    description: appDescription,
    images: ['/opengraph-image.png'],
  },
};

// `viewportFit: 'cover'` lets content extend under the notch/home-indicator
// area on iOS so the existing `env(safe-area-inset-*)` CSS in globals.css has
// something to actually inset against — without it, iOS letterboxes the page
// instead of extending it. themeColor matches the Brand Bible's ink ground so
// the native status bar (and the mobile Chrome/Safari UI chrome) doesn't
// flash white before the app's own dark background paints. No effect on the
// existing web deploy beyond that same status-bar-color meta tag.
// `interactiveWidget: 'resizes-content'` makes the layout viewport shrink
// when the on-screen keyboard opens (Android Chrome's default overlays it
// instead), so bottom-pinned inputs — Chappi's chat box — stay visible above
// the keyboard while typing. iOS ignores the property and already resizes.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#0d120e',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="dark"
      className={`dark ${spaceGrotesk.variable} ${fraunces.variable} ${spaceMono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var key = 'urganize.theme';
                  var stored = localStorage.getItem(key);
                  var resolved;
                  if (stored === 'light' || stored === 'dark') {
                    resolved = stored;
                  } else {
                    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
                  }
                  var root = document.documentElement;
                  root.dataset.theme = resolved;
                  root.classList.remove('dark', 'light');
                  root.classList.add(resolved);
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body className="app-body bg-bg-base text-content-primary antialiased">
        <PostHogProvider>
          <AppShell>{children}</AppShell>
        </PostHogProvider>
      </body>
    </html>
  );
}
