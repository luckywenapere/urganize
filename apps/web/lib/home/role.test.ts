import { describe, expect, it } from 'vitest';
import { resolveHomeRole, type HomeRoleInput } from './role';

function input(overrides: Partial<HomeRoleInput> = {}): HomeRoleInput {
  return {
    isOwnerOrAdmin: true,
    teamState: 'paid',
    ownerPlan: 'label',
    profileRole: 'artist-manager',
    isArtistScopedOnPrimary: false,
    ...overrides,
  };
}

describe('resolveHomeRole', () => {
  it('resolves an owner/admin genuinely paying for Label to label', () => {
    expect(resolveHomeRole(input())).toBe('label');
  });

  it('does NOT resolve to label for a trialing team on the label plan id — teamState must be paid', () => {
    // resolveTeamTier's own fail-open behaviour would collapse a trial to the
    // 'label' TIER; this proves the role check does not repeat that mistake.
    expect(resolveHomeRole(input({ teamState: 'trial' }))).toBe('manager');
  });

  it('does NOT resolve to label for a comped team, even with ownerPlan somehow set to label', () => {
    expect(resolveHomeRole(input({ teamState: 'comped' }))).toBe('manager');
  });

  it('does not resolve to label when the owner is paid but on Manager, not Label', () => {
    expect(resolveHomeRole(input({ ownerPlan: 'manager' }))).toBe('manager');
  });

  it('does not resolve to label for a non-owner/admin, even on a paid Label team', () => {
    expect(resolveHomeRole(input({ isOwnerOrAdmin: false }))).toBe('artist');
  });

  it('resolves to label for an owner/admin genuinely paying for Label, even when profileRole is "artist"', () => {
    // Row 1 (label) is checked before row 2 (artist) — the approved plan's
    // literal table order. Someone running a paying Label-tier team gets the
    // Label layout regardless of which onboarding option they personally
    // picked; profileRole only matters once row 1 does not match.
    expect(resolveHomeRole(input({ profileRole: 'artist' }))).toBe('label');
  });

  it('resolves profiles.role="artist" to artist for an owner/admin NOT paying for Label', () => {
    expect(resolveHomeRole(input({ profileRole: 'artist', teamState: 'trial' }))).toBe('artist');
  });

  it('resolves an artist-scoped member to artist regardless of profileRole', () => {
    expect(
      resolveHomeRole(
        input({
          isOwnerOrAdmin: false,
          teamState: 'paid',
          ownerPlan: 'label',
          profileRole: 'team-member',
          isArtistScopedOnPrimary: true,
        })
      )
    ).toBe('artist');
  });

  it('resolves an owner/admin on Solo (not Label, not artist role) to manager', () => {
    expect(resolveHomeRole(input({ ownerPlan: 'solo', teamState: 'paid' }))).toBe('manager');
  });

  it('resolves an owner/admin with a null ownerPlan (no subscription row read) to manager, not label', () => {
    expect(resolveHomeRole(input({ ownerPlan: null }))).toBe('manager');
  });

  it('falls back to artist for a plain member/guest with no artist role and no scope', () => {
    expect(
      resolveHomeRole({
        isOwnerOrAdmin: false,
        teamState: 'paid',
        ownerPlan: 'manager',
        profileRole: 'team-member',
        isArtistScopedOnPrimary: false,
      })
    ).toBe('artist');
  });
});
