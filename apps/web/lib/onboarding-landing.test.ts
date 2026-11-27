import { describe, expect, it } from 'vitest';
import {
  DATED_SHEET_AFTER_MS,
  LANDING_MAX_MS,
  NODATE_SHEET_FALLBACK_MS,
  RECORD_SHEET_AFTER_MS,
  decideTrialSheet,
  parseOnboardingLanding,
  planLimitLines,
  shouldAskWhoFor,
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
  });

  // Oyin, 27 Nov 2026 (#1412): sign-up no longer asks who the team is for, so
  // most new people have no answer. They are shown Solo, never the dearer plan.
  it('is Solo when nobody said who the team is for', () => {
    expect(trialSheetTier(null)).toBe('solo');
    expect(trialSheetTier(undefined)).toBe('solo');
    expect(trialSheetPlan(undefined).name).toBe('Solo');
  });

  // #1424: sign-up no longer asks who the team is for. Of the 16 who had
  // answered since 29 Oct, 8 were artists and 8 managers or labels, and team
  // size cannot tell them apart in the first days. So the sheet asks, one tap.
  it('asks who the team is for when nobody has said', () => {
    expect(shouldAskWhoFor({ ios: false, landingWhoFor: undefined, hasPersona: false, picked: null })).toBe(true);
    expect(shouldAskWhoFor({ ios: false, landingWhoFor: null, hasPersona: false, picked: null })).toBe(true);
  });

  it('does not ask someone who has already said', () => {
    // The stand-in team form asked.
    expect(shouldAskWhoFor({ ios: false, landingWhoFor: 'manager', hasPersona: true, picked: null })).toBe(false);
    // An answer on the profile from before (the card on Home, an older sign-up).
    expect(shouldAskWhoFor({ ios: false, landingWhoFor: undefined, hasPersona: true, picked: null })).toBe(false);
  });

  it('does not ask in the iPhone app, where the sheet shows no plan to change', () => {
    expect(shouldAskWhoFor({ ios: true, landingWhoFor: undefined, hasPersona: false, picked: null })).toBe(false);
  });

  it('keeps the rows up after a tap, so the answer can be changed', () => {
    // The tap saves the answer, so the profile has one a moment later.
    expect(shouldAskWhoFor({ ios: false, landingWhoFor: undefined, hasPersona: true, picked: 'label' })).toBe(true);
  });

  it('the plan follows the tap', () => {
    expect(trialSheetPlan('artist').name).toBe('Solo');
    expect(trialSheetPlan('manager').name).toBe('Pro');
    expect(trialSheetPlan('label').name).toBe('Pro');
  });

  it('says the limits from the plan itself', () => {
    expect(planLimitLines('solo')).toEqual(['One artist, you and two others.', 'One rollout at a time.']);
    expect(planLimitLines('manager')).toEqual(['Up to 3 artists and 6 people.', 'Three rollouts at a time.']);
  });

  it('prices from @urganize/pricing, with no first-month price', () => {
    const plan = trialSheetPlan('artist');
    expect(plan.name).toBe('Solo');
    expect(plan.price).toBe('₦5,000/month');
    expect(plan.then).toBeNull();
  });
});
