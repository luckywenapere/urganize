import { describe, expect, it } from 'vitest';
import { inviteGateContinueUrl, isPlanView, shouldRequireInvite, type InviteGateFacts } from './invite-gate';

const newTeam: InviteGateFacts = {
  role: 'owner',
  seats: 1,
  seatAvailable: true,
  rollouts: 1,
  activities: 24,
};

describe('shouldRequireInvite', () => {
  it('gates a new owner with one planned rollout and nobody else on the team', () => {
    expect(shouldRequireInvite(newTeam)).toBe(true);
  });

  it('gates an admin the same way', () => {
    expect(shouldRequireInvite({ ...newTeam, role: 'admin' })).toBe(true);
  });

  it('never gates members or guests, who cannot invite', () => {
    expect(shouldRequireInvite({ ...newTeam, role: 'member' })).toBe(false);
    expect(shouldRequireInvite({ ...newTeam, role: 'guest' })).toBe(false);
    expect(shouldRequireInvite({ ...newTeam, role: null })).toBe(false);
  });

  it('lets the team through once an invite occupies a seat', () => {
    expect(shouldRequireInvite({ ...newTeam, seats: 2 })).toBe(false);
  });

  it('never gates a team whose plan has no free seat', () => {
    expect(shouldRequireInvite({ ...newTeam, seatAvailable: false })).toBe(false);
  });

  it('leaves teams with more than one rollout alone', () => {
    expect(shouldRequireInvite({ ...newTeam, rollouts: 2 })).toBe(false);
    expect(shouldRequireInvite({ ...newTeam, rollouts: 0 })).toBe(false);
  });

  it('waits for a generated plan', () => {
    expect(shouldRequireInvite({ ...newTeam, activities: 0 })).toBe(false);
  });

  it('fails open on anything unreadable', () => {
    expect(shouldRequireInvite({ ...newTeam, seats: null })).toBe(false);
    expect(shouldRequireInvite({ ...newTeam, rollouts: null })).toBe(false);
    expect(shouldRequireInvite({ ...newTeam, activities: null })).toBe(false);
  });
});

describe('isPlanView', () => {
  it('is the scoped rollout view only', () => {
    expect(isPlanView('/dashboard', 'abc')).toBe(true);
    expect(isPlanView('/dashboard', null)).toBe(false);
    expect(isPlanView('/dashboard/notes', 'abc')).toBe(false);
  });
});

describe('inviteGateContinueUrl', () => {
  it('closes Settings and every other panel, keeping the plan', () => {
    expect(inviteGateContinueUrl('/dashboard', '?release=r1&settings=team&section=invite')).toBe(
      '/dashboard?release=r1'
    );
    expect(inviteGateContinueUrl('/dashboard', '?release=r1&scene=metadata&task=t1&new=1&month=2026-12')).toBe(
      '/dashboard?release=r1'
    );
  });

  it('leaves a clean URL alone and keeps unrelated params', () => {
    expect(inviteGateContinueUrl('/dashboard', '?release=r1')).toBe('/dashboard?release=r1');
    expect(inviteGateContinueUrl('/dashboard', '')).toBe('/dashboard');
    expect(inviteGateContinueUrl('/dashboard/home', 'settings=menu&ref=abc')).toBe('/dashboard/home?ref=abc');
  });

  it('is what the gate’s Continue button uses', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, '..', 'components', 'app', 'InviteGate.tsx'), 'utf8');
    expect(source).toMatch(/onClick=\{continueToPlan\}[\s\S]{0,80}Continue to my plan/);
    expect(source).toContain('inviteGateContinueUrl(window.location.pathname, window.location.search)');
  });
});
