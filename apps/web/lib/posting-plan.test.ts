import { describe, expect, it } from 'vitest';
import {
  buildPostNudgeText,
  bucketPosts,
  dayBadge,
  nextDayWords,
  expandWeeklyPlan,
  nextPlannedPost,
  normalizePostInput,
  weekStart,
  weekSummary,
  type ArtistPost,
} from './posting-plan';

function post(over: Partial<ArtistPost> & { id: string; postDay: string }): ArtistPost {
  return {
    artistId: 'a1',
    releaseId: null,
    what: 'Studio clip',
    platform: null,
    ownerUserId: null,
    status: 'planned',
    doneAt: null,
    ...over,
  };
}

// 2026-10-27 is a Tuesday.
const TODAY = '2026-10-27';

describe('weekStart', () => {
  it('starts the week on Monday', () => {
    expect(weekStart('2026-10-27')).toBe('2026-10-26');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
  });
});

describe('bucketPosts', () => {
  it('splits this week, next week and past, in day order', () => {
    const posts = [
      post({ id: 'later', postDay: '2026-11-10' }),
      post({ id: 'thu', postDay: '2026-10-29' }),
      post({ id: 'mon', postDay: '2026-10-26' }),
      post({ id: 'next', postDay: '2026-11-03' }),
      post({ id: 'old', postDay: '2026-10-20' }),
    ];
    const b = bucketPosts(posts, TODAY);
    expect(b.thisWeek.map((p) => p.id)).toEqual(['mon', 'thu']);
    expect(b.nextWeek.map((p) => p.id)).toEqual(['next']);
    expect(b.later.map((p) => p.id)).toEqual(['later']);
    expect(b.past.map((p) => p.id)).toEqual(['old']);
  });
});

describe('weekSummary', () => {
  it('counts this week only, done out of all', () => {
    const posts = [
      post({ id: '1', postDay: '2026-10-26', status: 'done' }),
      post({ id: '2', postDay: '2026-10-27' }),
      post({ id: '3', postDay: '2026-10-29', status: 'skipped' }),
      post({ id: '4', postDay: '2026-11-03', status: 'done' }),
    ];
    expect(weekSummary(posts, TODAY)).toEqual({ done: 1, total: 3 });
  });
});

describe('nextPlannedPost', () => {
  it('is the first planned post after today', () => {
    const posts = [
      post({ id: 'today', postDay: TODAY }),
      post({ id: 'sat', postDay: '2026-10-31' }),
      post({ id: 'thu-done', postDay: '2026-10-29', status: 'done' }),
      post({ id: 'thu', postDay: '2026-10-29' }),
    ];
    expect(nextPlannedPost(posts, TODAY)?.id).toBe('thu');
  });

  it('is null when nothing is planned ahead', () => {
    expect(nextPlannedPost([post({ id: 'x', postDay: '2026-10-20' })], TODAY)).toBeNull();
  });
});

describe('normalizePostInput', () => {
  it('trims and keeps the four fields', () => {
    expect(
      normalizePostInput({ what: '  Lyric snippet ', postDay: '2026-10-29', platform: 'tiktok', ownerUserId: 'u1' })
    ).toEqual({ ok: true, value: { what: 'Lyric snippet', postDay: '2026-10-29', platform: 'tiktok', ownerUserId: 'u1', releaseId: null } });
  });

  it('needs what and a real day', () => {
    expect(normalizePostInput({ what: ' ', postDay: '2026-10-29' })).toMatchObject({ ok: false });
    expect(normalizePostInput({ what: 'Clip', postDay: '2026-02-30' })).toMatchObject({ ok: false });
    expect(normalizePostInput({ what: 'Clip', postDay: 'tomorrow' })).toMatchObject({ ok: false });
  });

  it('drops an unknown platform to none rather than refusing', () => {
    expect(normalizePostInput({ what: 'Clip', postDay: '2026-10-29', platform: 'myspace' })).toMatchObject({
      ok: true,
      value: { platform: null },
    });
  });

  it('refuses a what longer than 200 characters', () => {
    expect(normalizePostInput({ what: 'x'.repeat(201), postDay: '2026-10-29' })).toMatchObject({ ok: false });
  });
});

describe('expandWeeklyPlan', () => {
  it('puts each weekday on its next date from the start day', () => {
    const out = expandWeeklyPlan({
      startDay: TODAY,
      weeks: 1,
      items: [
        { weekday: 'tue', what: 'Studio clip' },
        { weekday: 'thu', what: 'Lyric snippet', platform: 'tiktok' },
        { weekday: 'mon', what: 'Fan Q&A' },
      ],
    });
    expect(out.map((p) => [p.postDay, p.what])).toEqual([
      ['2026-10-27', 'Studio clip'],
      ['2026-10-29', 'Lyric snippet'],
      ['2026-11-02', 'Fan Q&A'],
    ]);
  });

  it('repeats every week, capped at 8 weeks', () => {
    const items = [{ weekday: 'sat' as const, what: 'Clip' }];
    expect(expandWeeklyPlan({ startDay: TODAY, weeks: 3, items }).map((p) => p.postDay)).toEqual([
      '2026-10-31',
      '2026-11-07',
      '2026-11-14',
    ]);
    expect(expandWeeklyPlan({ startDay: TODAY, weeks: 50, items })).toHaveLength(8);
  });
});

describe('buildPostNudgeText', () => {
  it('names the post, the artist and the platform', () => {
    expect(buildPostNudgeText('Ada', 'the studio clip', 'Tems', 'instagram')).toBe(
      'Morning Ada. Post "the studio clip" for Tems on Instagram today? Reply Done or Skip.'
    );
    expect(buildPostNudgeText('Ada', 'Clip', 'Tems', null)).toBe(
      'Morning Ada. Post "Clip" for Tems today? Reply Done or Skip.'
    );
  });
});

describe('dayBadge', () => {
  it('says Today for today and the weekday otherwise', () => {
    expect(dayBadge(TODAY, TODAY)).toEqual({ label: 'Today', date: '27' });
    expect(dayBadge('2026-10-29', TODAY)).toEqual({ label: 'Thu', date: '29' });
  });
});

describe('nextDayWords', () => {
  it('says tomorrow, a weekday this week, or a short date further out', () => {
    expect(nextDayWords('2026-10-28', TODAY)).toBe('tomorrow');
    expect(nextDayWords('2026-10-29', TODAY)).toBe('Thursday');
    expect(nextDayWords('2026-11-05', TODAY)).toBe('Thu 5 Nov');
  });
});
