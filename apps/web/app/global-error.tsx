'use client';

import { SUPPORT_WHATSAPP_URL } from '@/lib/support-contact';

// The last line of defence: a crash in the root layout itself, which app/error.tsx
// cannot catch because it renders inside that layout. Next replaces the entire
// document with this, so it has to supply its own <html> and <body>.
//
// Two rules govern everything here, and both are the reason it looks cruder than
// the rest of the app:
//
// 1. STYLING CANNOT BE ASSUMED. The root layout is what links the compiled CSS
//    and declares the next/font variables, and the root layout is precisely what
//    failed. A dev-server check on 2026-08-13 showed Next still injecting the
//    stylesheet links here, so Tailwind classes may well work — but "may well"
//    is not a property to hang the last error screen in the app on, and the font
//    variables are genuinely absent. So every colour is an inline literal (the
//    Brand Bible ink/spring values, hardcoded the way .epk-island hardcodes its
//    dark-locked palette) and the type is a system stack. Correct by
//    construction, in dev and prod and across Next upgrades.
//
// 2. NO MOVING PARTS. No auth store, no analytics, no storage reads. The
//    analytics client dynamically imports PostHog and touches localStorage,
//    either of which could be the thing that brought us here; a boundary that
//    can throw is not a boundary. That is why this page reports nothing — the
//    console error React already logged is the record. Only a plain string
//    constant is imported.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: '#0d120e',
          color: '#f5f0e6',
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#7fd99a',
            }}
          >
            Urganize
          </p>
          <h1
            style={{
              margin: '6px 0 0',
              fontSize: '22px',
              lineHeight: 1.25,
              fontWeight: 600,
            }}
          >
            The app failed to start
          </h1>
          <p
            style={{
              margin: '12px 0 0',
              fontSize: '14px',
              lineHeight: 1.6,
              color: 'rgba(245, 240, 230, 0.64)',
            }}
          >
            Something went wrong before we could load your workspace. Reloading
            usually clears it. Nothing you have saved is affected.
          </p>

          <div
            style={{
              marginTop: '24px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            {/* A full document reload, not reset(): re-rendering a tree whose
                root layout just threw tends to land in the same place. */}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                minHeight: '44px',
                padding: '0 20px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#7fd99a',
                color: '#0d120e',
                fontSize: '14px',
                fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              Reload the app
            </button>
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 20px',
                border: '1px solid rgba(245, 240, 230, 0.12)',
                color: 'rgba(245, 240, 230, 0.64)',
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              Message the founder
            </a>
          </div>

          {error.digest ? (
            <p
              style={{
                margin: '24px 0 0',
                paddingTop: '16px',
                borderTop: '1px solid rgba(245, 240, 230, 0.12)',
                fontSize: '12px',
                lineHeight: 1.6,
                color: 'rgba(245, 240, 230, 0.4)',
              }}
            >
              Reference{' '}
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {error.digest}
              </span>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
