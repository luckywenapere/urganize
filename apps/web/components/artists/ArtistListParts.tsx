'use client';

// The pieces the artists list shares between its layouts: the phone list and
// the narrow list in app/dashboard/artists/ArtistsPageClient.tsx, and Home on
// a computer in components/home-desktop (#1182). Moved out of the page file
// unchanged so both can draw the same cover and the same Next drop banner.

import Link from 'next/link';
import { Disc3, Plus } from '@/components/icons';
import { initialsFor } from '@/lib/swipe-nav';
import type { ArtistListRow, ArtistStatus } from '@/lib/artists-list';
import { releaseHref } from '@/lib/artist-page';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import type { ExecutionRelease } from '@/lib/execution-types';
import { displayReleaseTitle } from '@/types/releases';

export type RosterArtist = { id: string; name: string; photoUrl?: string | null };
export type ListRow = ArtistListRow<RosterArtist, ExecutionRelease>;
export type ArtistsListData = { rows: ListRow[]; spotlight: ListRow | null };
export const STATUS_WORD: Record<ArtistStatus, string> = {
  rolling_out: 'Rolling out',
  out_now: 'Out now',
  quiet: 'Quiet',
};

export const typeLabel = (release: ExecutionRelease) =>
  release.releaseType === 'ep' ? 'EP' : release.releaseType === 'album' ? 'Album' : 'Single';

/** "Fri 7 Nov", read as a local date like the artist page does. */
export function shortDay(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(parsed)
    .replace(',', '');
}

export const percent = (row: ListRow) => (row.total > 0 ? Math.round((row.done / row.total) * 100) : 0);

/** A rollout's cover; a flat tile with a disc when it has none (never a
 *  gradient); a dashed + when there is no rollout at all. `onInk` is the dark
 *  banner, where the page's own tile colour would glare. */
export function Cover({
  release,
  size,
  onInk = false,
  className = '',
}: {
  release: ExecutionRelease | null;
  size: number;
  onInk?: boolean;
  className?: string;
}) {
  const src = release ? release.coverThumbUrl || release.coverArtUrl || null : null;
  const box = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={box} className={`shrink-0 rounded-md object-cover ${className}`} />;
  }
  if (!release) {
    return (
      <span
        style={box}
        className={`grid shrink-0 place-items-center rounded-md border border-dashed border-stroke-strong text-content-tertiary ${className}`}
        aria-hidden="true"
      >
        <Plus className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span
      style={box}
      className={`grid shrink-0 place-items-center rounded-md ${
        onInk ? 'bg-[#f5f0e6]/10 text-[#f5f0e6]/45' : 'bg-bg-hover text-content-tertiary'
      } ${className}`}
      aria-hidden="true"
    >
      <Disc3 style={{ width: Math.round(size * 0.36), height: Math.round(size * 0.36) }} />
    </span>
  );
}
/** "21 of 34 tasks done · 3 due this week · 1 late" on the dark banner. */
function SpotlightFacts({ row, withDone }: { row: ListRow; withDone: boolean }) {
  const parts = [
    withDone && row.total > 0 ? `${row.done} of ${row.total} tasks done` : null,
    row.dueThisWeek > 0 ? `${row.dueThisWeek} due this week` : null,
  ].filter(Boolean);
  if (parts.length === 0 && row.late === 0) return null;
  return (
    <>
      {parts.join(' · ')}
      {row.late > 0 ? (
        <>
          {parts.length > 0 ? ' · ' : ''}
          <span className="font-semibold text-[#f2a7a0]">{row.late} late</span>
        </>
      ) : null}
    </>
  );
}

/**
 * The banner on top (#878): the dated rollout that drops soonest across the
 * roster. The eye lands on the cover, reads the title, then the countdown.
 * Dark green in both themes, like Spotify's artist banner.
 */
export function Spotlight({ row, compact = false }: { row: ListRow; compact?: boolean }) {
  const release = row.next;
  if (!release || row.daysToGo === null) return null;
  const days = row.daysToGo;
  const bar =
    row.total > 0 ? (
      <span className="block h-1 w-full overflow-hidden rounded-full bg-[#f5f0e6]/15">
        <span className="block h-full rounded-full bg-[#7fd09c]" style={{ width: `${percent(row)}%` }} />
      </span>
    ) : null;

  return (
    <Link
      href={releaseHref(release.id)}
      onClick={() => captureAnalyticsEvent({ name: 'artists_list_action', properties: { artist_id: row.artist.id, action: 'spotlight' } })}
      className={`motion-focus motion-press grid items-center rounded-2xl bg-[#1d2a21] text-[#f5f0e6] ${
        compact ? 'grid-cols-[72px_minmax(0,1fr)_auto] gap-3 p-4' : 'grid-cols-[136px_minmax(0,1fr)_auto] gap-6 p-6'
      }`}
    >
      <Cover release={release} size={compact ? 72 : 136} onInk className="shadow-[0_8px_24px_rgba(0,0,0,0.25)]" />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase leading-4 tracking-[0.1em] text-[#f5f0e6]/70">
          Next drop
        </span>
        <span className={`mt-1 block truncate font-display ${compact ? 'text-xl leading-[26px]' : 'text-[32px] leading-10'}`}>
          {displayReleaseTitle(release.title)}
        </span>
        <span className={`mt-1 flex min-w-0 items-center gap-2 text-[#f5f0e6]/70 ${compact ? 'text-[13px]' : 'text-sm'}`}>
          {compact ? null : row.artist.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.artist.photoUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
          ) : (
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f5f0e6]/15 text-[10px] font-semibold"
              aria-hidden="true"
            >
              {initialsFor(row.artist.name)}
            </span>
          )}
          <span className="truncate font-semibold text-[#f5f0e6]">{row.artist.name}</span>
          {compact ? null : <span className="shrink-0">· {typeLabel(release)}</span>}
        </span>
        {compact ? null : (
          <>
            {bar ? <span className="mt-4 block max-w-[280px]">{bar}</span> : null}
            <span className="mt-2 block text-[13px] leading-5 text-[#f5f0e6]/70">
              <SpotlightFacts row={row} withDone />
            </span>
          </>
        )}
      </span>
      <span className="flex flex-col items-end text-right">
        <span
          className={`font-semibold tabular-nums tracking-[-0.03em] ${compact ? 'text-4xl leading-9' : 'text-[56px] leading-[56px]'}`}
        >
          {days}
        </span>
        <span className={`text-[#f5f0e6]/70 ${compact ? 'text-xs' : 'text-[13px] leading-5'}`}>
          {days === 1 ? 'day' : 'days'}
          {compact ? '' : ` to go · ${shortDay(release.releaseDate) ?? ''}`}
        </span>
        {compact ? null : (
          <span className="mt-4 inline-flex h-9 items-center rounded-full bg-[#f5f0e6] px-4 text-[13px] font-semibold text-[#1d2a21]">
            Open rollout
          </span>
        )}
      </span>
      {compact && (bar || row.dueThisWeek > 0 || row.late > 0) ? (
        <span className="col-span-3">
          {bar}
          <span className="mt-1.5 block text-xs text-[#f5f0e6]/70">
            <SpotlightFacts row={row} withDone={false} />
          </span>
        </span>
      ) : null}
    </Link>
  );
}
