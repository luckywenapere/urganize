import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import type { ShareAnswers } from '@/lib/social-share';

/**
 * When the share sheet opens by itself, and what it remembers between opens.
 *
 * Founder call, 2026-09-23: the sheet opens by itself ONCE, right after
 * somebody creates their first rollout. Every rollout after that has a Share
 * button instead. Two routes lead to that moment and both are covered:
 *
 *  - The create-rollout modal. Its callers chain the sheet straight after the
 *    team-login step, BEFORE the planner or the new-rollout guide, so one
 *    thing is on screen at a time.
 *  - Onboarding, which is where most people create their first rollout. It
 *    finishes on another page, so it leaves a PENDING marker in this tab and
 *    the sheet host picks it up once the person lands in the app.
 *
 * "First" is decided by the SERVER (POST /api/releases answers `firstRelease`
 * from the person's own releases, test rollouts excluded), because the client's
 * copy of the catalog may not have loaded yet. The per-person marker here is
 * the belt to that brace: it stops a second offer on this device if somebody
 * deletes everything and starts again.
 */

/**
 * How many of a person's earlier rollouts the create route looks at to decide
 * whether they were all test rollouts. Anyone past this many has real work.
 */
export const FIRST_RELEASE_TEST_SCAN = 10;

/**
 * Was this the person's first REAL rollout? Decided on the server at create
 * time from the rollouts they owned before it.
 *
 * A test rollout is practice (the one-tap "look around" path), so it never
 * counts as a first and never makes the next one second. Every uncertainty
 * answers no, because the cost of a wrong yes is an interruption and the cost
 * of a wrong no is a Share button the person can still press.
 */
export function decideFirstRelease(input: {
  isTest: boolean;
  priorCount: number;
  /** One flag per earlier rollout that was read; null when the read failed. */
  priorTestFlags: boolean[] | null;
}): boolean {
  if (input.isTest) return false;
  if (input.priorCount === 0) return true;
  if (input.priorTestFlags === null) return false;
  if (input.priorCount > input.priorTestFlags.length) return false;
  return input.priorTestFlags.length > 0 && input.priorTestFlags.every(Boolean);
}

export function shouldOfferFirstShare(input: {
  enabled: boolean;
  firstRelease: boolean;
  alreadyOffered: boolean;
}): boolean {
  return input.enabled && input.firstRelease && !input.alreadyOffered;
}

// ── Offered once, per person ────────────────────────────────────────────────

const OFFERED_KEY = 'urganize.share.first-offered';
const OFFERED_CAP = 20;

function readOfferedUserIds(): string[] {
  const raw = window.localStorage.getItem(OFFERED_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Has this person already been offered the first-rollout share on this device?
 *
 * FAILS TOWARD "YES". A store that cannot be read is a store where the offer
 * can never be recorded, and the choice is between never offering and offering
 * on every first rollout forever. Silence is the one that cannot nag.
 */
export function hasOfferedFirstShare(userId: string | null | undefined): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return readOfferedUserIds().includes(String(userId ?? ''));
  } catch {
    return true;
  }
}

/** Best effort; never throws, because every caller is on its way to a sheet. */
export function markFirstShareOffered(userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    const id = String(userId ?? '');
    const next = [id, ...readOfferedUserIds().filter((entry) => entry !== id)].slice(0, OFFERED_CAP);
    window.localStorage.setItem(OFFERED_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked. hasOfferedFirstShare answers yes for a store it
    // cannot read, so the worst case is one offer too few.
  }
}

// ── Pending from onboarding, per tab ────────────────────────────────────────

const PENDING_KEY = 'urganize.share.pending-first';

/**
 * How long a pending offer waits. Onboarding ends with an invite step and a
 * trial page, which take minutes, not hours. A tab left open overnight and
 * reopened should not greet anybody with a sheet about yesterday.
 */
export const FIRST_SHARE_PENDING_TTL_MS = 30 * 60 * 1000;

export function markPendingFirstShare(releaseId: string, now: number = Date.now()): void {
  if (typeof window === 'undefined' || !releaseId) return;
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ releaseId, at: now }));
  } catch {
    // Blocked storage: this person simply finds the Share button instead.
  }
}

export function readPendingFirstShare(now: number = Date.now()): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { releaseId?: unknown; at?: unknown };
    if (typeof parsed.releaseId !== 'string' || !parsed.releaseId) return null;
    if (typeof parsed.at !== 'number' || now - parsed.at > FIRST_SHARE_PENDING_TTL_MS) return null;
    return parsed.releaseId;
  } catch {
    return null;
  }
}

export function clearPendingFirstShare(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear in a store that cannot be read.
  }
}

// ── Remembered answers, per person and rollout ──────────────────────────────

const ANSWERS_KEY = 'urganize.share.answers';
const ANSWERS_VERSION = 1;
const ANSWERS_CAP = 30;

type SavedAnswers = { userId: string; releaseId: string; answers: ShareAnswers };
type AnswersRecord = { entries: SavedAnswers[] };

function isShareAnswers(value: unknown): value is ShareAnswers {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.voice === 'artist' || candidate.voice === 'team') &&
    (candidate.dateMode === 'show' || candidate.dateMode === 'secret') &&
    typeof candidate.fanLink === 'string' &&
    typeof candidate.extraLine === 'string'
  );
}

function isAnswersRecord(value: unknown): value is AnswersRecord {
  if (!value || typeof value !== 'object') return false;
  const entries = (value as { entries?: unknown }).entries;
  return (
    Array.isArray(entries) &&
    entries.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof (entry as SavedAnswers).userId === 'string' &&
        typeof (entry as SavedAnswers).releaseId === 'string' &&
        isShareAnswers((entry as SavedAnswers).answers)
    )
  );
}

function readAnswersRecord(): AnswersRecord {
  return readPersistedState(ANSWERS_KEY, ANSWERS_VERSION, isAnswersRecord) ?? { entries: [] };
}

/**
 * What this person answered last time for this rollout, so the questions come
 * back already filled in. The questions are still ASKED every time (the
 * founder's "always ask"), they just start from what was said before.
 */
export function readSavedShareAnswers(
  userId: string | null | undefined,
  releaseId: string
): ShareAnswers | null {
  const id = String(userId ?? '');
  const match = readAnswersRecord().entries.find(
    (entry) => entry.userId === id && entry.releaseId === releaseId
  );
  return match ? match.answers : null;
}

export function saveShareAnswers(
  userId: string | null | undefined,
  releaseId: string,
  answers: ShareAnswers
): void {
  const id = String(userId ?? '');
  try {
    const rest = readAnswersRecord().entries.filter(
      (entry) => !(entry.userId === id && entry.releaseId === releaseId)
    );
    writePersistedState(ANSWERS_KEY, ANSWERS_VERSION, {
      entries: [{ userId: id, releaseId, answers }, ...rest].slice(0, ANSWERS_CAP),
    });
  } catch {
    // writePersistedState does not guard setItem (Safari private mode, a full
    // quota). Losing the memory costs a retyped link; throwing would cost the
    // posts the person just asked for.
  }
}
