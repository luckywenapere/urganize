/**
 * The words the artist's side uses for a song's state. Pure, so the sentences
 * (which carry a date) are held by tests instead of being rebuilt inline in a
 * component. No "rollout"/"release" confusion: a rollout is the work, a release
 * date is the day the music comes out, and the song is just "the song".
 */

import type { TrackStatus } from './rules';

/** "Fri 28 Nov", in Lagos time, from an ISO moment or a plain date. */
export function formatMusicDay(value: string | null | undefined): string {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) && value.length === 10
    ? new Date(`${value}T12:00:00+01:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  });
}

export function describeTrackStatus(input: { status: TrackStatus; liveAt: string | null }): string {
  switch (input.status) {
    case 'draft':
      return 'Not published yet';
    case 'scheduled':
      return input.liveAt
        ? `Goes live on ${formatMusicDay(input.liveAt)}`
        : 'Goes live when you set a release date';
    case 'live':
      return input.liveAt ? `Live since ${formatMusicDay(input.liveAt)}` : 'Live';
    case 'taken_down':
      return 'Taken down';
  }
}

/** The words on the "release day" choice in the publish form. */
export function describeReleaseDayChoice(releaseDate: string | null): string {
  const day = formatMusicDay(releaseDate);
  return day ? `On release day, ${day}` : 'On release day (set a release date first)';
}

/** "1,284 plays", "1 play", "No plays yet". */
export function describePlays(plays: number): string {
  if (plays <= 0) return 'No plays yet';
  return `${plays.toLocaleString('en')} ${plays === 1 ? 'play' : 'plays'}`;
}
