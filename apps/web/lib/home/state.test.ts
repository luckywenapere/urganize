import { describe, expect, it } from 'vitest';
import {
  daysUntilDate,
  isReleaseInFlight,
  isTaskLate,
  resolveArtistState,
  resolveLabelState,
  resolveManagerState,
  toHomeStateKey,
} from './state';
import { buildTask } from './test-fixtures';

const NOW = new Date('2026-09-29T12:00:00.000Z');

describe('daysUntilDate', () => {
  it('returns 0 for today', () => {
    expect(daysUntilDate('2026-09-29', NOW)).toBe(0);
  });

  it('returns a positive count for a future date', () => {
    expect(daysUntilDate('2026-10-13', NOW)).toBe(14);
  });

  it('returns a negative count for a past date', () => {
    expect(daysUntilDate('2026-09-22', NOW)).toBe(-7);
  });

  it('returns null for a missing or unparseable date', () => {
    expect(daysUntilDate(null, NOW)).toBeNull();
    expect(daysUntilDate('not-a-date', NOW)).toBeNull();
  });
});

describe('isReleaseInFlight', () => {
  it('is in flight on release day', () => {
    expect(isReleaseInFlight({ status: 'draft', releaseDate: '2026-09-29' }, false, NOW)).toBe(true);
  });

  it('is in flight for a future date', () => {
    expect(isReleaseInFlight({ status: 'draft', releaseDate: '2026-10-05' }, false, NOW)).toBe(true);
  });

  it('is in flight within the grace window after release day (exactly 7 days)', () => {
    expect(isReleaseInFlight({ status: 'draft', releaseDate: '2026-09-22' }, false, NOW)).toBe(true);
  });

  it('is NOT in flight just past the grace window (8 days)', () => {
    expect(isReleaseInFlight({ status: 'draft', releaseDate: '2026-09-21' }, false, NOW)).toBe(false);
  });

  it('is never in flight once archived, even with a future date', () => {
    expect(isReleaseInFlight({ status: 'archived', releaseDate: '2026-10-05' }, true, NOW)).toBe(false);
  });

  it('an undated release is in flight only while it has open tasks', () => {
    expect(isReleaseInFlight({ status: 'draft', releaseDate: null }, true, NOW)).toBe(true);
    expect(isReleaseInFlight({ status: 'draft', releaseDate: null }, false, NOW)).toBe(false);
  });
});

describe('resolveManagerState', () => {
  it('is new with no roster artist', () => {
    expect(
      resolveManagerState({
        hasRosterArtist: false,
        releaseCount: 3,
        inFlightCount: 1,
        sectionsAllEmpty: false,
      })
    ).toBe('new');
  });

  it('is new with a roster artist but zero releases', () => {
    expect(
      resolveManagerState({
        hasRosterArtist: true,
        releaseCount: 0,
        inFlightCount: 0,
        sectionsAllEmpty: true,
      })
    ).toBe('new');
  });

  it('is mid_release when something is in flight and sections have content', () => {
    expect(
      resolveManagerState({
        hasRosterArtist: true,
        releaseCount: 2,
        inFlightCount: 1,
        sectionsAllEmpty: false,
      })
    ).toBe('mid_release');
  });

  it('is all_clear when something is in flight but every section is empty', () => {
    expect(
      resolveManagerState({
        hasRosterArtist: true,
        releaseCount: 1,
        inFlightCount: 1,
        sectionsAllEmpty: true,
      })
    ).toBe('all_clear');
  });

  it('is between when nothing is in flight but releases exist', () => {
    expect(
      resolveManagerState({
        hasRosterArtist: true,
        releaseCount: 2,
        inFlightCount: 0,
        sectionsAllEmpty: true,
      })
    ).toBe('between');
  });
});

describe('resolveArtistState', () => {
  it('is new with no releases', () => {
    expect(resolveArtistState({ releaseCount: 0, inFlightCount: 0 })).toBe('new');
  });

  it('is mid_release when something is in flight', () => {
    expect(resolveArtistState({ releaseCount: 2, inFlightCount: 1 })).toBe('mid_release');
  });

  it('is between when releases exist but none are in flight', () => {
    expect(resolveArtistState({ releaseCount: 1, inFlightCount: 0 })).toBe('between');
  });
});

describe('resolveLabelState', () => {
  it('is new with no roster artist', () => {
    expect(
      resolveLabelState({ hasRosterArtist: false, hasLateTask: true, hasArtistWithNoUpcomingRelease: true })
    ).toBe('new');
  });

  it('is busy when anything is late, even alongside a roster gap', () => {
    expect(
      resolveLabelState({ hasRosterArtist: true, hasLateTask: true, hasArtistWithNoUpcomingRelease: true })
    ).toBe('busy');
  });

  it('is gap when nothing is late but a roster artist has nothing upcoming', () => {
    expect(
      resolveLabelState({ hasRosterArtist: true, hasLateTask: false, hasArtistWithNoUpcomingRelease: true })
    ).toBe('gap');
  });

  it('falls back to busy (with empty sections) when nothing is late and there is no roster gap', () => {
    expect(
      resolveLabelState({ hasRosterArtist: true, hasLateTask: false, hasArtistWithNoUpcomingRelease: false })
    ).toBe('busy');
  });
});

describe('isTaskLate', () => {
  it('is late for a todo task past its due date', () => {
    expect(isTaskLate(buildTask({ status: 'todo', dueDate: '2026-09-20' }), NOW)).toBe(true);
  });

  it('is NOT late for a compressed-runway task past its due date (that is catch_up, not overdue)', () => {
    expect(
      isTaskLate(buildTask({ status: 'todo', dueDate: '2026-09-20', compressedRunway: true }), NOW)
    ).toBe(false);
  });

  it('is NOT late for a blocked task past its due date — status wins over date, matching the catalog', () => {
    expect(isTaskLate(buildTask({ status: 'blocked', dueDate: '2026-09-20' }), NOW)).toBe(false);
  });

  it('is NOT late for a done task, even with a past due date', () => {
    expect(isTaskLate(buildTask({ status: 'done', dueDate: '2026-09-20' }), NOW)).toBe(false);
  });

  it('is NOT late for a task due today or in the future', () => {
    expect(isTaskLate(buildTask({ status: 'todo', dueDate: '2026-09-29' }), NOW)).toBe(false);
    expect(isTaskLate(buildTask({ status: 'todo', dueDate: '2026-10-05' }), NOW)).toBe(false);
  });
});

describe('toHomeStateKey', () => {
  it('combines role and state into one key', () => {
    expect(toHomeStateKey('manager', 'mid_release')).toBe('manager_mid_release');
    expect(toHomeStateKey('artist', 'new')).toBe('artist_new');
    expect(toHomeStateKey('label', 'gap')).toBe('label_gap');
  });
});
