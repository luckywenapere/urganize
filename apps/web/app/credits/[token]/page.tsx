import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicCreditForm } from '@/lib/credits-server';
import { CreditSubmissionForm } from '@/components/credits/CreditSubmissionForm';

// The public credit-submission form (URG-108). Server component, no auth:
// the unguessable share token is the access control, resolved by
// loadPublicCreditForm with the service-role client — the same contract as
// the public EPK page. force-dynamic because the release context (and the
// link's validity) must be resolved live on every request.
export const dynamic = 'force-dynamic';

// Brand palette (URG 001) via the dark-locked .credits-island vars in
// globals.css — see that file for why this duplicates rather than shares
// .epk-island's values.
const INK = 'var(--credits-ground)';
const STROKE = 'var(--credits-border)';
const CREAM = 'var(--credits-text)';
const MUTED = 'var(--credits-text-muted)';
const FAINT = 'var(--credits-text-faint)';
const BRAND = 'var(--credits-accent)';

function formatReleaseDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const form = await loadPublicCreditForm(token);
  if (!form) {
    return { title: 'Submit credits', robots: { index: false, follow: false } };
  }
  const heading = [form.artistName, form.releaseTitle].filter(Boolean).join(' — ');
  return {
    title: `Submit credits | ${heading}`,
    description: `Submit your publishing and production credits for ${heading || 'this release'}.`,
    // Forms are shared by link, never discovered by crawl — the token is the
    // only gate, so keep these URLs out of search indexes.
    robots: { index: false, follow: false },
  };
}

export default async function PublicCreditsPage({ params }: PageProps) {
  const { token } = await params;
  const form = await loadPublicCreditForm(token);
  if (!form) notFound();

  const dateLabel = formatReleaseDate(form.releaseDate);

  return (
    <main className="credits-island min-h-screen" style={{ backgroundColor: INK, color: CREAM }}>
      <div className="mx-auto max-w-[720px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: FAINT }}>
          Submit your credits
        </p>

        <header className="mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.16em]" style={{ color: MUTED }}>
            {form.artistName}
          </p>
          <h1 className="font-display mt-2 text-4xl font-medium leading-tight sm:text-5xl">
            {form.releaseTitle}
          </h1>
          {dateLabel ? (
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em]" style={{ color: BRAND }}>
              Out {dateLabel}
            </p>
          ) : null}
        </header>

        {/* Plain-English framing (2026-08-13): the old copy led with
            "distribution", which is the reason this form exists but not a word
            the person filling it out thinks in. Say what it is for them (being
            credited and paid), how long it takes, and who sees it. */}
        <p className="mt-6 max-w-[52ch] text-sm leading-relaxed" style={{ color: MUTED }}>
          Did you work on this song? Add your details below so you get credited — and paid —
          correctly. It takes about two minutes, and only the team behind this release sees your
          answers.
        </p>
        <p className="mt-3 max-w-[52ch] text-sm leading-relaxed" style={{ color: MUTED }}>
          Only three things are required:{' '}
          <span style={{ color: CREAM }}>your name, what you did, and your email</span>. Skip
          anything you are not sure about.
        </p>

        <CreditSubmissionForm token={token} releaseTitle={form.releaseTitle} />

        <footer className="mt-14 border-t pt-6" style={{ borderColor: STROKE }}>
          <a
            href="https://urganize.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: FAINT }}
          >
            Made with <span style={{ color: BRAND }}>Urganize</span> — the operating system for music business
          </a>
        </footer>
      </div>
    </main>
  );
}
