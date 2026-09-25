import { daysBetweenLocalDates, localPartsInZone } from './events';

/**
 * DJ packs: the pure half.
 *
 * A pack is a setlist, its files, and the show details, handed to one person
 * through a link only they hold. The per-recipient token is what makes read
 * receipts answerable at all — "Tunde opened it, the engineer did not" is only
 * a sentence you can say if the two of them followed different URLs.
 */

export const MAX_RECIPIENT_NAME_LENGTH = 80;
export const MAX_RECIPIENT_ROLE_LENGTH = 60;

/** Roles a pack usually goes to. Offered as suggestions, not a closed set —
 *  every touring setup names these people slightly differently. */
export const COMMON_RECIPIENT_ROLES = ['DJ', 'Sound engineer', 'Band MD', 'Tour manager'] as const;

/** Days after the show that a link stops working, unless the owner sets its
 *  own date. Three, so a DJ who plays a late Saturday can still re-download on
 *  the Monday, and a link pasted into a group chat does not live forever. */
export const DEFAULT_PACK_EXPIRY_DAYS = 3;

export type PackAccessAction = 'viewed' | 'downloaded_all' | 'downloaded_track';

/** What the owner sees per recipient. The point of the whole feature. */
export type RecipientReceipt = {
  id: string;
  name: string;
  role: string | null;
  token: string;
  revokedAt: string | null;
  /** Null when they have never opened it. */
  lastViewedAt: string | null;
  lastDownloadedAt: string | null;
  downloadCount: number;
};

/**
 * The line under a recipient's name.
 *
 * States it plainly and never guesses: "Not opened" is a fact worth showing,
 * because it is exactly the case the manager has to act on.
 */
export function describeReceipt(
  receipt: RecipientReceipt,
  now: Date = new Date(),
  timezone?: string
): string {
  if (receipt.revokedAt) return 'Link turned off';
  if (receipt.lastDownloadedAt) {
    return `Downloaded ${relativeDay(receipt.lastDownloadedAt, now, timezone)}`;
  }
  if (receipt.lastViewedAt) {
    return `Opened ${relativeDay(receipt.lastViewedAt, now, timezone)}, no download`;
  }
  return 'Not opened';
}

/**
 * "today", "yesterday", "3 days ago", by CALENDAR day. A download at 23:50
 * seen at 00:10 was yesterday, which is what a person means by the word;
 * counting whole 24-hour periods called it "today" until 2026-09-25.
 *
 * Read on the clock of `timezone` when one is given (the assistant, which runs
 * on a server, passes the show's), and on this device's clock otherwise (the
 * pack panel, where the manager is looking).
 */
export function relativeDay(iso: string, now: Date = new Date(), timezone?: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'at some point';

  let days: number | null = null;
  if (timezone) {
    const a = localPartsInZone(then.toISOString(), timezone);
    const b = localPartsInZone(now.toISOString(), timezone);
    days = a && b ? daysBetweenLocalDates(a.date, b.date) : null;
  }
  if (days === null) {
    const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    // Rounded, because a day with a clock change is 23 or 25 hours long.
    days = Math.round((midnight(now) - midnight(then)) / 86_400_000);
  }
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** True when this recipient is the one to chase. */
export const needsNudge = (receipt: RecipientReceipt): boolean =>
  !receipt.revokedAt && !receipt.lastDownloadedAt;

/**
 * A WhatsApp deep link carrying the pack URL and a short message.
 *
 * WhatsApp is the channel this whole industry runs on — the product already
 * uses a wa.me link for founder support — so chasing a DJ should open the app
 * they are already in rather than an email client they are not.
 *
 * A phone number is optional: without one this opens WhatsApp with the message
 * ready and lets the manager pick the contact, which is the common case since
 * we do not store recipient numbers.
 */
export function buildNudgeLink(input: {
  recipientName: string;
  showTitle: string;
  packUrl: string;
  phone?: string | null;
}): string {
  const firstName = input.recipientName.trim().split(/\s+/)[0] || 'there';
  const message = `Hi ${firstName}, here are the tracks for ${input.showTitle}: ${input.packUrl}`;
  const digits = (input.phone || '').replace(/\D/g, '');
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

/** The slice of a set row the readiness check reads. Structural so the set
 *  builder, the pack panel and the UrgAns tool can all hand in what they have. */
export type PackReadinessItem = {
  itemType?: string | null;
  /** The file this row will send — already resolved to the song's default
   *  when the row names none (see pickDefaultVersion). */
  version?: unknown;
};

export type PackReadiness = {
  /** Song rows only: talk, interludes and breaks are not files. */
  songs: number;
  /** Songs with no file to send. */
  missingFiles: number;
  /** One line for the owner, before anything goes out. Empty for an empty set. */
  summary: string;
  /** The confirm-card sentence UrgAns shows before sending. */
  detail: string;
};

/**
 * What a pack would actually hand over, said plainly BEFORE it is sent.
 *
 * Two things this replaced: the UrgAns confirm card counted talk and breaks as
 * "tracks" (a set with one song and two talks read "3 tracks"), and nothing
 * anywhere warned that a song had no file — so a pack could go out in which
 * every track read "No file".
 */
export function describePackReadiness(items: readonly PackReadinessItem[]): PackReadiness {
  const songRows = items.filter((item) => (item.itemType ?? 'song') === 'song');
  const songs = songRows.length;
  const missingFiles = songRows.filter((item) => !item.version).length;

  const trackWord = songs === 1 ? 'track' : 'tracks';
  const promise = 'They get their own private link. You can turn it off later, but you can’t unsend it.';

  let summary = '';
  if (songs > 0 && missingFiles === songs) {
    summary =
      songs === 1
        ? 'The song has no file yet. Add it so there is something to download.'
        : 'None of the songs have a file yet. Add them so there is something to download.';
  } else if (missingFiles > 0) {
    summary = `${missingFiles} of ${songs} songs ${missingFiles === 1 ? 'has' : 'have'} no file yet. ${
      missingFiles === 1 ? 'It will' : 'They will'
    } show as missing for the DJ.`;
  }

  let detail: string;
  if (songs === 0) {
    detail = 'There are no songs in this set yet.';
  } else if (missingFiles === 0) {
    detail = `${songs} ${trackWord}. ${promise}`;
  } else if (missingFiles === songs) {
    detail = `${songs} ${trackWord}, none with a file yet, so there will be nothing to download. ${promise}`;
  } else {
    detail = `${songs} ${trackWord}, and ${missingFiles} ${missingFiles === 1 ? 'has' : 'have'} no file yet, so ${
      missingFiles === 1 ? 'it will' : 'they will'
    } show as missing. ${promise}`;
  }

  return { songs, missingFiles, summary, detail };
}

/** Trims and length-checks a recipient. Returns the row values or a message. */
export function parseRecipient(input: {
  name?: unknown;
  role?: unknown;
}): { error: string } | { name: string; role: string | null } {
  if (typeof input.name !== 'string' || !input.name.trim()) {
    return { error: 'Who is this for?' };
  }
  const name = input.name.trim();
  if (name.length > MAX_RECIPIENT_NAME_LENGTH) {
    return { error: 'That name is too long.' };
  }

  let role: string | null = null;
  if (typeof input.role === 'string' && input.role.trim()) {
    role = input.role.trim();
    if (role.length > MAX_RECIPIENT_ROLE_LENGTH) {
      return { error: 'That role is too long.' };
    }
  }

  return { name, role };
}

/** True when the link should no longer serve anything. */
export const isPackExpired = (expiresAt: string | null, now: Date = new Date()): boolean => {
  if (!expiresAt) return false;
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() <= now.getTime();
};

/** What a pack link shows, decided in one place so the page and every
 *  download agree. */
export type PackGate = 'unavailable' | 'cancelled' | 'expired' | 'ok';

/**
 * The order is the rule. A turned-off link is UNAVAILABLE before anything
 * else, so the person it was taken from learns nothing more, not even that
 * the show was called off. A cancelled show outranks an expired link: "the
 * show is off" is the true reason, and the one a DJ can act on.
 */
export function decidePackGate(input: {
  recipientRevokedAt: string | null;
  eventStatus: string | null;
  packExpiresAt: string | null;
  now?: Date;
}): PackGate {
  if (input.recipientRevokedAt) return 'unavailable';
  if (input.eventStatus === 'cancelled') return 'cancelled';
  if (isPackExpired(input.packExpiresAt, input.now ?? new Date())) return 'expired';
  return 'ok';
}

/** The default expiry for a show on `setStartAt`, or null when the date is not
 *  known yet — a link with no show date should not quietly expire in three
 *  days from nothing.
 *
 *  Recomputed whenever the show's date moves (PATCH /api/events/[id]), so a
 *  show pushed back a week does not have its links die before it happens. */
export function defaultPackExpiry(setStartAt: string | null): string | null {
  if (!setStartAt) return null;
  const start = new Date(setStartAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + DEFAULT_PACK_EXPIRY_DAYS * 86_400_000).toISOString();
}

/**
 * The expiry to give a pack the owner has just reopened: the later of three
 * days from now and the show's own default.
 *
 * "Later of" rather than "now + 3" because reopening must never SHORTEN a pack
 * — a show still a fortnight away keeps its links until three days after it.
 */
export function reopenedPackExpiry(setStartAt: string | null, now: Date = new Date()): string {
  const fromNow = now.getTime() + DEFAULT_PACK_EXPIRY_DAYS * 86_400_000;
  const fromShow = defaultPackExpiry(setStartAt);
  const showMs = fromShow ? Date.parse(fromShow) : Number.NaN;
  return new Date(Number.isNaN(showMs) ? fromNow : Math.max(fromNow, showMs)).toISOString();
}

/**
 * Why a set that was sent to someone cannot be deleted (founder call,
 * 2026-09-25: sent sets are kept).
 *
 * The access log is the only record of who downloaded an unreleased track, and
 * it lives on the pack; deleting the set would take the pack and that record
 * with it. So the refusal names the people it went to, says why it is kept,
 * and offers the one thing that IS possible — renaming it — rather than
 * sending the manager looking for an action that does not exist (the old
 * "Revoke the pack first" copy pointed at nothing).
 */
export function describeSentSetRefusal(recipientNames: readonly string[]): string {
  const names = recipientNames.map((name) => name.trim()).filter(Boolean);
  const first = names[0] || 'someone';
  const others = Math.max(0, recipientNames.length - 1);
  const who =
    others === 0 ? first : `${first} and ${others} ${others === 1 ? 'other' : 'others'}`;
  return `This set went to ${who}, so it is kept as the record of who downloaded it. You can rename it.`;
}
