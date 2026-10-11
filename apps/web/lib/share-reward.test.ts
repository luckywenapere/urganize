import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SHARE_REWARD_DAYS,
  SHARE_REWARD_OFFER,
  decideShareReward,
  formatShareRewardDate,
  isShareRewardEligible,
  isShareRewardEnabled,
  shareRewardConfirmation,
  type ShareRewardAccess,
} from './share-reward';
import { paidBonusEndsAt, resolveTeamAccess, type WorkspaceBillingFields } from './team-billing';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-11T12:00:00.000Z');
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY).toISOString();

const TRIAL: ShareRewardAccess = { state: 'trial', reason: 'trial_active' };
const PAID: ShareRewardAccess = { state: 'paid', reason: 'owner_paid' };

function decide(over: Partial<Parameters<typeof decideShareReward>[0]> = {}) {
  return decideShareReward({
    claimedAt: null,
    access: TRIAL,
    ownerPaid: false,
    ownerPaidThrough: null,
    teamTrialEndsAt: iso(2),
    paidBonusDays: 0,
    now: NOW,
    ...over,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isShareRewardEnabled', () => {
  it('is on by default whenever the share sheet is on', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SOCIAL_SHARE', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SHARE_REWARD', '');
    expect(isShareRewardEnabled()).toBe(true);
  });

  it('is off with its kill switch', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SOCIAL_SHARE', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SHARE_REWARD', 'false');
    expect(isShareRewardEnabled()).toBe(false);
  });

  it('is off when there is no share sheet to offer it on', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SOCIAL_SHARE', 'false');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SHARE_REWARD', 'true');
    expect(isShareRewardEnabled()).toBe(false);
  });
});

describe('decideShareReward: trialing teams', () => {
  it('extends a live trial by 30 days from its current end', () => {
    const result = decide({ teamTrialEndsAt: iso(2) });
    expect(result).toEqual({ kind: 'trial_extended', trialEndsAt: iso(32), accessUntil: iso(32) });
  });

  it('gives a lapsed trial 30 days from now, not from a date in the past', () => {
    const result = decide({ access: { state: 'walled', reason: 'trial_expired' }, teamTrialEndsAt: iso(-10) });
    expect(result).toMatchObject({ kind: 'trial_extended', trialEndsAt: iso(30) });
  });

  it('gives a read-only team (paid before, lapsed) 30 days from now', () => {
    const result = decide({ access: { state: 'read_only', reason: 'payment_failed' }, teamTrialEndsAt: iso(-90) });
    expect(result).toMatchObject({ kind: 'trial_extended', trialEndsAt: iso(30) });
  });

  it('gives a credits-only team 30 days of full access from now', () => {
    const result = decide({ access: { state: 'credits_only', reason: 'credits_funded' }, teamTrialEndsAt: iso(-5) });
    expect(result).toMatchObject({ kind: 'trial_extended', trialEndsAt: iso(30) });
  });

  it('stamps an unstamped trial 30 days from now', () => {
    const result = decide({ access: { state: 'trial', reason: 'no_trial_stamp' }, teamTrialEndsAt: null });
    expect(result).toMatchObject({ kind: 'trial_extended', trialEndsAt: iso(30) });
  });

  it("extends from the owner's own trial when that runs longer than the team's", () => {
    const result = decide({ teamTrialEndsAt: iso(1), ownerTrialEndsAt: iso(20) });
    expect(result).toMatchObject({ kind: 'trial_extended', trialEndsAt: iso(50) });
  });

  it('treats an owner with access but no payment as a trial, not a paid team', () => {
    const result = decide({ access: PAID, ownerPaid: false, teamTrialEndsAt: iso(-1) });
    expect(result.kind).toBe('trial_extended');
  });
});

describe('decideShareReward: paying teams', () => {
  it('adds 30 bonus days onto the end of the paid period, and never touches the trial', () => {
    const result = decide({ access: PAID, ownerPaid: true, ownerPaidThrough: iso(100), teamTrialEndsAt: iso(-200) });
    expect(result).toEqual({ kind: 'paid_bonus', paidBonusDays: SHARE_REWARD_DAYS, accessUntil: iso(130) });
  });

  it('adds to bonus days already held rather than replacing them', () => {
    const result = decide({ access: PAID, ownerPaid: true, ownerPaidThrough: iso(10), paidBonusDays: 5 });
    expect(result).toMatchObject({ kind: 'paid_bonus', paidBonusDays: 35, accessUntil: iso(45) });
  });

  it('still records the month for a paid account with no end date, with no date to show', () => {
    const result = decide({ access: PAID, ownerPaid: true, ownerPaidThrough: null });
    expect(result).toEqual({ kind: 'paid_bonus', paidBonusDays: 30, accessUntil: null });
  });
});

describe('decideShareReward: once only, and free teams', () => {
  it('gives nothing a second time, whatever the state', () => {
    for (const access of [TRIAL, PAID, { state: 'walled', reason: 'trial_expired' } as ShareRewardAccess]) {
      expect(decide({ access, ownerPaid: true, claimedAt: iso(-1) })).toEqual({ kind: 'already_claimed' });
    }
  });

  it('gives nothing to a comped team or an allowlisted owner', () => {
    expect(decide({ access: { state: 'comped', reason: 'comped' } })).toEqual({ kind: 'not_needed' });
    expect(decide({ access: { state: 'paid', reason: 'owner_allowlisted' } })).toEqual({ kind: 'not_needed' });
  });
});

describe('isShareRewardEligible', () => {
  const base = {
    enabled: true,
    isOwnerOrAdmin: true,
    claimedAt: null,
    access: TRIAL,
    hasRealRollout: true,
  };

  it('offers it to an owner or admin of an unclaimed team with a real rollout', () => {
    expect(isShareRewardEligible(base)).toBe(true);
    expect(isShareRewardEligible({ ...base, access: PAID })).toBe(true);
    expect(isShareRewardEligible({ ...base, access: { state: 'read_only', reason: 'payment_failed' } })).toBe(true);
  });

  it.each([
    ['the feature is off', { enabled: false }],
    ['a member who cannot act on billing', { isOwnerOrAdmin: false }],
    ['a team that already claimed', { claimedAt: iso(-3) }],
    ['a team with only test rollouts', { hasRealRollout: false }],
    ['a comped team', { access: { state: 'comped', reason: 'comped' } as ShareRewardAccess }],
    ['an allowlisted owner', { access: { state: 'paid', reason: 'owner_allowlisted' } as ShareRewardAccess }],
  ])('does not offer it to %s', (_label, patch) => {
    expect(isShareRewardEligible({ ...base, ...patch })).toBe(false);
  });
});

describe('the paid bonus window in resolveTeamAccess', () => {
  const team = (paidBonusDays: number): WorkspaceBillingFields => ({
    trialStartedAt: iso(-400),
    trialEndsAt: iso(-397),
    compedAt: null,
    billingPlan: null,
    billingLockedAmount: null,
    paidBonusDays,
  });

  const lapsed = (over: Partial<Parameters<typeof resolveTeamAccess>[0]> = {}) =>
    resolveTeamAccess({
      ownerHasAccess: false,
      ownerLapsedFromPayment: true,
      team: team(30),
      ownerPaidThrough: iso(-10),
      now: NOW,
      ...over,
    });

  it('keeps a lapsed paying team on paid access inside its bonus days', () => {
    expect(lapsed()).toMatchObject({ state: 'paid', hasAccess: true, canWrite: true, reason: 'share_bonus' });
  });

  it('drops to read-only once the bonus days run out', () => {
    expect(lapsed({ ownerPaidThrough: iso(-31) })).toMatchObject({ state: 'read_only', reason: 'payment_failed' });
  });

  it('does nothing without bonus days, so every team that never shared is unchanged', () => {
    expect(lapsed({ team: team(0) })).toMatchObject({ state: 'read_only' });
    expect(lapsed({ team: { ...team(0), paidBonusDays: undefined } })).toMatchObject({ state: 'read_only' });
  });

  it('does nothing without a paid-through date', () => {
    expect(lapsed({ ownerPaidThrough: null })).toMatchObject({ state: 'read_only' });
  });

  it('leaves a paying owner as owner_paid: the bonus waits for the paid period to end', () => {
    expect(lapsed({ ownerHasAccess: true, ownerLapsedFromPayment: false, ownerPaidThrough: iso(100) })).toMatchObject({
      state: 'paid',
      reason: 'owner_paid',
    });
  });

  it('follows the live paid-through date, so a renewal carries the month forward', () => {
    expect(paidBonusEndsAt(iso(365), 30)?.toISOString()).toBe(iso(395));
    expect(paidBonusEndsAt(iso(10), 0)).toBeNull();
    expect(paidBonusEndsAt('not a date', 30)).toBeNull();
  });
});

describe('copy', () => {
  it('says the offer and the confirmation the founder asked for', () => {
    expect(SHARE_REWARD_OFFER).toBe('Share your rollout and get 1 month free');
    expect(shareRewardConfirmation('2026-11-10T12:00:00.000Z')).toBe(
      '1 month free added. Your team now has access until November 10, 2026.'
    );
    expect(shareRewardConfirmation(null)).toBe('1 month free added to your team.');
    expect(formatShareRewardDate('nonsense')).toBe('');
  });

  it('never reaches anything a fan reads: the caption and poster code knows nothing of it', () => {
    for (const file of ['lib/social-share.ts', 'lib/social-share-card.tsx']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8').toLowerCase();
      expect(source).not.toContain('share-reward');
      expect(source).not.toContain('month free');
      expect(source).not.toContain('free month');
    }
  });
});
