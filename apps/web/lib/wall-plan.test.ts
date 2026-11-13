import { describe, expect, it } from 'vitest';
import { PRICING_TIERS, type PricingTierId } from '@urganize/pricing';
import { isWallNeed, pickWallPlan, planFitsUsage, wallPlanBadge, wallPlanReason, type WallUsage } from './wall-plan';

const ALL: PricingTierId[] = ['solo', 'solo_plus', 'manager', 'pro'];
const usage = (artists: number | null, seats: number | null, activeReleases: number | null = 1): WallUsage => ({
  artists,
  seats,
  activeReleases,
});

describe('pickWallPlan: first plan or trial ended', () => {
  it('starts an independent artist on Solo', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false, persona: 'independent_artist', usage: usage(1, 1) })).toEqual({
      tier: 'solo',
      kind: 'solo',
    });
  });

  it('starts a manager on Pro', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false, persona: 'music_manager', usage: usage(2, 4) })?.tier).toBe('manager');
  });

  it('starts anyone who did not answer on Pro', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false })?.tier).toBe('manager');
  });

  it('starts from the plan picked on the sign-up paywall', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false, persona: 'music_manager', chosenTier: 'solo_plus', usage: usage(1, 2) })?.tier).toBe(
      'solo_plus'
    );
  });

  it('moves an artist with two artists past both one-artist plans', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false, persona: 'independent_artist', usage: usage(2, 2) })).toEqual({
      tier: 'manager',
      kind: 'team',
    });
  });

  it('moves a picked plan up when the team has outgrown it', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false, chosenTier: 'solo', usage: usage(1, 1, 3) })?.tier).toBe('solo_plus');
  });

  it('moves a manager with four artists to Pro Plus', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false, persona: 'music_manager', usage: usage(4, 7) })?.tier).toBe('pro');
  });

  it('never moves down from the starting plan, even when a cheaper one fits', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false, persona: 'music_manager', usage: usage(1, 1) })?.tier).toBe('manager');
  });

  it('shows every plan (null) when no self-serve plan holds the team', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false, usage: usage(9, 20) })).toBeNull();
  });

  it('never picks a plan checkout cannot charge', () => {
    expect(pickWallPlan({ offered: ['solo_plus', 'pro'], isUpgrade: false, persona: 'music_manager', usage: usage(2, 2) })?.tier).toBe('pro');
  });

  it('shows every plan when nothing is offered', () => {
    expect(pickWallPlan({ offered: [], isUpgrade: false })).toBeNull();
  });

  it('treats an unreadable count as no limit', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: false, persona: 'independent_artist', usage: usage(null, null, null) })?.tier).toBe(
      'solo'
    );
  });
});

describe('pickWallPlan: moving up', () => {
  it('sends Pro short of artists to Pro Plus', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: true, currentTier: 'manager', need: 'artists' })).toEqual({
      tier: 'pro',
      kind: 'upgrade',
    });
  });

  it('sends Solo short of artists past Solo Plus, which also has one', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: true, currentTier: 'solo', need: 'artists' })?.tier).toBe('manager');
  });

  it('sends Solo short of rollouts to Solo Plus', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: true, currentTier: 'solo', need: 'active_releases' })?.tier).toBe('solo_plus');
  });

  it('takes the next plan up when no limit was named', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: true, currentTier: 'solo_plus' })?.tier).toBe('manager');
  });

  it('shows every plan when the next step is a conversation', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: true, currentTier: 'pro', need: 'artists' })).toBeNull();
  });

  it('falls back to the fit rules when the current plan is unknown', () => {
    expect(pickWallPlan({ offered: ALL, isUpgrade: true, persona: 'music_manager' })?.tier).toBe('manager');
  });
});

describe('the copy', () => {
  const plain = (text: string) => {
    expect(text).not.toMatch(/—|workspace/i);
    expect(text.trim().endsWith('.')).toBe(true);
  };

  it('names the team it fits', () => {
    const text = wallPlanReason({ tier: 'manager', kind: 'team' }, { usage: usage(2, 4) });
    expect(text).toBe('Room for your 2 artists and 4 people, with space to grow to 3 artists and 6 people.');
    plain(text);
  });

  it('says how far a move up goes, from the plan they are on', () => {
    const text = wallPlanReason({ tier: 'pro', kind: 'upgrade' }, { currentTier: 'manager', need: 'artists' });
    expect(text).toBe('Up to 5 artists and 10 people, up from 3 artists and 6 people on Pro.');
    plain(text);
  });

  it('speaks to rollouts when that is the limit', () => {
    const text = wallPlanReason({ tier: 'solo_plus', kind: 'upgrade' }, { currentTier: 'solo', need: 'active_releases' });
    expect(text).toBe('Up to 3 rollouts at a time, up from 1 on Solo.');
  });

  it('reads credits from the plans when that is the limit', () => {
    const text = wallPlanReason({ tier: 'manager', kind: 'upgrade' }, { currentTier: 'solo_plus', need: 'urgans_monthly_actions' });
    expect(text).toContain(String(PRICING_TIERS.manager.urgansMonthlyCredits));
    expect(text).toContain(String(PRICING_TIERS.solo_plus.urgansMonthlyCredits));
  });

  it('gives one artist a plain line', () => {
    const text = wallPlanReason({ tier: 'solo', kind: 'solo' }, { usage: usage(1, 1) });
    expect(text).toBe('Everything you need for your next release, with room for 2 more people on your team.');
    plain(text);
  });

  it('has a badge for every kind', () => {
    expect(wallPlanBadge('upgrade')).toBe('Next step up');
    expect(wallPlanBadge('team')).toBe('Fits your team');
    expect(wallPlanBadge('solo')).toBe('Made for you');
  });
});

describe('helpers', () => {
  it('reads only real limit keys from the URL', () => {
    expect(isWallNeed('artists')).toBe(true);
    expect(isWallNeed('urgans_monthly_actions')).toBe(true);
    expect(isWallNeed('everything')).toBe(false);
    expect(isWallNeed(null)).toBe(false);
  });

  it('lets an unlimited plan hold anything', () => {
    expect(planFitsUsage('label', usage(40, 90, 30))).toBe(true);
  });
});
