import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CuratorPageCta } from '@/components/curator/CuratorPageCta';
import { curatorPageDescription } from '@/lib/curator-public';
import { loadPublicCuratorPage } from '@/lib/curator-public-server';
import { PITCH_PLATFORM_LABELS } from '@/lib/pitching';
import { curatorStatsLine, initialsOf, pitchingSteps, playlistWants } from '@/lib/public-pages-desktop';

/**
 * A playlist curator's public page.
 *
 * WHY IT EXISTS. A curator posted her own settings URL to a WhatsApp status
 * telling artists to pitch her; that route bounces everyone else to the sign-in
 * screen, and the curator side had no shareable link at all. This is the link.
 *
 * It is READ ONLY. Nothing here writes a pitch: an artist makes an account and
 * pitches through the ordinary path, which is what keeps this page free of the
 * spam surface an open submission form would have opened.
 *
 * noindex on BOTH branches, including not-found, or a slug somebody guessed
 * becomes an indexable page. Unlike the press kit, which is deliberately
 * findable, this one is reached by a link she chose to post. Making it listed
 * is a later decision, not an omission.
 *
 * force-dynamic because her photo's signed URL has to be minted fresh, and
 * because publishing has to take effect at once rather than when a cache
 * decides.
 *
 * The palette is the dark-locked .kit-island block in globals.css, which is the
 * shared public-artifact palette rather than the press kit's alone. A sixth
 * near-identical block is exactly the drift this repo keeps correcting.
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
  const page = await loadPublicCuratorPage(slug);
  if (!page) {
    return { title: 'Not found', robots: { index: false, follow: false } };
  }
  return {
    title: `Pitch to ${page.displayName}`,
    description: curatorPageDescription(page),
    robots: { index: false, follow: false },
  };
}

/** A link that is safe to render from a URL somebody typed. */
function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) return <span style={{ color: MUTED }}>{children}</span>;
  return (
    <a
      href={trimmed}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline underline-offset-4"
      style={{ color: ACCENT }}
    >
      {children}
    </a>
  );
}

const initials = initialsOf;

/** A flat tile, never an empty one or a gradient (#1232). */
const TILE = 'rgba(245, 240, 230, 0.06)';

export default async function PublicCuratorPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await loadPublicCuratorPage(slug);
  if (!page) notFound();

  // Redesigned 2026-10-11 (founder brief): this is the page curators post to
  // their status and bio, so it is the front door for most new artists. One
  // big face, one sentence, one button, then her playlists as tiles.
  const totalFollowers = page.playlists.reduce(
    (sum, playlist) => sum + (playlist.followerCount ?? 0),
    0
  );

  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: GROUND }}>
      <CuratorDesktop page={page} totalFollowers={totalFollowers} />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20 lg:hidden">
        <header className="flex flex-col items-center text-center">
          {page.photoUrl ? (
            // A signed Storage URL with a one hour life. next/image would
            // proxy and cache it past its own expiry.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.photoUrl}
              alt={page.displayName}
              className="h-32 w-32 rounded-full object-cover shadow-2xl sm:h-40 sm:w-40"
              style={{ backgroundColor: SURFACE, boxShadow: `0 0 0 4px ${GROUND}, 0 0 0 6px ${ACCENT}` }}
            />
          ) : (
            <span
              className="flex h-32 w-32 items-center justify-center rounded-full font-display text-4xl sm:h-40 sm:w-40"
              style={{ backgroundColor: SURFACE, color: CREAM, boxShadow: `0 0 0 4px ${GROUND}, 0 0 0 6px ${ACCENT}` }}
            >
              {initials(page.displayName)}
            </span>
          )}

          <h1 className="mt-7 font-display text-4xl leading-tight sm:text-6xl" style={{ color: CREAM }}>
            {page.displayName}
          </h1>

          {page.playlists.length > 0 ? (
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em]" style={{ color: FAINT }}>
              {page.playlists.length === 1 ? '1 playlist' : `${page.playlists.length} playlists`}
              {totalFollowers > 0 ? ` · ${totalFollowers.toLocaleString('en')} followers` : ''}
            </p>
          ) : null}

          {page.bio ? (
            <p className="mt-6 max-w-lg whitespace-pre-line text-[16px] leading-7" style={{ color: MUTED }}>
              {page.bio}
            </p>
          ) : null}

          <CuratorPageCta
            slug={page.slug}
            displayName={page.displayName}
            hasPlaylists={page.playlists.length > 0}
          />
        </header>

        {page.playlists.length > 0 ? (
          <section className="mt-16">
            <ul className="grid grid-cols-2 gap-3 sm:gap-4">
              {page.playlists.map((playlist) => (
                <li
                  key={playlist.id}
                  className="flex aspect-square flex-col justify-end overflow-hidden rounded-2xl p-4"
                  style={{
                    background: `linear-gradient(160deg, ${SURFACE} 0%, ${GROUND} 100%)`,
                    border: `1px solid ${STROKE}`,
                  }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
                    {PITCH_PLATFORM_LABELS[playlist.platform] || PITCH_PLATFORM_LABELS.other}
                  </p>
                  <p className="mt-1 line-clamp-2 font-display text-lg leading-snug sm:text-xl" style={{ color: CREAM }}>
                    {playlist.url ? (
                      <SafeLink href={playlist.url}>{playlist.name}</SafeLink>
                    ) : (
                      playlist.name
                    )}
                  </p>
                  {playlist.followerCount !== null ? (
                    <p className="mt-1 text-xs" style={{ color: FAINT }}>
                      {playlist.followerCount.toLocaleString('en')} followers
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-20 text-center">
          <a
            href="https://urganize.app"
            className="font-mono text-[11px] tracking-[0.12em] hover:underline"
            style={{ color: FAINT }}
          >
            Made with Urganize
          </a>
        </footer>
      </main>
    </div>
  );
}

/**
 * The curator page on a computer (#1232; approved mock
 * docs/mocks/public-pages-desktop, screen 4): name, numbers and the Pitch
 * button on one row, the playlists three across with flat initials tiles, and
 * how pitching works. A phone keeps the stacked page above.
 */
function CuratorDesktop({
  page,
  totalFollowers,
}: {
  page: NonNullable<Awaited<ReturnType<typeof loadPublicCuratorPage>>>;
  totalFollowers: number;
}) {
  const stats = curatorStatsLine(page.playlists.length, totalFollowers);
  return (
    <div className="hidden lg:block">
      <div className="flex h-16 items-center justify-between border-b px-10" style={{ borderColor: STROKE }}>
        <a href="https://urganize.app" className="font-display text-[20px]" style={{ color: ACCENT }}>
          Urganize
        </a>
        <span className="text-[13px]" style={{ color: MUTED }}>
          Playlist curator
        </span>
      </div>

      <main className="mx-auto max-w-[1080px] px-10 pb-12 pt-10">
        <header className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-7">
          {page.photoUrl ? (
            // A signed Storage URL with a one hour life. next/image would
            // proxy and cache it past its own expiry.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.photoUrl}
              alt={page.displayName}
              className="h-[120px] w-[120px] rounded-full object-cover"
              style={{ backgroundColor: SURFACE }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-[120px] w-[120px] items-center justify-center rounded-full font-display text-[40px]"
              style={{ backgroundColor: TILE, color: MUTED }}
            >
              {initials(page.displayName)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-[40px] leading-[1.15]" style={{ color: CREAM }}>
              {page.displayName}
            </h1>
            {stats ? (
              <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
                {stats}
              </p>
            ) : null}
            {page.bio ? (
              <p className="mt-2.5 max-w-[640px] whitespace-pre-line text-[15px] leading-6" style={{ color: MUTED }}>
                {page.bio}
              </p>
            ) : null}
          </div>
          <CuratorPageCta
            slug={page.slug}
            displayName={page.displayName}
            hasPlaylists={page.playlists.length > 0}
            layout="row"
          />
        </header>

        {page.playlists.length > 0 ? (
          <ul className="mt-8 grid grid-cols-3 gap-4">
            {page.playlists.map((playlist) => {
              const wants = playlistWants(playlist.genres);
              return (
                <li
                  key={playlist.id}
                  className="overflow-hidden rounded-2xl border"
                  style={{ backgroundColor: SURFACE, borderColor: STROKE }}
                >
                  <div
                    aria-hidden="true"
                    className="grid aspect-[16/10] place-items-center font-display text-[44px]"
                    style={{ backgroundColor: TILE, color: MUTED }}
                  >
                    {initials(playlist.name)}
                  </div>
                  <div className="p-4">
                    <p className="text-[12px] font-semibold" style={{ color: MUTED }}>
                      {PITCH_PLATFORM_LABELS[playlist.platform] || PITCH_PLATFORM_LABELS.other}
                    </p>
                    <p className="mt-0.5 line-clamp-2 font-display text-[20px] leading-snug" style={{ color: CREAM }}>
                      {playlist.url ? <SafeLink href={playlist.url}>{playlist.name}</SafeLink> : playlist.name}
                    </p>
                    {playlist.followerCount !== null ? (
                      <p className="mt-1 text-[13px]" style={{ color: FAINT }}>
                        {playlist.followerCount.toLocaleString('en')} followers
                      </p>
                    ) : null}
                    {wants ? (
                      <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
                        {wants}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        <section aria-label="How pitching works" className="mt-6 grid grid-cols-3 gap-4">
          {pitchingSteps(page.displayName).map((step, index) => (
            <div key={step.title} className="rounded-2xl border p-5" style={{ backgroundColor: SURFACE, borderColor: STROKE }}>
              <p className="text-[12px] font-bold tracking-[0.06em]" style={{ color: FAINT }}>
                {index + 1}
              </p>
              <p className="mt-1 font-semibold" style={{ color: CREAM }}>
                {step.title}
              </p>
              <p className="text-[13px]" style={{ color: MUTED }}>
                {step.body}
              </p>
            </div>
          ))}
        </section>

        <footer className="mt-12 text-center">
          <a href="https://urganize.app" className="text-[12px] hover:underline" style={{ color: FAINT }}>
            Made with Urganize
          </a>
        </footer>
      </main>
    </div>
  );
}
