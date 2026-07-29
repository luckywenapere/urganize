import { describe, expect, it } from 'vitest';
import {
  isOnboardingStage,
  isOnboardingWhereStuck,
  isOnboardingWhereStuckList,
  normalizeOnboardingState,
} from './onboarding';

// URG-192 added onboarding_where_stuck / onboarding_stage. These are pure
// guards + a pure row normalizer, so they're the kind of logic this repo's
// narrow vitest coverage is for. The null-vs-empty-array distinction is the
// subtle part: null means "never asked" (a pre-URG-192 signup), [] means
// "asked, picked nothing". Aggregate counts on the admin side (URG-195) are
// only honest if those stay distinguishable.

describe('isOnboardingWhereStuck', () => {
  it('accepts every shipped option value', () => {
    for (const value of [
      'keeping_team_aligned',
      'tracking_progress',
      'collecting_credits',
      'managing_multiple_releases',
      'marketing_promo',
      'distribution',
    ]) {
      expect(isOnboardingWhereStuck(value)).toBe(true);
    }
  });

  it('rejects unknown, empty, and non-string input', () => {
    for (const value of ['', 'nope', 'KEEPING_TEAM_ALIGNED', null, undefined, 3, {}, []]) {
      expect(isOnboardingWhereStuck(value)).toBe(false);
    }
  });

  it("does not accept the biggest-headache vocabulary it partially overlaps with", () => {
    // 'keeping_team_aligned' is valid in BOTH enums, but these three are
    // OnboardingBiggestHeadache-only and must not pass as where-stuck values.
    expect(isOnboardingWhereStuck('tracking_whats_done_and_whats_next')).toBe(false);
    expect(isOnboardingWhereStuck('collecting_credits_and_metadata')).toBe(false);
    expect(isOnboardingWhereStuck('managing_multiple_releases_at_once')).toBe(false);
  });
});

describe('isOnboardingWhereStuckList', () => {
  it('accepts an empty list — "asked, picked nothing" is a real answer', () => {
    expect(isOnboardingWhereStuckList([])).toBe(true);
  });

  it('accepts a valid multi-select', () => {
    expect(isOnboardingWhereStuckList(['distribution', 'marketing_promo'])).toBe(true);
  });

  it('rejects a list containing any invalid member', () => {
    expect(isOnboardingWhereStuckList(['distribution', 'nope'])).toBe(false);
  });

  it('rejects duplicates so a crafted body cannot skew aggregate counts', () => {
    expect(isOnboardingWhereStuckList(['distribution', 'distribution'])).toBe(false);
  });

  it('rejects non-arrays', () => {
    for (const value of ['distribution', null, undefined, {}, 7]) {
      expect(isOnboardingWhereStuckList(value)).toBe(false);
    }
  });
});

describe('isOnboardingStage', () => {
  it('accepts every shipped option value', () => {
    for (const value of [
      'just_starting',
      'recorded',
      'preparing',
      'date_set',
      'promoting',
      'post_release',
    ]) {
      expect(isOnboardingStage(value)).toBe(true);
    }
  });

  it('rejects unknown and non-string input', () => {
    for (const value of ['', 'shipped', null, undefined, 0, []]) {
      expect(isOnboardingStage(value)).toBe(false);
    }
  });
});

describe('normalizeOnboardingState — whereStuck / stage', () => {
  it('reads a stored answer back', () => {
    const state = normalizeOnboardingState({
      onboarding_where_stuck: ['distribution', 'marketing_promo'],
      onboarding_stage: 'date_set',
    });
    expect(state.onboardingWhereStuck).toEqual(['distribution', 'marketing_promo']);
    expect(state.onboardingStage).toBe('date_set');
  });

  it('preserves an empty array rather than collapsing it to null', () => {
    const state = normalizeOnboardingState({ onboarding_where_stuck: [] });
    expect(state.onboardingWhereStuck).toEqual([]);
  });

  it('reads a pre-migration row (columns absent) as null, not empty', () => {
    const state = normalizeOnboardingState({ onboarding_completed: true });
    expect(state.onboardingWhereStuck).toBeNull();
    expect(state.onboardingStage).toBeNull();
  });

  it('filters unknown members instead of discarding the valid picks with them', () => {
    const state = normalizeOnboardingState({
      onboarding_where_stuck: ['distribution', 'retired_option', 'marketing_promo'],
    });
    expect(state.onboardingWhereStuck).toEqual(['distribution', 'marketing_promo']);
  });

  it('nulls an invalid stage rather than passing it through', () => {
    const state = normalizeOnboardingState({ onboarding_stage: 'retired_stage' });
    expect(state.onboardingStage).toBeNull();
  });

  it('tolerates a non-array where_stuck value', () => {
    expect(normalizeOnboardingState({ onboarding_where_stuck: 'distribution' }).onboardingWhereStuck)
      .toBeNull();
  });
});
