import { describe, expect, it } from 'vitest';
import {
  classifyReleaseReality,
  isPlaceholderTitle,
  isTouchedTask,
  TEST_AFTER_DAYS,
  type ReleaseRealityInput,
} from './release-reality';

const NOW = new Date('2026-11-28T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function release(over: Partial<ReleaseRealityInput> = {}): ReleaseRealityInput {
  return {
    isTest: false,
    title: 'Go Up',
    releaseDate: '2026-12-25',
    createdAt: daysAgo(30),
    touchedCount: 3,
    ...over,
  };
}

describe('isPlaceholderTitle', () => {
  it('catches the names people give a rollout they are only trying', () => {
    for (const title of ['Untitled', 'Untitled rollout', 'Untitled release', 'untitled', 'Test', 'test 2', 'Testing', 'Unknown yet', 'asdf', 'New rollout', '', '   ', null]) {
      expect(isPlaceholderTitle(title), String(title)).toBe(true);
    }
  });

  it('leaves real names alone, including ones that start with the same letters', () => {
    for (const title of ['Go Up', 'Testament', 'Unknowns', 'Woyo!', 'b4ugly', 'STTW VOL2', 'Love Song']) {
      expect(isPlaceholderTitle(title), title).toBe(false);
    }
  });
});

describe('classifyReleaseReality', () => {
  it('calls a named, dated rollout somebody has worked on real', () => {
    expect(classifyReleaseReality(release(), NOW)).toBe('real');
  });

  it('calls a flagged test release a test, however much work is in it', () => {
    expect(classifyReleaseReality(release({ isTest: true }), NOW)).toBe('test');
  });

  it('calls an old, untouched rollout with no name a test', () => {
    expect(classifyReleaseReality(release({ title: 'Untitled', touchedCount: 0 }), NOW)).toBe('test');
  });

  it('calls an old, untouched rollout with no date a test', () => {
    expect(classifyReleaseReality(release({ releaseDate: null, touchedCount: 0 }), NOW)).toBe('test');
  });

  it('gives a new rollout a week before calling it a test', () => {
    const fresh = release({ title: 'Untitled', releaseDate: null, touchedCount: 0, createdAt: daysAgo(TEST_AFTER_DAYS - 1) });
    expect(classifyReleaseReality(fresh, NOW)).toBe('too_early');
    expect(classifyReleaseReality({ ...fresh, createdAt: daysAgo(TEST_AFTER_DAYS) }, NOW)).toBe('test');
  });

  it('never calls a rollout somebody is working on a test, even with no name or date', () => {
    expect(classifyReleaseReality(release({ title: 'Untitled', releaseDate: null, touchedCount: 1 }), NOW)).toBe('too_early');
  });

  it('does not call a named, dated rollout real until somebody works on it', () => {
    expect(classifyReleaseReality(release({ touchedCount: 0 }), NOW)).toBe('too_early');
  });

  it('treats an unreadable creation date as too new to judge', () => {
    expect(classifyReleaseReality(release({ title: 'Untitled', touchedCount: 0, createdAt: null }), NOW)).toBe('too_early');
  });
});

describe('isTouchedTask', () => {
  const made = '2026-11-01T10:00:00.000Z';

  it('counts an activity moved off "to do"', () => {
    expect(isTouchedTask({ status: 'done', createdAt: made, updatedAt: made })).toBe(true);
    expect(isTouchedTask({ status: 'in_progress', createdAt: made, updatedAt: made })).toBe(true);
  });

  it('counts an activity edited five or more minutes after it was made', () => {
    expect(isTouchedTask({ status: 'todo', createdAt: made, updatedAt: '2026-11-01T10:05:00.000Z' })).toBe(true);
  });

  it('does not count an activity only written when the plan was made', () => {
    expect(isTouchedTask({ status: 'todo', createdAt: made, updatedAt: '2026-11-01T10:04:59.000Z' })).toBe(false);
    expect(isTouchedTask({ status: 'todo', createdAt: null, updatedAt: null })).toBe(false);
  });
});
