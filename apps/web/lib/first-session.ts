/**
 * The first session after onboarding, and what waits for the next one
 * (2026-10-11, first-user flow; founder-approved).
 *
 * A brand-new manager used to finish onboarding and land on Home under a pile
 * of offers: the "Your first rollout / Tell people it's coming" share sheet,
 * the catalog tour, the install card and the rollout tour offer, all before
 * they had a plan. Now onboarding lands them in the planner for the rollout
 * they just named, and everything else waits.
 *
 * THE MECHANISM, kept deliberately small:
 *
 *  - When onboarding finishes it writes ONE record to localStorage (who, which
 *    rollout, when, and an id for this browser tab) and puts the same tab id in
 *    sessionStorage.
 *  - "This is the first session" means: the record exists, this tab carries
 *    its tab id, and it is under FIRST_SESSION_MAX_MS old. sessionStorage dies
 *    with the tab, so closing the tab or coming back in a new one is the next
 *    visit; a tab left open is cut off by the age cap.
 *  - While it is the first session, the share sheet's onboarding offer, the
 *    catalog tour, the install card and the rollout tour offer stay quiet.
 *    That covers "until the first plan is built and the invite gate is
 *    cleared" with room to spare: the quiet lasts the whole first session
 *    rather than lifting the moment both happen, so nothing pops up between
 *    the plan landing and the gate, or right after the gate closes.
 *  - The "Tell people it's coming" share offer is not dropped, it is moved:
 *    the record keeps the rollout id, and the first visit to Home in a LATER
 *    session offers it once (see `decideDeferredShareOffer`).
 *
 * Every read fails toward "not the first session" for prompts in general
 * (an unreadable store must never silence the app forever) and toward "no
 * offer" for the share (an interruption is the worse mistake). Pure core,
 * thin storage wrappers, so vitest holds the rules.
 */

import { normalizeReadyToday } from './onboarding-readiness';
import type { ReadyItem } from './ready-today';

// The keys and clearFirstSession live in lib/first-run-storage.ts so sign-out
// can clear them without loading this module (URG-314 batch 6).
import { FIRST_SESSION_KEY, FIRST_SESSION_TAB_KEY } from './first-run-storage';
export { FIRST_SESSION_KEY, FIRST_SESSION_TAB_KEY, clearFirstSession } from './first-run-storage';

/** A tab left open overnight is not still "the first session". */
export const FIRST_SESSION_MAX_MS = 12 * 60 * 60 * 1000;

/** A deferred share offer older than this is about a moment long gone. */
export const DEFERRED_SHARE_MAX_MS = 14 * 24 * 60 * 60 * 1000;

export type FirstSessionRecord = {
  v: 1;
  /** Epoch ms when onboarding finished. */
  startedAt: number;
  /** The id of the browser tab onboarding finished in. */
  tabId: string;
  /** The rollout onboarding created. */
  releaseId: string;
  /** The rollout whose "Tell people it's coming" offer waits for the next visit, or null. */
  shareReleaseId: string | null;
};

export function parseFirstSessionRecord(raw: string | null): FirstSessionRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FirstSessionRecord> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== 1) return null;
    if (typeof parsed.startedAt !== 'number' || !Number.isFinite(parsed.startedAt)) return null;
    if (typeof parsed.tabId !== 'string' || !parsed.tabId) return null;
    if (typeof parsed.releaseId !== 'string' || !parsed.releaseId) return null;
    const share = typeof parsed.shareReleaseId === 'string' && parsed.shareReleaseId ? parsed.shareReleaseId : null;
    return { v: 1, startedAt: parsed.startedAt, tabId: parsed.tabId, releaseId: parsed.releaseId, shareReleaseId: share };
  } catch {
    return null;
  }
}

/** Pure: is `tabId` still inside the first session the record describes? */
export function isFirstSession(
  record: FirstSessionRecord | null,
  tabId: string | null,
  now: number
): boolean {
  if (!record || !tabId) return false;
  if (record.tabId !== tabId) return false;
  const age = now - record.startedAt;
  return age >= 0 && age < FIRST_SESSION_MAX_MS;
}

/**
 * Pure: the rollout to offer the share sheet for on this Home visit, or null.
 * Only outside the first session, only once (the caller clears it), and only
 * while the offer is still recent enough to be about something current.
 */
export function decideDeferredShareOffer(input: {
  record: FirstSessionRecord | null;
  tabId: string | null;
  now: number;
  onHome: boolean;
}): string | null {
  const { record, tabId, now, onHome } = input;
  if (!onHome || !record || !record.shareReleaseId) return null;
  if (isFirstSession(record, tabId, now)) return null;
  if (now - record.startedAt > DEFERRED_SHARE_MAX_MS) return null;
  return record.shareReleaseId;
}

// ── Storage wrappers (never throw) ──────────────────────────────────────────

function newTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `tab-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
}

export function readFirstSessionRecord(): FirstSessionRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseFirstSessionRecord(window.localStorage.getItem(FIRST_SESSION_KEY));
  } catch {
    return null;
  }
}

export function readFirstSessionTabId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(FIRST_SESSION_TAB_KEY);
  } catch {
    return null;
  }
}

/** Called once, when onboarding finishes in this tab. */
export function startFirstSession(input: {
  releaseId: string;
  shareReleaseId: string | null;
  now?: number;
}): void {
  if (typeof window === 'undefined' || !input.releaseId) return;
  try {
    const tabId = newTabId();
    const record: FirstSessionRecord = {
      v: 1,
      startedAt: input.now ?? Date.now(),
      tabId,
      releaseId: input.releaseId,
      shareReleaseId: input.shareReleaseId,
    };
    window.sessionStorage.setItem(FIRST_SESSION_TAB_KEY, tabId);
    window.localStorage.setItem(FIRST_SESSION_KEY, JSON.stringify(record));
  } catch {
    // Blocked storage: nothing is held back, and the share offer is simply lost
    // (the rollout's own Share button still works).
  }
}

/** True while this tab is the first session after onboarding. */
export function isInFirstSession(now: number = Date.now()): boolean {
  return isFirstSession(readFirstSessionRecord(), readFirstSessionTabId(), now);
}

/** The deferred share offer has been made (or is moot): drop it, keep the rest. */
export function clearDeferredShare(): void {
  if (typeof window === 'undefined') return;
  try {
    const record = readFirstSessionRecord();
    if (!record) return;
    window.localStorage.setItem(FIRST_SESSION_KEY, JSON.stringify({ ...record, shareReleaseId: null }));
  } catch {
    // Nothing to clear in a store that cannot be written.
  }
}

// ── Onboarding → planner hand-off (per tab) ─────────────────────────────────

const OPEN_PLANNER_KEY = 'urganize.onboarding.open-planner';

/** Onboarding to the dashboard takes minutes at most (an invite step, maybe a trial page). */
export const OPEN_PLANNER_TTL_MS = 60 * 60 * 1000;

export type OnboardingPlannerHandoff = {
  releaseId: string;
  releaseType?: 'single' | 'ep' | 'album';
  releaseDate?: string;
  artistName?: string;
  /** "What's already done?", asked once in onboarding (2026-10-11). Present
   *  and non-empty means the planner skips its own copy of the question. */
  readyToday?: ReadyItem[];
  /** Where the music is (#854): "Ready to release" in onboarding is 'finished',
   *  so planner v2 skips "Where's the music right now?". */
  musicStage?: 'making' | 'finished';
  at: number;
};

export function parseOnboardingPlannerHandoff(
  raw: string | null,
  now: number
): OnboardingPlannerHandoff | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingPlannerHandoff> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.releaseId !== 'string' || !parsed.releaseId) return null;
    if (typeof parsed.at !== 'number' || now - parsed.at > OPEN_PLANNER_TTL_MS || now < parsed.at) return null;
    const type = parsed.releaseType;
    return {
      releaseId: parsed.releaseId,
      ...(type === 'single' || type === 'ep' || type === 'album' ? { releaseType: type } : {}),
      ...(typeof parsed.releaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.releaseDate)
        ? { releaseDate: parsed.releaseDate }
        : {}),
      ...(typeof parsed.artistName === 'string' && parsed.artistName.trim()
        ? { artistName: parsed.artistName.trim().slice(0, 120) }
        : {}),
      ...(() => {
        const ready = Array.isArray(parsed.readyToday) ? normalizeReadyToday(parsed.readyToday) : [];
        return ready.length ? { readyToday: ready } : {};
      })(),
      ...(parsed.musicStage === 'making' || parsed.musicStage === 'finished' ? { musicStage: parsed.musicStage } : {}),
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function markOnboardingPlannerHandoff(input: Omit<OnboardingPlannerHandoff, 'at'>, now: number = Date.now()): void {
  if (typeof window === 'undefined' || !input.releaseId) return;
  try {
    window.sessionStorage.setItem(OPEN_PLANNER_KEY, JSON.stringify({ ...input, at: now }));
  } catch {
    // Blocked storage: they land on the rollout and its Plan button.
  }
}

/** Read and clear, but only for the rollout that is on screen. */
export function takeOnboardingPlannerHandoff(
  releaseId: string,
  now: number = Date.now()
): OnboardingPlannerHandoff | null {
  if (typeof window === 'undefined' || !releaseId) return null;
  try {
    const handoff = parseOnboardingPlannerHandoff(window.sessionStorage.getItem(OPEN_PLANNER_KEY), now);
    if (!handoff) {
      window.sessionStorage.removeItem(OPEN_PLANNER_KEY);
      return null;
    }
    if (handoff.releaseId !== releaseId) return null;
    window.sessionStorage.removeItem(OPEN_PLANNER_KEY);
    return handoff;
  } catch {
    return null;
  }
}

/** Where onboarding lands: the new rollout when there is one, else Home. */
export function onboardingLandingPath(releaseId: string | null | undefined, homePath: string): string {
  return releaseId ? `/dashboard?release=${encodeURIComponent(releaseId)}` : homePath;
}
