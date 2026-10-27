import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { loadPublicCreditForm } from '@/lib/credits-server';
import { CreditSubmissionForm } from '@/components/credits/CreditSubmissionForm';
import { CreditLinkBeacon } from '@/components/credits/CreditLinkBeacon';

// The public credit-submission form (URG-108). Server component, no auth:
// the unguessable share token is the access control, resolved by
// loadPublicCreditForm with the service-role client — the same contract as
// the public EPK page. force-dynamic because the release context (and the
// link's validity) must be resolved live on every request.
export const dynamic = 'force-dynamic';

// The app's current dark palette via the dark-locked .credits-island vars in
// globals.css. Restyled 2026-10-27 (founder approved the "sleek" mock): the
// real wordmark at the top, one narrow column, no cards, no all-caps labels.
const INK = 'var(--credits-ground)';
const STROKE = 'var(--credits-border)';
const CREAM = 'var(--credits-text)';
const MUTED = 'var(--credits-text-muted)';
const FAINT = 'var(--credits-text-faint)';

function formatReleaseDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const lookup = await loadPublicCreditForm(token);
  if (lookup.kind === 'missing') {
    return { title: 'Submit credits', robots: { index: false, follow: false } };
  }
  const heading = [lookup.form.artistName, lookup.form.releaseTitle].filter(Boolean).join(' — ');
  if (lookup.kind === 'closed') {
    return { title: `Request closed | ${heading}`, robots: { index: false, follow: false } };
  }
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
  const lookup = await loadPublicCreditForm(token);
  if (lookup.kind === 'missing') notFound();

  const form = lookup.form;
  const isClosed = lookup.kind === 'closed';
  const dateLabel = formatReleaseDate(form.releaseDate);

  const subline = [form.artistName, dateLabel ? `Out ${dateLabel}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="credits-island min-h-screen" style={{ backgroundColor: INK, color: CREAM }}>
      <div className="mx-auto max-w-[460px] px-5 pb-16 pt-8 sm:pt-12">
        <CreditLinkBeacon closed={isClosed} />
        <div className="flex items-center justify-between">
          <a href="https://urganize.app" target="_blank" rel="noopener noreferrer" aria-label="Urganize">
            <Logo size="sm" priority />
          </a>
          <span className="text-xs" style={{ color: FAINT }}>
            {isClosed ? 'Request closed' : 'Credits'}
          </span>
        </div>

        <header className="mt-12">
          {subline ? (
            <p className="text-sm" style={{ color: FAINT }}>
              {subline}
            </p>
          ) : null}
          <h1 className="font-display mt-1 text-4xl leading-tight sm:text-5xl">
            {form.releaseTitle}
          </h1>
        </header>

        {/* A closed link keeps the same header (so the person knows they had
            the right song) and replaces the form with one plain explanation.
            Deliberately NOT a 404: they were sent this link by someone they
            work with, and "page not found" reads as their mistake. */}
        {isClosed ? (
          <div className="mt-8">
            <p className="text-lg" style={{ color: CREAM }}>
              This request is closed.
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: MUTED }}>
              The team behind{' '}
              <span style={{ color: CREAM }}>{form.releaseTitle || 'this release'}</span> is not
              collecting credits through this link right now. If you still need to add or change
              yours, message them directly.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: MUTED }}>
              Add your details so you get credited and paid. About a minute.
            </p>

            <CreditSubmissionForm
              token={token}
              releaseTitle={form.releaseTitle}
              artistName={form.artistName}
            />
          </>
        )}

        <p className="mt-10 border-t pt-5 text-center text-xs" style={{ borderColor: STROKE, color: FAINT }}>
          Only the team behind this release sees your answers.
        </p>
      </div>
    </main>
  );
}
