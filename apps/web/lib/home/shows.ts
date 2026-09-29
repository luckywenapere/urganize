import { formatShowDateTime, partitionShows, type SchedulableShow } from '@/lib/events';
import { summarizeSetlist, type SetlistSummaryItem } from '@/lib/setlist';
import { daysUntilDate } from './state';
import { NEXT_SHOW_WINDOW_DAYS } from './config';
import type { HomeNextShow } from './types';

const NEXT_SHOW_WINDOW_MS = NEXT_SHOW_WINDOW_DAYS * 86_400_000;

/**
 * The one show that belongs on Home: the SOONEST show that has not yet
 * ended (partitionShows's own "upcoming" — which correctly keeps a show
 * that started minutes ago and is still running), excluding cancelled shows,
 * and only when it starts within NEXT_SHOW_WINDOW_DAYS. A show 20 days out
 * would still sort first among "upcoming" but does not belong on Home yet.
 */
export function selectNextShow<T extends SchedulableShow & { id: string; status: string }>(
  shows: readonly T[],
  now: Date = new Date()
): T | null {
  const eligible = shows.filter((show) => show.status !== 'cancelled');
  const { upcoming } = partitionShows(eligible, now);
  const candidate = upcoming[0];
  if (!candidate?.setStartAt) return null;

  const startMs = Date.parse(candidate.setStartAt);
  if (Number.isNaN(startMs)) return null;
  if (startMs - now.getTime() > NEXT_SHOW_WINDOW_MS) return null;

  return candidate;
}

export type BuildNextShowInput = {
  id: string;
  artistName: string;
  venueName: string | null;
  city: string | null;
  setStartAt: string | null;
  timezone: string;
  setLengthMinutes: number;
  /** The show's FIRST setlist's items, or null when it has no setlist yet
   * (a show can hold several; the approved plan uses the first). */
  setlistItems: readonly SetlistSummaryItem[] | null;
  /** Non-revoked DJ pack recipients who have opened the link at least once,
   * and how many non-revoked recipients exist in total. Either null when
   * there is no pack at all — Home then omits the DJ-links line entirely
   * rather than claiming "0 of 0". */
  djLinksOpened: number | null;
  djLinksTotal: number | null;
};

export function buildNextShow(input: BuildNextShowInput, now: Date = new Date()): NonNullable<HomeNextShow> {
  const setlistSummary = input.setlistItems
    ? summarizeSetlist(input.setlistItems, input.setLengthMinutes)
    : null;

  const djLinks =
    input.djLinksTotal !== null && input.djLinksOpened !== null
      ? { opened: input.djLinksOpened, total: input.djLinksTotal }
      : null;

  return {
    id: input.id,
    artistName: input.artistName,
    venueName: input.venueName,
    city: input.city,
    dateLabel: formatShowDateTime(input.setStartAt, input.timezone, { includeTime: false, now }),
    setTimeLabel: formatShowDateTime(input.setStartAt, input.timezone, { includeDate: false, now }),
    daysUntil: input.setStartAt ? daysUntilDate(input.setStartAt.slice(0, 10), now) : null,
    setlist: setlistSummary
      ? {
          totalMinutes: Math.round(setlistSummary.totalSeconds / 60),
          slotMinutes: Math.round(setlistSummary.slotSeconds / 60),
          fit: setlistSummary.fit,
          isPartial: setlistSummary.isPartial,
        }
      : null,
    djLinks,
    // Artist-only, deferred to step 4 — see lib/home/types.ts's comment.
    soundcheckLabel: null,
  };
}
