import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/app/api/_shared/auth';
import { isAltlinkEnabled } from '@/lib/altlink/rules';
import { loadLiveSmartLinkUrl } from '@/lib/altlink/server';
import { isCaptureFeatureEnabled, loadCaptureReleaseId, loadPublicCapturePage } from '@/lib/capture-server';
import { CaptureLeadForm } from '@/components/capture/CaptureLeadForm';

// The public fan-capture page (2026-08-14). Server component, no auth: the
// unguessable share token is the access control, resolved by
// loadPublicCapturePage with the service-role client — the same contract as
// the public EPK and credits pages.
//
// force-dynamic, and for the same reason /curator/join/[code] is (CLAUDE.md
// "The front door is server-rendered"): this page's answer depends on a row
// that changes — the copy is edited, the page is paused, the token rotates —
// so there was never a static version to protect. The signed graphic URL
// expires too, which alone rules out caching the HTML.
//
// EVERYTHING A FAN NEEDS IS IN THIS SERVER HTML: the graphic, the headline,
// the field and the button. This is a front door reached from a bio link on a
// phone, which is the exact profile of the users the /auth and /curator/join
// dead ends cost us — a page that renders nothing until 1MB of JS lands is a
// page that loses them. Submitting needs JS (the exchange is a POST), which is
// why there is a <noscript> notice, but the page appears and reads without it.
export const dynamic = 'force-dynamic';

// Brand palette (URG 001) via the dark-locked .capture-island vars in
// globals.css — the .epk-island / .credits-island pattern.
const INK = 'var(--capture-ground)';
const STROKE = 'var(--capture-border)';
const CREAM = 'var(--capture-text)';
const MUTED = 'var(--capture-text-muted)';
const FAINT = 'var(--capture-text-faint)';
const BRAND = 'var(--capture-accent)';

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const page = await loadPublicCapturePage(token);
  if (!page) {
    return { title: 'Get the link', robots: { index: false, follow: false } };
  }
  const heading = [page.artistName, page.releaseTitle].filter(Boolean).join(' — ');
  return {
    title: page.headline || `Get the link | ${heading}`,
    description: page.incentive || `Be first to hear ${page.releaseTitle || 'this release'}.`,
    // Capture pages are shared by link, never discovered by crawl — the token
    // is the only gate, so keep these URLs out of search indexes.
    robots: { index: false, follow: false },
  };
}

export default async function PublicCapturePage({ params }: PageProps) {
  const { token } = await params;
  const page = await loadPublicCapturePage(token);
  if (!page) {
    // Fan emails are off (#872): an old fan page link goes to the rollout's
    // live smart link when it has one, and is a 404 otherwise.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const releaseId = !isCaptureFeatureEnabled() && isAltlinkEnabled() && supabaseUrl ? await loadCaptureReleaseId(token) : null;
    const admin = releaseId && supabaseUrl ? createAdminClient(supabaseUrl) : null;
    const altlinkUrl = admin && releaseId ? await loadLiveSmartLinkUrl(admin, releaseId) : null;
    if (altlinkUrl) redirect(altlinkUrl);
    notFound();
  }

  // Once the rollout has its Altlink pre-save / smart link, an old fan page
  // link sends fans there instead (307, so it can change back). Emails already
  // collected are untouched; the manager still sees them in the Pre-save view.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const admin = isAltlinkEnabled() && supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (admin) {
    const altlinkUrl = await loadLiveSmartLinkUrl(admin, page.releaseId);
    if (altlinkUrl) redirect(altlinkUrl);
  }

  const heading = page.headline || page.releaseTitle || 'Get the link';

  return (
    <main className="capture-island min-h-screen" style={{ backgroundColor: INK, color: CREAM }}>
      {/* max-w-[440px]: this is a single-column phone surface even on a desktop
          monitor. A wider column would spread the graphic, the headline and the
          field far enough apart that they stop reading as one offer. */}
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col px-5 pb-10 pt-10 sm:pt-16">
        {page.graphicUrl ? (
          // Plain <img>, not next/image, for the same reason the EPK page uses
          // one: the src is a Supabase signed URL with a TTL, and proxying or
          // caching it through the optimizer would outlive the signature.
          // aspect-square enforces playbook G2 at render time — whatever the
          // uploaded image's own ratio, it is cropped to a square here so it
          // can never push the field below the fold on a phone.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.graphicUrl}
            alt={`${page.releaseTitle} artwork`}
            className="aspect-square w-full rounded-2xl border object-cover"
            style={{ borderColor: STROKE }}
          />
        ) : null}

        <header className="mt-7">
          {page.artistName ? (
            <p
              className="font-mono text-[11px] uppercase tracking-[0.22em]"
              style={{ color: FAINT }}
            >
              {page.artistName}
            </p>
          ) : null}
          <h1 className="font-display mt-2 text-3xl font-medium leading-tight sm:text-4xl">
            {heading}
          </h1>
          {page.incentive ? (
            <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED }}>
              {page.incentive}
            </p>
          ) : null}
        </header>

        {page.isCollecting ? (
          <CaptureLeadForm
            token={token}
            collectName={page.collectName}
            buttonLabel={page.buttonLabel}
            consentNote={page.consentNote}
            destinationLabel={page.destinationLabel}
          />
        ) : (
          // Paused, or not ready to pay out. Told plainly rather than 404'd: a
          // fan who tapped a link that was shared in good faith deserves an
          // explanation, and a dead end reads as the artist's page being fake.
          <div
            className="mt-8 rounded-2xl border p-6 text-center"
            style={{ borderColor: STROKE, backgroundColor: 'var(--capture-surface)' }}
          >
            <p className="text-sm" style={{ color: CREAM }}>
              {page.isPaused ? 'This list is closed for now.' : 'This page is not ready yet.'}
            </p>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              Check back soon, or follow {page.artistName || 'the artist'} for the announcement.
            </p>
          </div>
        )}

        <noscript>
          <p className="mt-4 text-sm" style={{ color: MUTED }}>
            Signing up needs JavaScript switched on. Turn it on and reload this page.
          </p>
        </noscript>

        <footer className="mt-auto pt-12">
          <a
            href="https://urganize.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: FAINT }}
          >
            Made with <span style={{ color: BRAND }}>Urganize</span>
          </a>
        </footer>
      </div>
    </main>
  );
}
