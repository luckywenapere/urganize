'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronRight, Plus, Users } from '@/components/icons';
import { bucketReleases } from '@/lib/artist-overview';
import { parseReleaseDate } from '@/lib/recap-copy';
import { ADD_ARTIST_HREF, CATALOGUE_HREF } from '@/lib/shell-nav';
import { initialsFor } from '@/lib/swipe-nav';
import { useAuthStore } from '@/lib/auth-store';
import { artistSummary } from '@/lib/artist-overview';
import { artistHref, describeArtistCounts, isArtistPageEnabled } from '@/lib/artist-page';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { artistPhotoUrl, saveArtistPhoto } from '@/lib/profile-photo-client';
import { useReleaseStore } from '@/stores/useReleaseStore';

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

export default function ArtistsPageClient({ swipe = false }: { swipe?: boolean } = {}) {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.isLoading);

  const artists = useArtistRosterStore((state) => state.artists);
  const rosterLoaded = useArtistRosterStore((state) => state.loaded);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const setArtistPhoto = useArtistRosterStore((state) => state.setArtistPhoto);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  useEffect(() => {
    // A direct link followed while the flag is off goes back to the catalogue.
    // The flag is inlined at build time, so there is no server-side gate.
    if (!ARTIST_PAGE_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void loadRoster();
    void loadCommandCenter();
  }, [loadRoster, loadCommandCenter, router]);

  const cards = useMemo(
    () =>
      artists.map((artist) => ({
        artist,
        summary: artistSummary(artist.id, releases),
      })),
    [artists, releases]
  );

  if (!ARTIST_PAGE_ENABLED) return null;

  const loading = (authLoading || !rosterLoaded) && artists.length === 0;

  if (swipe) return <SwipeArtists loading={loading} artists={artists} releases={releases} />;

  return (
    <div>
      {/* The section's content top: the same spacer CatalogueView draws, and
          nothing else above the list, so both tabs start 20px under the tab
          row (tab jump fix, Oct 18, 2026; lib/section-content-top-guard). */}
      <div className="pt-5 sm:pt-6" />

      {loading ? (
        // The list's own shape (tab jump fix, Oct 18, 2026): one card, three
        // 64px rows with the face and the name, so nothing moves when it lands.
        <div
          className="overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface"
          aria-busy="true"
        >
          <ul className="divide-y divide-stroke-subtle">
            {[0, 1, 2].map((key) => (
              <li key={key} className="flex h-16 items-center gap-4 pl-5 pr-5">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-hover" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block h-4 w-32 animate-pulse rounded bg-bg-hover" />
                  <span className="block h-3 w-16 animate-pulse rounded bg-bg-hover md:hidden" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stroke-default p-8 text-center">
          <Users className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-content-primary">No artists yet</p>
          <p className="mt-1 text-sm text-content-secondary">Add an artist in Settings and they appear here.</p>
        </div>
      ) : (
        <div className="section-list-enter overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
          {/* pl matches the rows below, which leave room for the face. Rollouts
              only: Planned and Press kit left the table (founder call,
              2026-10-15), Shows were deleted (Oct 17, 2026); the press kit
              still lives on each artist's page. */}
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_2rem] gap-4 border-b border-stroke-subtle py-3 pl-[4.25rem] pr-5 text-xs font-medium text-content-tertiary md:grid">
            <span>Artist</span>
            <span>Rollouts</span>
            <span />
          </div>
          <ul className="divide-y divide-stroke-subtle">
            {cards.map(({ artist, summary }) => (
              <li key={artist.id} className="relative">
                {/* The face is a SIBLING of the row link, laid over it, never
                    inside it: a button inside an anchor is invalid markup and
                    its tap would open the artist instead of the file picker. */}
                <ProfilePhotoPicker
                  name={artist.name}
                  photoUrl={artist.photoUrl}
                  size={40}
                  signUrl={artistPhotoUrl(artist.id)}
                  save={(path) => saveArtistPhoto(artist.id, path)}
                  onChange={(url) => setArtistPhoto(artist.id, url)}
                  surface="artist_photo"
                  className="absolute left-5 top-3 z-10"
                />
                <Link
                  href={artistHref(artist.id)}
                  className="motion-focus grid min-h-16 items-center gap-x-4 gap-y-1 py-3 pl-[4.25rem] pr-5 transition-colors hover:bg-bg-hover/60 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_2rem]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display text-base font-semibold text-content-primary">
                      {artist.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-content-secondary md:hidden">
                      {/* Rollouts only, like the columns (founder call, 2026-10-15). */}
                      {describeArtistCounts({ ...summary, planned: 0, live: 0 })}
                    </span>
                  </span>
                  <span className="hidden text-sm tabular-nums text-content-primary md:block">{summary.releases}</span>
                  <ArrowRight className="hidden h-4 w-4 text-content-tertiary md:block" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "Drops Fri 6 Nov" within a fortnight, "Drops 4 Dec" further out. */
function describeDrop(value: string | null, now: Date = new Date()): string | null {
  const date = parseReleaseDate(value);
  if (!date) return null;
  const soon = date.getTime() - now.getTime() < 14 * 86_400_000;
  const text = date.toLocaleDateString('en-GB', soon ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
  return `Drops ${text.replace(',', '')}`;
}

type RosterArtist = { id: string; name: string; photoUrl?: string | null };
type RosterRelease = { id: string; artistId: string; releaseDate: string | null; status: string; title: string };

/**
 * The Artists tab in the swipe navigation (URG-380, frame 5): a serif title with
 * one quiet +, a count line whose "in motion" half opens the rollouts list, and
 * one row per artist with their next release and when it drops. Rows, not a
 * card, the same as Home's rows.
 */
function SwipeArtists({
  loading,
  artists,
  releases,
}: {
  loading: boolean;
  artists: RosterArtist[];
  releases: RosterRelease[];
}) {
  const rows = artists.map((artist) => {
    const mine = releases.filter((release) => release.artistId === artist.id);
    const buckets = bucketReleases(mine);
    const next = buckets.planned[0] ?? buckets.live[0] ?? null;
    return { artist, next, drop: next ? describeDrop(next.releaseDate) : null, motion: buckets.planned.length + buckets.live.length };
  });
  const inMotion = rows.reduce((sum, row) => sum + row.motion, 0);

  return (
    <div className="pb-6">
      <div className="mt-3 flex items-end justify-between">
        <h1 className="font-display text-[40px] leading-[1.1] tracking-[-0.3px] text-content-primary">Artists</h1>
        <Link
          href={ADD_ARTIST_HREF}
          aria-label="Add artist"
          className="motion-focus motion-press mb-1 grid h-9 w-9 place-items-center rounded-full border border-content-primary/[0.14] text-content-primary/70 hover:text-content-primary"
        >
          <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
        </Link>
      </div>
      {loading ? (
        <ul className="mt-[18px]" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <li key={key} className="flex h-[76px] items-center gap-3.5 border-b border-content-primary/[0.07] px-1.5">
              <span className="h-[42px] w-[42px] shrink-0 animate-pulse rounded-full bg-bg-hover" />
              <span className="h-4 w-32 animate-pulse rounded bg-bg-hover" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-[22px] border border-content-primary/[0.07] bg-bg-surface p-6">
          <p className="font-display text-2xl text-content-primary">No artists yet.</p>
          <p className="mt-2 text-[15px] text-content-primary/55">Add the first and their rollouts show here.</p>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-[15px] text-content-primary/55">
            {rows.length} {rows.length === 1 ? 'artist' : 'artists'}
            {inMotion > 0 ? (
              <>
                {' · '}
                <Link href={CATALOGUE_HREF} className="motion-focus rounded hover:text-content-primary">
                  {inMotion} {inMotion === 1 ? 'rollout' : 'rollouts'} in motion
                </Link>
              </>
            ) : null}
          </p>
          <ul className="section-list-enter mt-[18px]">
            {rows.map(({ artist, next, drop }) => (
              <li key={artist.id} className="border-b border-content-primary/[0.07] last:border-b-0">
                <Link
                  href={artistHref(artist.id)}
                  className="motion-focus flex min-h-[76px] items-center gap-3.5 px-1.5 py-2"
                >
                  {artist.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artist.photoUrl} alt="" className="h-[42px] w-[42px] shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-bg-elevated text-[13.5px] font-semibold text-content-primary/80" aria-hidden="true">
                      {initialsFor(artist.name)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16.5px] text-content-primary">{artist.name}</span>
                    <span className={`mt-0.5 block truncate text-sm ${next ? 'text-content-primary/75' : 'text-content-primary/40'}`}>
                      {next ? next.title : 'No rollout planned'}
                    </span>
                  </span>
                  {next ? (
                    <span className="shrink-0 font-mono text-xs text-content-primary/50">{drop ?? 'Planning'}</span>
                  ) : null}
                  <ChevronRight className="h-[18px] w-[18px] shrink-0 text-content-primary/35" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
