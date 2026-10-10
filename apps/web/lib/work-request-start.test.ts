import { describe, expect, it } from 'vitest';
import { MAX_HIRES_PER_TEAM } from './work-requests';
import {
  HIRE_MEMBER_ROLE,
  buildHireMemberRow,
  buildStartMemberRow,
  describeStartForSender,
  describeStartResult,
  hireHasRoom,
  type StartResult,
} from './work-request-start';

const NOW = new Date('2026-10-10T09:00:00.000Z');

describe('buildStartMemberRow', () => {
  const base = { workspaceId: 'ws', userId: 'u1', email: '  Ada@Example.COM ', artistScopeId: 'artist-1', now: NOW };

  it('adds somebody as an active member, joined now, with no invite left over', () => {
    const row = buildStartMemberRow({ ...base, isHire: true });
    expect(row).toMatchObject({
      workspace_id: 'ws',
      user_id: 'u1',
      role: HIRE_MEMBER_ROLE,
      status: 'active',
      invite_token: null,
      invite_expires_at: null,
      invited_at: NOW.toISOString(),
      joined_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    });
  });

  it('lowercases and trims the email', () => {
    expect(buildStartMemberRow({ ...base, isHire: true }).email).toBe('ada@example.com');
  });

  it('keeps the artist scope, which is what holds a hire to one artist', () => {
    expect(buildStartMemberRow({ ...base, isHire: true }).artist_scope_id).toBe('artist-1');
    expect(buildStartMemberRow({ ...base, artistScopeId: null, isHire: true }).artist_scope_id).toBeNull();
  });

  it('is not an admin and not a guest: a hire has to be able to finish the work', () => {
    expect(HIRE_MEMBER_ROLE).toBe('member');
  });

  // The two rows differ in exactly one column, and that column is what decides
  // whether a seat is used.
  it('marks a hire as one and an artist a manager signs as not', () => {
    expect(buildStartMemberRow({ ...base, isHire: true }).is_hire).toBe(true);
    expect(buildStartMemberRow({ ...base, isHire: false }).is_hire).toBe(false);
    const { is_hire: _a, ...hire } = buildStartMemberRow({ ...base, isHire: true });
    const { is_hire: _b, ...signed } = buildStartMemberRow({ ...base, isHire: false });
    expect(hire).toEqual(signed);
  });

  it('defaults the time to now', () => {
    const row = buildStartMemberRow({ workspaceId: 'ws', userId: 'u', email: 'a@b.co', artistScopeId: null, isHire: true });
    expect(Number.isNaN(Date.parse(row.joined_at))).toBe(false);
  });
});

describe('buildHireMemberRow', () => {
  it('is always a hire', () => {
    const row = buildHireMemberRow({ workspaceId: 'ws', userId: 'u', email: 'a@b.co', artistScopeId: 'x', now: NOW });
    expect(row.is_hire).toBe(true);
  });
});

describe('hireHasRoom', () => {
  it('allows a hire below the ceiling and refuses at it', () => {
    expect(hireHasRoom(0)).toBe(true);
    expect(hireHasRoom(MAX_HIRES_PER_TEAM - 1)).toBe(true);
    expect(hireHasRoom(MAX_HIRES_PER_TEAM)).toBe(false);
    expect(hireHasRoom(MAX_HIRES_PER_TEAM + 5)).toBe(false);
  });

  it('fails open on a count that could not be read', () => {
    expect(hireHasRoom(null)).toBe(true);
  });
});

describe('describeStartResult (what the person who said yes reads)', () => {
  const started = (over: Partial<Extract<StartResult, { status: 'started' }>> = {}): StartResult => ({
    status: 'started',
    kind: 'manager_rollout',
    releaseId: 'r1',
    releaseTitle: 'Midnight EP',
    personAdded: true,
    taskTitle: null,
    ...over,
  });
  const notStarted = (
    reason: Extract<StartResult, { status: 'not_started' }>['reason'],
    detail: string | null = null
  ): StartResult => ({ status: 'not_started', kind: 'manager_rollout', reason, detail });

  it('says the rollout is started and the artist is on it', () => {
    expect(describeStartResult(started(), { otherName: 'Dorian' })).toBe('Started “Midnight EP”. Dorian is on it with you.');
  });

  it('says plainly when a seat was missing, and what to do', () => {
    const line = describeStartResult(started({ personAdded: false }), { otherName: 'Dorian' });
    expect(line).toContain('Started “Midnight EP”.');
    expect(line).toContain('no free seat');
    expect(line).toContain('change plan');
  });

  it('puts a hire on the rollout, and names their activity when they were asked about one', () => {
    const joined = describeStartResult(started({ kind: 'hire_join' }), { otherName: 'Northline' });
    expect(joined).toBe('You are on “Midnight EP” with Northline.');
    const task = describeStartResult(started({ kind: 'hire_join', taskTitle: 'Cover art' }), { otherName: 'Northline' });
    expect(task).toBe('You are on “Midnight EP” with Northline, and “Cover art” is yours.');
  });

  it('always says the yes was saved when the rollout could not start', () => {
    for (const reason of ['rollout_limit', 'artist_limit', 'hire_limit', 'sender_left', 'release_gone', 'failed'] as const) {
      expect(describeStartResult(notStarted(reason), { otherName: 'Dorian' })).toMatch(/^Your yes is saved/);
    }
  });

  it("uses the plan's own sentence for a limit when it has one", () => {
    const line = describeStartResult(notStarted('rollout_limit', 'Solo is limited to 1 rollout at a time.'), { otherName: 'x' });
    expect(line).toContain('Solo is limited to 1 rollout at a time.');
    expect(describeStartResult(notStarted('rollout_limit'), { otherName: 'x' })).toContain('no room for another rollout');
    expect(describeStartResult(notStarted('artist_limit'), { otherName: 'x' })).toContain('no room for another artist');
  });

  it('names the hire ceiling', () => {
    expect(describeStartResult(notStarted('hire_limit'), { otherName: 'Northline' })).toContain(String(MAX_HIRES_PER_TEAM));
  });

  it('falls back to "They" when the other person has no name', () => {
    expect(describeStartResult(started(), { otherName: '   ' })).toContain('They is on it');
  });

  it('never uses the word release for the rollout, or workspace, or a dash', () => {
    const results: StartResult[] = [
      started(),
      started({ personAdded: false }),
      started({ kind: 'hire_join', taskTitle: 'Cover art' }),
      notStarted('rollout_limit'),
      notStarted('artist_limit'),
      notStarted('hire_limit'),
      notStarted('sender_left'),
      notStarted('release_gone'),
      notStarted('failed'),
    ];
    for (const result of results) {
      const line = describeStartResult(result, { otherName: 'Dorian' });
      expect(line).not.toMatch(/\brelease\b/i);
      expect(line).not.toMatch(/workspace/i);
      expect(line).not.toMatch(/[—–]/);
    }
  });
});

describe('describeStartForSender (what the asker reads)', () => {
  it('says nothing unless work actually started', () => {
    expect(
      describeStartForSender({ status: 'not_started', kind: 'hire_join', reason: 'failed', detail: null }, 'Ada')
    ).toBeNull();
  });

  it('tells the artist they are on the rollout, or that a seat is needed', () => {
    const base = { status: 'started', kind: 'manager_rollout', releaseId: 'r', releaseTitle: 'EP', taskTitle: null } as const;
    expect(describeStartForSender({ ...base, personAdded: true }, 'Ada')).toBe('Ada started “EP” and you are on it.');
    expect(describeStartForSender({ ...base, personAdded: false }, 'Ada')).toContain('free seat');
  });

  it('tells a team the person is on their rollout, and which activity is theirs', () => {
    const base = { status: 'started', kind: 'hire_join', releaseId: 'r', releaseTitle: 'EP', personAdded: true } as const;
    expect(describeStartForSender({ ...base, taskTitle: null }, 'Ada')).toBe('Ada is on “EP”.');
    expect(describeStartForSender({ ...base, taskTitle: 'Mix' }, 'Ada')).toBe('Ada is on “EP” and “Mix” is theirs now.');
  });
});
