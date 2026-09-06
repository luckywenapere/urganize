import { describe, expect, it } from 'vitest';
import { findRoleGaps, type GapTask } from './role-gaps';

/**
 * Which jobs on this release have nobody on them.
 *
 * Every rule here decides whether a manager is told something untrue about
 * their own team, so each one is mutation tested.
 */

const OWNER = 'owner-1';
const ADA = 'ada-1';

function task(over: Partial<GapTask> & { id: string }): GapTask {
  return {
    templateTaskId: 'w7_brief_designer',
    assignedToUserId: OWNER,
    status: 'todo',
    dueDate: '2026-03-01',
    title: 'Brief designer on cover art',
    ...over,
  };
}

describe('role gaps', () => {
  it('reports a role whose task is still sitting on the owner', () => {
    // Template instantiation puts every task on the owner, so this IS the
    // signal that nobody has been brought in. There is no such thing as an
    // unassigned template task.
    const gaps = findRoleGaps([task({ id: 't1' })], OWNER);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].role).toBe('graphic_designer');
  });

  it('reports a genuinely unassigned task too', () => {
    // A manager-added activity can carry no assignee at all.
    const gaps = findRoleGaps([task({ id: 't1', assignedToUserId: null })], OWNER);
    expect(gaps).toHaveLength(1);
  });

  it('does NOT report a role somebody else has taken', () => {
    // The whole point. A task moved off the owner means somebody is on it, and
    // telling the manager to go hire for it would be wrong.
    expect(findRoleGaps([task({ id: 't1', assignedToUserId: ADA })], OWNER)).toEqual([]);
  });

  it('does NOT report a done task, whoever it sits on', () => {
    // The work happened. A manager who did their own artwork should not be
    // told they need a designer.
    expect(findRoleGaps([task({ id: 't1', status: 'done' })], OWNER)).toEqual([]);
  });

  it('ignores a task no role maps to', () => {
    expect(findRoleGaps([task({ id: 't1', templateTaskId: 'w8_set_rollout_budget' })], OWNER)).toEqual(
      []
    );
  });

  it('ignores an activity with no template origin', () => {
    expect(findRoleGaps([task({ id: 't1', templateTaskId: null })], OWNER)).toEqual([]);
  });

  it('keeps the EARLIEST task per role, not the last one seen', () => {
    // The reason the hiring map exists. Surfacing "cover art delivered" instead
    // of "brief the designer" tells the manager a week late, which is the
    // failure this whole panel is built to avoid.
    // The EARLY task is listed first on purpose. With the late one first, a
    // "last one wins" bug would still land on the early task by accident and
    // this test would pass while the rule was broken.
    const gaps = findRoleGaps(
      [
        task({ id: 'early', templateTaskId: 'w7_brief_designer', dueDate: '2026-03-01' }),
        task({ id: 'late', templateTaskId: 'w6_cover_art_first_draft', dueDate: '2026-03-20' }),
      ],
      OWNER
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].taskId).toBe('early');
  });

  it('returns roles in plan order, soonest first', () => {
    const gaps = findRoleGaps(
      [
        task({ id: 'pr', templateTaskId: 'w4_brief_pr_contacts', dueDate: '2026-04-01' }),
        task({ id: 'art', templateTaskId: 'w7_brief_designer', dueDate: '2026-03-01' }),
      ],
      OWNER
    );
    expect(gaps.map((gap) => gap.role)).toEqual(['graphic_designer', 'pr']);
  });

  it('puts a dateless task last rather than first', () => {
    // A null date must not sort ahead of a real one: "no date" is not "due
    // now", and leading the panel with it would bury the urgent row.
    const gaps = findRoleGaps(
      [
        task({ id: 'nodate', templateTaskId: 'w7_brief_designer', dueDate: null }),
        task({ id: 'pr', templateTaskId: 'w4_brief_pr_contacts', dueDate: '2026-04-01' }),
      ],
      OWNER
    );
    expect(gaps.map((gap) => gap.taskId)).toEqual(['pr', 'nodate']);
  });

  it('finds nothing on a release with no plan', () => {
    expect(findRoleGaps([], OWNER)).toEqual([]);
  });
});
