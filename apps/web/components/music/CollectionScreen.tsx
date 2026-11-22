'use client';

import { useEffect, useMemo, useState } from 'react';
import { Heart } from '@/components/icons/lucide';
import { orderBySaved } from '@/lib/music/library';
import type { PublicTrack } from '@/lib/music/server';
import { SongListSkeleton, SongRow } from './parts';
import { useMusicLibrary } from './useMusicLibrary';

type LikedState = { status: 'idle' | 'loading' | 'ready' | 'error'; byId: Record<string, PublicTrack> };

/**
 * Collection (#1364): the songs the listener hearted, newest heart first, and
 * nothing else on the page. Kept on this device, so it works with no account.
 */
export function CollectionScreen() {
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
      <h1 className="sr-only">Collection</h1>

      {library.saved.length === 0 ? (
        <div className="mt-2 rounded-2xl border border-dashed border-content-primary/[0.2] p-8 text-center">
          <Heart className="mx-auto h-6 w-6 text-content-secondary" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-content-primary">Nothing here yet</p>
          <p className="mt-1 text-xs text-content-secondary">Tap the heart on a song to keep it here.</p>
        </div>
      ) : null}

      {library.saved.length > 0 && liked.length === 0 && state.status !== 'ready' ? (
        state.status === 'error' ? (
          <p role="alert" className="text-sm text-content-secondary">
            We could not load your collection. Check your connection and open this tab again.
          </p>
        ) : (
          <SongListSkeleton rows={Math.min(library.saved.length, 5)} />
        )
      ) : null}

      {liked.length > 0 ? (
        <ul className="m-0 mt-1 list-none p-0">
          {liked.map((track) => (
            <SongRow key={track.id} track={track} queue={liked} showDate={false} />
          ))}
        </ul>
      ) : null}

      {state.status === 'ready' && library.saved.length > 0 && liked.length === 0 ? (
        <p className="text-sm text-content-secondary">The songs you kept are not available any more.</p>
      ) : null}
    </div>
  );
}
