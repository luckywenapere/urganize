import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicPerson } from '@/lib/person-public-server';
import { loadUnclaimedPerson } from '@/lib/person-unclaimed-server';
import { UnclaimedProfileView } from '@/components/people/UnclaimedProfileView';
import { DIRECTORY_ROLE_LABELS } from '@/lib/directory-roles';
import { createClient } from '@supabase/supabase-js';
import { ProfileActions } from '@/components/people/ProfileActions';
import { EMPTY_PERSON_PAGE_EXTRAS, loadPersonPageExtras } from '@/lib/person-page-extras-server';
import { hypeLine, initialsOf, roleLine } from '@/lib/person-page';
import { ProfileViewBeacon } from '@/components/directory/ProfileViewBeacon';
import { ProfileGrowthFooter } from '@/components/people/ProfileGrowthFooter';
import { OwnProfileShare } from '@/components/people/OwnProfileShare';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { isLikelyBot, isPrefetchRequest, publicProfileViewedProperties } from '@/lib/profile-growth';
import { recordPublicProfileView } from '@/lib/profile-growth-server';
import { headers } from 'next/headers';

/**
 * A person's public record at /p/{slug}.
 *
 * Server component, no auth, mirroring app/k/[slug]/page.tsx. Every failure
 * resolves to the same 404, so the page cannot tell a reader whether a profile
 * exists and is private from one that never existed.
 *
 * THE CLAIMED PAGE IS THE URG-305 DESIGN (2026-10-15, founder-approved mock
 * profile.html): cover, face, name and tick, role · city, one hype line, the
 * artists they manage, up to three numbers, a credits grid, Reach and save.
 * Bare minimum text. ANYTHING WE LACK IS HIDDEN, never filled with placeholder
 * copy: no photo hides the cover, no bio hides the hype line, no roster hides
 * "Managing", a zero hides its number, and there is no vouch or years data yet,
 * so those two numbers do not render at all.
 *
 * NO RELEASE TITLES (founder call, 2026-09-05) still holds: the credits grid is
 * cover art only, of releases that came out (lib/person-page-extras-server.ts).
 *
 * noindex, unlike the press kit: a person's page is reached by a link they
 * chose to share.
 *
 * The palette is the app's dark tokens (#0c0c0d ground, #171719 surface,
 * #7fd99a accent), set on the shared .kit-island class's variables inline so
 * the footer and share row underneath follow it.
 */
export const dynamic = 'force-dynamic';

const GROUND = '#0c0c0d';
const SURFACE = '#171719';
const CREAM = '#f2f2f0';
const MUTED = '#929291';
const ACCENT = '#7fd99a';

/** The app's dark tokens on the shared public-page class (see the comment above). */
const PALETTE = {
  '--kit-ground': GROUND,
  '--kit-surface': SURFACE,
  '--kit-border': '#202023',
  '--kit-text': CREAM,
  '--kit-text-muted': MUTED,
  '--kit-text-faint': MUTED,
  '--kit-accent': ACCENT,
  backgroundColor: GROUND,
  color: CREAM,
} as React.CSSProperties;

type PageProps = { params: Promise<{ slug: string }> };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const person = await loadPublicPerson(slug);
  if (!person) {
    // Somebody a team credited who has not claimed their page. Name only.
    const unclaimed = await loadUnclaimedPerson(slug);
    if (unclaimed) return { title: unclaimed.displayName, robots: { index: false, follow: false } };
    return { title: 'Not found', robots: { index: false, follow: false } };
  }

  const delivered = person.roles.filter((entry) => entry.delivered > 0);
  const description = delivered.length
    ? `${delivered
        .map((entry) => `${DIRECTORY_ROLE_LABELS[entry.role]}, ${entry.delivered} delivered`)
        .join('. ')}.`
    : person.view.bio || undefined;

  return {
    title: person.profile.displayName,
    description,
    robots: { index: false, follow: false },
  };
}

/** One counted read of the page (public_profile_viewed), after the reply. */
async function countView(input: { slug: string; claimed: boolean; personId: string | null }) {
  const requestHeaders = await headers();
  recordPublicProfileView({
    ...input,
    isBotOrPrefetch:
      isLikelyBot(requestHeaders.get('user-agent')) || isPrefetchRequest((name) => requestHeaders.get(name)),
    event: createPostHogEvent(
      'public_profile_viewed',
      publicProfileViewedProperties({ slug: input.slug, claimed: input.claimed })
    ),
  });
}

export default async function PersonPage({ params }: PageProps) {
  const { slug } = await params;
  const person = await loadPublicPerson(slug);
  if (!person) {
    const unclaimed = await loadUnclaimedPerson(slug);
    if (unclaimed) {
      await countView({ slug: unclaimed.slug, claimed: false, personId: null });
      return <UnclaimedProfileView person={unclaimed} />;
    }
    notFound();
  }

  const { profile, roles, view, profileType } = person;
  const pageSlug = profile.slug || slug.trim().toLowerCase();
  await countView({ slug: pageSlug, claimed: true, personId: profile.id });

  const admin = adminClient();
  const extras = admin
    ? await loadPersonPageExtras(admin, { userId: profile.userId, personId: profile.id })
    : EMPTY_PERSON_PAGE_EXTRAS;
  const role = roleLine({ roles, profileType, city: profile.city || view.location });
  const hype = hypeLine(view.bio);
  // Vouches and years have no data source yet, so only Releases can show.
  const stats = [{ key: 'releases', value: extras.releases, label: 'Releases' }].filter((stat) => stat.value > 0);

  return (
    <div className="kit-island min-h-screen" style={PALETTE}>
      <main className="mx-auto w-full max-w-[480px] pb-16">
        {/* Only a public profile reaches this page, and a profile is only public once claimed. */}
        <ProfileViewBeacon roles={roles.map((entry) => entry.role)} claimed />

        {view.photoUrl ? (
          <div aria-hidden="true" className="relative h-[150px] overflow-hidden">
            {/* A plain img on purpose: a signed url with a short life, which
                next/image would proxy and cache past that. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.photoUrl} alt="" className="h-full w-full scale-125 object-cover opacity-60 blur-2xl" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent, ${GROUND})` }} />
          </div>
        ) : (
          <div className="h-16" />
        )}

        <header className={`relative px-[22px] ${view.photoUrl ? '-mt-[58px]' : ''}`}>
          <Face name={profile.displayName} url={view.photoUrl} />
          <h1 className="mt-3.5 font-display text-[30px] leading-tight">
            {profile.displayName}
            <Tick />
          </h1>
          {role ? <p className="mt-1.5 font-mono text-[15px]" style={{ color: MUTED }}>{role}</p> : null}
          {hype ? <p className="mt-3.5 text-[17px] font-semibold">{hype}</p> : null}
        </header>

        {extras.managed.count > 0 ? (
          <div className="flex items-center px-[22px] pt-6">
            <div className="flex">
              {extras.managed.faces.map((face, index) => (
                <span
                  key={face.id}
                  title={face.name}
                  className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold"
                  style={{
                    marginLeft: index === 0 ? 0 : -14,
                    border: `3px solid ${GROUND}`,
                    outline: `2px solid ${ACCENT}`,
                    outlineOffset: -2,
                    backgroundColor: SURFACE,
                  }}
                >
                  {face.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={face.photoUrl} alt={face.name} className="h-full w-full object-cover" />
                  ) : (
                    initialsOf(face.name)
                  )}
                </span>
              ))}
            </div>
            <span className="ml-3.5 text-[15px] font-bold">Managing {extras.managed.count}</span>
          </div>
        ) : null}

        {stats.length > 0 ? (
          <dl className="flex gap-[34px] px-[22px] pt-6">
            {stats.map((stat) => (
              <div key={stat.key} className="flex flex-col-reverse">
                <dt className="font-mono text-xs" style={{ color: MUTED }}>{stat.label}</dt>
                <dd className="font-display text-[26px]">{stat.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {extras.credits.length > 0 ? (
          <ul className="mx-[22px] mt-6 grid grid-cols-3 gap-[3px] overflow-hidden rounded-[14px]">
            {extras.credits.map((tile) => (
              <li key={tile.id} className="aspect-square" style={{ backgroundColor: SURFACE }}>
                {/* Cover art only: release titles stay off this page. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tile.coverUrl} alt="" className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        ) : null}

        <div className="px-[22px]">
          <ProfileActions slug={pageSlug} />

          {/* Shown only to the signed-in owner of this page, after it draws. */}
          <OwnProfileShare slug={pageSlug} />

          <ProfileGrowthFooter slug={pageSlug} />
        </div>
      </main>
    </div>
  );
}

function Face({ name, url }: { name: string; url: string | null }) {
  return (
    <div
      className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full font-display text-3xl"
      style={{ border: `4px solid ${GROUND}`, outline: `2px solid ${ACCENT}`, backgroundColor: SURFACE }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </div>
  );
}

function Tick() {
  return (
    <span
      role="img"
      aria-label="Claimed"
      className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full align-[4px] text-xs font-black text-black"
      style={{ backgroundColor: ACCENT, fontFamily: 'system-ui, sans-serif' }}
    >
      ✓
    </span>
  );
}
