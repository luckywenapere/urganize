/* eslint-disable @next/next/no-img-element */
'use client';

import { Heart, Pause, Play } from '@/components/icons';
import { formatDuration, musicInitials } from '@/lib/music/rules';
import type { PublicTrack } from '@/lib/music/server';
import { useMusic } from './MusicProvider';
import { useMusicLibrary } from './useMusicLibrary';

/** A song's cover, or a flat tile with its initials when it has none. Never a
 *  gradient: a missing picture is a plain tile, the house rule. */
export function Cover({
  track,
  className = 'h-11 w-11',
  textClass = 'text-sm',
}: {
  track: Pick<PublicTrack, 'title' | 'coverUrl'>;
  className?: string;
  textClass?: string;
}) {
  if (track.coverUrl) {
    return (
      <img
        src={track.coverUrl}
        alt=""
        loading="lazy"
        className={`${className} flex-none rounded-md bg-bg-elevated object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} ${textClass} flex flex-none items-center justify-center rounded-md bg-brand font-semibold text-content-inverse`}
    >
      {musicInitials(track.title)}
    </span>
  );
}

/** The small "E" beside an explicit song. */
export function ExplicitMark() {
  return (
    <span
      title="Explicit"
      aria-label="Explicit"
      className="ml-1.5 inline-block rounded-[3px] bg-bg-elevated px-1 align-[1px] text-[10px] font-semibold leading-4 text-content-secondary"
    >
      E
    </span>
  );
}

function relativeDay(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** One song in a list. Tapping anywhere on it plays it and queues the songs
 *  after it in the same list. */
export function SongRow({ track, queue }: { track: PublicTrack; queue: PublicTrack[] }) {
  const { current, isPlaying, playTrack, toggle } = useMusic();
  const isCurrent = current?.id === track.id;
  const playingNow = isCurrent && isPlaying;

  return (
    <li className="flex items-center border-b border-stroke-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => (isCurrent ? toggle() : playTrack(track, queue))}
        aria-label={`${playingNow ? 'Pause' : 'Play'} ${track.title} by ${track.artistName}`}
        className="motion-focus flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-bg-hover"
      >
        <Cover track={track} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-medium ${isCurrent ? 'text-brand' : 'text-content-primary'}`}
          >
            {track.title}
            {track.explicit ? <ExplicitMark /> : null}
          </span>
          <span className="block truncate text-xs text-content-secondary">
            {track.artistName} · {relativeDay(track.liveAt)}
          </span>
        </span>
        {track.durationSeconds ? (
          <span className="hidden text-xs tabular-nums text-content-secondary sm:block">
            {formatDuration(track.durationSeconds)}
          </span>
        ) : null}
        <span aria-hidden="true" className={`flex-none ${isCurrent ? 'text-brand' : 'text-content-primary'}`}>
          {playingNow ? <Pause className="h-[18px] w-[18px]" /> : <Play className="h-[18px] w-[18px]" />}
        </span>
      </button>
      <SaveButton track={track} />
    </li>
  );
}

/** The heart that adds a song to the listener's liked songs on the You tab. A real toggle button,
 *  so it says whether it is on, and it is as big as a thumb needs. */
export function SaveButton({ track, className = '' }: { track: Pick<PublicTrack, 'id' | 'title'>; className?: string }) {
  const { isSaved, toggleSave } = useMusicLibrary();
  const saved = isSaved(track.id);
  return (
    <button
      type="button"
      onClick={() => toggleSave(track.id)}
      aria-pressed={saved}
      aria-label={`${saved ? 'Unlike' : 'Like'} ${track.title}`}
      className={`motion-focus motion-press flex h-11 w-11 flex-none items-center justify-center rounded-full transition-colors hover:bg-bg-hover ${
        saved ? 'text-brand' : 'text-content-secondary'
      } ${className}`}
    >
      <Heart className="h-[18px] w-[18px]" fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}

/** Same row height and spacing as SongRow, so nothing moves when songs arrive. */
export function SongRowSkeleton() {
  return (
    <li className="flex min-h-[56px] items-center border-b border-stroke-subtle last:border-b-0">
      <span className="flex min-w-0 flex-1 items-center gap-3 px-1 py-2">
        <span className="h-11 w-11 flex-none animate-pulse rounded-md bg-bg-elevated" />
        <span className="min-w-0 flex-1 space-y-2">
          <span className="block h-3.5 w-1/2 animate-pulse rounded bg-bg-elevated" />
          <span className="block h-3 w-1/3 animate-pulse rounded bg-bg-elevated" />
        </span>
      </span>
      <span className="h-11 w-11 flex-none" />
    </li>
  );
}

export function SongListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="m-0 list-none p-0">
      {Array.from({ length: rows }, (_, index) => (
        <SongRowSkeleton key={index} />
      ))}
    </ul>
  );
}
