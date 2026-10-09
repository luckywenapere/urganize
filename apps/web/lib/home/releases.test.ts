import { describe, expect, it } from 'vitest';
import {
  buildReleaseSummary,
  computeProgress,
  computeTeamSize,
  computeWeekProgress,
  computeYourPart,
} from './releases';
import { buildTask } from './test-fixtures';

const NOW = new Date('2026-09-29T12:00:00.000Z');

describe('computeProgress', () => {
  it('counts done over total, excluding cancelled tasks entirely', () => {
    const tasks = [
      buildTask({ id: '1', status: 'done' }),
      buildTask({ id: '2', status: 'todo' }),
      buildTask({ id: '3', status: 'cancelled' }),
    ];
    expect(computeProgress(tasks)).toEqual({ done: 1, total: 2 });
  });

  it('handles an empty list', () => {
    expect(computeProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe('computeYourPart', () => {
  it('only counts tasks assigned to the viewer', () => {
    const tasks = [
      buildTask({ id: '1', assignedToUserId: 'viewer', status: 'done' }),
      buildTask({ id: '2', assignedToUserId: 'viewer', status: 'todo' }),
      buildTask({ id: '3', assignedToUserId: 'someone-else', status: 'done' }),
    ];
    expect(computeYourPart(tasks, 'viewer')).toEqual({ done: 1, total: 2 });
  });

  it('excludes the viewer\'s cancelled tasks from total', () => {
    const tasks = [buildTask({ assignedToUserId: 'viewer', status: 'cancelled' })];
    expect(computeYourPart(tasks, 'viewer')).toEqual({ done: 0, total: 0 });
  });
});

describe('computeTeamSize', () => {
  it('counts distinct assignees, ignoring unassigned tasks', () => {
    const tasks = [
      buildTask({ id: '1', assignedToUserId: 'a' }),
      buildTask({ id: '2', assignedToUserId: 'a' }),
      buildTask({ id: '3', assignedToUserId: 'b' }),
      buildTask({ id: '4', assignedToUserId: null }),
    ];
    expect(computeTeamSize(tasks)).toBe(2);
  });
});

describe('computeWeekProgress', () => {
  it('returns null with no release date', () => {
    expect(computeWeekProgress(null, 'single', NOW)).toBeNull();
  });

  it('reads week 1 at the very start of the single playbook\'s lead time (8 weeks out)', () => {
    // Release day = today + 8 weeks (56 days), so plan start is today.
    const releaseDate = new Date(NOW);
    releaseDate.setDate(releaseDate.getDate() + 56);
    const result = computeWeekProgress(releaseDate.toISOString().slice(0, 10), 'single', NOW);
    expect(result).not.toBeNull();
    expect(result?.current).toBe(1);
  });

  it('clamps to the total when the release is well past its plan', () => {
    const result = computeWeekProgress('2020-01-01', 'single', NOW);
    expect(result).not.toBeNull();
    expect(result?.current).toBe(result?.total);
  });

  it('reads the same week in the Americas as in Lagos (a date column is a calendar day)', () => {
    const original = process.env.TZ;
    try {
      for (const zone of ['America/New_York', 'America/Los_Angeles', 'Africa/Lagos']) {
        process.env.TZ = zone;
        // Release 2026-11-24, single playbook: plan starts 56 days earlier,
        // 2026-09-29. Oct 5 is day 6 (still week 1); Oct 6 is day 7 (week 2).
        expect(computeWeekProgress('2026-11-24', 'single', new Date(2026, 9, 5, 12))?.current).toBe(1);
        expect(computeWeekProgress('2026-11-24', 'single', new Date(2026, 9, 6, 12))?.current).toBe(2);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('clamps to week 1 for a release far in the future beyond the plan start', () => {
    const releaseDate = new Date(NOW);
    releaseDate.setDate(releaseDate.getDate() + 365);
    const result = computeWeekProgress(releaseDate.toISOString().slice(0, 10), 'single', NOW);
    expect(result?.current).toBe(1);
  });
});

describe('buildReleaseSummary', () => {
  it('assembles a full summary from a release and its tasks', () => {
    const tasks = [
      buildTask({ id: '1', releaseId: 'r1', assignedToUserId: 'viewer', status: 'done' }),
      buildTask({ id: '2', releaseId: 'r1', assignedToUserId: 'viewer', status: 'todo', dueDate: '2026-09-20' }),
      buildTask({ id: '3', releaseId: 'r1', assignedToUserId: 'someone-else', status: 'todo' }),
    ];
    const summary = buildReleaseSummary(
      {
        id: 'r1',
        title: 'Midnight EP',
        artistId: 'a1',
        artistName: 'Dorian',
        releaseType: 'ep',
        releaseDate: '2026-10-05',
      },
      tasks,
      'viewer',
      NOW
    );

    expect(summary.id).toBe('r1');
    expect(summary.daysOut).toBe(6);
    expect(summary.isSoon).toBe(true);
    expect(summary.progress).toEqual({ done: 1, total: 3 });
    expect(summary.yourDone).toBe(1);
    expect(summary.yourTotal).toBe(2);
    expect(summary.slippingCount).toBe(1);
    expect(summary.teamSize).toBe(2);
    expect(summary.week).not.toBeNull();
  });

  it('is not "soon" for a release more than 14 days out', () => {
    const summary = buildReleaseSummary(
      { id: 'r1', title: 'x', artistId: 'a1', artistName: 'A', releaseType: 'single', releaseDate: '2026-11-01' },
      [],
      'viewer',
      NOW
    );
    expect(summary.isSoon).toBe(false);
  });

  it('has no week progress or soon-flag noise with no release date', () => {
    const summary = buildReleaseSummary(
      { id: 'r1', title: 'x', artistId: 'a1', artistName: 'A', releaseType: 'single', releaseDate: null },
      [],
      'viewer',
      NOW
    );
    expect(summary.daysOut).toBeNull();
    expect(summary.isSoon).toBe(false);
    expect(summary.week).toBeNull();
  });
});
