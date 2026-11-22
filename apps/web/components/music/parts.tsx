'use client';

import { Heart, Pause, Play } from '@/components/icons/lucide';
import { formatDuration } from '@/lib/music/rules';
import type { PublicTrack } from '@/lib/music/server';
import { useMusic } from './MusicProvider';
import { Vinyl } from './Vinyl';
import { useMusicLibrary } from './useMusicLibrary';

/** The small "E" beside an explicit song. */
export function ExplicitMark() {
  return (
    <span
      title="Explicit"
      aria-label="Explicit"
      className="ml-1.5 inline-block rounded-[3px] bg-content-primary/[0.08] px-1 align-[1px] text-[10px] font-semibold leading-4 text-content-secondary"
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
  return then.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/** One song in a list: its record, the title and artist, the length, the heart.
 *  Tapping it plays it and queues the songs after it in the same list. The
 *  record turns while that song plays. */
export function SongRow({
  track,
  queue,
  showDate = true,
}: {
  track: PublicTrack;
  queue: PublicTrack[];
  /** Home says when a song came out; Collection lists the songs only. */
  showDate?: boolean;
}) {
  const { current, isPlaying, playTrack, toggle } = useMusic();
  const isCurrent = current?.id === track.id;
  const playingNow = isCurrent && isPlaying;
  const when = showDate ? relativeDay(track.liveAt) : '';

  return (
    <li className="flex items-center border-b border-content-primary/[0.08] last:border-b-0">
      <button
        type="button"
        onClick={() => (isCurrent ? toggle() : playTrack(track, queue))}
        aria-label={`${playingNow ? 'Pause' : 'Play'} ${track.title} by ${track.artistName}`}
        className="motion-focus group flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-lg py-2 text-left"
      >
        <span className="relative flex-none">
          <Vinyl track={track} spinning={playingNow} showInitials={false} grooves={5} className="h-11 w-11" />
          <span
            aria-hidden="true"
            className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[#f5f0e6] transition-opacity ${
              isCurrent ? 'opacity-0' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
            }`}
          >
            <Play className="h-4 w-4 fill-current" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[14.5px] font-semibold tracking-[-0.02em] ${isCurrent ? 'text-brand' : 'text-content-primary'}`}
          >
            {track.title}
            {track.explicit ? <ExplicitMark /> : null}
          </span>
          <span className="block truncate text-[12.5px] text-content-secondary">
            {track.artistName}
            {when ? ` · ${when}` : ''}
          </span>
        </span>
        {track.durationSeconds ? (
          <span className="flex-none text-xs tabular-nums text-content-tertiary">{formatDuration(track.durationSeconds)}</span>
        ) : null}
        {isCurrent ? (
          <span aria-hidden="true" className="flex-none text-brand">
            {playingNow ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </span>
        ) : null}
      </button>
      <SaveButton track={track} />
    </li>
  );
}

/** The heart that keeps a song in the listener's Collection. A real toggle, so
 *  it says whether it is on, and as big as a thumb needs. */
export function SaveButton({ track, className = '' }: { track: Pick<PublicTrack, 'id' | 'title'>; className?: string }) {
  const { isSaved, toggleSave } = useMusicLibrary();
  const saved = isSaved(track.id);
  return (
    <button
      type="button"
      onClick={() => toggleSave(track.id)}
      aria-pressed={saved}
      aria-label={`${saved ? 'Remove' : 'Keep'} ${track.title} ${saved ? 'from' : 'in'} your collection`}
      className={`motion-focus motion-press flex h-11 w-11 flex-none items-center justify-center rounded-full transition-colors hover:bg-content-primary/[0.06] ${
        saved ? 'text-brand' : 'text-content-secondary'
      } ${className}`}
    >
      <Heart className="h-[19px] w-[19px]" fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}

/** Same row height and spacing as SongRow, so nothing moves when songs arrive. */
export function SongRowSkeleton() {
  return (
    <li className="flex min-h-[60px] items-center border-b border-content-primary/[0.08] last:border-b-0">
      <span className="flex min-w-0 flex-1 items-center gap-3 py-2">
        <span className="h-11 w-11 flex-none animate-pulse rounded-full bg-content-primary/[0.08]" />
        <span className="min-w-0 flex-1 space-y-2">
          <span className="block h-3.5 w-1/2 animate-pulse rounded bg-content-primary/[0.08]" />
          <span className="block h-3 w-1/3 animate-pulse rounded bg-content-primary/[0.08]" />
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
