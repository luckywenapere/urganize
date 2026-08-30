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
export function describeReceipt(receipt: RecipientReceipt, now: Date = new Date()): string {
  if (receipt.revokedAt) return 'Link revoked';
  if (receipt.lastDownloadedAt) {
    return `Downloaded ${relativeDay(receipt.lastDownloadedAt, now)}`;
  }
  if (receipt.lastViewedAt) {
    return `Opened ${relativeDay(receipt.lastViewedAt, now)}, no download`;
  }
  return 'Not opened';
}

/** "today", "yesterday", "3 days ago". Day granularity is the right precision
 *  for a question a manager asks once a day. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'at some point';

  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
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

/** The default expiry for a show on `setStartAt`, or null when the date is not
 *  known yet — a link with no show date should not quietly expire in three
 *  days from nothing. */
export function defaultPackExpiry(setStartAt: string | null): string | null {
  if (!setStartAt) return null;
  const start = new Date(setStartAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + DEFAULT_PACK_EXPIRY_DAYS * 86_400_000).toISOString();
}
