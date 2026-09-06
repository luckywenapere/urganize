import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicPerson } from '@/lib/person-public-server';
import { personSubtitle } from '@/lib/person-public';
import { PERSON_AVAILABILITY_COPY } from '@/lib/person-profile';
import { DIRECTORY_ROLE_LABELS } from '@/lib/directory-roles';

/**
 * A person's public record at /p/{slug}.
 *
 * Server component, no auth, mirroring app/k/[slug]/page.tsx. Every failure
 * resolves to the same 404, so the page cannot tell a reader whether a profile
 * exists and is private from one that never existed.
 *
 * COUNTS ONLY, NO RELEASE TITLES (founder call, 2026-09-05). The count is the
 * product: "Mix engineer, 9 delivered" is the whole claim. Naming the releases
 * would carry the entire cross-team privacy surface for very little more, and a
 * title shown by mistake cannot be taken back.
 *
 * CLAIMED AND VERIFIED ARE RENDERED APART and must stay that way. A role with a
 * count is something the product will vouch for, derived from releases that
 * came out; a role without one is the person's own word. Merging the two lists
 * would put the whole record back at the mercy of self-reporting, which is the
 * thing the directory exists to avoid.
 *
 * noindex, unlike the press kit. A kit is deliberately findable so an editor
 * searching an artist's name lands on it; a person's page is reached by a link
 * they chose to share.
 *
 * The palette is the dark-locked .kit-island block in globals.css, reused
 * rather than copied. That class is now the shared public-artifact palette
 * rather than the press kit's alone — a fifth near-identical block is exactly
 * the drift this repo keeps having to correct.
 */
export const dynamic = 'force-dynamic';

const GROUND = 'var(--kit-ground)';
const SURFACE = 'var(--kit-surface)';
const STROKE = 'var(--kit-border)';
const CREAM = 'var(--kit-text)';
const MUTED = 'var(--kit-text-muted)';
const FAINT = 'var(--kit-text-faint)';
const ACCENT = 'var(--kit-accent)';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const person = await loadPublicPerson(slug);
  if (!person) return { title: 'Not found', robots: { index: false, follow: false } };

  const delivered = person.roles.filter((entry) => entry.delivered > 0);
  const description = delivered.length
    ? `${delivered
        .map((entry) => `${DIRECTORY_ROLE_LABELS[entry.role]}, ${entry.delivered} delivered`)
        .join('. ')}.`
    : person.profile.bio || undefined;

  return {
    title: person.profile.displayName,
    description,
    robots: { index: false, follow: false },
  };
}

export default async function PersonPage({ params }: PageProps) {
  const { slug } = await params;
  const person = await loadPublicPerson(slug);
  if (!person) notFound();

  const { profile, roles } = person;
  const delivered = roles.filter((entry) => entry.delivered > 0);
  const claimed = roles.filter((entry) => entry.delivered === 0);
  const place = personSubtitle(profile);

  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: GROUND, color: CREAM }}>
      <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
        <header>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">{profile.displayName}</h1>
          {place ? (
            <p className="mt-2 text-sm" style={{ color: MUTED }}>
              {place}
            </p>
          ) : null}
          <p className="mt-4 inline-flex rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em]"
             style={{ border: `1px solid ${STROKE}`, color: ACCENT }}>
            {PERSON_AVAILABILITY_COPY[profile.availability].label}
          </p>
        </header>

        {profile.bio ? (
          <p className="mt-10 text-base leading-relaxed" style={{ color: MUTED }}>
            {profile.bio}
          </p>
        ) : null}

        {/* The record. Nothing on this page can change it. */}
        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
            Delivered
          </h2>
          {delivered.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: MUTED }}>
              Nothing on the record yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {delivered.map((entry) => (
                <li
                  key={entry.role}
                  className="flex items-baseline justify-between gap-4 rounded-xl px-4 py-3"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${STROKE}` }}
                >
                  <span className="text-base">{DIRECTORY_ROLE_LABELS[entry.role]}</span>
                  <span className="font-mono text-sm" style={{ color: ACCENT }}>
                    {entry.delivered} delivered
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Deliberately a separate list with a heading that says whose word it
            is. These carry no count because nothing has verified them. */}
        {claimed.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
              Also works as
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {claimed.map((entry) => (
                <li
                  key={entry.role}
                  className="rounded-full px-3 py-1.5 text-sm"
                  style={{ border: `1px solid ${STROKE}`, color: MUTED }}
                >
                  {DIRECTORY_ROLE_LABELS[entry.role]}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {profile.links.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
              Elsewhere
            </h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {profile.links.map((link) => (
                <li key={`${link.label}-${link.url}`}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-sm underline underline-offset-4"
                    style={{ color: CREAM }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-20 pt-8" style={{ borderTop: `1px solid ${STROKE}` }}>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: FAINT }}>
            Delivered with Urganize
          </p>
        </footer>
      </main>
    </div>
  );
}
