'use client';

import Link from 'next/link';
import { Loader2, Music } from '@/components/icons';
import { GuidanceCard } from './GuidanceCard';
import { useMusic } from './MusicProvider';
import { MusicShortcuts } from './MusicShell';
import { SongListSkeleton, SongRow } from './parts';
import { useMusicAccount } from './useMusicAccount';

/** The front door: every song that is out, the newest at the top. */
export function SongsScreen() {
  const { feed, reloadFeed, loadMore } = useMusic();
  const { guidance, dismissGuidance, hasTeam } = useMusicAccount();

  return (
    <div>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-content-primary">New music</h1>
          <p className="mt-0.5 text-sm text-content-secondary">Newest at the top</p>
        </div>
        <MusicShortcuts className="lg:hidden" />
      </header>

      {guidance ? <GuidanceCard kind={guidance} onDismiss={dismissGuidance} /> : null}

      {feed.status === 'loading' ? <SongListSkeleton /> : null}

      {feed.status === 'error' ? (
        <div role="alert" className="rounded-xl border border-stroke-default bg-bg-surface p-5 text-center">
          <p className="text-sm font-medium text-content-primary">We could not load the songs.</p>
          <p className="mt-1 text-xs text-content-secondary">Check your connection and try again.</p>
          <button
            type="button"
            onClick={reloadFeed}
            className="motion-focus motion-press mt-3 inline-flex h-10 items-center rounded-lg border border-stroke-control px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover"
          >
            Try again
          </button>
        </div>
      ) : null}

      {feed.status === 'ready' && feed.tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stroke-control p-8 text-center">
          <Music className="mx-auto h-6 w-6 text-content-secondary" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-content-primary">No music yet</p>
          <p className="mt-1 text-xs text-content-secondary">
            Songs show up here on the day they come out.
          </p>
          {hasTeam ? (
            <Link
              href="/dashboard"
              className="motion-focus mt-3 inline-flex min-h-[40px] items-center text-sm font-semibold text-brand"
            >
              Put your first song here from a rollout
            </Link>
          ) : null}
        </div>
      ) : null}

      {feed.status === 'ready' && feed.tracks.length > 0 ? (
        <>
          <ul className="m-0 list-none p-0">
            {feed.tracks.map((track) => (
              <SongRow key={track.id} track={track} queue={feed.tracks} />
            ))}
          </ul>
          {feed.hasMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={feed.loadingMore}
                className="motion-focus motion-press inline-flex h-10 items-center gap-2 rounded-lg border border-stroke-control px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-60"
              >
                {feed.loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Show more
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
