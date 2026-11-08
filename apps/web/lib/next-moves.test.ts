import { describe, expect, it } from 'vitest';
import {
  findPhaseHandoff,
  isValidNextMoveKey,
  movesForRollout,
  nextMoveKey,
  NEXT_MOVE_COPY,
  pickNextMoves,
  type NextMoveRollout,
  type NextMoveTask,
} from './next-moves';

// 10:00 in Lagos on Wed 14 Oct 2026.
const NOW = new Date('2026-10-14T09:00:00Z');
const RID = '11111111-1111-4111-8111-111111111111';
const RID2 = '22222222-2222-4222-8222-222222222222';
const FLAGS = { planner: true, pitching: true };

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const task = (over: Partial<NextMoveTask> & { id: string }): NextMoveTask => ({
  title: `Task ${over.id}`,
  status: 'todo',
  dueDate: null,
  templateTaskId: null,
  assignedToUserId: 'owner',
  ...over,
});

const rollout = (over: Partial<NextMoveRollout> = {}): NextMoveRollout => ({
  id: RID,
  title: 'Midnight',
  releaseDate: addDays('2026-10-14', 60),
  status: 'active',
  isOwner: true,
  tasks: [task({ id: 't1', assignedToUserId: 'owner' }), task({ id: 't2', assignedToUserId: 'teammate' })],
  pitches: null,
  ...over,
});

const rules = (r: NextMoveRollout, surface: 'home' | 'rollout' = 'home') =>
  movesForRollout(r, { now: NOW, flags: FLAGS, surface }).map((move) => move.rule);

describe('a rollout that was just created', () => {
  it('offers the plan on Home to the owner', () => {
    const [move] = movesForRollout(rollout({ tasks: [] }), { now: NOW, flags: FLAGS, surface: 'home' });
    expect(move.rule).toBe('plan');
    expect(move.title).toBe(NEXT_MOVE_COPY.plan.title);
    expect(move.target).toEqual({ kind: 'link', href: `/dashboard?release=${RID}` });
  });

  it('does not offer it on the rollout page, where the planner card already sits', () => {
    expect(rules(rollout({ tasks: [] }), 'rollout')).toEqual([]);
  });

  it('does not offer it to a teammate, with the planner off, or once released', () => {
    expect(rules(rollout({ tasks: [], isOwner: false }))).toEqual([]);
    expect(movesForRollout(rollout({ tasks: [] }), { now: NOW, flags: { ...FLAGS, planner: false }, surface: 'home' })).toEqual([]);
    expect(rules(rollout({ tasks: [], status: 'released' }))).toEqual([]);
  });

  it('asks the owner to invite the team once there is a plan and one person on it', () => {
    const solo = rollout({ tasks: [task({ id: 'a' }), task({ id: 'b' })] });
    expect(rules(solo)).toContain('invite');
    expect(rules(rollout())).not.toContain('invite');
    expect(rules(rollout({ isOwner: false, tasks: solo.tasks }))).not.toContain('invite');
  });

  it('opens team settings over the current page, not over the rollout', () => {
    const solo = rollout({ tasks: [task({ id: 'a' }), task({ id: 'b' })] });
    const invite = movesForRollout(solo, { now: NOW, flags: FLAGS, surface: 'home' }).find((m) => m.rule === 'invite');
    expect(invite?.target).toEqual({ kind: 'settings', segment: 'team', section: 'teammates' });
  });
});

describe('a release date getting close', () => {
  it('offers the distribution check from 14 days out to the day before', () => {
    expect(rules(rollout({ releaseDate: addDays('2026-10-14', 14) }))).toContain('distribute');
    expect(rules(rollout({ releaseDate: addDays('2026-10-14', 1) }))).toContain('distribute');
    expect(rules(rollout({ releaseDate: addDays('2026-10-14', 15) }))).not.toContain('distribute');
    expect(rules(rollout({ releaseDate: '2026-10-14' }))).not.toContain('distribute');
  });

  it('says how many days are left', () => {
    const move = movesForRollout(rollout({ releaseDate: addDays('2026-10-14', 9) }), {
      now: NOW,
      flags: FLAGS,
      surface: 'rollout',
    }).find((m) => m.rule === 'distribute');
    expect(move?.detail).toBe('Out in 9 days. Catch gaps before your distributor does.');
    expect(move?.target).toEqual({ kind: 'link', href: `/dashboard?release=${RID}&scene=distribute` });
  });

  it('offers the open editorial pitch while the window is open, as a tap on that activity', () => {
    const r = rollout({
      releaseDate: addDays('2026-10-14', 30),
      tasks: [task({ id: 'ed', templateTaskId: 'editorial_pitch', dueDate: addDays('2026-10-14', 2) })],
    });
    const move = movesForRollout(r, { now: NOW, flags: FLAGS, surface: 'rollout' }).find((m) => m.rule === 'editorial');
    expect(move?.detail).toBe('The window closes in 23 days.');
    expect(move?.target).toEqual({ kind: 'task', releaseId: RID, taskId: 'ed' });
  });

  it('drops the editorial pitch once it is done or the window has closed', () => {
    const done = rollout({ tasks: [task({ id: 'ed', templateTaskId: 'editorial_pitch', status: 'done' })] });
    expect(rules(done)).not.toContain('editorial');
    const closed = rollout({
      releaseDate: addDays('2026-10-14', 5),
      tasks: [task({ id: 'ed', templateTaskId: 'editorial_pitch' })],
    });
    expect(rules(closed)).not.toContain('editorial');
  });
});

describe('a block of work finished', () => {
  const release = addDays('2026-10-14', 20);
  // Setup is 29+ days before release day, pre-release 8 to 28.
  const setupDone = [
    task({ id: 's1', status: 'done', dueDate: addDays(release, -40) }),
    task({ id: 's2', status: 'cancelled', dueDate: addDays(release, -35) }),
    task({ id: 'p2', title: 'Second pre-release job', dueDate: addDays(release, -10) }),
    task({ id: 'p1', title: 'Book the radio run', dueDate: addDays(release, -20) }),
  ];

  it('points at the first open activity of the next phase', () => {
    const handoff = findPhaseHandoff(setupDone, release);
    expect(handoff?.finished).toBe('setup');
    expect(handoff?.next).toBe('pre_release');
    expect(handoff?.task.id).toBe('p1');

    const move = movesForRollout(rollout({ releaseDate: release, tasks: setupDone }), {
      now: NOW,
      flags: FLAGS,
      surface: 'rollout',
    }).find((m) => m.rule === 'next_phase');
    expect(move?.title).toBe('Start: Book the radio run');
    expect(move?.detail).toBe('Setup is done. This is next.');
    expect(move?.key).toBe(`next_phase:${RID}:pre_release`);
  });

  it('says nothing while the first phase is still open, or with no date', () => {
    expect(findPhaseHandoff([task({ id: 'x', dueDate: addDays(release, -40) })], release)).toBeNull();
    expect(findPhaseHandoff(setupDone, null)).toBeNull();
  });

  it('cuts a long title so the card stays one line', () => {
    const long = 'A'.repeat(90);
    const tasks = [task({ id: 's', status: 'done', dueDate: addDays(release, -40) }), task({ id: 'p', title: long, dueDate: addDays(release, -20) })];
    const move = movesForRollout(rollout({ releaseDate: release, tasks }), { now: NOW, flags: FLAGS, surface: 'home' }).find(
      (m) => m.rule === 'next_phase'
    );
    expect(move?.title.length).toBeLessThanOrEqual('Start: '.length + 60);
    expect(move?.title.endsWith('…')).toBe(true);
  });
});

describe('a pitch was sent', () => {
  it('asks for more pitches up to three, only after a recent one', () => {
    const r = (count: number, last: number | null) => rollout({ pitches: { count, lastSentDaysAgo: last } });
    const move = movesForRollout(r(1, 0), { now: NOW, flags: FLAGS, surface: 'home' }).find((m) => m.rule === 'pitch_more');
    expect(move?.title).toBe('Pitch 2 more curators');
    expect(movesForRollout(r(2, 3), { now: NOW, flags: FLAGS, surface: 'home' }).find((m) => m.rule === 'pitch_more')?.title).toBe(
      'Pitch 1 more curator'
    );
    expect(rules(r(3, 0))).not.toContain('pitch_more');
    expect(rules(r(1, 20))).not.toContain('pitch_more');
    expect(rules(r(0, null))).not.toContain('pitch_more');
    expect(rules(rollout({ pitches: null }))).not.toContain('pitch_more');
  });

  it('stays quiet with pitching switched off', () => {
    const moves = movesForRollout(rollout({ pitches: { count: 1, lastSentDaysAgo: 0 } }), {
      now: NOW,
      flags: { ...FLAGS, pitching: false },
      surface: 'home',
    });
    expect(moves.map((m) => m.rule)).not.toContain('pitch_more');
  });
});

describe('picking what to show', () => {
  const busy = rollout({
    releaseDate: addDays('2026-10-14', 10),
    tasks: [task({ id: 'a' })],
    pitches: { count: 1, lastSentDaysAgo: 1 },
  });

  it('shows at most three, most important first', () => {
    const picked = pickNextMoves({
      rollouts: [busy],
      dismissed: new Set(),
      now: NOW,
      flags: FLAGS,
      surface: 'rollout',
      hasTeam: false,
    });
    expect(picked.map((m) => m.rule)).toEqual(['distribute', 'pitch_more', 'invite']);
  });

  it('never asks to invite someone who already has a team, or before that is known', () => {
    const base = { rollouts: [busy], dismissed: new Set<string>(), now: NOW, flags: FLAGS, surface: 'rollout' as const };
    expect(pickNextMoves({ ...base, hasTeam: true }).map((m) => m.rule)).not.toContain('invite');
    expect(pickNextMoves({ ...base, hasTeam: null }).map((m) => m.rule)).not.toContain('invite');
    expect(pickNextMoves(base).map((m) => m.rule)).not.toContain('invite');
  });

  it('puts Invite away on every rollout once it is dismissed on one', () => {
    const picked = pickNextMoves({
      rollouts: [busy],
      dismissed: new Set([nextMoveKey('invite', RID2)]),
      now: NOW,
      flags: FLAGS,
      surface: 'rollout',
      hasTeam: false,
    });
    expect(picked.map((m) => m.rule)).not.toContain('invite');
  });

  it('never shows a dismissed move again', () => {
    const picked = pickNextMoves({
      rollouts: [busy],
      dismissed: new Set([nextMoveKey('distribute', RID)]),
      now: NOW,
      flags: FLAGS,
      surface: 'rollout',
    });
    expect(picked.map((m) => m.rule)).not.toContain('distribute');
  });

  it('puts the sooner rollout first and asks to invite once across rollouts', () => {
    const later = rollout({ id: RID2, title: 'Later', releaseDate: addDays('2026-10-14', 12), tasks: [task({ id: 'b' })] });
    const picked = pickNextMoves({
      rollouts: [later, busy],
      dismissed: new Set(),
      now: NOW,
      flags: FLAGS,
      surface: 'home',
      hasTeam: false,
    });
    expect(picked[0].releaseId).toBe(RID);
    expect(picked[1].releaseId).toBe(RID2);
    expect(picked.filter((m) => m.rule === 'invite').length).toBeLessThanOrEqual(1);
    expect(picked.length).toBe(3);
  });
});

describe('dismiss keys', () => {
  it('accepts what the picker makes and refuses anything else', () => {
    expect(isValidNextMoveKey(nextMoveKey('plan', RID))).toBe(true);
    expect(isValidNextMoveKey(nextMoveKey('next_phase', RID, 'post_release'))).toBe(true);
    expect(isValidNextMoveKey('plan:not-an-id')).toBe(false);
    expect(isValidNextMoveKey(`drop:${RID}`)).toBe(false);
    expect(isValidNextMoveKey(`plan:${RID}; drop table`)).toBe(false);
    expect(isValidNextMoveKey(42)).toBe(false);
  });
});

describe('copy', () => {
  it('keeps the house rules: no em dash, no exclamation mark', () => {
    const strings = [
      NEXT_MOVE_COPY.label,
      NEXT_MOVE_COPY.plan.title,
      NEXT_MOVE_COPY.plan.detail,
      NEXT_MOVE_COPY.distribute.detail(3),
      NEXT_MOVE_COPY.editorial.detail(3),
      NEXT_MOVE_COPY.nextPhase.detail('Setup'),
      NEXT_MOVE_COPY.pitchMore.detail,
      NEXT_MOVE_COPY.invite.detail,
    ];
    for (const text of strings) {
      expect(text).not.toMatch(/[—!]/);
    }
  });
});
