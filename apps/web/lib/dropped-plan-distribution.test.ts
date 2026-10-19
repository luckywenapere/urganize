import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { distributionStripMode, isPlanDropped } from './distribution-strip-visibility';
import { movesForRollout, type NextMoveRollout, type NextMoveTask } from './next-moves';
import { countProgress } from './task-progress';

/**
 * URG-399 (Oct 19, 2026), leftover from URG-389: a rollout whose every activity
 * is cancelled read "All clear" on its timeline but still showed "Ready to
 * distribute 0/7" and the "Run the distribution check" next move. The 0/7 is
 * the check before distribution (release fields and files), which never read
 * tasks; the rollout's plan being dropped is what hides it.
 */

const now = new Date(2026, 9, 19, 10, 0, 0);
const DATED = { status: 'draft', releaseDate: '2026-10-28' };

function stripFor(statuses: string[], over: Partial<{ status: string; releaseDate: string | null }> = {}) {
  const progress = countProgress(statuses.map((status) => ({ status })));
  return distributionStripMode(
    {
      ...DATED,
      ...over,
      tasksDone: progress.done,
      tasksTotal: progress.total,
      tasksCancelled: statuses.length - progress.total,
    },
    now
  );
}

describe('distribution strip on a dropped plan', () => {
  it('every activity cancelled: readiness goes, a distributor answer can still show', () => {
    expect(stripFor(['cancelled', 'cancelled', 'cancelled'])).toBe('rejections');
  });

  it('a normal rollout is unchanged', () => {
    expect(stripFor(['todo', 'done', 'in_progress'])).toBe('full');
  });

  it('one cancelled activity (a distribution task included) changes nothing', () => {
    expect(stripFor(['todo', 'cancelled', 'done'])).toBe('full');
  });

  it('done plus cancelled already reads Released through countProgress', () => {
    expect(stripFor(['done', 'cancelled'], { releaseDate: null })).toBe('rejections');
  });

  it('no release day and everything cancelled mounts nothing, as before (0/0 reads as an empty shell)', () => {
    expect(stripFor(['cancelled'], { releaseDate: null })).toBe('none');
  });

  it('archived and the empty shell keep their answers', () => {
    expect(stripFor(['cancelled', 'cancelled'], { status: 'archived', releaseDate: '2026-09-01' })).toBe('full');
    expect(stripFor([], { releaseDate: null })).toBe('none');
    expect(stripFor([])).toBe('full');
  });

  it('callers that do not pass the cancelled count get the old answer', () => {
    expect(distributionStripMode({ ...DATED, tasksDone: 0, tasksTotal: 0 }, now)).toBe('full');
  });

  it('isPlanDropped needs at least one cancelled activity and none live', () => {
    expect(isPlanDropped({ tasksTotal: 0, tasksCancelled: 2 })).toBe(true);
    expect(isPlanDropped({ tasksTotal: 0, tasksCancelled: 0 })).toBe(false);
    expect(isPlanDropped({ tasksTotal: 3, tasksCancelled: 2 })).toBe(false);
    expect(isPlanDropped({ tasksTotal: 0 })).toBe(false);
  });

  it('WorkspaceView passes the cancelled count', () => {
    const src = readFileSync(join(__dirname, '..', 'components/workspace/WorkspaceView.tsx'), 'utf8');
    expect(src).toMatch(/tasksCancelled: scopedTasks\.length - scopedProgress\.total/);
  });
});

describe('next moves on a dropped plan', () => {
  const RID = '11111111-1111-4111-8111-111111111111';
  const NOW = new Date('2026-10-14T09:00:00Z');
  const task = (id: string, status: string, over: Partial<NextMoveTask> = {}): NextMoveTask => ({
    id,
    title: `Task ${id}`,
    status,
    dueDate: null,
    templateTaskId: null,
    assignedToUserId: 'owner',
    ...over,
  });
  const rollout = (tasks: NextMoveTask[]): NextMoveRollout => ({
    id: RID,
    title: 'Midnight',
    releaseDate: '2026-10-20', // 6 days out: inside the distribution window
    status: 'active',
    isOwner: true,
    tasks,
    pitches: null,
  });
  const rules = (r: NextMoveRollout, surface: 'home' | 'rollout' = 'home') =>
    movesForRollout(r, { now: NOW, flags: { planner: true, pitching: true }, surface }).map((m) => m.rule);

  it('every activity cancelled: no "Run the distribution check", nothing else either', () => {
    const dropped = rollout([task('a', 'cancelled'), task('b', 'cancelled', { assignedToUserId: null })]);
    expect(rules(dropped)).toEqual([]);
    expect(rules(dropped, 'rollout')).toEqual([]);
  });

  it('a live rollout in the window still gets it', () => {
    expect(rules(rollout([task('a', 'todo'), task('b', 'cancelled')]))).toContain('distribute');
    expect(rules(rollout([task('a', 'done'), task('b', 'cancelled')]))).toContain('distribute');
  });

  it('an empty rollout still offers the plan on Home', () => {
    expect(rules(rollout([]))).toEqual(['plan']);
  });
});
