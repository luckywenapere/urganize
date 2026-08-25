// Tests for the per-release context block.
//
// Only the pure formatter is covered: the loaders take a Supabase client and
// this repo deliberately keeps that on manual testing (vitest collects
// lib/**/*.test.ts and mocks no database). What IS worth pinning here is the
// prose a model reads — a heading over an empty list teaches a model to invent
// something to put under it, and the runway wording is the difference between
// a date and a sense of urgency.

import { describe, expect, it } from 'vitest';
import { formatReleaseContext } from './portable-context';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';

const TODAY = '2026-08-25';

function release(overrides: Partial<Release> = {}): Release {
  return {
    id: 'rel-1',
    title: 'Midnight EP',
    artistName: 'Tems',
    artistId: 'artist-1',
    releaseType: 'ep',
    releaseDate: '2026-09-04',
    status: 'draft',
    description: null,
    ...overrides,
  } as Release;
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.abs(hash(JSON.stringify(overrides)))}`,
    releaseId: 'rel-1',
    title: 'Brief the designer',
    status: 'todo',
    dueDate: null,
    taskType: 'task',
    ...overrides,
  } as Task;
}

/** Deterministic — Math.random would make ids differ between runs. */
function hash(value: string): number {
  let out = 0;
  for (let i = 0; i < value.length; i += 1) out = (out * 31 + value.charCodeAt(i)) | 0;
  return out;
}

describe('formatReleaseContext', () => {
  it('leads with the facts a model needs to orient', () => {
    const text = formatReleaseContext({ release: release(), tasks: [], today: TODAY });
    expect(text).toContain('Release: Midnight EP');
    expect(text).toContain('Artist: Tems');
    expect(text).toContain('Type: ep');
    expect(text).toContain('Status: draft');
    expect(text).toContain('Activities: 0 of 0 done');
    expect(text).toContain(`Today is ${TODAY}.`);
  });

  it('states the runway in words as well as the date', () => {
    // The date alone says nothing about urgency, and every question a manager
    // asks about a release is really about how much runway is left.
    expect(
      formatReleaseContext({ release: release({ releaseDate: '2026-09-04' }), tasks: [], today: TODAY })
    ).toContain('10 days away');
    expect(
      formatReleaseContext({ release: release({ releaseDate: '2026-08-26' }), tasks: [], today: TODAY })
    ).toContain('1 day away');
    expect(
      formatReleaseContext({ release: release({ releaseDate: TODAY }), tasks: [], today: TODAY })
    ).toContain('out today');
    expect(
      formatReleaseContext({ release: release({ releaseDate: '2026-08-24' }), tasks: [], today: TODAY })
    ).toContain('out 1 day ago');
    expect(
      formatReleaseContext({ release: release({ releaseDate: '2026-08-18' }), tasks: [], today: TODAY })
    ).toContain('out 7 days ago');
  });

  it('says so plainly when there is no date', () => {
    const text = formatReleaseContext({
      release: release({ releaseDate: null }),
      tasks: [],
      today: TODAY,
    });
    expect(text).toContain('Date: not set (no date set yet)');
  });

  it('survives an unparseable date instead of printing NaN', () => {
    const text = formatReleaseContext({
      release: release({ releaseDate: 'sometime in the autumn' }),
      tasks: [],
      today: TODAY,
    });
    expect(text).toContain('no date set yet');
    expect(text).not.toMatch(/NaN/);
  });

  it('omits every section that has nothing in it', () => {
    const text = formatReleaseContext({ release: release(), tasks: [], today: TODAY });
    for (const heading of [
      'Overdue',
      'Blocked',
      'In progress',
      'Still to do',
      'Dated moments',
      'What this release is',
    ]) {
      expect(text, heading).not.toContain(heading);
    }
  });

  it('sorts open work into the bucket that describes it, once each', () => {
    const tasks = [
      task({ title: 'Late thing', status: 'todo', dueDate: '2026-08-01' }),
      task({ title: 'Stuck thing', status: 'blocked' }),
      task({ title: 'Live thing', status: 'in_progress' }),
      task({ title: 'Next thing', status: 'todo' }),
      task({ title: 'Finished thing', status: 'done' }),
      task({ title: 'Dropped thing', status: 'cancelled' }),
    ];
    const text = formatReleaseContext({ release: release(), tasks, today: TODAY });

    expect(text).toContain('Overdue (1)');
    expect(text).toContain('Blocked (1)');
    expect(text).toContain('In progress (1)');
    expect(text).toContain('Still to do (1)');
    expect(text).toContain('Activities: 1 of 6 done');
    // Cancelled work is neither done nor still to do, and must not be
    // presented as outstanding.
    expect(text).not.toContain('Dropped thing');
  });

  it('counts an overdue task once, not also as still to do', () => {
    const tasks = [task({ title: 'Late thing', status: 'todo', dueDate: '2026-08-01' })];
    const text = formatReleaseContext({ release: release(), tasks, today: TODAY });
    expect(text).toContain('Overdue (1)');
    expect(text).not.toContain('Still to do');
  });

  it('treats a task due today as not yet overdue', () => {
    const tasks = [task({ title: 'Today thing', status: 'todo', dueDate: TODAY })];
    const text = formatReleaseContext({ release: release(), tasks, today: TODAY });
    expect(text).not.toContain('Overdue');
    expect(text).toContain('Still to do (1)');
  });

  it('caps a long list and says how many it withheld', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task({ title: `Thing ${i}`, status: 'todo' })
    );
    const text = formatReleaseContext({ release: release(), tasks, today: TODAY });
    expect(text).toContain('Still to do (12)');
    expect(text).toContain('...and 4 more');
  });

  it('surfaces dated moments through the shared milestone predicate', () => {
    const tasks = [
      task({ title: 'Release day', taskType: 'event_milestone', dueDate: '2026-09-04' }),
      task({ title: 'Ordinary work' }),
    ];
    const text = formatReleaseContext({ release: release(), tasks, today: TODAY });
    expect(text).toContain('Dated moments:');
    expect(text).toContain('- Release day (2026-09-04)');
  });

  it('includes the description only when there is one', () => {
    expect(
      formatReleaseContext({
        release: release({ description: '  Second EP, Lagos-recorded.  ' }),
        tasks: [],
        today: TODAY,
      })
    ).toContain('What this release is:\nSecond EP, Lagos-recorded.');
    expect(
      formatReleaseContext({ release: release({ description: '   ' }), tasks: [], today: TODAY })
    ).not.toContain('What this release is');
  });

  it('falls back rather than printing an empty artist or type', () => {
    const text = formatReleaseContext({
      release: release({ artistName: '', releaseType: '' as Release['releaseType'] }),
      tasks: [],
      today: TODAY,
    });
    expect(text).toContain('Artist: not set');
    expect(text).toContain('Type: single');
  });
});
