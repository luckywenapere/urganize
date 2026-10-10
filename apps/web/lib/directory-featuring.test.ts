import { describe, expect, it } from 'vitest';
import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';
import {
  FEATURED_MONTHS,
  RISING_MIN_ACTIVE_TEAMMATES,
  RISING_WINDOW_DAYS,
  SHELF_SIZE,
  buildShelves,
  featuredEndsOn,
  featuredHasRoom,
  isFeaturedOn,
  isoDay,
  isValidIsoDay,
  qualifiesForRising,
  rankRising,
  resolveViewerKind,
  risingMonthStart,
  shelfRoleOrder,
  wentLiveInWindow,
  type RisingCandidate,
  type ShelfPerson,
} from './directory-featuring';

function candidate(over: Partial<RisingCandidate> & { userId: string }): RisingCandidate {
  return {
    role: 'producer',
    claimed: true,
    listed: true,
    displayName: over.userId,
    liveReleases: 1,
    deliveredTotal: 1,
    activeTeammates: null,
    ...over,
  };
}

function person(userId: string, over: Partial<ShelfPerson> = {}): ShelfPerson {
  return {
    userId,
    displayName: userId,
    city: null,
    availability: 'open',
    roles: [],
    slug: null,
    isPublic: false,
    managerRecord: null,
    ...over,
  };
}

describe('resolveViewerKind', () => {
  it('reads a plain artist account as an artist', () => {
    expect(resolveViewerKind({ accountRole: 'artist', ownRoles: [] })).toBe('artist');
  });

  it('reads every other account as somebody building a team', () => {
    for (const accountRole of ['manager', 'artist-manager', 'team-member', 'artist-team', null, undefined]) {
      expect(resolveViewerKind({ accountRole, ownRoles: [] })).toBe('manager');
    }
  });

  it('lets a manager record in the directory beat an artist sign-up answer', () => {
    expect(resolveViewerKind({ accountRole: 'artist', ownRoles: ['manager'] })).toBe('manager');
  });

  it('does not turn other roles into a manager', () => {
    expect(resolveViewerKind({ accountRole: 'artist', ownRoles: ['producer'] })).toBe('artist');
  });
});

describe('shelfRoleOrder', () => {
  it('leads with managers for an artist, and puts them last for a manager', () => {
    expect(shelfRoleOrder('artist')[0]).toBe('manager');
    expect(shelfRoleOrder('manager').at(-1)).toBe('manager');
  });

  it('leads a manager with creatives, then adjacent professionals', () => {
    const order = shelfRoleOrder('manager');
    expect(order.indexOf('producer')).toBeLessThan(order.indexOf('pr'));
    expect(order.indexOf('graphic_designer')).toBeLessThan(order.indexOf('booking_agent'));
  });

  // A role added to the vocabulary and forgotten here would never get a shelf and
  // nothing would look wrong, so the order has to cover every role exactly once.
  it('names every role once, for both viewers', () => {
    for (const viewer of ['artist', 'manager'] as const) {
      const order = shelfRoleOrder(viewer);
      expect(order).toHaveLength(DIRECTORY_ROLES.length);
      expect(new Set(order).size).toBe(DIRECTORY_ROLES.length);
      for (const role of DIRECTORY_ROLES) expect(order).toContain(role);
    }
  });
});

describe('dates', () => {
  it('reads today as a UTC calendar day', () => {
    expect(isoDay(new Date('2026-10-10T23:59:59.000Z'))).toBe('2026-10-10');
    expect(isoDay(new Date('2026-10-11T00:00:00.000Z'))).toBe('2026-10-11');
  });

  it('accepts only real calendar days', () => {
    expect(isValidIsoDay('2026-10-10')).toBe(true);
    expect(isValidIsoDay('2026-02-30')).toBe(false);
    expect(isValidIsoDay('2026-13-01')).toBe(false);
    expect(isValidIsoDay('10/10/2026')).toBe(false);
    expect(isValidIsoDay('2026-10-10T00:00:00Z')).toBe(false);
    expect(isValidIsoDay(null)).toBe(false);
    expect(isValidIsoDay(20261010)).toBe(false);
  });
});

describe('featured picks run for a quarter', () => {
  it('is three months, which is what the spec says', () => {
    expect(FEATURED_MONTHS).toBe(3);
  });

  it('ends the day before the same date three months on', () => {
    expect(featuredEndsOn('2026-10-01')).toBe('2026-12-31');
    expect(featuredEndsOn('2026-10-10')).toBe('2027-01-09');
  });

  it('falls back to the end of a shorter month rather than skipping into the next', () => {
    // Nov 30 is the last day of a month, so Aug 31 + 3 months lands on it, minus a day.
    expect(featuredEndsOn('2026-08-31')).toBe('2026-11-29');
    // Jan 31 + 3 months is Apr 31, which does not exist, so Apr 30, minus a day.
    expect(featuredEndsOn('2026-01-31')).toBe('2026-04-29');
  });

  it('crosses a year end', () => {
    expect(featuredEndsOn('2026-11-15')).toBe('2027-02-14');
  });

  it('counts both ends as on the shelf, and nothing outside them', () => {
    const row = { startsOn: '2026-10-01', endsOn: '2026-12-31' };
    expect(isFeaturedOn(row, '2026-10-01')).toBe(true);
    expect(isFeaturedOn(row, '2026-12-31')).toBe(true);
    expect(isFeaturedOn(row, '2026-09-30')).toBe(false);
    expect(isFeaturedOn(row, '2027-01-01')).toBe(false);
  });
});

describe('featuredHasRoom', () => {
  const six = (role: DirectoryRole, startsOn: string, endsOn: string) =>
    Array.from({ length: SHELF_SIZE }, () => ({ role, startsOn, endsOn }));

  it('allows up to six per role and refuses the seventh', () => {
    const five = six('producer', '2026-10-01', '2026-12-31').slice(0, SHELF_SIZE - 1);
    expect(featuredHasRoom(five, 'producer', '2026-10-01', '2026-12-31')).toBe(true);
    expect(featuredHasRoom(six('producer', '2026-10-01', '2026-12-31'), 'producer', '2026-10-01', '2026-12-31')).toBe(false);
  });

  it('counts each role on its own', () => {
    const full = six('producer', '2026-10-01', '2026-12-31');
    expect(featuredHasRoom(full, 'pr', '2026-10-01', '2026-12-31')).toBe(true);
  });

  it('lets next quarter be scheduled while this quarter is full', () => {
    const thisQuarter = six('producer', '2026-10-01', '2026-12-31');
    expect(featuredHasRoom(thisQuarter, 'producer', '2027-01-01', '2027-03-31')).toBe(true);
  });

  it('counts a pick that overlaps by even one day', () => {
    const thisQuarter = six('producer', '2026-10-01', '2026-12-31');
    expect(featuredHasRoom(thisQuarter, 'producer', '2026-12-31', '2027-03-30')).toBe(false);
  });
});

describe('risingMonthStart', () => {
  it('is the first of the month, UTC', () => {
    expect(risingMonthStart(new Date('2026-10-31T23:59:00.000Z'))).toBe('2026-10-01');
    expect(risingMonthStart(new Date('2026-11-01T00:00:00.000Z'))).toBe('2026-11-01');
  });
});

describe('wentLiveInWindow', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');

  it('needs the date to have arrived', () => {
    expect(wentLiveInWindow('2026-10-11', now)).toBe(false);
    expect(wentLiveInWindow('2026-10-10', now)).toBe(true);
  });

  it('keeps ninety days and no more', () => {
    expect(wentLiveInWindow('2026-07-13', now)).toBe(true);
    expect(wentLiveInWindow('2026-07-12', now)).toBe(false);
    expect(wentLiveInWindow('2026-07-01', now)).toBe(false);
    expect(RISING_WINDOW_DAYS).toBe(90);
  });

  it('is false for nothing, nonsense and an empty string', () => {
    expect(wentLiveInWindow(null, now)).toBe(false);
    expect(wentLiveInWindow(undefined, now)).toBe(false);
    expect(wentLiveInWindow('', now)).toBe(false);
    expect(wentLiveInWindow('soon', now)).toBe(false);
  });

  it('reads a full timestamp by its calendar day', () => {
    expect(wentLiveInWindow('2026-10-01T18:30:00.000Z', now)).toBe(true);
  });
});

describe('qualifiesForRising', () => {
  it('takes a claimed, published person with a release live in the window', () => {
    expect(qualifiesForRising(candidate({ userId: 'a' }))).toBe(true);
  });

  it('refuses an unclaimed profile, and one that is not published', () => {
    expect(qualifiesForRising(candidate({ userId: 'a', claimed: false }))).toBe(false);
    expect(qualifiesForRising(candidate({ userId: 'a', listed: false }))).toBe(false);
  });

  it('refuses somebody with no release live in the window', () => {
    expect(qualifiesForRising(candidate({ userId: 'a', liveReleases: 0 }))).toBe(false);
  });

  it('asks a manager for two or more active teammates', () => {
    const manager = (activeTeammates: number | null) =>
      qualifiesForRising(candidate({ userId: 'm', role: 'manager', activeTeammates }));
    expect(manager(null)).toBe(false);
    expect(manager(0)).toBe(false);
    expect(manager(RISING_MIN_ACTIVE_TEAMMATES - 1)).toBe(false);
    expect(manager(RISING_MIN_ACTIVE_TEAMMATES)).toBe(true);
  });

  it('does not ask a creative for teammates', () => {
    expect(qualifiesForRising(candidate({ userId: 'a', role: 'producer', activeTeammates: 0 }))).toBe(true);
  });
});

describe('rankRising', () => {
  it('orders by live releases, then total delivered, then name', () => {
    const ranked = rankRising([
      candidate({ userId: 'c', displayName: 'Cee', liveReleases: 1, deliveredTotal: 9 }),
      candidate({ userId: 'a', displayName: 'Ada', liveReleases: 3, deliveredTotal: 1 }),
      candidate({ userId: 'b', displayName: 'Bee', liveReleases: 1, deliveredTotal: 9 }),
      candidate({ userId: 'd', displayName: 'Dee', liveReleases: 1, deliveredTotal: 2 }),
    ]);
    expect(ranked.map((c) => c.userId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('falls back to the user id so two identical people never reshuffle', () => {
    const ranked = rankRising([
      candidate({ userId: 'z', displayName: 'Same' }),
      candidate({ userId: 'y', displayName: 'Same' }),
    ]);
    expect(ranked.map((c) => c.userId)).toEqual(['y', 'z']);
  });

  it('keeps six per role and not seven', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      candidate({ userId: `p${i}`, displayName: `P${i}`, liveReleases: 10 - i })
    );
    expect(rankRising(many)).toHaveLength(SHELF_SIZE);
  });

  it('drops everyone who does not qualify before ranking', () => {
    const ranked = rankRising([
      candidate({ userId: 'in' }),
      candidate({ userId: 'unclaimed', claimed: false, liveReleases: 99 }),
      candidate({ userId: 'hidden', listed: false, liveReleases: 99 }),
    ]);
    expect(ranked.map((c) => c.userId)).toEqual(['in']);
  });

  it('counts a person once per role even when passed twice', () => {
    const ranked = rankRising([candidate({ userId: 'a' }), candidate({ userId: 'a' })]);
    expect(ranked).toHaveLength(1);
  });

  it('lets the same person rise in two roles', () => {
    const ranked = rankRising([
      candidate({ userId: 'a', role: 'producer' }),
      candidate({ userId: 'a', role: 'mix_engineer' }),
    ]);
    expect(ranked).toHaveLength(2);
  });

  it('caps each role on its own', () => {
    const producers = Array.from({ length: 7 }, (_, i) => candidate({ userId: `p${i}`, role: 'producer' }));
    const prs = Array.from({ length: 7 }, (_, i) => candidate({ userId: `r${i}`, role: 'pr' }));
    const ranked = rankRising([...producers, ...prs]);
    expect(ranked.filter((c) => c.role === 'producer')).toHaveLength(SHELF_SIZE);
    expect(ranked.filter((c) => c.role === 'pr')).toHaveLength(SHELF_SIZE);
  });
});

describe('buildShelves', () => {
  it('returns no shelf for a role nobody is on', () => {
    expect(buildShelves({ viewer: 'manager', featured: [], onTheRise: [] })).toEqual([]);
  });

  it('puts managers first for an artist and last for a manager', () => {
    const input = {
      featured: [
        { role: 'manager' as const, person: person('m1') },
        { role: 'producer' as const, person: person('p1') },
      ],
      onTheRise: [],
    };
    expect(buildShelves({ viewer: 'artist', ...input }).map((s) => s.role)).toEqual(['manager', 'producer']);
    expect(buildShelves({ viewer: 'manager', ...input }).map((s) => s.role)).toEqual(['producer', 'manager']);
  });

  it('does not repeat a featured person under On the rise for the same role', () => {
    const shelves = buildShelves({
      viewer: 'manager',
      featured: [{ role: 'producer', person: person('p1') }],
      onTheRise: [
        { role: 'producer', person: person('p1') },
        { role: 'producer', person: person('p2') },
      ],
    });
    expect(shelves[0].featured.map((p) => p.userId)).toEqual(['p1']);
    expect(shelves[0].onTheRise.map((p) => p.userId)).toEqual(['p2']);
  });

  it('can show the same person on two different roles', () => {
    const shelves = buildShelves({
      viewer: 'manager',
      featured: [
        { role: 'producer', person: person('p1') },
        { role: 'mix_engineer', person: person('p1') },
      ],
      onTheRise: [],
    });
    expect(shelves).toHaveLength(2);
  });

  it('never puts the viewer on their own shelf', () => {
    const shelves = buildShelves({
      viewer: 'manager',
      viewerUserId: 'me',
      featured: [{ role: 'producer', person: person('me') }],
      onTheRise: [
        { role: 'producer', person: person('me') },
        { role: 'producer', person: person('other') },
      ],
    });
    expect(shelves[0].featured).toEqual([]);
    expect(shelves[0].onTheRise.map((p) => p.userId)).toEqual(['other']);
  });

  it('does not treat a missing viewer id as matching a person', () => {
    const shelves = buildShelves({
      viewer: 'manager',
      viewerUserId: null,
      featured: [{ role: 'producer', person: person('p1') }],
      onTheRise: [],
    });
    expect(shelves[0].featured).toHaveLength(1);
  });

  it('caps both lists at six', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ role: 'producer' as const, person: person(`p${i}`) }));
    const rise = Array.from({ length: 9 }, (_, i) => ({ role: 'producer' as const, person: person(`r${i}`) }));
    const [shelf] = buildShelves({ viewer: 'manager', featured: many, onTheRise: rise });
    expect(shelf.featured).toHaveLength(SHELF_SIZE);
    expect(shelf.onTheRise).toHaveLength(SHELF_SIZE);
  });

  it('keeps a duplicated person on one list only once', () => {
    const [shelf] = buildShelves({
      viewer: 'manager',
      featured: [
        { role: 'producer', person: person('p1') },
        { role: 'producer', person: person('p1') },
      ],
      onTheRise: [],
    });
    expect(shelf.featured).toHaveLength(1);
  });

  it('keeps a shelf that has only one of the two lists', () => {
    const shelves = buildShelves({
      viewer: 'manager',
      featured: [],
      onTheRise: [{ role: 'pr', person: person('r1') }],
    });
    expect(shelves).toHaveLength(1);
    expect(shelves[0].featured).toEqual([]);
  });
});
