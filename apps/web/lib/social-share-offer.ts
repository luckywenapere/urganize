import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import type { ShareAnswers } from '@/lib/social-share';
import { decideDeferredShareOffer } from '@/lib/first-session';
import { DEFERRED_FIRST_SHARE_KEY } from '@/lib/first-run-storage';

/**
 * When the share sheet opens by itself, and what it remembers between opens.
 *
 * Founder call, 2026-09-23: the sheet opens by itself ONCE after somebody
 * creates their first rollout. Every rollout after that has a Share button
 * instead.
 *
 * WHEN it opens changed twice. It used to open straight after the create, before
 * the planner, which asked people to announce a rollout with no plan behind it
 * (a prospect flagged it as "too early" in a live walkthrough). Onboarding moved
 * its offer to Home on the NEXT visit on 2026-10-11 (lib/first-session.ts), and
 * on 2026-10-13 every other create path followed: the create-rollout modal (all
 * three of its callers) and UrgAns's create_release now save a DEFERRED offer
 * here, and the sheet host opens it once on Home in a later visit, at a quiet
 * moment. One rule for both, `decideDeferredShareOffer`, so they cannot drift.
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

// ── Deferred to the next visit, per person ─────────────────────────────────

// The key and clearDeferredFirstShare live in lib/first-run-storage.ts so
// sign-out can clear them without loading this module (URG-314 batch 6).
const DEFERRED_KEY = DEFERRED_FIRST_SHARE_KEY;
const DEFERRED_TAB_KEY = 'urganize.share.deferred-first.tab';

/**
 * A first-rollout share offer waiting for the next visit. Kept in localStorage
 * (it has to outlive the tab it was made in) with the id of that tab, so
 * "the next visit" is a new tab or the same tab more than FIRST_SESSION_MAX_MS
 * later: the same rule onboarding's deferred offer uses, through the same
 * function (`decideDeferredShareOffer`), so the two cannot drift apart.
 */
export type DeferredFirstShare = {
  v: 1;
  userId: string;
  releaseId: string;
  /** Epoch ms when the rollout was made. */
  at: number;
  /** The tab it was made in. */
  tabId: string;
};

export function parseDeferredFirstShare(raw: string | null): DeferredFirstShare | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DeferredFirstShare> | null;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId) return null;
    if (typeof parsed.releaseId !== 'string' || !parsed.releaseId) return null;
    if (typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) return null;
    if (typeof parsed.tabId !== 'string' || !parsed.tabId) return null;
    return { v: 1, userId: parsed.userId, releaseId: parsed.releaseId, at: parsed.at, tabId: parsed.tabId };
  } catch {
    return null;
  }
}

/**
 * Pure: the rollout to offer the share sheet for on this Home visit, or null.
 * Only for the person it was saved for, only on Home, only on a later visit
 * than the one the rollout was made in, and only while it is recent.
 */
export function decideDeferredFirstShare(input: {
  record: DeferredFirstShare | null;
  userId: string | null | undefined;
  tabId: string | null;
  now: number;
  onHome: boolean;
}): string | null {
  const { record, userId, tabId, now, onHome } = input;
  if (!record || !userId || record.userId !== userId) return null;
  return decideDeferredShareOffer({
    record: {
      v: 1,
      startedAt: record.at,
      tabId: record.tabId,
      releaseId: record.releaseId,
      shareReleaseId: record.releaseId,
    },
    tabId,
    now,
    onHome,
  });
}

function readOrCreateTabId(): string {
  const existing = window.sessionStorage.getItem(DEFERRED_TAB_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tab-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
  window.sessionStorage.setItem(DEFERRED_TAB_KEY, id);
  return id;
}

/** Save the offer for the next visit. Never throws: every caller is mid-flow. */
export function deferFirstShare(
  userId: string | null | undefined,
  releaseId: string,
  now: number = Date.now()
): void {
  if (typeof window === 'undefined' || !userId || !releaseId) return;
  try {
    const record: DeferredFirstShare = { v: 1, userId, releaseId, at: now, tabId: readOrCreateTabId() };
    window.localStorage.setItem(DEFERRED_KEY, JSON.stringify(record));
  } catch {
    // Blocked storage: no offer comes later, and the rollout's own Share
    // button still works.
  }
}

export function readDeferredFirstShare(): DeferredFirstShare | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseDeferredFirstShare(window.localStorage.getItem(DEFERRED_KEY));
  } catch {
    return null;
  }
}

export function readDeferredFirstShareTabId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(DEFERRED_TAB_KEY);
  } catch {
    return null;
  }
}

export { clearDeferredFirstShare } from '@/lib/first-run-storage';

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
