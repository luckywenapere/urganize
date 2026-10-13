import { describe, expect, it } from 'vitest';
import {
  INVITE_GATE_SKIP_MS,
  inviteGateContinueUrl,
  inviteGateSkipKey,
  inviteGateStorageKey,
  isInviteGateSkipped,
  isPlanView,
  shouldRequireInvite,
  type InviteGateFacts,
} from './invite-gate';

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

describe('Skip for now (2026-10-13)', () => {
  const now = 10_000_000_000;

  it('keeps the gate away for a day after a skip', () => {
    expect(isInviteGateSkipped(now, now)).toBe(true);
    expect(isInviteGateSkipped(now - INVITE_GATE_SKIP_MS + 1, now)).toBe(true);
  });

  it('asks again once the day is up', () => {
    expect(INVITE_GATE_SKIP_MS).toBe(24 * 60 * 60 * 1000);
    expect(isInviteGateSkipped(now - INVITE_GATE_SKIP_MS, now)).toBe(false);
  });

  it('never treats a missing, broken or future time as a skip', () => {
    expect(isInviteGateSkipped(null, now)).toBe(false);
    expect(isInviteGateSkipped(undefined, now)).toBe(false);
    expect(isInviteGateSkipped(Number.NaN, now)).toBe(false);
    expect(isInviteGateSkipped(now + 60_000, now)).toBe(false);
  });

  it('is kept per team, apart from the "has fired" key', () => {
    expect(inviteGateSkipKey('ws-1')).not.toBe(inviteGateSkipKey('ws-2'));
    expect(inviteGateSkipKey('ws-1')).not.toBe(inviteGateStorageKey('ws-1'));
  });

  it('is wired into the gate: a button, Escape, and no firing while skipped', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, '..', 'components', 'app', 'InviteGate.tsx'), 'utf8');
    expect(source).toMatch(/onClick=\{onSkip\}[\s\S]{0,300}Skip for now/);
    expect(source).toContain('escapeRef.current = sent ? continueToPlan : onSkip;');
    expect(source).toContain('if (next.required && !readSkipped(next.workspaceId)) fire(next.workspaceId);');
    expect(source).toContain('return readTriggered(workspaceId) && !readSkipped(workspaceId);');
    // A skip must not clear the answer, or the gate would never come back.
    const onSkip = source.slice(source.indexOf('onSkip={() => {'), source.indexOf('/>', source.indexOf('onSkip={() => {')));
    expect(onSkip).toContain('writeSkipped(answer.workspaceId)');
    expect(onSkip).not.toContain('setAnswer(');
  });
});
