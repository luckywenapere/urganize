import type { PublicUnclaimed } from '@/lib/person-unclaimed-server';
import { UNCLAIMED_COPY } from '@/lib/claim-copy';
import { RemovalForm } from './RemovalForm';
import { ProfileGrowthFooter } from './ProfileGrowthFooter';

// The public page for somebody who has not claimed their profile: a name, an
// "Unclaimed" label and the credits a team collected. Nothing the person did
// not give a team on a credits form. Server component; the one interactive
// piece is the removal form.
//
// Same dark-locked palette as the claimed page (.kit-island), reused rather
// than copied.

const GROUND = 'var(--kit-ground)';
const SURFACE = 'var(--kit-surface)';
const STROKE = 'var(--kit-border)';
const CREAM = 'var(--kit-text)';
const MUTED = 'var(--kit-text-muted)';
const FAINT = 'var(--kit-text-faint)';
const ACCENT = 'var(--kit-accent)';

export function UnclaimedProfileView({ person }: { person: PublicUnclaimed }) {
  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: GROUND, color: CREAM }}>
      <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
        <header>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">{person.displayName}</h1>
          <p
            className="mt-4 inline-flex rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em]"
            style={{ border: `1px solid ${STROKE}`, color: ACCENT }}
          >
            {UNCLAIMED_COPY.badge}
          </p>
          <p className="mt-4 text-sm" style={{ color: MUTED }}>
            {UNCLAIMED_COPY.explain}
          </p>
        </header>

        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
            {UNCLAIMED_COPY.creditsHeading}
          </h2>
          {person.credits.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: MUTED }}>
              {UNCLAIMED_COPY.noCredits}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {person.credits.map((credit, index) => (
                <li
                  key={`${credit.releaseTitle}-${index}`}
                  className="flex items-baseline justify-between gap-4 rounded-xl px-4 py-3"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${STROKE}` }}
                >
                  <span className="text-base">{credit.releaseTitle}</span>
                  <span className="text-right text-sm" style={{ color: MUTED }}>
                    {[credit.roles.join(', '), credit.releaseYear].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <RemovalForm slug={person.slug} />

        <ProfileGrowthFooter slug={person.slug} />
      </main>
    </div>
  );
}
