import { describe, expect, it } from 'vitest';
import { shouldShowInviteBanner } from './invite-banner';

const solo = { isManager: true, dismissed: false, teamKnown: true, memberCount: 1 };

describe('shouldShowInviteBanner', () => {
  it('shows to a manager who is the only person on the team', () => {
    expect(shouldShowInviteBanner(solo)).toBe(true);
  });

  it('stays away once somebody else has joined the team', () => {
    expect(shouldShowInviteBanner({ ...solo, memberCount: 2 })).toBe(false);
    expect(shouldShowInviteBanner({ ...solo, memberCount: 7 })).toBe(false);
  });

  it('waits until the team size is known, so it never flashes and vanishes', () => {
    expect(shouldShowInviteBanner({ ...solo, teamKnown: false })).toBe(false);
    // A count of 0 before the team is known must not read as "just you".
    expect(shouldShowInviteBanner({ ...solo, teamKnown: false, memberCount: 0 })).toBe(false);
  });

  it('stays gone once it has been dismissed', () => {
    expect(shouldShowInviteBanner({ ...solo, dismissed: true })).toBe(false);
  });

  it('is only for managers, who are the ones who can invite', () => {
    expect(shouldShowInviteBanner({ ...solo, isManager: false })).toBe(false);
  });

  it('treats a known count of 0 as a team of one, not as a reason to hide', () => {
    // The identity payload falls back to 0 when it cannot count; showing a
    // gentle invite is the safe direction, hiding it would be a silent loss.
    expect(shouldShowInviteBanner({ ...solo, memberCount: 0 })).toBe(true);
  });
});
