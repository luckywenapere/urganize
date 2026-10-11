import { describe, expect, it } from 'vitest';
import {
  EMPTY_NPS_STATE,
  LONG_SNOOZE_DAYS,
  MIN_ACCOUNT_AGE_DAYS,
  MIN_ACTIVE_DAYS,
  NPS_HISTORY_LIMIT,
  NPS_REASON_MAX_LENGTH,
  REASK_AFTER_ANSWER_DAYS,
  SNOOZE_AFTER_DISMISS_DAYS,
  SNOOZE_AFTER_SHOWN_DAYS,
  applyNpsAction,
  categorizeNpsScore,
  computeNps,
  decideNpsEligibility,
  normalizeNpsState,
  npsFollowUpQuestion,
  type NpsState,
} from './nps';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function state(over: Partial<NpsState> = {}): NpsState {
  return { ...EMPTY_NPS_STATE, responses: [], ...over };
}

function eligible(over: Partial<NpsState> = {}, signupDaysAgo = 60, activeDays = 20) {
  return decideNpsEligibility({ state: state(over), nowMs: NOW, signupMs: NOW - signupDaysAgo * DAY, activeDays });
}

describe('categorizeNpsScore', () => {
  it('uses the standard bands: 0-6 detractor, 7-8 passive, 9-10 promoter', () => {
    expect(categorizeNpsScore(0)).toBe('detractor');
    expect(categorizeNpsScore(6)).toBe('detractor');
    expect(categorizeNpsScore(7)).toBe('passive');
    expect(categorizeNpsScore(8)).toBe('passive');
    expect(categorizeNpsScore(9)).toBe('promoter');
    expect(categorizeNpsScore(10)).toBe('promoter');
  });

  it('words the follow-up for the band', () => {
    expect(npsFollowUpQuestion(10)).toMatch(/love most/);
    expect(npsFollowUpQuestion(7)).toMatch(/make it a 10/);
    expect(npsFollowUpQuestion(3)).toMatch(/fix first/);
  });
});

describe('computeNps', () => {
  it('is % promoters minus % detractors', () => {
    // 5 promoters, 3 passives, 2 detractors out of 10 => 50 - 20 = 30
    expect(computeNps([10, 9, 9, 10, 9, 8, 7, 7, 3, 6])).toEqual({
      score: 30,
      responses: 10,
      promoters: 5,
      passives: 3,
      detractors: 2,
    });
  });

  it('is null with no answers and ignores invalid scores', () => {
    expect(computeNps([]).score).toBeNull();
    expect(computeNps([11, -1, 4.5]).responses).toBe(0);
  });

  it('can be -100 and 100', () => {
    expect(computeNps([0, 1, 2]).score).toBe(-100);
    expect(computeNps([9, 10]).score).toBe(100);
  });
});

describe('decideNpsEligibility', () => {
  it('asks an established, active account that was never asked', () => {
    expect(eligible()).toEqual({ eligible: true });
  });

  it('never asks a new account', () => {
    expect(eligible({}, MIN_ACCOUNT_AGE_DAYS - 1)).toEqual({ eligible: false, reason: 'too_new' });
    expect(eligible({}, MIN_ACCOUNT_AGE_DAYS)).toEqual({ eligible: true });
  });

  it('never asks someone who has barely used it', () => {
    expect(eligible({}, 60, MIN_ACTIVE_DAYS - 1)).toEqual({ eligible: false, reason: 'not_enough_use' });
    expect(eligible({}, 60, MIN_ACTIVE_DAYS)).toEqual({ eligible: true });
  });

  it('waits a quarter after an answer, then asks again', () => {
    const answered = (days: number) => ({ responses: [{ score: 8, reason: '', at: ago(days), surface: 'home' }] });
    expect(eligible(answered(REASK_AFTER_ANSWER_DAYS - 1))).toEqual({ eligible: false, reason: 'answered_recently' });
    expect(eligible(answered(REASK_AFTER_ANSWER_DAYS + 1))).toEqual({ eligible: true });
  });

  it('backs off after a close, and much longer after three in a row', () => {
    expect(eligible({ lastDismissedAt: ago(SNOOZE_AFTER_DISMISS_DAYS - 1), dismissalsInARow: 1 })).toEqual({
      eligible: false,
      reason: 'dismissed_recently',
    });
    expect(eligible({ lastDismissedAt: ago(SNOOZE_AFTER_DISMISS_DAYS + 1), dismissalsInARow: 1 })).toEqual({
      eligible: true,
    });
    expect(eligible({ lastDismissedAt: ago(SNOOZE_AFTER_DISMISS_DAYS + 1), dismissalsInARow: 3 })).toEqual({
      eligible: false,
      reason: 'dismissed_recently',
    });
    expect(eligible({ lastDismissedAt: ago(LONG_SNOOZE_DAYS + 1), dismissalsInARow: 3 })).toEqual({
      eligible: true,
    });
  });

  it('does not follow someone around Home after it was shown and ignored', () => {
    expect(eligible({ lastShownAt: ago(SNOOZE_AFTER_SHOWN_DAYS - 1) })).toEqual({
      eligible: false,
      reason: 'shown_recently',
    });
    expect(eligible({ lastShownAt: ago(SNOOZE_AFTER_SHOWN_DAYS + 1) })).toEqual({ eligible: true });
  });
});

describe('applyNpsAction', () => {
  const iso = new Date(NOW).toISOString();

  it('records a score, resets the close streak, then attaches the reason to it', () => {
    let next = applyNpsAction(state({ dismissalsInARow: 2 }), { type: 'score', score: 9, surface: 'home' }, iso);
    expect(next.responses).toEqual([{ score: 9, reason: '', at: iso, surface: 'home' }]);
    expect(next.dismissalsInARow).toBe(0);
    next = applyNpsAction(next, { type: 'reason', reason: '  The timeline  ' }, iso);
    expect(next.responses[0].reason).toBe('The timeline');
  });

  it('caps the reason length and the history length', () => {
    const long = 'x'.repeat(NPS_REASON_MAX_LENGTH + 50);
    let next = applyNpsAction(state(), { type: 'score', score: 5, surface: 'home' }, iso);
    next = applyNpsAction(next, { type: 'reason', reason: long }, iso);
    expect(next.responses[0].reason).toHaveLength(NPS_REASON_MAX_LENGTH);

    let many = state();
    for (let i = 0; i < NPS_HISTORY_LIMIT + 3; i += 1) {
      many = applyNpsAction(many, { type: 'score', score: i % 11, surface: 'home' }, iso);
    }
    expect(many.responses).toHaveLength(NPS_HISTORY_LIMIT);
  });

  it('a reason with no score is ignored', () => {
    expect(applyNpsAction(state(), { type: 'reason', reason: 'hi' }, iso).responses).toEqual([]);
  });

  it('counts closes in a row', () => {
    const once = applyNpsAction(state(), { type: 'dismiss' }, iso);
    const twice = applyNpsAction(once, { type: 'dismiss' }, iso);
    expect(twice.dismissalsInARow).toBe(2);
    expect(twice.lastDismissedAt).toBe(iso);
  });
});

describe('normalizeNpsState', () => {
  it('survives a missing or malformed row', () => {
    expect(normalizeNpsState(null)).toEqual(EMPTY_NPS_STATE);
    expect(normalizeNpsState({ responses: [{ score: 42, at: 'nope' }], dismissalsInARow: 'x' })).toEqual(
      EMPTY_NPS_STATE
    );
  });

  it('keeps valid answers', () => {
    const at = ago(1);
    expect(normalizeNpsState({ responses: [{ score: 10, reason: 'great', at }] }).responses).toEqual([
      { score: 10, reason: 'great', at, surface: 'home' },
    ]);
  });
});
