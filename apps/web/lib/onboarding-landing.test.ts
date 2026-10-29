import { describe, expect, it } from 'vitest';
import {
  DATED_SHEET_AFTER_MS,
  LANDING_MAX_MS,
  NODATE_SHEET_FALLBACK_MS,
  RECORD_SHEET_AFTER_MS,
  decideTrialSheet,
  parseOnboardingLanding,
  planLimitLines,
  trialSheetPlan,
  trialSheetTier,
  type OnboardingLanding,
  type TrialSheetInput,
} from './onboarding-landing';

const NOW = 1_800_000_000_000;

function landing(over: Partial<OnboardingLanding> = {}): OnboardingLanding {
  return { v: 1, userId: 'u1', kind: 'rollout_dated', releaseId: 'r1', at: NOW, ...over };
}

function input(over: Partial<TrialSheetInput> = {}): TrialSheetInput {
  return {
    landing: landing(),
    place: { onHome: false, releaseId: 'r1', onRecord: false },
    elapsedMs: 0,
    plannerOpen: false,
    plannerWasOpened: false,
    planBuilding: false,
    planLanded: false,
    ...over,
  };
}

describe('when the trial sheet opens', () => {
  it('a dated rollout: when the plan lands, or after 45 seconds', () => {
    expect(decideTrialSheet(input())).toBe('wait');
    expect(decideTrialSheet(input({ planLanded: true }))).toBe('open');
    expect(decideTrialSheet(input({ elapsedMs: DATED_SHEET_AFTER_MS }))).toBe('open');
  });

  it('never over the planner questions', () => {
    expect(decideTrialSheet(input({ plannerOpen: true, planLanded: true, elapsedMs: 999_999 }))).toBe('wait');
  });

  it('a rollout with no date: once the plan starts building after the questions', () => {
    const base = input({ landing: landing({ kind: 'rollout_nodate' }) });
    expect(decideTrialSheet({ ...base, plannerWasOpened: true, elapsedMs: 999_999 })).toBe('wait');
    expect(decideTrialSheet({ ...base, plannerWasOpened: true, planBuilding: true })).toBe('open');
    // Never opened the planner: the sheet comes after a minute instead.
    expect(decideTrialSheet({ ...base, elapsedMs: NODATE_SHEET_FALLBACK_MS })).toBe('open');
  });

  it('a record: 8 seconds after landing on it', () => {
    const base = input({ landing: landing({ kind: 'record', releaseId: undefined }), place: { onHome: false, releaseId: null, onRecord: true } });
    expect(decideTrialSheet(base)).toBe('wait');
    expect(decideTrialSheet({ ...base, elapsedMs: RECORD_SHEET_AFTER_MS })).toBe('open');
  });

  it('skipped: on the first Home visit', () => {
    const base = input({ landing: landing({ kind: 'skipped', releaseId: undefined }), place: { onHome: true, releaseId: null, onRecord: false } });
    expect(decideTrialSheet({ ...base, elapsedMs: 2_000 })).toBe('open');
    expect(decideTrialSheet({ ...base, place: { onHome: false, releaseId: null, onRecord: false }, elapsedMs: 9_000 })).toBe('none');
  });

  it('nothing on another rollout, and never for someone who joined a team', () => {
    expect(decideTrialSheet(input({ place: { onHome: false, releaseId: 'other', onRecord: false }, elapsedMs: 99_000 }))).toBe('none');
    expect(decideTrialSheet(input({ landing: landing({ kind: 'joined' }), elapsedMs: 99_000 }))).toBe('none');
  });
});

describe('the landing record', () => {
  it('reads back what was written, and drops stale or broken records', () => {
    const raw = JSON.stringify(landing({ whoFor: 'artist', teamName: 'Northline' }));
    expect(parseOnboardingLanding(raw, NOW + 1000)).toEqual(landing({ whoFor: 'artist', teamName: 'Northline' }));
    expect(parseOnboardingLanding(raw, NOW + LANDING_MAX_MS + 1)).toBeNull();
    expect(parseOnboardingLanding('{', NOW)).toBeNull();
    expect(parseOnboardingLanding(JSON.stringify({ ...landing(), kind: 'nope' }), NOW)).toBeNull();
  });
});

describe('the plan on the sheet', () => {
  it('fits who the team is for', () => {
    expect(trialSheetTier('artist')).toBe('solo');
    expect(trialSheetTier('manager')).toBe('manager');
    expect(trialSheetTier('label')).toBe('manager');
    expect(trialSheetTier(null)).toBe('manager');
  });

  it('says the limits from the plan itself', () => {
    expect(planLimitLines('solo')).toEqual(['One artist, you and one other person.', 'One rollout at a time.']);
    expect(planLimitLines('manager')).toEqual(['Up to 3 artists and 5 people.', 'Three rollouts at a time.']);
  });

  it('prices from @urganize/pricing, starting price first', () => {
    const plan = trialSheetPlan('artist');
    expect(plan.name).toBe('Solo');
    expect(plan.price).toMatch(/\/month$/);
    expect(plan.then === null || plan.then.startsWith('for your first')).toBe(true);
  });
});
