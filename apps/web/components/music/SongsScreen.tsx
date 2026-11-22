'use client';

import { Loader2, Play, Pause } from '@/components/icons/lucide';
import { GuidanceCard } from './GuidanceCard';
import { useMusic } from './MusicProvider';
import { useMusicSheets } from './MusicShell';
import { SongListSkeleton, SongRow } from './parts';
import { Vinyl, Sleeve } from './Vinyl';
import { useMusicAccount } from './useMusicAccount';

/**
 * Home (#1364): the newest song in its sleeve with the record half out, then
 * every song that is out, newest first. No subtitle explaining the order.
 */
export function SongsScreen() {
  const { feed, reloadFeed, loadMore, current, isPlaying, playTrack, toggle } = useMusic();
  const { guidance, dismissGuidance, hasTeam } = useMusicAccount();
  const sheets = useMusicSheets();
  const newest = feed.status === 'ready' ? feed.tracks[0] : undefined;
  const newestPlaying = Boolean(newest && current?.id === newest.id && isPlaying);

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:gap-10 lg:gap-14">
      <div>
        {guidance ? <GuidanceCard kind={guidance} onDismiss={dismissGuidance} /> : null}

        {feed.status === 'loading' ? <HeroSkeleton /> : null}

        {newest ? (
          <section aria-label="Newest song" className="relative mt-2.5 flex h-[168px] items-center md:h-[250px]">
            <Sleeve track={newest} className="h-[150px] w-[150px] md:h-[230px] md:w-[230px]" />
            <Vinyl
              track={newest}
              spinning={newestPlaying}
              grooves={8}
              className="z-[1] -ml-[76px] h-[140px] w-[140px] md:-ml-[118px] md:h-[214px] md:w-[214px]"
            />
            <div className="ml-3 min-w-0 flex-1 md:ml-9">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand">Out now</p>
              <h1 className="mt-1 line-clamp-2 text-[19px] font-bold leading-[1.15] tracking-[-0.03em] text-content-primary md:text-[34px] md:tracking-[-0.04em]">
                {newest.title}
              </h1>
              <p className="truncate text-[13px] text-content-secondary md:text-[15px]">{newest.artistName}</p>
              <button
                type="button"
                onClick={() => (current?.id === newest.id ? toggle() : playTrack(newest, feed.tracks))}
                className="motion-focus motion-press mt-3 inline-flex h-[38px] items-center gap-1.5 rounded-full bg-content-primary pl-3 pr-4 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 md:h-[42px]"
              >
                {newestPlaying ? <Pause className="h-4 w-4 fill-current" aria-hidden="true" /> : <Play className="h-4 w-4 fill-current" aria-hidden="true" />}
                {newestPlaying ? 'Pause' : 'Play'}
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <section aria-labelledby="music-new" className="md:pt-1">
        <h2 id="music-new" className="mb-1 mt-5 text-[15px] font-bold tracking-[-0.02em] text-content-primary md:mt-0">
          New music
        </h2>

        {feed.status === 'loading' ? <SongListSkeleton /> : null}

        {feed.status === 'error' ? (
          <div role="alert" className="mt-2 rounded-2xl border border-content-primary/[0.08] bg-bg-surface p-5 text-center">
            <p className="text-sm font-medium text-content-primary">We could not load the songs.</p>
            <p className="mt-1 text-xs text-content-secondary">Check your connection and try again.</p>
            <button
              type="button"
              onClick={reloadFeed}
              className="motion-focus motion-press mt-3 inline-flex h-10 items-center rounded-full border border-content-primary/[0.16] px-4 text-sm font-semibold text-content-primary hover:bg-content-primary/[0.06]"
            >
              Try again
            </button>
          </div>
        ) : null}

        {feed.status === 'ready' && feed.tracks.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-dashed border-content-primary/[0.2] p-8 text-center">
            <p className="text-sm font-medium text-content-primary">No music yet</p>
            <p className="mt-1 text-xs text-content-secondary">Songs show up here on the day they come out.</p>
            {hasTeam ? (
              <button
                type="button"
                onClick={() => sheets.open('upload')}
                className="motion-focus mt-3 inline-flex min-h-[40px] items-center text-sm font-semibold text-brand"
              >
                Upload your first song
              </button>
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
                  className="motion-focus motion-press inline-flex h-10 items-center gap-2 rounded-full border border-content-primary/[0.16] px-4 text-sm font-semibold text-content-primary hover:bg-content-primary/[0.06] disabled:opacity-60"
                >
                  {feed.loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Show more
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}

/** The hero's shape while the songs load, so nothing jumps when they arrive. */
export function HeroSkeleton() {
  return (
    <div aria-hidden="true" className="relative mt-2.5 flex h-[168px] items-center md:h-[250px]">
      <span className="h-[150px] w-[150px] flex-none animate-pulse rounded-md bg-content-primary/[0.08] md:h-[230px] md:w-[230px]" />
      <span className="ml-3 flex-1 space-y-2.5 md:ml-[154px]">
        <span className="block h-3 w-14 animate-pulse rounded bg-content-primary/[0.08]" />
        <span className="block h-5 w-3/4 animate-pulse rounded bg-content-primary/[0.08]" />
        <span className="block h-3.5 w-1/2 animate-pulse rounded bg-content-primary/[0.08]" />
        <span className="block h-[38px] w-20 animate-pulse rounded-full bg-content-primary/[0.08]" />
      </span>
    </div>
  );
}
