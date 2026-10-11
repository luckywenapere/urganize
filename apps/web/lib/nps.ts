/**
 * Net Promoter Score (2026-10-11, founder ask: "put an NPS survey in Urganize,
 * pick the best place to ask").
 *
 * The question is the standard one, worded for this market:
 *   "How likely are you to recommend Urganize to another artist, manager or
 *    music team?" on 0 to 10, then ONE optional follow-up whose wording depends
 *    on the score.
 *
 * WHERE AND WHEN (the decision, so it is not re-litigated per session):
 *  - On Home only, a few seconds after it has drawn. Home is where people land
 *    between pieces of work, so the ask never interrupts a task, a planner
 *    intake, a payment or the "How did it go?" sheet (which owns the moment
 *    right after a task is done).
 *  - Only to people who have had time to form an opinion: an account at least
 *    MIN_ACCOUNT_AGE_DAYS old that has used Urganize on at least
 *    MIN_ACTIVE_DAYS different days. Asking a two-day-old account measures the
 *    sign-up flow, not the product.
 *  - Answered: not asked again for REASK_AFTER_ANSWER_DAYS (a quarter), so the
 *    score can be tracked over time without nagging.
 *  - Closed without answering: SNOOZE_AFTER_DISMISS_DAYS. Three closes in a
 *    row without an answer and it backs off to LONG_SNOOZE_DAYS.
 *  - Shown but neither answered nor closed (they navigated away): it waits
 *    SNOOZE_AFTER_SHOWN_DAYS, so it never follows someone around Home.
 *
 * STORAGE: one `ui_state_drafts` row per user (scope 'nps', key 'nps'), a
 * table already in production, so this shipped with no migration. Every answer
 * is also sent to PostHog as `nps_submitted`. See "Net Promoter Score" at the
 * end of CLAUDE.md.
 *
 * Everything in this file is pure so it can be tested without IO.
 */

export const NPS_SCOPE = 'nps';
export const NPS_DRAFT_KEY = 'nps';

export const MIN_ACCOUNT_AGE_DAYS = 14;
export const MIN_ACTIVE_DAYS = 5;
export const REASK_AFTER_ANSWER_DAYS = 90;
export const SNOOZE_AFTER_DISMISS_DAYS = 30;
export const SNOOZE_AFTER_SHOWN_DAYS = 7;
export const LONG_SNOOZE_DAYS = 180;
export const DISMISSALS_BEFORE_LONG_SNOOZE = 3;
export const NPS_REASON_MAX_LENGTH = 500;
/** How many past answers one user's row keeps. Four years of quarterly asks. */
export const NPS_HISTORY_LIMIT = 16;

const DAY_MS = 24 * 60 * 60 * 1000;

export const NPS_QUESTION = 'How likely are you to recommend Urganize to another artist, manager or music team?';
export const NPS_LOW_LABEL = 'Not likely';
export const NPS_HIGH_LABEL = 'Very likely';

export type NpsCategory = 'detractor' | 'passive' | 'promoter';

export type NpsResponse = {
  score: number;
  reason: string;
  /** ISO time the score was given. */
  at: string;
  surface: string;
};

export type NpsState = {
  responses: NpsResponse[];
  lastShownAt: string | null;
  lastDismissedAt: string | null;
  /** Closes in a row since the last answer. */
  dismissalsInARow: number;
};

export const EMPTY_NPS_STATE: NpsState = {
  responses: [],
  lastShownAt: null,
  lastDismissedAt: null,
  dismissalsInARow: 0,
};

export function isValidNpsScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10;
}

export function categorizeNpsScore(score: number): NpsCategory {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

/** The one follow-up, worded for the score they gave. */
export function npsFollowUpQuestion(score: number): string {
  const category = categorizeNpsScore(score);
  if (category === 'promoter') return 'What do you love most about Urganize?';
  if (category === 'passive') return 'What would make it a 10 for you?';
  return 'What is the one thing we should fix first?';
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

export function cleanNpsReason(value: unknown): string {
  return String(value ?? '')
    .trim()
    .slice(0, NPS_REASON_MAX_LENGTH);
}

/** Reads whatever is stored, tolerating a missing or malformed row. */
export function normalizeNpsState(value: unknown): NpsState {
  if (!value || typeof value !== 'object') return { ...EMPTY_NPS_STATE, responses: [] };
  const raw = value as Record<string, unknown>;
  const responses = Array.isArray(raw.responses)
    ? raw.responses
        .map((entry): NpsResponse | null => {
          if (!entry || typeof entry !== 'object') return null;
          const item = entry as Record<string, unknown>;
          const at = isoOrNull(item.at);
          if (!isValidNpsScore(item.score) || !at) return null;
          return {
            score: item.score,
            reason: cleanNpsReason(item.reason),
            at,
            surface: typeof item.surface === 'string' && item.surface ? item.surface : 'home',
          };
        })
        .filter((entry): entry is NpsResponse => entry !== null)
    : [];
  const dismissals = Number(raw.dismissalsInARow);
  return {
    responses: responses.slice(-NPS_HISTORY_LIMIT),
    lastShownAt: isoOrNull(raw.lastShownAt),
    lastDismissedAt: isoOrNull(raw.lastDismissedAt),
    dismissalsInARow: Number.isFinite(dismissals) && dismissals > 0 ? Math.floor(dismissals) : 0,
  };
}

export function latestNpsResponse(state: NpsState): NpsResponse | null {
  return state.responses.length ? state.responses[state.responses.length - 1] : null;
}

export type NpsEligibilityInput = {
  state: NpsState;
  nowMs: number;
  /** auth.users.created_at, in ms. */
  signupMs: number;
  /** Distinct days with a user_presence_days row. */
  activeDays: number;
};

export type NpsEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: 'too_new' | 'not_enough_use' | 'answered_recently' | 'dismissed_recently' | 'shown_recently';
    };

function daysSince(iso: string | null, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (nowMs - Date.parse(iso)) / DAY_MS;
}

export function decideNpsEligibility(input: NpsEligibilityInput): NpsEligibility {
  const { state, nowMs, signupMs, activeDays } = input;

  if (!Number.isFinite(signupMs) || (nowMs - signupMs) / DAY_MS < MIN_ACCOUNT_AGE_DAYS) {
    return { eligible: false, reason: 'too_new' };
  }
  if (activeDays < MIN_ACTIVE_DAYS) return { eligible: false, reason: 'not_enough_use' };

  const latest = latestNpsResponse(state);
  if (latest && daysSince(latest.at, nowMs) < REASK_AFTER_ANSWER_DAYS) {
    return { eligible: false, reason: 'answered_recently' };
  }

  if (state.lastDismissedAt) {
    // A close only counts if it came after the latest answer.
    const dismissedAfterAnswer = !latest || Date.parse(state.lastDismissedAt) > Date.parse(latest.at);
    if (dismissedAfterAnswer) {
      const snooze =
        state.dismissalsInARow >= DISMISSALS_BEFORE_LONG_SNOOZE ? LONG_SNOOZE_DAYS : SNOOZE_AFTER_DISMISS_DAYS;
      if (daysSince(state.lastDismissedAt, nowMs) < snooze) {
        return { eligible: false, reason: 'dismissed_recently' };
      }
    }
  }

  if (daysSince(state.lastShownAt, nowMs) < SNOOZE_AFTER_SHOWN_DAYS) {
    return { eligible: false, reason: 'shown_recently' };
  }

  return { eligible: true };
}

export type NpsAction =
  | { type: 'shown' }
  | { type: 'dismiss' }
  | { type: 'score'; score: number; surface: string }
  | { type: 'reason'; reason: string };

/** The next stored state after one action. Pure; the route persists it. */
export function applyNpsAction(state: NpsState, action: NpsAction, nowIso: string): NpsState {
  switch (action.type) {
    case 'shown':
      return { ...state, lastShownAt: nowIso };
    case 'dismiss':
      return { ...state, lastDismissedAt: nowIso, dismissalsInARow: state.dismissalsInARow + 1 };
    case 'score': {
      const responses = [
        ...state.responses,
        { score: action.score, reason: '', at: nowIso, surface: action.surface || 'home' },
      ].slice(-NPS_HISTORY_LIMIT);
      return { ...state, responses, dismissalsInARow: 0 };
    }
    case 'reason': {
      const latest = latestNpsResponse(state);
      if (!latest) return state;
      const responses = [...state.responses.slice(0, -1), { ...latest, reason: cleanNpsReason(action.reason) }];
      return { ...state, responses };
    }
    default:
      return state;
  }
}

export type NpsSummary = {
  /** -100 to 100, or null with no answers. */
  score: number | null;
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
};

/** NPS = % promoters minus % detractors, rounded to a whole number. */
export function computeNps(scores: number[]): NpsSummary {
  const valid = scores.filter(isValidNpsScore);
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const score of valid) {
    const category = categorizeNpsScore(score);
    if (category === 'promoter') promoters += 1;
    else if (category === 'passive') passives += 1;
    else detractors += 1;
  }
  const total = valid.length;
  return {
    score: total ? Math.round(((promoters - detractors) / total) * 100) : null,
    responses: total,
    promoters,
    passives,
    detractors,
  };
}
