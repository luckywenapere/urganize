import { describe, expect, it } from 'vitest';
import type { ContentPost } from '@/types/content-calendar';
import {
  bucketPostsByDay,
  buildMonthGrid,
  canQuickTogglePosted,
  getClientTodayIso,
  getWeekLabel,
  isPostOverdue,
  isValidMonthParam,
  resolveMonth,
} from './content-calendar';

// Pure-logic coverage for the content calendar's date math (URG-157 Phase A):
// month param validation and defaulting, the Monday-start month grid, the
// release-relative week labels, day bucketing, and the overdue / quick-toggle
// boundaries. Routes and UI stay on manual QA per the repo's v1 testing
// posture.

function makePost(overrides: Partial<ContentPost> = {}): ContentPost {
  return {
    id: 'post-1',
    calendarId: 'cal-1',
    releaseId: 'rel-1',
    sharedGroupId: null,
    scheduledDate: '2026-07-10',
    title: 'Teaser clip',
    caption: '',
    format: 'video',
    status: 'draft',
    pillar: null,
    postedUrl: null,
    assetId: null,
    sharedCount: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isValidMonthParam', () => {
  it.each(['2026-01', '2026-07', '2026-12'])('accepts strict YYYY-MM %s', (value) => {
    expect(isValidMonthParam(value)).toBe(true);
  });

  it.each(['2026-7', '202607', '2026-07-01', '2026/07', 'garbage', ''])(
    'rejects malformed value %s',
    (value) => {
      expect(isValidMonthParam(value)).toBe(false);
    }
  );

  it('rejects out-of-range months', () => {
    expect(isValidMonthParam('2026-13')).toBe(false);
    expect(isValidMonthParam('2026-00')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidMonthParam(null)).toBe(false);
  });
});

describe('resolveMonth', () => {
  it('a valid month param wins over everything', () => {
    expect(resolveMonth('2026-03', '2026-08-14', '2026-07-20')).toBe('2026-03');
  });

  it('an invalid month param falls through to the release month', () => {
    expect(resolveMonth('2026-13', '2026-08-14', '2026-07-20')).toBe('2026-08');
    expect(resolveMonth(null, '2026-08-14', '2026-07-20')).toBe('2026-08');
  });

  it("no release date falls through to today's month", () => {
    expect(resolveMonth(null, null, '2026-07-20')).toBe('2026-07');
  });

  it("a malformed release date falls through to today's month", () => {
    expect(resolveMonth(null, 'not-a-date', '2026-07-20')).toBe('2026-07');
  });
});

describe('getClientTodayIso', () => {
  it('returns the local YYYY-MM-DD, never the UTC date', () => {
    const localIso = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
      ).padStart(2, '0')}`;

    const before = localIso(new Date());
    const actual = getClientTodayIso();
    const after = localIso(new Date());

    // Two candidates so a run that straddles local midnight can't flake.
    expect([before, after]).toContain(actual);
    expect(actual).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('buildMonthGrid', () => {
  it('covers non-leap February starting on a Sunday (Feb 2026)', () => {
    const grid = buildMonthGrid('2026-02');

    expect(grid.weeks).toHaveLength(5);
    for (const week of grid.weeks) {
      expect(week.days).toHaveLength(7);
      expect(week.days[0].date).toBe(week.weekStart);
    }

    // Feb 1 2026 is a Sunday, so the first Monday-start week reaches back
    // into January.
    const firstWeek = grid.weeks[0];
    expect(firstWeek.weekStart).toBe('2026-01-26');
    expect(firstWeek.days[0]).toEqual({ date: '2026-01-26', inMonth: false });
    expect(firstWeek.days[6]).toEqual({ date: '2026-02-01', inMonth: true });

    // Non-leap: the month ends on Feb 28 and the grid pads into March.
    const lastWeek = grid.weeks[4];
    expect(lastWeek.weekStart).toBe('2026-02-23');
    expect(lastWeek.days[5]).toEqual({ date: '2026-02-28', inMonth: true });
    expect(lastWeek.days[6]).toEqual({ date: '2026-03-01', inMonth: false });
  });

  it('covers a month starting on a Monday with no leading pad (Jun 2026)', () => {
    const grid = buildMonthGrid('2026-06');

    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks[0].weekStart).toBe('2026-06-01');
    expect(grid.weeks[0].days[0]).toEqual({ date: '2026-06-01', inMonth: true });

    const lastWeek = grid.weeks[4];
    expect(lastWeek.weekStart).toBe('2026-06-29');
    expect(lastWeek.days[1]).toEqual({ date: '2026-06-30', inMonth: true });
    expect(lastWeek.days[6]).toEqual({ date: '2026-07-05', inMonth: false });
  });
});

describe('getWeekLabel', () => {
  // 2026-08-14 is a Friday; its Monday-start week begins 2026-08-10.
  const releaseDate = '2026-08-14';

  it('labels the week containing the release date RELEASE WEEK', () => {
    expect(getWeekLabel('2026-08-10', releaseDate)).toBe('RELEASE WEEK');
  });

  it('labels adjacent weeks by whole-week distance', () => {
    expect(getWeekLabel('2026-08-03', releaseDate)).toBe('WK-1');
    expect(getWeekLabel('2026-08-17', releaseDate)).toBe('WK+1');
  });

  it('keeps labeling out to exactly +/-8 weeks', () => {
    expect(getWeekLabel('2026-06-15', releaseDate)).toBe('WK-8');
    expect(getWeekLabel('2026-10-05', releaseDate)).toBe('WK+8');
  });

  it('suppresses labels beyond +/-8 weeks', () => {
    expect(getWeekLabel('2026-06-08', releaseDate)).toBeNull();
    expect(getWeekLabel('2026-10-12', releaseDate)).toBeNull();
  });

  it('returns null when there is no release date to anchor on', () => {
    expect(getWeekLabel('2026-08-10', null)).toBeNull();
    expect(getWeekLabel('2026-08-10', 'not-a-date')).toBeNull();
  });
});

describe('bucketPostsByDay', () => {
  const month = '2026-07';
  const today = '2026-07-20';

  it('excludes posts scheduled outside the month', () => {
    const inside = makePost({ id: 'in', scheduledDate: '2026-07-10' });
    const before = makePost({ id: 'before', scheduledDate: '2026-06-30' });
    const after = makePost({ id: 'after', scheduledDate: '2026-08-01' });

    const byDay = bucketPostsByDay([inside, before, after], month, today);

    expect(byDay.size).toBe(1);
    expect(byDay.get('2026-07-10')).toEqual([inside]);
  });

  it('sorts overdue-unposted posts first within a day, then by title', () => {
    const posted = makePost({ id: 'posted', scheduledDate: '2026-07-10', status: 'posted', title: 'Aaa recap' });
    const draft = makePost({ id: 'draft', scheduledDate: '2026-07-10', status: 'draft', title: 'Zzz teaser' });

    const byDay = bucketPostsByDay([posted, draft], month, today);

    expect(byDay.get('2026-07-10')?.map((post) => post.id)).toEqual(['draft', 'posted']);
  });

  it('sorts by title when nothing in the day is overdue', () => {
    const beta = makePost({ id: 'beta', scheduledDate: '2026-07-25', title: 'Beta drop' });
    const alpha = makePost({ id: 'alpha', scheduledDate: '2026-07-25', title: 'Alpha drop' });

    const byDay = bucketPostsByDay([beta, alpha], month, today);

    expect(byDay.get('2026-07-25')?.map((post) => post.id)).toEqual(['alpha', 'beta']);
  });

  it('returns an empty map for empty input', () => {
    expect(bucketPostsByDay([], month, today).size).toBe(0);
  });
});

describe('isPostOverdue', () => {
  const today = '2026-07-20';

  it('is false on the scheduled day itself', () => {
    expect(isPostOverdue(makePost({ scheduledDate: '2026-07-20' }), today)).toBe(false);
  });

  it('is true for past unposted posts', () => {
    expect(isPostOverdue(makePost({ scheduledDate: '2026-07-19', status: 'draft' }), today)).toBe(true);
    expect(isPostOverdue(makePost({ scheduledDate: '2026-07-19', status: 'ready' }), today)).toBe(true);
  });

  it('is false once the post is marked posted', () => {
    expect(isPostOverdue(makePost({ scheduledDate: '2026-07-19', status: 'posted' }), today)).toBe(false);
  });

  it('is false for future posts', () => {
    expect(isPostOverdue(makePost({ scheduledDate: '2026-07-21' }), today)).toBe(false);
  });
});

describe('canQuickTogglePosted', () => {
  const today = '2026-07-20';

  it('allows posts dated today', () => {
    expect(canQuickTogglePosted(makePost({ scheduledDate: '2026-07-20' }), today)).toBe(true);
  });

  it('allows past posts', () => {
    expect(canQuickTogglePosted(makePost({ scheduledDate: '2026-07-01' }), today)).toBe(true);
  });

  it('blocks future posts', () => {
    expect(canQuickTogglePosted(makePost({ scheduledDate: '2026-07-21' }), today)).toBe(false);
  });
});
