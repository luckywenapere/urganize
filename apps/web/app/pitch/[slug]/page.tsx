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

  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: GROUND }}>
      <main className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
            Playlist owner
          </p>

          <div className="mt-6 flex items-center gap-4">
            {page.photoUrl ? (
              // A signed Storage URL with a one hour life. next/image would
              // proxy and cache it past its own expiry.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.photoUrl}
                alt={page.displayName}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
                style={{ backgroundColor: SURFACE }}
              />
            ) : (
              <span
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-display text-xl"
                style={{ backgroundColor: SURFACE, color: MUTED }}
              >
                {initials(page.displayName)}
              </span>
            )}
            <h1 className="font-display text-4xl sm:text-5xl" style={{ color: CREAM }}>
              {page.displayName}
            </h1>
          </div>

          {page.bio ? (
            <p className="mt-6 whitespace-pre-line text-[15px] leading-7" style={{ color: MUTED }}>
              {page.bio}
            </p>
          ) : null}
        </header>

        <CuratorPageCta
          slug={page.slug}
          displayName={page.displayName}
          hasPlaylists={page.playlists.length > 0}
        />

        {page.playlists.length > 0 ? (
          <section className="mt-14">
            <h2
              className="font-mono text-[11px] uppercase tracking-[0.18em]"
              style={{ color: FAINT }}
            >
              {page.playlists.length === 1 ? 'The playlist' : 'The playlists'}
            </h2>
            <ul className="mt-4 space-y-3">
              {page.playlists.map((playlist) => (
                <li
                  key={playlist.id}
                  className="rounded-lg border px-4 py-4"
                  style={{ borderColor: STROKE, backgroundColor: SURFACE }}
                >
                  <p className="text-[15px]" style={{ color: CREAM }}>
                    {playlist.url ? (
                      <SafeLink href={playlist.url}>{playlist.name}</SafeLink>
                    ) : (
                      playlist.name
                    )}
                  </p>
                  <p className="mt-1 font-mono text-xs" style={{ color: FAINT }}>
                    {PITCH_PLATFORM_LABELS[playlist.platform] || PITCH_PLATFORM_LABELS.other}
                    {playlist.followerCount !== null
                      ? ` · ${playlist.followerCount.toLocaleString('en')} followers`
                      : ''}
                  </p>
                  {playlist.genres.length > 0 ? (
                    <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
                      {playlist.genres.join(', ')}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-16 border-t pt-6" style={{ borderColor: STROKE }}>
          <p className="font-mono text-[11px]" style={{ color: FAINT }}>
            Made with Urganize
          </p>
        </footer>
      </main>
    </div>
  );
}
