import { createHash, randomBytes } from 'node:crypto';
import { normalizeEmail, normalizePhone, type PersonIdentifier } from './person-identity';
import { suggestSlug } from './person-profile';

// The claim flow's rules (Profiles and Directory spec, Lane A, 2026-10-10).
//
// A credited person with no account gets an UNCLAIMED profile made from the
// credit a team collected. They can claim it with a link. Everything that
// decides who may claim what, how long a link lives, what counts as proof and
// when a removal is due is here, pure, so it can be tested without a database.
//
// Node's crypto is imported, so this file is for server code and tests. The
// client-safe copy lives in lib/claim-copy.ts.

/** A claim link lives for a month. Long enough to reach somebody who is on
 *  tour, short enough that an old link in a chat history stops working. */
export const CLAIM_INVITE_DAYS = 30;
/** Wrong guesses at the email or phone before the link locks. */
export const MAX_CLAIM_ATTEMPTS = 5;
/** The promise on the public removal form. */
export const REMOVAL_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Tokens ----------------------------------------------------------------

/** 24 random bytes: 32 URL-safe characters. Shown once and never stored. */
export function generateClaimToken(): string {
  return randomBytes(24).toString('base64url');
}

/** What is stored. Nothing needs the token back, so a leaked row is not a
 *  working link (the same reasoning the OAuth tokens use). */
export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export { isValidClaimToken } from './claim-token-shape';

export function claimInviteExpiry(now: Date): Date {
  return new Date(now.getTime() + CLAIM_INVITE_DAYS * DAY_MS);
}

// ---- What state is an invite in -------------------------------------------

export type ClaimInviteRow = {
  usedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
  failedAttempts: number;
};

export type ClaimInviteState = 'open' | 'used' | 'revoked' | 'expired' | 'locked';

/**
 * Used outranks everything, so a link already used reads as used, not expired.
 * An unreadable expiry counts as expired: a link we cannot date must not open a
 * profile.
 */
export function claimInviteState(invite: ClaimInviteRow, now: Date = new Date()): ClaimInviteState {
  if (invite.usedAt) return 'used';
  if (invite.revokedAt) return 'revoked';
  const expires = Date.parse(invite.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return 'expired';
  if (invite.failedAttempts >= MAX_CLAIM_ATTEMPTS) return 'locked';
  return 'open';
}

// ---- Proof -----------------------------------------------------------------

export type ContactProof =
  | { ok: true; via: 'account_email' | 'typed_email' | 'typed_phone'; identifier: PersonIdentifier }
  | { ok: false; reason: 'no_match' | 'nothing_to_check' };

/**
 * Does this person hold an email or phone that is on the credit?
 *
 * Two ways to prove it. Their sign-in email matches one on the credit AND the
 * provider says it is confirmed (a password signup with the email unconfirmed
 * proves nothing, because anyone can type anyone's address). Or they type the
 * email or phone that is on the credit. The second is weaker than a code sent
 * to them, so the invite also locks after MAX_CLAIM_ATTEMPTS wrong tries.
 *
 * Names are never compared. A name is a label, not an identity.
 */
export function proveContact(input: {
  typed: string;
  accountEmail: string | null;
  accountEmailConfirmed: boolean;
  identifiers: readonly PersonIdentifier[];
}): ContactProof {
  const known = new Set(input.identifiers.map((entry) => `${entry.kind}:${entry.value}`));
  if (known.size === 0) return { ok: false, reason: 'nothing_to_check' };

  const account = normalizeEmail(input.accountEmail);
  if (account && input.accountEmailConfirmed && known.has(`email:${account}`)) {
    return { ok: true, via: 'account_email', identifier: { kind: 'email', value: account } };
  }

  const typed = input.typed.trim();
  if (typed) {
    const email = normalizeEmail(typed);
    if (email && known.has(`email:${email}`)) {
      return { ok: true, via: 'typed_email', identifier: { kind: 'email', value: email } };
    }
    const phone = normalizePhone(typed);
    if (phone && known.has(`phone:${phone}`)) {
      return { ok: true, via: 'typed_phone', identifier: { kind: 'phone', value: phone } };
    }
  }
  return { ok: false, reason: 'no_match' };
}

/**
 * A hint of which contact is on file, so the person knows what to type without
 * the page handing a stranger an address: "t***@gmail.com", "+234 *** *** 4567".
 */
export function maskIdentifier(identifier: PersonIdentifier): string {
  if (identifier.kind === 'email') {
    const [local, domain] = identifier.value.split('@');
    if (!local || !domain) return '';
    return `${local[0]}***@${domain}`;
  }
  const digits = identifier.value.replace(/\D/g, '');
  if (digits.length < 6) return '';
  return `+${digits.slice(0, 3)} *** *** ${digits.slice(-4)}`;
}

// ---- Slugs for unclaimed profiles -------------------------------------------

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A short random tail, so a slug cannot be guessed from a name and two people
 *  with the same name never collide. */
export function randomSlugTail(length = 5): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += SLUG_ALPHABET[bytes[index] % SLUG_ALPHABET.length];
  }
  return out;
}

/**
 * The handle an unclaimed profile is served at. Built from the name so a link
 * reads as them, with a random tail so it is not enumerable. The shape matches
 * person_profiles_slug_shape_check. A name with no usable letters becomes
 * "profile-xxxxx".
 */
export function unclaimedSlug(displayName: string, tail: string = randomSlugTail()): string {
  const base = (suggestSlug(displayName) || 'profile').slice(0, 48).replace(/-+$/g, '');
  return `${base || 'profile'}-${tail}`;
}

// ---- Removal ---------------------------------------------------------------

export function removalDueAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + REMOVAL_DAYS * DAY_MS);
}

export type RemovalUrgency = 'overdue' | 'due_soon' | 'on_track';

/** Overdue once the three days are up, due soon in the last day. */
export function removalUrgency(dueAt: string, now: Date = new Date()): RemovalUrgency {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return 'overdue';
  const left = due - now.getTime();
  if (left <= 0) return 'overdue';
  if (left <= DAY_MS) return 'due_soon';
  return 'on_track';
}

/** What the public removal form accepts: one email or one phone number. */
export function parseRemovalContact(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 254) return null;
  return normalizeEmail(trimmed) ?? normalizePhone(trimmed);
}

export function parseRemovalNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().replace(/\s+/g, ' ');
  return value ? value.slice(0, 500) : null;
}

// ---- Which credits reach a profile ------------------------------------------

/** Only a credit the person attested to, that has not been hidden, on a rollout
 *  that has come out. Fail toward not creating a profile. */
export function creditCountsForProfile(input: {
  confirmedAccurate: boolean;
  personHidden: boolean;
  delivered: boolean;
}): boolean {
  return input.confirmedAccurate && !input.personHidden && input.delivered;
}
