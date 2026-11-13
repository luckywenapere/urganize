/**
 * The playlist owner's screens on a computer (#1237): the small rules the
 * desktop inbox, playlists, earnings and profile layouts share. Pure and
 * client-safe, so each rule is tested once and the four pages cannot disagree
 * about what "waiting", "this month" or "Free" means.
 */

import { formatNaira } from './money';
import { SHARE_ORIGIN } from './app-hosts';
import { curatorPagePath } from './curator-public';
import { responseWindowDays } from './pitch-payments';
import type { CuratorPitch } from '@/types/pitching';
import type { CuratorEarningsRow } from '@/types/pitch-payments';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** What replying earns, or "Free" when nothing is paid. Never "₦0". */
export function pitchMoneyLabel(pitch: Pick<CuratorPitch, 'paymentKind' | 'shareKobo'>): string {
  const share = typeof pitch.shareKobo === 'number' ? pitch.shareKobo : 0;
  if (pitch.paymentKind !== 'paid' || share <= 0) return 'Free';
  return formatNaira(share);
}

export type TimeLeft = { label: string; urgent: boolean; closed: boolean };

/**
 * Time left to reply. Whole days while a day or more is left; hours, marked
 * urgent, under a day. Null for a pitch with no deadline (a free pitch).
 */
export function pitchTimeLeft(dueIso: string | null | undefined, now: Date = new Date()): TimeLeft | null {
  if (!dueIso) return null;
  const due = Date.parse(dueIso);
  if (!Number.isFinite(due)) return null;
  const ms = due - now.getTime();
  if (ms <= 0) return { label: 'Time ran out', urgent: false, closed: true };
  if (ms >= DAY_MS) {
    const days = Math.floor(ms / DAY_MS);
    return { label: `${days} ${days === 1 ? 'day' : 'days'} left`, urgent: false, closed: false };
  }
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 1) return { label: 'Under 1 hour left', urgent: true, closed: false };
  return { label: `${hours} ${hours === 1 ? 'hour' : 'hours'} left`, urgent: true, closed: false };
}

export const isPitchDecided = (pitch: Pick<CuratorPitch, 'status'>): boolean =>
  pitch.status === 'added' || pitch.status === 'passed';

/** Still asking for an answer: not decided, and a paid pitch's window is open. */
export function isPitchWaiting(
  pitch: Pick<CuratorPitch, 'status' | 'paymentKind' | 'responseDueAt'>,
  now: Date = new Date()
): boolean {
  if (isPitchDecided(pitch)) return false;
  if (pitch.paymentKind === 'paid') {
    const left = pitchTimeLeft(pitch.responseDueAt, now);
    return !left?.closed;
  }
  return true;
}

export const waitingCount = (pitches: readonly CuratorPitch[], now: Date = new Date()): number =>
  pitches.filter((pitch) => isPitchWaiting(pitch, now)).length;

/** Money still to earn: paid pitches with an open window, not yet answered. */
export function waitingOnReplies(
  pitches: readonly CuratorPitch[],
  now: Date = new Date()
): { kobo: number; count: number } {
  let kobo = 0;
  let count = 0;
  for (const pitch of pitches) {
    if (pitch.paymentKind !== 'paid' || !isPitchWaiting(pitch, now)) continue;
    const share = typeof pitch.shareKobo === 'number' ? pitch.shareKobo : 0;
    if (share <= 0) continue;
    kobo += share;
    count += 1;
  }
  return { kobo, count };
}

const LAGOS_MONTH = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  timeZone: 'Africa/Lagos',
});

/** "2026-11" for a moment, read in Lagos. Empty for a bad date. */
export function lagosMonthKey(iso: string | Date): string {
  const at = iso instanceof Date ? iso.getTime() : Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const parts = LAGOS_MONTH.formatToParts(new Date(at));
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  return year && month ? `${year}-${month}` : '';
}

/** What reached the bank this Lagos month, and from how many replies. */
export function monthEarnings(
  rows: readonly CuratorEarningsRow[],
  now: Date = new Date()
): { kobo: number; count: number } {
  const month = lagosMonthKey(now);
  let kobo = 0;
  let count = 0;
  for (const entry of rows) {
    if (entry.status !== 'paid' || lagosMonthKey(entry.paidAt) !== month) continue;
    kobo += Math.max(0, entry.sentToBankKobo);
    count += 1;
  }
  return { kobo, count };
}

export const earningsStatusLabel = (status: CuratorEarningsRow['status']): string =>
  status === 'paid' ? 'Sent to your bank' : 'Refunded';

/** A genre tag in sentence case: "afrobeats" reads "Afrobeats". */
export function playlistTag(genre: string): string {
  const clean = genre.trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : '';
}

/** Up to two initials for a tile with no picture. */
export function curatorInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  return letters || '?';
}

/**
 * The public page link, always on the public host. Never the origin the page
 * happens to be open on, so a preview or local copy cannot hand out a link
 * nobody else can open.
 */
export function publicPageLink(slug: string | null | undefined): { href: string; display: string } | null {
  const clean = String(slug || '').trim();
  if (!clean) return null;
  const href = `${SHARE_ORIGIN}${curatorPagePath(clean)}`;
  return { href, display: href.replace(/^https?:\/\//, '') };
}

/** The one line about the reply window, said once at the top of Pitches. */
export function replyWindowLine(hours: number): string {
  const days = responseWindowDays(hours);
  return `Reply within ${days} ${days === 1 ? 'day' : 'days'} or the artist gets their money back.`;
}

/** True once a draft differs from what is saved. */
export function isProfileDirty(
  saved: { displayName: string; bio: string } | null,
  nameDraft: string | null,
  bioDraft: string | null
): boolean {
  const name = nameDraft ?? saved?.displayName ?? '';
  const bio = bioDraft ?? saved?.bio ?? '';
  return name !== (saved?.displayName ?? '') || bio !== (saved?.bio ?? '');
}
