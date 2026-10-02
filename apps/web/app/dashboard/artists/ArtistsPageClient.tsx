'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Users } from '@/components/icons';
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
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Catalogue
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Artists</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Each artist, with every rollout, show and press kit in one place.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-[84px] animate-pulse rounded-xl border border-stroke-default bg-bg-surface"
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stroke-default p-8 text-center">
          <Users className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-content-primary">No artists yet</p>
          <p className="mt-1 text-sm text-content-secondary">Add an artist in Settings and they appear here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map(({ artist, summary, kit }) => (
            <li key={artist.id}>
              <Link
                href={artistHref(artist.id)}
                className="motion-focus flex items-center justify-between gap-3 rounded-xl border border-stroke-default bg-bg-surface p-4 transition-colors hover:border-stroke-strong"
              >
                <div className="min-w-0">
                  <h2 className="line-clamp-2 break-words font-display text-base font-semibold text-content-primary">
                    {artist.name}
                  </h2>
                  <p className="mt-1 text-xs text-content-secondary">{describeArtistCounts(summary)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full border border-stroke-default px-2 py-0.5 text-[11px] font-semibold text-content-secondary">
                    {kit ? KIT_COPY[kit.state] : 'No kit yet'}
                  </span>
                  <ArrowRight className="h-4 w-4 text-content-tertiary" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
