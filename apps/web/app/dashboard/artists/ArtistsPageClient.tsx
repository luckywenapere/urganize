'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Users } from '@/components/icons';
import { PageHeader } from '@/components/shell/PageHeader';
import { useAuthStore } from '@/lib/auth-store';
import { artistSummary } from '@/lib/artist-overview';
import { artistHref, describeArtistCounts, isArtistPageEnabled } from '@/lib/artist-page';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useEventsStore } from '@/stores/useEventsStore';
import { usePressKitsStore } from '@/stores/usePressKitsStore';
import { useReleaseStore } from '@/stores/useReleaseStore';

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

const KIT_COPY = { incomplete: 'Kit not finished', ready: 'Kit ready', published: 'Kit live' } as const;

export default function ArtistsPageClient() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.isLoading);

  const artists = useArtistRosterStore((state) => state.artists);
  const rosterLoaded = useArtistRosterStore((state) => state.loaded);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const events = useEventsStore((state) => state.events);
  const loadEvents = useEventsStore((state) => state.load);
  const kits = usePressKitsStore((state) => state.entries);
  const loadKits = usePressKitsStore((state) => state.load);

  useEffect(() => {
    // A direct link followed while the flag is off goes back to the catalogue.
    // The flag is inlined at build time, so there is no server-side gate.
    if (!ARTIST_PAGE_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void loadRoster();
    void loadCommandCenter();
    void loadEvents();
    void loadKits();
  }, [loadRoster, loadCommandCenter, loadEvents, loadKits, router]);

  const cards = useMemo(
    () =>
      artists.map((artist) => ({
        artist,
        summary: artistSummary(artist.id, releases, events),
        kit: kits.find((entry) => entry.artistId === artist.id)?.kit ?? null,
      })),
    [artists, releases, events, kits]
  );

  if (!ARTIST_PAGE_ENABLED) return null;

  const loading = (authLoading || !rosterLoaded) && artists.length === 0;

  return (
    <div>
      <PageHeader title="Artists" description="Each artist, with every rollout, show and press kit in one place." />

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-16 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stroke-default p-8 text-center">
          <Users className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-content-primary">No artists yet</p>
          <p className="mt-1 text-sm text-content-secondary">Add an artist in Settings and they appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
          <div className="hidden grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)_2rem] gap-4 border-b border-stroke-subtle px-5 py-3 text-xs font-medium text-content-tertiary md:grid">
            <span>Artist</span>
            <span>Rollouts</span>
            <span>Planned</span>
            <span>Shows coming</span>
            <span>Press kit</span>
            <span />
          </div>
          <ul className="divide-y divide-stroke-subtle">
            {cards.map(({ artist, summary, kit }) => (
              <li key={artist.id}>
                <Link
                  href={artistHref(artist.id)}
                  className="motion-focus grid min-h-16 items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-bg-hover/60 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)_2rem]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display text-base font-semibold text-content-primary">
                      {artist.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-content-secondary md:hidden">
                      {describeArtistCounts(summary)}
                    </span>
                  </span>
                  <span className="hidden text-sm tabular-nums text-content-primary md:block">{summary.releases}</span>
                  <span className="hidden text-sm tabular-nums text-content-primary md:block">{summary.planned}</span>
                  <span className="hidden text-sm tabular-nums text-content-primary md:block">{summary.upcomingShows}</span>
                  <span>
                    <span className="inline-flex rounded-full border border-stroke-default px-2.5 py-0.5 text-xs font-medium text-content-secondary">
                      {kit ? KIT_COPY[kit.state] : 'No kit yet'}
                    </span>
                  </span>
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
