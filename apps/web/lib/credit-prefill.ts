/**
 * Remember a collaborator's own details on their own device, so a producer
 * answering for the same manager's third release does not retype their IPI
 * (founder spec Phase 2, 2026-08-27).
 *
 * DEVICE-LOCAL, NOT A SERVER LOOKUP, and that is the whole design (founder
 * call). The spec's wording — prefill "if the same contributor (same email) has
 * submitted on a past release" — read literally means the public form asks the
 * server what it knows about a typed email. That endpoint has no login, the
 * share token is its only gate, and people forward the link freely, so it would
 * hand anyone holding a link a co-writer's legal name, IPI, PRO, publisher and
 * phone for the price of guessing an email. IPI numbers are what royalty claims
 * are made with. Storing it on the contributor's own machine covers the real
 * case with no lookup to abuse.
 *
 * Pure: no React, no I/O beyond the shared localStorage helper.
 */

import { readPersistedState, writePersistedState, clearPersistedState } from '@/lib/persisted-state';
import type { CreditSubmissionInput } from '@/types/credits';

/** ONE key for every release, deliberately: carrying across releases is the
 * entire point, so this must not be scoped per token. */
export const CREDIT_PREFILL_KEY = 'urganize.credits.prefill';
export const CREDIT_PREFILL_VERSION = 1;

/**
 * Six months. Long enough to cover a producer's next few releases with the same
 * manager, short enough that a studio or internet-cafe machine does not hold a
 * stranger's legal name and IPI indefinitely. The visible notice and the clear
 * control on the form are the real mitigation for a shared device; this is the
 * backstop for the one nobody comes back to.
 */
export const CREDIT_PREFILL_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * The fields worth remembering: facts about the PERSON, which do not change
 * from one song to the next.
 *
 * What is deliberately absent matters more than what is here.
 *
 *  - `roles` — a person's role changes per song. Someone who produced the last
 *    one may only have co-written this one, and roles are required AND drive
 *    which splits are required, so a wrong prefill they do not notice files a
 *    wrong credit and demands the wrong number.
 *  - `songwriterSplit` / `masterSplit` — NEVER. A 50% share on one song says
 *    nothing about the next, and a silently pre-filled ownership share is the
 *    most dangerous autofill this domain has: it could file a claim nobody
 *    typed. This is not a convenience trade-off, it is a hard line.
 *  - `contribution` — "what you did" is about this song.
 *  - `confirmedAccurate` — an attestation about THIS submission. It has to be
 *    ticked again every time or it means nothing.
 */
export const CREDIT_PREFILL_FIELDS = [
  'legalName',
  'stageName',
  'email',
  'phone',
  'country',
  'proAffiliation',
  'ipiNumber',
  'publisherName',
  'publisherIpi',
  'instagramHandle',
  'xHandle',
  'bio',
] as const;

export type CreditPrefillField = (typeof CREDIT_PREFILL_FIELDS)[number];
export type CreditPrefill = Partial<Record<CreditPrefillField, string>>;

const FIELD_SET = new Set<string>(CREDIT_PREFILL_FIELDS);

/** Accepts only an object whose known keys are strings. Unknown keys are
 * tolerated on read (a future version may add one) but dropped by
 * `pickCreditPrefill` before anything reaches the form. */
export function isCreditPrefill(value: unknown): value is CreditPrefill {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, entry]) => !FIELD_SET.has(key) || typeof entry === 'string'
  );
}

/** The durable half of a submitted form, trimmed, with blanks dropped so a
 * cleared field never overwrites a good stored value with an empty one. */
export function pickCreditPrefill(input: CreditSubmissionInput): CreditPrefill {
  const out: CreditPrefill = {};
  for (const field of CREDIT_PREFILL_FIELDS) {
    const value = String(input[field] ?? '').trim();
    if (value) out[field] = value;
  }
  return out;
}

/** Merge stored values onto an empty form. Only fills fields the form has left
 * blank, so this can run after a draft is already being typed without ever
 * clobbering what someone wrote. */
export function applyCreditPrefill(
  form: CreditSubmissionInput,
  stored: CreditPrefill
): CreditSubmissionInput {
  const next = { ...form };
  for (const field of CREDIT_PREFILL_FIELDS) {
    const value = stored[field];
    if (!value) continue;
    if (String(next[field] ?? '').trim()) continue;
    next[field] = value;
  }
  return next;
}

/** True when there is anything worth telling the user about. */
export function hasCreditPrefill(stored: CreditPrefill | null): boolean {
  return Boolean(stored && CREDIT_PREFILL_FIELDS.some((field) => stored[field]));
}

/** How the form names whose details these are. Falls back through stage name to
 * the email so the notice is never "we filled in your details" with nothing to
 * point at. */
export function describeCreditPrefill(stored: CreditPrefill): string {
  return (
    stored.legalName?.trim() ||
    stored.stageName?.trim() ||
    stored.email?.trim() ||
    'your details'
  );
}

// ── Storage ─────────────────────────────────────────────────────────────────
// Reads are already guarded by readPersistedState. Writes are NOT:
// writePersistedState calls setItem directly, which throws
// QuotaExceededError, and in Safari private mode it can throw on any write.
// Remembering details is a convenience, so it must never break a submission
// that has already succeeded.

export function loadCreditPrefill(): CreditPrefill | null {
  return readPersistedState<CreditPrefill>(
    CREDIT_PREFILL_KEY,
    CREDIT_PREFILL_VERSION,
    isCreditPrefill,
    CREDIT_PREFILL_MAX_AGE_MS
  );
}

export function saveCreditPrefill(input: CreditSubmissionInput): void {
  const value = pickCreditPrefill(input);
  if (!hasCreditPrefill(value)) return;
  try {
    writePersistedState(CREDIT_PREFILL_KEY, CREDIT_PREFILL_VERSION, value);
  } catch {
    // Blocked or full storage. Nothing to recover and nothing to tell the
    // user: their credits are already sent.
  }
}

export function forgetCreditPrefill(): void {
  try {
    clearPersistedState(CREDIT_PREFILL_KEY);
  } catch {
    // Same reasoning as above.
  }
}
