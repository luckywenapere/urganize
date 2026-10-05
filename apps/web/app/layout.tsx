import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Instrument_Sans, Young_Serif, Space_Mono } from 'next/font/google';
import { AppShell } from '@/components/app/AppShell';
import { CursorRefresher } from '@/components/app/CursorRefresher';
import { PostHogProvider } from '@/components/providers/PostHogProvider';
import { CANONICAL_DESCRIPTION } from '@/lib/positioning';
import './globals.css';

// Self-hosted via next/font (preloaded, no third-party request chain). Per
// the Urganize Brand Bible (URG 001): Instrument Sans is the body/UI workhorse (swapped from Space Grotesk 2026-10-05, founder call: Space Grotesk had become the stock "designed" grotesque)
// (--font-sans), Young Serif is the display face used large and with restraint
// for headlines (--font-display), Space Mono carries the "catalog" metadata
// voice — dates, statuses, counts, IDs (--font-mono). IBM Plex Sans is
// retired; globals.css binds all three variables below.
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-sans',
});
const youngSerif = Young_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-young-serif',
});
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-space-mono',
});

const appName = 'Urganize';
// The founder's long description, verbatim (2026-09-24 positioning).
// Imported rather than typed out so the app, the marketing site and the share
// card cannot describe a different product; see lib/positioning.
const appDescription = CANONICAL_DESCRIPTION;

function getMetadataBase() {
  // Production fallback is the CANONICAL domain, never the *.vercel.app
  // deployment host: Vercel Deployment Protection walls that host behind an
  // SSO login, so absolute og:image / twitter:image URLs minted from it are
  // unfetchable by social crawlers — the share card silently stays stale
  // (found 2026-07-23; same root cause as the invite-link fix in
  // lib/tasks-server.ts resolveAppBaseUrl). NEXT_PUBLIC_APP_URL still wins.
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_ENV === 'production' ? 'https://app.urganize.app' : '') ||
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

// Textile character layer (NEXT_PUBLIC_FEATURE_TEXTILE). Read at module scope
// because this is a server component and the value is inlined at build time —
// the same reason a flag flip needs a deploy that actually rebuilds apps/web.
//
// It is applied as a class rather than a data attribute so it survives the
// pre-hydration theme script below, which calls
// `classList.remove('dark', 'light')` — it names those two classes explicitly
// and touches nothing else. Verified before relying on it.
const TEXTILE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TEXTILE === 'true';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="dark"
      className={`dark ${TEXTILE_ENABLED ? 'urg-textile ' : ''}${instrumentSans.variable} ${youngSerif.variable} ${spaceMono.variable}`}
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
        {/*
          Pre-hydration session probe for /auth, the same shape as the theme
          script above and for the same reason: a decision that has to be made
          before the first paint cannot wait for React.

          /auth server-renders the real login form so it survives a failed or
          slow hydration (bug report, 2026-08-12). The server cannot know
          whether the visitor is already signed in, and the React gate in
          AuthPageClient can only correct that after hydration — which is fine
          in practice but not a guarantee, because React may yield while
          hydrating and let the browser paint the form first. This runs before
          the body exists, so the CSS in globals.css keyed on the attribute is
          applied to the very first frame.

          It is a HINT, not authority: the flag is whatever the auth store last
          persisted, so it can be stale (a session that expired while the app
          was closed). AuthPageClient removes the attribute the moment Supabase
          confirms there is no session, which is what reveals the form again.
          Failing to set it at all — storage blocked, unexpected shape — simply
          falls back to the React gate.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  if (!/^\\/auth\\/?$/.test(window.location.pathname)) return;
                  var raw = localStorage.getItem('urganize-auth');
                  if (!raw) return;
                  var parsed = JSON.parse(raw);
                  if (parsed && parsed.state && parsed.state.isAuthenticated === true) {
                    document.documentElement.setAttribute('data-auth-session', '1');
                  }
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body className="app-body bg-bg-base text-content-primary antialiased">
        <CursorRefresher />
        <PostHogProvider>
          <AppShell>{children}</AppShell>
        </PostHogProvider>
      </body>
    </html>
  );
}
