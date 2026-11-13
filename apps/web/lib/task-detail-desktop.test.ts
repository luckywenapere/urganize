import { describe, expect, it } from 'vitest';
import {
  buildBlockedBanner,
  buildLateBanner,
  buildProvenanceLine,
  findDependents,
  firstUnmetDependency,
  formatDayInWords,
  moveToThisWeekDate,
  recordNoun,
} from './task-detail-desktop';

// Local-time dates, the way the browser hands them to the helpers.
const on = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h);

describe('moveToThisWeekDate', () => {
  it('moves to Friday of this week on a weekday', () => {
    expect(moveToThisWeekDate(on(2026, 11, 9))).toBe('2026-11-13'); // Mon
    expect(moveToThisWeekDate(on(2026, 11, 11))).toBe('2026-11-13'); // Wed
    expect(moveToThisWeekDate(on(2026, 11, 12))).toBe('2026-11-13'); // Thu
  });

  it('keeps Friday on a Friday', () => {
    expect(moveToThisWeekDate(on(2026, 11, 13))).toBe('2026-11-13');
  });

  it('moves to the next workday at the weekend', () => {
    expect(moveToThisWeekDate(on(2026, 11, 14))).toBe('2026-11-16'); // Sat
    expect(moveToThisWeekDate(on(2026, 11, 15))).toBe('2026-11-16'); // Sun
  });

  it('crosses a month and a year', () => {
    expect(moveToThisWeekDate(on(2026, 12, 29))).toBe('2027-01-01'); // Tue
    expect(moveToThisWeekDate(on(2027, 1, 30))).toBe('2027-02-01'); // Sat
  });
});

describe('formatDayInWords', () => {
  const now = on(2026, 11, 13);
  it('writes a plan date in words with no year this year', () => {
    expect(formatDayInWords('2026-09-16T00:00:00.000Z', now)).toBe('Wed 16 Sep');
    expect(formatDayInWords('2026-09-16', now)).toBe('Wed 16 Sep');
  });
  it('adds the year when it is another year', () => {
    expect(formatDayInWords('2027-01-06T00:00:00Z', now)).toBe('Wed 6 Jan 2027');
  });
  it('returns empty for nothing or junk', () => {
    expect(formatDayInWords(null, now)).toBe('');
    expect(formatDayInWords('soon', now)).toBe('');
  });
});

describe('recordNoun', () => {
  it('names the record', () => {
    expect(recordNoun('single')).toBe('single');
    expect(recordNoun('ep')).toBe('EP');
    expect(recordNoun('album')).toBe('album');
    expect(recordNoun(null)).toBe('record');
  });
});

describe('buildLateBanner', () => {
  const now = on(2026, 11, 13);
  const base = { status: 'todo', completedAt: null, compressedRunway: false };

  it('says how late and when the record is out', () => {
    expect(
      buildLateBanner({
        ...base,
        dueDate: '2026-09-16T00:00:00Z',
        releaseDate: '2027-01-06',
        releaseType: 'album',
        now,
      })
    ).toEqual({ title: '58 days late', body: 'It was due Wed 16 Sep. The album is out Wed 6 Jan 2027.' });
  });

  it('says one day, singular', () => {
    expect(buildLateBanner({ ...base, dueDate: '2026-11-12', releaseDate: null, releaseType: null, now })).toEqual({
      title: '1 day late',
      body: 'It was due Thu 12 Nov.',
    });
  });

  it('says came out when release day has passed', () => {
    expect(
      buildLateBanner({ ...base, dueDate: '2026-11-01', releaseDate: '2026-11-06', releaseType: 'single', now })?.body
    ).toBe('It was due Sun 1 Nov. The single came out Fri 6 Nov.');
  });

  it('shows nothing when it is not late', () => {
    expect(buildLateBanner({ ...base, dueDate: '2026-11-13', releaseDate: null, releaseType: null, now })).toBeNull();
    expect(buildLateBanner({ ...base, dueDate: null, releaseDate: null, releaseType: null, now })).toBeNull();
  });

  it('shows nothing for closed work or a catch-up activity', () => {
    const late = { dueDate: '2026-09-16', releaseDate: null, releaseType: null, now };
    expect(buildLateBanner({ ...base, ...late, status: 'done' })).toBeNull();
    expect(buildLateBanner({ ...base, ...late, status: 'cancelled' })).toBeNull();
    expect(buildLateBanner({ ...base, ...late, compressedRunway: true })).toBeNull();
  });
});

describe('findDependents', () => {
  const tasks = [
    { id: 'a', dependencies: [], dueDate: null },
    { id: 'b', dependencies: ['a'], dueDate: '2026-10-07' },
    { id: 'c', dependencies: ['x', 'a'], dueDate: '2026-09-30' },
    { id: 'd', dependencies: ['x'], dueDate: '2026-09-01' },
    { id: 'e', dependencies: ['a'], dueDate: null },
  ];

  it('finds the tasks that wait on this one, soonest first, undated last', () => {
    expect(findDependents('a', tasks).map((task) => task.id)).toEqual(['c', 'b', 'e']);
  });

  it('is empty when nothing waits on it', () => {
    expect(findDependents('d', tasks)).toEqual([]);
  });

  it('never lists the task itself', () => {
    expect(findDependents('a', [{ id: 'a', dependencies: ['a'], dueDate: null }])).toEqual([]);
  });
});

describe('firstUnmetDependency', () => {
  const prereqs = [
    { id: 'p1', status: 'done' as const },
    { id: 'p2', status: 'cancelled' as const },
    { id: 'p3', status: 'in_progress' as const },
  ];
  it('returns the first one not done or cancelled, in declared order', () => {
    expect(firstUnmetDependency(['p1', 'p2', 'p3'], prereqs)?.id).toBe('p3');
  });
  it('returns null when all are met or unknown', () => {
    expect(firstUnmetDependency(['p1', 'p2', 'missing'], prereqs)).toBeNull();
  });
});

describe('buildBlockedBanner', () => {
  const now = on(2026, 11, 13);
  it('names who holds it and when it was due', () => {
    expect(
      buildBlockedBanner(
        { title: 'Pitch the lead single to editors', dueDate: '2026-11-06', assigneeName: 'Maya Okafor', assigneeUserId: 'u2' },
        'u1',
        now
      )
    ).toEqual({ title: 'Waiting on Maya', body: '"Pitch the lead single to editors" is not done yet. It was due Fri 6 Nov.' });
  });
  it('says due rather than was due for a future date', () => {
    expect(
      buildBlockedBanner({ title: 'Mix', dueDate: '2026-11-20', assigneeName: 'Maya', assigneeUserId: 'u2' }, 'u1', now).body
    ).toBe('"Mix" is not done yet. It is due Fri 20 Nov.');
  });
  it('says you when it is yours, and copes with no one and no date', () => {
    expect(buildBlockedBanner({ title: 'Mix', dueDate: null, assigneeName: 'Oyin', assigneeUserId: 'u1' }, 'u1', now)).toEqual({
      title: 'Waiting on you',
      body: '"Mix" is not done yet.',
    });
    expect(buildBlockedBanner({ title: 'Mix', dueDate: null, assigneeName: null, assigneeUserId: null }, 'u1', now).title).toBe(
      'Waiting on an earlier activity'
    );
  });
});

describe('buildProvenanceLine', () => {
  const now = on(2026, 11, 13);
  it('says which plan and who changed it last', () => {
    expect(
      buildProvenanceLine({
        fromPlan: true,
        releaseType: 'album',
        lastChange: { actorName: 'Oyin Wenapere', createdAt: '2026-11-12T09:00:00Z' },
        now,
      })
    ).toBe('From the album plan. Last changed by Oyin on 12 Nov.');
  });
  it('drops what it does not know', () => {
    expect(buildProvenanceLine({ fromPlan: true, releaseType: null, lastChange: null, now })).toBe('From the plan.');
    expect(
      buildProvenanceLine({ fromPlan: false, releaseType: 'single', lastChange: { actorName: 'Maya', createdAt: '2026-10-01T09:00:00Z' }, now })
    ).toBe('Last changed by Maya on 1 Oct.');
    expect(buildProvenanceLine({ fromPlan: false, releaseType: null, lastChange: null, now })).toBe('');
  });
});
