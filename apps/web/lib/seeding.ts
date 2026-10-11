import { normalizeEmail, normalizePhone } from './person-identity';
import {
  PERSON_BIO_MAX_CHARS,
  PERSON_DISPLAY_NAME_MAX_CHARS,
  parsePersonProfileInput,
  type PersonProfileInput,
} from './person-profile';
import type { PersonVisibility } from '@/types/directory';

// Founder-led seeding (2026-10-10). Pure rules: no IO, no React, no node
// imports, so the operator page can import them and vitest can hold them.
//
// WHAT THIS IS. Lucky pastes managers from his sales list; each becomes a
// consent-pending profile (unclaimed, private) with a claim link. The manager
// opens the link, edits, and publishes. Nothing is listed, served at /p/{slug}
// or featured until they say yes. Loosens the strategy doc's seeded-profile
// rule by founder decision; logged in CLAUDE.md for the Monday review.

/** How many people one paste may create. */
export const SEED_BATCH_MAX = 30;

/** How long a claim link works. A sales follow-up can take weeks. */
export const SEED_LINK_TTL_DAYS = 30;

export const SEED_NOTES_MAX_CHARS = 1000;

export type SeedRowInput = {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string;
  bioStarter: string | null;
};

export type SeedRowCheck =
  | { ok: true; data: SeedRowInput }
  | { ok: false; error: string };

/**
 * One entered row, checked.
 *
 * A way to reach them is required: a link nobody can be sent is a profile
 * nobody will ever open. The identity rules are the ones Relationships uses
 * (lib/person-identity.ts), so the same person written two ways is recognised
 * as one.
 */
export function checkSeedRow(raw: {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
  bioStarter?: unknown;
}): SeedRowCheck {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return { ok: false, error: 'Add a name.' };
  if (name.length > PERSON_DISPLAY_NAME_MAX_CHARS) {
    return { ok: false, error: `Keep the name to ${PERSON_DISPLAY_NAME_MAX_CHARS} characters or fewer.` };
  }

  const emailText = typeof raw.email === 'string' ? raw.email.trim() : '';
  const phoneText = typeof raw.phone === 'string' ? raw.phone.trim() : '';
  const email = emailText ? normalizeEmail(emailText) : null;
  const phone = phoneText ? normalizePhone(phoneText) : null;
  if (emailText && !email) return { ok: false, error: 'That email does not look right.' };
  if (phoneText && !phone) return { ok: false, error: 'That phone number does not look right.' };
  if (!email && !phone) return { ok: false, error: 'Add an email or a phone number.' };

  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
  if (notes.length > SEED_NOTES_MAX_CHARS) {
    return { ok: false, error: `Keep notes to ${SEED_NOTES_MAX_CHARS} characters or fewer.` };
  }

  const bioText = typeof raw.bioStarter === 'string' ? raw.bioStarter.trim() : '';
  if (bioText.length > PERSON_BIO_MAX_CHARS) {
    return { ok: false, error: `Keep the bio starter to ${PERSON_BIO_MAX_CHARS} characters or fewer.` };
  }

  return { ok: true, data: { name, email, phone, notes, bioStarter: bioText || null } };
}

const looksLikeEmail = (value: string) => value.includes('@');
const looksLikePhone = (value: string) => /^\+?[\d\s().-]{7,}$/.test(value) && /\d{7,}/.test(value.replace(/\D/g, ''));

/**
 * Turns pasted text into rows.
 *
 * One person a line. The first field is the name; after that the fields can come
 * in any order and are sorted by what they look like: the first thing with an
 * "@" is the email, the first long run of digits is the phone, and whatever is
 * left is notes. Fields are split on a tab, a pipe or a comma, so a paste from
 * a spreadsheet and a typed list both work.
 */
export function parseSeedList(text: string): Array<{ name: string; email: string; phone: string; notes: string }> {
  const rows: Array<{ name: string; email: string; phone: string; notes: string }> = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const fields = line
      .split(/\t|\||,/)
      .map((field) => field.trim())
      .filter(Boolean);
    if (fields.length === 0) continue;
    const [name, ...rest] = fields;
    let email = '';
    let phone = '';
    const notes: string[] = [];
    for (const field of rest) {
      if (!email && looksLikeEmail(field)) email = field;
      else if (!phone && looksLikePhone(field)) phone = field;
      else notes.push(field);
    }
    rows.push({ name, email, phone, notes: notes.join(', ') });
  }
  return rows;
}

export type SeedBatchCheck =
  | { ok: true; rows: SeedRowInput[] }
  | { ok: false; error: string; status: number };

/** A whole batch: the cap, then every row. A bad row names its line. */
export function checkSeedBatch(rows: unknown): SeedBatchCheck {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: 'Add at least one person.', status: 400 };
  }
  if (rows.length > SEED_BATCH_MAX) {
    return { ok: false, error: `Add up to ${SEED_BATCH_MAX} people at a time.`, status: 400 };
  }
  const checked: SeedRowInput[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const result = checkSeedRow(row && typeof row === 'object' ? (row as Record<string, unknown>) : {});
    if (!result.ok) return { ok: false, error: `Line ${index + 1}: ${result.error}`, status: 400 };
    checked.push(result.data);
  }
  return { ok: true, rows: checked };
}

// ---------------------------------------------------------------------------
// States, and the weekly numbers

export type SeedState = 'invited' | 'opened' | 'published';

export type SeedDates = {
  invitedAt: string | null;
  openedAt: string | null;
  publishedAt: string | null;
};

/** The furthest point somebody has reached. */
export function seedState(dates: SeedDates): SeedState {
  if (dates.publishedAt) return 'published';
  if (dates.openedAt) return 'opened';
  return 'invited';
}

export const SEED_STATE_LABEL: Record<SeedState, string> = {
  invited: 'Link made',
  opened: 'Opened it',
  published: 'Published',
};

export type SeedSummary = {
  total: number;
  /** Each count is "reached at least this far", so published is inside opened. */
  opened: number;
  published: number;
  invitedThisWeek: number;
  openedThisWeek: number;
  publishedThisWeek: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function within(value: string | null, since: number, until: number): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > since && time <= until;
}

/**
 * The numbers for the weekly review. "This week" is the last 7 days ending now,
 * not a calendar week, so it reads the same on any day it is opened.
 */
export function summarizeSeeding(rows: SeedDates[], now: Date): SeedSummary {
  const until = now.getTime();
  const since = until - WEEK_MS;
  return {
    total: rows.length,
    opened: rows.filter((row) => row.openedAt || row.publishedAt).length,
    published: rows.filter((row) => row.publishedAt).length,
    invitedThisWeek: rows.filter((row) => within(row.invitedAt, since, until)).length,
    openedThisWeek: rows.filter((row) => within(row.openedAt, since, until)).length,
    publishedThisWeek: rows.filter((row) => within(row.publishedAt, since, until)).length,
  };
}

// ---------------------------------------------------------------------------
// The claim link

export type ClaimInviteState = 'ok' | 'used' | 'revoked' | 'expired';

/**
 * Whether a claim link can still be used. A used link outranks a revoked one,
 * and both outrank expiry, so the page can say the most specific true thing.
 */
export function claimInviteState(
  invite: { usedAt: string | null; revokedAt: string | null; expiresAt: string },
  now: Date
): ClaimInviteState {
  if (invite.usedAt) return 'used';
  if (invite.revokedAt) return 'revoked';
  const expires = Date.parse(invite.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return 'expired';
  return 'ok';
}

export function claimLinkExpiry(now: Date): string {
  return new Date(now.getTime() + SEED_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function claimUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/welcome/${token}`;
}

/** Tokens are url-safe and long enough to be unguessable. */
export function isPlausibleClaimToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{20,80}$/.test(token);
}

// ---------------------------------------------------------------------------
// Publishing, which is theirs alone

export type PublishChoice = 'directory' | 'public';

export type ClaimBody = {
  input: PersonProfileInput;
  /** True only when the person said "publish". Anything else stays private. */
  publish: boolean;
  visibility: PersonVisibility;
};

/**
 * The claim request, checked.
 *
 * VISIBILITY IS NEVER TAKEN FROM THE FIELDS. The profile fields go through the
 * same parser as the editor with visibility stripped out, and the listing
 * choice comes only from an explicit `publish: true` plus a choice of who can
 * see it. Without that, a stray `visibility` in the body could list somebody
 * who only pressed Save.
 */
export function parseClaimBody(body: unknown): { error: string } | ClaimBody {
  const payload = (body && typeof body === 'object' ? { ...(body as Record<string, unknown>) } : {}) as Record<
    string,
    unknown
  >;
  const publish = payload.publish === true;
  const choice = payload.publishTo;
  delete payload.visibility;
  delete payload.slug;

  const parsed = parsePersonProfileInput(payload);
  if ('error' in parsed) return parsed;

  if (!publish) return { input: parsed.input, publish: false, visibility: 'private' };

  if (choice !== 'directory' && choice !== 'public') {
    return { error: 'Choose who can see your profile.' };
  }
  return { input: parsed.input, publish: true, visibility: choice };
}

/**
 * What a profile still needs before it can be published. A name and one role
 * are what make it findable; without a role it would appear under no search
 * at all, which is worse than not appearing.
 */
export function publishProblems(profile: { displayName: string; roles: string[] }): string[] {
  const problems: string[] = [];
  if (!profile.displayName.trim()) problems.push('Add your name.');
  if (profile.roles.length === 0) problems.push('Pick at least one thing you do.');
  return problems;
}

// ---------------------------------------------------------------------------
// The message Lucky sends

export function firstNameOf(name: string): string {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first;
}

export type SeedMessages = {
  whatsapp: string;
  emailSubject: string;
  emailBody: string;
};

/**
 * Copy-paste messages in the founder-note register: one person writing to one
 * person. Plain words, no pressure, and the first thing said is that nothing
 * is public until they choose. Signed Wena, the name he goes by.
 */
export function buildSeedMessages(input: { name: string; url: string }): SeedMessages {
  const first = firstNameOf(input.name);
  const hello = first ? `Hi ${first}` : 'Hi';
  return {
    whatsapp: `${hello}, it's Wena from Urganize. I made a small profile for you, so people who hire managers can find you. Only you can see it until you publish it. Have a look, change anything, and publish it only if you want to: ${input.url}`,
    emailSubject: 'A profile for you on Urganize',
    emailBody: `${hello},

It's Wena from Urganize. I made a small profile for you, so the artists and teams who hire managers can find you.

Only you can see it right now. Nothing goes public until you publish it. You can change anything first.

Open it here: ${input.url}

If it's not for you, just tell me and I'll delete it.

Wena`,
  };
}

/**
 * A WhatsApp link that opens a chat with this number and the message already
 * typed. wa.me wants digits only, no plus or spaces. Null without a usable
 * number, in which case the page offers copy only.
 */
export function whatsappHref(phone: string | null | undefined, message: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
