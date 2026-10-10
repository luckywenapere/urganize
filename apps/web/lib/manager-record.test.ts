import { describe, expect, it } from 'vitest';
import {
  EMPTY_MANAGER_RECORD,
  buildManagerRecord,
  describeManagerRecord,
  isRolloutDelivered,
  type ManagerRolloutRow,
} from './manager-record';

// Midday UTC so the local-midnight comparison in the shared rule lands on the same
// calendar day in every time zone the suite might run in.
const NOW = new Date('2026-10-10T12:00:00.000Z');

function rollout(over: Partial<ManagerRolloutRow> & { id: string }): ManagerRolloutRow {
  return {
    artistId: 'artist-1',
    releaseDate: null,
    status: 'draft',
    isTest: false,
    totalTasks: 10,
    allTasksDone: false,
    ...over,
  };
}

describe('isRolloutDelivered', () => {
  it('is true once the release day has arrived', () => {
    expect(isRolloutDelivered(rollout({ id: 'a', releaseDate: '2026-09-01' }), NOW)).toBe(true);
  });

  it('is false for a release day still ahead', () => {
    expect(isRolloutDelivered(rollout({ id: 'a', releaseDate: '2026-12-01' }), NOW)).toBe(false);
  });

  it('is true when every activity is done, with no date', () => {
    expect(isRolloutDelivered(rollout({ id: 'a', allTasksDone: true }), NOW)).toBe(true);
  });

  it('is not true for a rollout with no activities, whatever the flag says', () => {
    expect(isRolloutDelivered(rollout({ id: 'a', totalTasks: 0, allTasksDone: true }), NOW)).toBe(false);
  });

  // Nothing writes `released`, and `archived` is somebody putting a rollout away.
  it('ignores the stored status, in both directions', () => {
    expect(isRolloutDelivered(rollout({ id: 'a', status: 'released', releaseDate: '2026-12-01' }), NOW)).toBe(false);
    expect(isRolloutDelivered(rollout({ id: 'a', status: 'archived', releaseDate: '2026-12-01' }), NOW)).toBe(false);
  });
});

describe('buildManagerRecord', () => {
  it('is empty for a manager who has run nothing', () => {
    expect(buildManagerRecord([], NOW)).toEqual(EMPTY_MANAGER_RECORD);
  });

  it('counts rollouts that came out, and the artists they were for', () => {
    const record = buildManagerRecord(
      [
        rollout({ id: 'a', artistId: 'x', releaseDate: '2026-01-10' }),
        rollout({ id: 'b', artistId: 'x', releaseDate: '2026-03-10' }),
        rollout({ id: 'c', artistId: 'y', releaseDate: '2026-02-10' }),
      ],
      NOW
    );
    expect(record.releasesRun).toBe(3);
    expect(record.artistsManaged).toBe(2);
  });

  it('never counts a test rollout', () => {
    const record = buildManagerRecord(
      [rollout({ id: 'a', releaseDate: '2026-01-10', isTest: true }), rollout({ id: 'b', isTest: true })],
      NOW
    );
    expect(record).toEqual(EMPTY_MANAGER_RECORD);
  });

  it('does not count a rollout still being planned as run', () => {
    const record = buildManagerRecord([rollout({ id: 'a', releaseDate: '2027-01-01' })], NOW);
    expect(record.releasesRun).toBe(0);
    expect(record.artistsManaged).toBe(0);
  });

  describe('still active', () => {
    it('counts an artist with a rollout still open', () => {
      const record = buildManagerRecord([rollout({ id: 'a', artistId: 'x', releaseDate: '2027-01-01' })], NOW);
      expect(record.artistsActive).toBe(1);
    });

    it('counts an artist whose rollout came out in the last 90 days', () => {
      const record = buildManagerRecord([rollout({ id: 'a', artistId: 'x', releaseDate: '2026-09-15' })], NOW);
      expect(record.artistsActive).toBe(1);
    });

    it('does not count an artist whose last rollout came out long ago', () => {
      const record = buildManagerRecord([rollout({ id: 'a', artistId: 'x', releaseDate: '2026-02-01' })], NOW);
      expect(record.releasesRun).toBe(1);
      expect(record.artistsActive).toBe(0);
    });

    it('counts an artist once even with several open rollouts', () => {
      const record = buildManagerRecord(
        [
          rollout({ id: 'a', artistId: 'x', releaseDate: '2027-01-01' }),
          rollout({ id: 'b', artistId: 'x', releaseDate: '2027-02-01' }),
        ],
        NOW
      );
      expect(record.artistsActive).toBe(1);
    });

    it('gives an archived draft nothing: not run, not managed, not active', () => {
      const record = buildManagerRecord([rollout({ id: 'a', status: 'archived', releaseDate: '2027-01-01' })], NOW);
      expect(record).toEqual(EMPTY_MANAGER_RECORD);
    });

    it('still counts a rollout that came out and was archived afterwards', () => {
      const record = buildManagerRecord(
        [rollout({ id: 'a', artistId: 'x', status: 'archived', releaseDate: '2026-02-01' })],
        NOW
      );
      expect(record.releasesRun).toBe(1);
      expect(record.artistsManaged).toBe(1);
    });
  });

  it('counts a rollout with no artist as run, but not toward any artist', () => {
    const record = buildManagerRecord([rollout({ id: 'a', artistId: null, releaseDate: '2026-02-01' })], NOW);
    expect(record.releasesRun).toBe(1);
    expect(record.artistsManaged).toBe(0);
  });

  it('is deterministic and does not touch its input', () => {
    const rows = [rollout({ id: 'a', releaseDate: '2026-02-01' })];
    const copy = JSON.parse(JSON.stringify(rows));
    expect(buildManagerRecord(rows, NOW)).toEqual(buildManagerRecord(rows, NOW));
    expect(rows).toEqual(copy);
  });
});

describe('describeManagerRecord', () => {
  it('says nothing for nothing, rather than three zeros', () => {
    expect(describeManagerRecord(null)).toBeNull();
    expect(describeManagerRecord(undefined)).toBeNull();
    expect(describeManagerRecord(EMPTY_MANAGER_RECORD)).toBeNull();
  });

  it('uses the singular for one and the plural otherwise', () => {
    expect(describeManagerRecord({ releasesRun: 1, artistsManaged: 1, artistsActive: 0 })).toBe(
      '1 rollout run · 1 artist managed'
    );
    expect(describeManagerRecord({ releasesRun: 4, artistsManaged: 2, artistsActive: 0 })).toBe(
      '4 rollouts run · 2 artists managed'
    );
  });

  it('adds still active only when there is some', () => {
    expect(describeManagerRecord({ releasesRun: 4, artistsManaged: 2, artistsActive: 1 })).toBe(
      '4 rollouts run · 2 artists managed · 1 still active'
    );
  });

  it('shows a first rollout that is still open', () => {
    expect(describeManagerRecord({ releasesRun: 0, artistsManaged: 0, artistsActive: 1 })).toBe(
      '0 rollouts run · 0 artists managed · 1 still active'
    );
  });

  it('says rollout, never release, because that is what the product calls it', () => {
    const line = describeManagerRecord({ releasesRun: 3, artistsManaged: 2, artistsActive: 1 }) ?? '';
    expect(line).not.toMatch(/release/i);
  });
});
