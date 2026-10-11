'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Newspaper } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { usePressKitsStore } from '@/stores/usePressKitsStore';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { ProfileFace } from '@/components/shared/ProfileFace';
import type { PressKit } from '@/types/press-kits';

// Same flag the API routes read. A direct link followed while the flag is off
// bounces to the catalog — the route has no server-side gate, since the flag is
// inlined at build time (the notes and shows precedent).
const PRESS_KITS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true';

const STATE_COPY: Record<PressKit['state'], string> = {
  incomplete: 'Not finished',
  ready: 'Ready',
  published: 'Live',
};

const stateClass = (state: PressKit['state']): string => {
  if (state === 'published') return 'border-brand/30 bg-brand/10 text-brand';
  if (state === 'ready') return 'border-stroke-strong bg-bg-elevated text-content-primary';
  return 'border-stroke-default bg-bg-surface text-content-tertiary';
};

export default function PressKitsPageClient() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.isLoading);

  // The roster lives in a cache-first store rather than in this component, so
  // returning to the tab paints the last known list instead of three pulsing
  // cards and a round trip (founder report, 2026-09-05). The store's own
  // recency guard decides whether this call reaches the network at all.
  const entries = usePressKitsStore((state) => state.entries);
  const isInitialLoading = usePressKitsStore((state) => state.isInitialLoading);
  const error = usePressKitsStore((state) => state.error);
  const load = usePressKitsStore((state) => state.load);
  // Faces come from the roster, which already carries signed photo urls.
  const rosterArtists = useArtistRosterStore((state) => state.artists);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const photoById = useMemo(
    () => new Map(rosterArtists.map((artist) => [artist.id, artist.photoUrl ?? null])),
    [rosterArtists]
  );
  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    if (!PRESS_KITS_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    // No handover to the artist list here (removed 2026-10-04): tapping "Press
    // kits" in the menu or Settings landed people on Artists, which they read
    // as the Directory. The artist page links to each kit's editor; this list
    // is the one place that is just press kits.
    void load();
  }, [load, router]);

  if (!PRESS_KITS_ENABLED) return null;

  // Only ever a first-ever visit now. A revalidate behind a painted list is
  // silent, which is the whole point of the cache.
  const loading = (authLoading && entries.length === 0) || isInitialLoading;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="pt-5 sm:pt-6" />

      {/* A failed load over an already-painted roster is a banner, not a wall:
          the cached rows are still usable and still true a moment ago. With
          nothing on screen it is the same box doing its original job. The
          CuratorLoadError split, and the fix MetadataSection needed for the
          same reason. */}
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          {error}{' '}
          <button
            type="button"
            onClick={() => void load({ force: true })}
            className="underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-[84px] animate-pulse rounded-xl border border-stroke-default bg-bg-surface"
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stroke-default p-8 text-center">
          <Newspaper className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-content-primary">No artists yet</p>
          <p className="mt-1 text-sm text-content-secondary">
            Add an artist in Settings and their press kit starts here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.artistId}>
              <Link
                href={`/dashboard/press-kits/${entry.artistId}`}
                className="motion-focus flex items-center justify-between gap-3 rounded-xl border border-stroke-default bg-bg-surface p-4 transition-colors hover:border-stroke-strong"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileFace name={entry.artistName} photoUrl={photoById.get(entry.artistId)} size={44} />
                  <div className="min-w-0">
                  <h2 className="line-clamp-2 break-words font-display text-base font-semibold text-content-primary">
                    {entry.artistName}
                  </h2>
                  <p className="mt-1 line-clamp-2 break-words text-xs text-content-secondary">
                    {entry.kit ? `urganize.app/k/${entry.kit.slug}` : 'No kit yet'}
                  </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      entry.kit
                        ? stateClass(entry.kit.state)
                        : 'border-stroke-default bg-bg-surface text-content-tertiary'
                    }`}
                  >
                    {entry.kit ? STATE_COPY[entry.kit.state] : 'Start one'}
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
