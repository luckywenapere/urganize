'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Users } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { artistSummary } from '@/lib/artist-overview';
import { artistHref, describeArtistCounts, isArtistPageEnabled } from '@/lib/artist-page';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { artistPhotoUrl, saveArtistPhoto } from '@/lib/profile-photo-client';
import { useReleaseStore } from '@/stores/useReleaseStore';

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

export default function ArtistsPageClient() {
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

  return (
    <div>
      <div className="pt-5 sm:pt-6" />

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
