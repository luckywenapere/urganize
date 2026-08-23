import { describe, expect, it } from 'vitest';
import { canResumeCuratorInviteClaim } from './curator-invites';

// The stranding this guards against: the join route consumes the invite BEFORE
// writing curator_profiles, so a failure in between leaves an account marked
// used with no curator profile and no way back in.
const CLAIMANT = 'user-1';

describe('canResumeCuratorInviteClaim', () => {
  it('lets the original claimant finish', () => {
    expect(
      canResumeCuratorInviteClaim({
        state: 'used',
        revokedAt: null,
        usedBy: CLAIMANT,
        userId: CLAIMANT,
      })
    ).toBe(true);
  });

  it('refuses a different user, so single use still holds', () => {
    expect(
      canResumeCuratorInviteClaim({
        state: 'used',
        revokedAt: null,
        usedBy: 'someone-else',
        userId: CLAIMANT,
      })
    ).toBe(false);
  });

  it('refuses a revoked link even for its claimant', () => {
    // resolveCuratorInviteState reports 'used' ahead of 'revoked', so this case
    // reaches the predicate looking exactly like a resumable one.
    expect(
      canResumeCuratorInviteClaim({
        state: 'used',
        revokedAt: '2026-08-20T10:00:00Z',
        usedBy: CLAIMANT,
        userId: CLAIMANT,
      })
    ).toBe(false);
  });

  it('only ever applies to a used link', () => {
    for (const state of ['active', 'revoked', 'expired'] as const) {
      expect(
        canResumeCuratorInviteClaim({ state, revokedAt: null, usedBy: CLAIMANT, userId: CLAIMANT }),
        state
      ).toBe(false);
    }
  });

  it('refuses when either side is missing, rather than matching empty to empty', () => {
    expect(
      canResumeCuratorInviteClaim({ state: 'used', revokedAt: null, usedBy: null, userId: CLAIMANT })
    ).toBe(false);
    expect(
      canResumeCuratorInviteClaim({ state: 'used', revokedAt: null, usedBy: null, userId: '' })
    ).toBe(false);
    expect(
      canResumeCuratorInviteClaim({ state: 'used', revokedAt: null, usedBy: '  ', userId: '  ' })
    ).toBe(false);
  });

  it('tolerates surrounding whitespace on a real match', () => {
    expect(
      canResumeCuratorInviteClaim({
        state: 'used',
        revokedAt: null,
        usedBy: ' user-1 ',
        userId: 'user-1',
      })
    ).toBe(true);
  });
});
