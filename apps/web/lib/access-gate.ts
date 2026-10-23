// Closed sign-up (invite-only), 2026-10-15. Pure rules and copy, safe for the
// client. The server half (reads, writes, hashing) is lib/access-gate-server.ts.
//
// Founder call: "make sure no one can just sign in". Anyone can still create an
// auth user (Google makes one before any app code runs), so the gate holds them
// where access is granted instead: requireActiveAccount answers 402
// reason 'not_approved' and ensureOwnedWorkspace refuses to make them a team.
//
// Closed sign-up is ON in code, with no flag. profiles.access_approved_at was
// backfilled for every account that existed on 2026-10-15
// (supabase/migrations/20261015030000_closed_signup.sql).

/** How long a /start/<code> link works. */
export const ACCESS_INVITE_TTL_DAYS = 14;

/** The 402 reason the fetch interceptor carries to /locked. */
export const NOT_APPROVED_REASON = 'not_approved';

export const WAITLIST_URL = 'https://urganize.app/#waitlist';

/** Copy, kept in one place so /auth, /onboarding and /locked say the same thing. */
export const INVITE_ONLY_COPY = {
  title: 'Urganize is invite-only for now.',
  body: "Join the waitlist and we'll reach out.",
  cta: 'Join the waitlist',
  signInLead: 'Have an invite?',
  signInLink: 'Sign in.',
} as const;

export const HELD_COPY = {
  title: "You're on the list.",
  body: "We'll let you in soon.",
  cta: 'Sign out',
} as const;

export type AccessSource =
  | 'existing'
  | 'admin'
  | 'invite_link'
  | 'invite_email'
  | 'team_invite'
  | 'founder_seed'
  | 'allowlist'
  /** Paid at self-serve checkout (2026-10-22): paying skips the waitlist. */
  | 'paid_self_serve'
  /** Three friends joined through the waitlist share link (2026-10-23). */
  | 'friends';

export function normalizeAccessEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes('@') && trimmed.length <= 320 ? trimmed : '';
}

/** Shape check before any database read, so a junk path never hits the table. */
export function looksLikeAccessCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Za-z0-9]{8,40}$/.test(code);
}

/**
 * Who gets in. True when any one holds:
 *  1. the profile carries access_approved_at;
 *  2. the email is on the paywall allowlist;
 *  3. they belong (not removed) to a team they do not own: email invites and
 *     /join links, whose accept routes stay open;
 *  4. an open founder invite is bound to their email.
 * A /start/<code> link and a founder /welcome link approve by stamping (1).
 */
export type AppAccessFacts = {
  approvedAt: string | null;
  allowlisted: boolean;
  hasForeignMembership: boolean;
  hasEmailInvite: boolean;
};

export type AppAccessDecision =
  | { allowed: true; stamp: AccessSource | null }
  | { allowed: false };

export function decideAppAccess(facts: AppAccessFacts): AppAccessDecision {
  if (facts.approvedAt) return { allowed: true, stamp: null };
  if (facts.allowlisted) return { allowed: true, stamp: 'allowlist' };
  if (facts.hasForeignMembership) return { allowed: true, stamp: 'team_invite' };
  if (facts.hasEmailInvite) return { allowed: true, stamp: 'invite_email' };
  return { allowed: false };
}

export type AccessInviteRow = {
  expires_at?: unknown;
  revoked_at?: unknown;
  used_at?: unknown;
};

export type AccessInviteState = 'open' | 'used' | 'revoked' | 'expired';

/** Used beats revoked beats expired, the curator-invite order. */
export function resolveAccessInviteState(
  row: AccessInviteRow,
  now: Date = new Date()
): AccessInviteState {
  if (row.used_at) return 'used';
  if (row.revoked_at) return 'revoked';
  const expires = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
  if (Number.isFinite(expires) && expires <= now.getTime()) return 'expired';
  return 'open';
}

/**
 * The email binding does not expire: someone the founder called may sign up
 * weeks later with the address they gave. Only the link's code has a clock.
 */
export function emailBindingIsOpen(row: AccessInviteRow): boolean {
  return !row.used_at && !row.revoked_at;
}

export function accessInviteExpiry(days: number = ACCESS_INVITE_TTL_DAYS, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildStartPath(code: string): string {
  return `/start/${encodeURIComponent(code)}`;
}

/** First name only, so the message reads like a person wrote it. */
export function buildInviteMessage(link: string, name?: string | null): string {
  const first = typeof name === 'string' ? name.trim().split(/\s+/)[0] : '';
  const greeting = first ? `Hi ${first}, ` : 'Hi, ';
  return `${greeting}you're in. Start using Urganize here: ${link}`;
}

/** wa.me with the message prefilled; with a phone it opens that chat. */
export function buildWhatsAppShareUrl(message: string, phone?: string | null): string {
  let digits = typeof phone === 'string' ? phone.replace(/[^\d]/g, '') : '';
  // A Nigerian local number (0803 123 4567) needs the country code for wa.me.
  if (digits.length === 11 && digits.startsWith('0')) digits = `234${digits.slice(1)}`;
  const base = digits.length >= 7 ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}
