'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Heart, Settings } from '@/components/icons';
import { orderBySaved } from '@/lib/music/library';
import type { PublicTrack } from '@/lib/music/server';
import { SongListSkeleton, SongRow } from './parts';
import { useMusicLibrary } from './useMusicLibrary';

type LikedState = { status: 'idle' | 'loading' | 'ready' | 'error'; byId: Record<string, PublicTrack> };

/**
 * The listener's own tab, and only one thing on it: the songs they liked, with
 * the newest like at the top. Kept on this device, so it works with no account.
 * Settings (the way into the Artist dashboard) sits behind the gear.
 */
export function YouScreen() {
  const { library } = useMusicLibrary();
  const [state, setState] = useState<LikedState>({ status: 'idle', byId: {} });

  const likedKey = library.saved.join(',');

  useEffect(() => {
    if (library.saved.length === 0) return;
    // Taking a like off needs no request; only a song we have not fetched yet does.
    if (library.saved.every((id) => state.byId[id])) return;
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading' }));
    fetch(`/api/music/tracks?ids=${encodeURIComponent(library.saved.join(','))}`)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { tracks?: PublicTrack[] };
        if (!response.ok || !Array.isArray(data.tracks)) throw new Error('failed');
        if (cancelled) return;
        const byId: Record<string, PublicTrack> = {};
        for (const track of data.tracks) byId[track.id] = track;
        setState({ status: 'ready', byId });
      })
      .catch(() => {
        if (!cancelled) setState((prev) => ({ ...prev, status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
    // state.byId is read for the skip check only; refetching on its own change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likedKey]);

  const liked = useMemo(() => orderBySaved(library, Object.values(state.byId)), [library, state.byId]);

  return (
    <div>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-content-primary">Liked songs</h1>
          <p className="mt-0.5 text-sm text-content-secondary">Songs you tapped the heart on</p>
        </div>
        <Link
          href="/music/settings"
          aria-label="Settings"
          className="motion-focus motion-press -mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </Link>
      </header>

      {library.saved.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stroke-control p-8 text-center">
          <Heart className="mx-auto h-6 w-6 text-content-secondary" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-content-primary">No liked songs yet</p>
          <p className="mt-1 text-xs text-content-secondary">Tap the heart on a song to keep it here.</p>
        </div>
      ) : null}

      {library.saved.length > 0 && liked.length === 0 && state.status !== 'ready' ? (
        state.status === 'error' ? (
          <p role="alert" className="text-sm text-content-secondary">
            We could not load your liked songs. Check your connection and open this tab again.
          </p>
        ) : (
          <SongListSkeleton rows={Math.min(library.saved.length, 5)} />
        )
      ) : null}

      {liked.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {liked.map((track) => (
            <SongRow key={track.id} track={track} queue={liked} />
          ))}
        </ul>
      ) : null}

      {state.status === 'ready' && library.saved.length > 0 && liked.length === 0 ? (
        <p className="text-sm text-content-secondary">The songs you liked are not available any more.</p>
      ) : null}
    </div>
  );
}
