import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CuratorPageCta } from '@/components/curator/CuratorPageCta';
import { curatorPageDescription } from '@/lib/curator-public';
import { loadPublicCuratorPage } from '@/lib/curator-public-server';
import { PITCH_PLATFORM_LABELS } from '@/lib/pitching';

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

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
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
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
