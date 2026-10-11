import { describe, expect, it } from 'vitest';
import {
  FEATURED_PER_ROLE,
  MANAGER_MIN_TEAMMATES,
  RISING_PER_ROLE,
  checkFeatureRequest,
  composeShelves,
  computeOnTheRise,
  hasEnoughHistory,
  isPublishedProfile,
  monthKey,
  orderShelfForViewer,
  quarterBounds,
  shouldRecomputeRise,
  viewerKindFromProfile,
  viewerKindFromProfileType,
  type RiseActivity,
  type RiseCandidate,
  type RiseRecord,
  type RiseRelease,
} from './featured-shelves';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();
const dateOnly = (n: number) => daysAgo(n).slice(0, 10);

const published = { userId: 'u1', status: 'claimed', visibility: 'directory' };

describe('isPublishedProfile', () => {
  it('needs a claimed, listed profile', () => {
    expect(isPublishedProfile(published)).toBe(true);
    expect(isPublishedProfile({ ...published, visibility: 'public' })).toBe(true);
  });
  it('refuses private, unclaimed and ownerless profiles', () => {
    expect(isPublishedProfile({ ...published, visibility: 'private' })).toBe(false);
    expect(isPublishedProfile({ ...published, status: 'unclaimed' })).toBe(false);
    expect(isPublishedProfile({ ...published, userId: null })).toBe(false);
  });
});

describe('quarterBounds', () => {
  it('runs a Lagos quarter, starting 23:00 UTC the evening before', () => {
    const q = quarterBounds(new Date('2026-11-20T12:00:00Z'));
    expect(q.startsAt).toBe('2026-09-30T23:00:00.000Z');
    expect(q.endsAt).toBe('2026-12-31T23:00:00.000Z');
    expect(q.label).toBe('Q4 2026');
  });
  it('flips with the Lagos day, not the UTC day', () => {
    // 23:30 UTC on Dec 31 is already Jan 1 in Lagos.
    expect(quarterBounds(new Date('2026-12-31T23:30:00Z')).label).toBe('Q1 2027');
    expect(quarterBounds(new Date('2026-12-31T22:30:00Z')).label).toBe('Q4 2026');
  });
  it('rolls the year with offset', () => {
    const next = quarterBounds(new Date('2026-11-20T12:00:00Z'), 1);
    expect(next.label).toBe('Q1 2027');
    expect(next.startsAt).toBe('2026-12-31T23:00:00.000Z');
    expect(next.endsAt).toBe('2027-03-31T23:00:00.000Z');
  });
  it('ends exactly where the next one starts', () => {
    expect(quarterBounds(NOW).endsAt).toBe(quarterBounds(NOW, 1).startsAt);
  });
});

describe('checkFeatureRequest', () => {
  const base = {
    profile: published,
    role: 'producer',
    heldRoles: ['producer'],
    featuredInRole: 0,
    alreadyFeatured: false,
  };
  it('accepts a published person who holds the role', () => {
    expect(checkFeatureRequest(base)).toEqual({ ok: true });
  });
  it('refuses a profile that is not published', () => {
    const verdict = checkFeatureRequest({ ...base, profile: { ...published, visibility: 'private' } });
    expect(verdict).toMatchObject({ ok: false, code: 'not_published' });
  });
  it('refuses an unknown role first, and a role they do not hold', () => {
    expect(checkFeatureRequest({ ...base, role: 'wizard' })).toMatchObject({ code: 'unknown_role' });
    expect(checkFeatureRequest({ ...base, heldRoles: ['manager'] })).toMatchObject({ code: 'role_not_held' });
  });
  it('refuses a repeat and a full role', () => {
    expect(checkFeatureRequest({ ...base, alreadyFeatured: true })).toMatchObject({ code: 'already_featured' });
    expect(checkFeatureRequest({ ...base, featuredInRole: FEATURED_PER_ROLE - 1 })).toEqual({ ok: true });
    expect(checkFeatureRequest({ ...base, featuredInRole: FEATURED_PER_ROLE })).toMatchObject({ code: 'role_full' });
  });
});

describe('monthly recompute', () => {
  it('keys on the Lagos month', () => {
    expect(monthKey(new Date('2026-11-20T12:00:00Z'))).toBe('2026-11-01');
    expect(monthKey(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
    expect(monthKey(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10-01');
  });
  it('recomputes only when the month changed', () => {
    expect(shouldRecomputeRise('2026-11-01', NOW)).toBe(false);
    expect(shouldRecomputeRise('2026-10-01', NOW)).toBe(true);
    expect(shouldRecomputeRise(null, NOW)).toBe(true);
  });
  it('waits for thirty days of activity', () => {
    expect(hasEnoughHistory(null, NOW)).toBe(false);
    expect(hasEnoughHistory('garbage', NOW)).toBe(false);
    expect(hasEnoughHistory(daysAgo(29), NOW)).toBe(false);
    expect(hasEnoughHistory(daysAgo(30), NOW)).toBe(true);
  });
});

function candidate(over: Partial<RiseCandidate> & { userId: string }): RiseCandidate {
  return {
    profileId: `p-${over.userId}`,
    status: 'claimed',
    visibility: 'directory',
    claimedRoles: [],
    ...over,
  };
}

function release(over: Partial<RiseRelease> & { id: string }): RiseRelease {
  return {
    ownerUserId: 'owner',
    releaseDate: dateOnly(20),
    status: 'draft',
    isTest: false,
    updatedAt: daysAgo(20),
    taskCount: 10,
    doneTaskCount: 10,
    lastTaskDoneAt: daysAgo(20),
    ...over,
  };
}

const run = (input: {
  candidates?: RiseCandidate[];
  releases?: RiseRelease[];
  records?: RiseRecord[];
  activity?: RiseActivity[];
}) =>
  computeOnTheRise(
    {
      candidates: input.candidates ?? [],
      releases: input.releases ?? [],
      records: input.records ?? [],
      activity: input.activity ?? [],
    },
    NOW
  );

describe('computeOnTheRise, delivery roles', () => {
  const people = [candidate({ userId: 'a' })];
  const records = [{ userId: 'a', role: 'producer', releaseId: 'r1' }];

  it('picks a published person delivered on a rollout that went live in 90 days', () => {
    const picks = run({ candidates: people, releases: [release({ id: 'r1' })], records });
    expect(picks).toEqual([{ profileId: 'p-a', userId: 'a', role: 'producer' }]);
  });
  it('skips a rollout that went live more than 90 days ago, and one not yet live', () => {
    const old = release({ id: 'r1', releaseDate: dateOnly(91), lastTaskDoneAt: daysAgo(91) });
    expect(run({ candidates: people, releases: [old], records })).toEqual([]);
    const future = release({ id: 'r1', releaseDate: dateOnly(-5), doneTaskCount: 3 });
    expect(run({ candidates: people, releases: [future], records })).toEqual([]);
  });
  it('skips test rollouts', () => {
    expect(run({ candidates: people, releases: [release({ id: 'r1', isTest: true })], records })).toEqual([]);
  });
  it('skips anyone who is private, unclaimed or has no record on a live rollout', () => {
    const rel = [release({ id: 'r1' })];
    expect(run({ candidates: [candidate({ userId: 'a', visibility: 'private' })], releases: rel, records })).toEqual([]);
    expect(run({ candidates: [candidate({ userId: 'a', status: 'unclaimed' })], releases: rel, records })).toEqual([]);
    expect(run({ candidates: people, releases: rel, records: [] })).toEqual([]);
    expect(run({ candidates: people, releases: rel, records: [{ userId: 'a', role: 'producer', releaseId: 'other' }] })).toEqual([]);
  });
  it('counts a rollout that finished before its date once every activity is done', () => {
    const early = release({ id: 'r1', releaseDate: dateOnly(-30), lastTaskDoneAt: daysAgo(5) });
    expect(run({ candidates: people, releases: [early], records })).toHaveLength(1);
  });
  it('caps each role at six, most recent first, and is deterministic on ties', () => {
    const many = Array.from({ length: 8 }, (_, i) => candidate({ userId: `u${i}` }));
    const releases = many.map((c, i) =>
      release({ id: `r${i}`, releaseDate: dateOnly(10 + i), lastTaskDoneAt: daysAgo(10 + i) })
    );
    const recs = many.map((c, i) => ({ userId: c.userId, role: 'producer', releaseId: `r${i}` }));
    const picks = run({ candidates: many, releases, records: recs });
    expect(picks).toHaveLength(RISING_PER_ROLE);
    expect(picks.map((p) => p.userId)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4', 'u5']);
    expect(run({ candidates: many, releases, records: recs })).toEqual(picks);
  });
});

describe('computeOnTheRise, managers', () => {
  const manager = candidate({ userId: 'm', claimedRoles: ['manager'] });
  const live = release({ id: 'r1', ownerUserId: 'm' });
  const team = (...ids: string[]): RiseActivity[] =>
    ids.map((actorId) => ({ releaseId: 'r1', actorId, at: daysAgo(3) }));

  it('needs two teammates active on their rollouts in 30 days', () => {
    expect(MANAGER_MIN_TEAMMATES).toBe(2);
    const picks = run({ candidates: [manager], releases: [live], activity: team('t1', 't2') });
    expect(picks).toEqual([{ profileId: 'p-m', userId: 'm', role: 'manager' }]);
    expect(run({ candidates: [manager], releases: [live], activity: team('t1') })).toEqual([]);
  });
  it('does not count the manager, repeats, or activity older than 30 days', () => {
    expect(run({ candidates: [manager], releases: [live], activity: team('m', 't1', 't1') })).toEqual([]);
    const stale: RiseActivity[] = ['t1', 't2'].map((actorId) => ({ releaseId: 'r1', actorId, at: daysAgo(31) }));
    expect(run({ candidates: [manager], releases: [live], activity: stale })).toEqual([]);
  });
  it('needs the manager role claimed, a live rollout and a delivered activity', () => {
    const activity = team('t1', 't2');
    expect(run({ candidates: [candidate({ userId: 'm' })], releases: [live], activity })).toEqual([]);
    const idle = release({ id: 'r1', ownerUserId: 'm', doneTaskCount: 0, releaseDate: dateOnly(20) });
    expect(run({ candidates: [manager], releases: [idle], activity })).toEqual([]);
  });
});

describe('viewer ordering', () => {
  it('reads the kind from claimed roles, with a profile type winning', () => {
    expect(viewerKindFromProfile({ claimedRoles: [] })).toBe('artist');
    expect(viewerKindFromProfile({ claimedRoles: ['producer'] })).toBe('creative');
    expect(viewerKindFromProfile({ claimedRoles: ['producer', 'a_and_r'] })).toBe('manager');
    expect(viewerKindFromProfile({ claimedRoles: ['producer'], profileType: 'artist' })).toBe('artist');
  });

  const entry = (userId: string, shelfRole: 'manager' | 'producer' | 'a_and_r' | 'photographer') => ({
    userId,
    shelfRole,
  });
  const list = [entry('a', 'producer'), entry('b', 'manager'), entry('c', 'photographer'), entry('d', 'a_and_r')];

  it('puts management first for an artist', () => {
    expect(orderShelfForViewer(list, 'artist').map((e) => e.userId)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('puts the people who make the work first for a manager', () => {
    expect(orderShelfForViewer(list, 'manager').map((e) => e.userId)).toEqual(['a', 'c', 'b', 'd']);
  });
  it('keeps the original order inside a role', () => {
    const same = [entry('x', 'producer'), entry('y', 'producer')];
    expect(orderShelfForViewer(same, 'manager').map((e) => e.userId)).toEqual(['x', 'y']);
  });
});

describe('composeShelves', () => {
  const e = (userId: string, shelfRole: 'producer' | 'manager') => ({ userId, shelfRole });
  it('does not repeat a featured person under the same role on the rise', () => {
    const out = composeShelves([e('a', 'producer')], [e('a', 'producer'), e('b', 'producer')], 'artist');
    expect(out.onTheRise.map((x) => x.userId)).toEqual(['b']);
  });
  it('keeps a person on the rise for a different role', () => {
    const out = composeShelves([e('a', 'producer')], [e('a', 'manager')], 'artist');
    expect(out.onTheRise).toHaveLength(1);
  });
  it('returns an empty list, never a placeholder, when there is nothing', () => {
    expect(composeShelves([], [], 'artist')).toEqual({ featured: [], onTheRise: [] });
  });
});

describe('viewerKindFromProfileType', () => {
  it('maps the directory profile types onto viewer kinds', () => {
    expect(viewerKindFromProfileType('manager')).toBe('manager');
    expect(viewerKindFromProfileType('artist')).toBe('artist');
    expect(viewerKindFromProfileType('creative')).toBe('creative');
  });

  it('treats an adjacent pro like a creative, who meets management first', () => {
    expect(viewerKindFromProfileType('adjacent')).toBe('creative');
  });

  it('answers nothing for no type or an unknown one, so roles decide', () => {
    expect(viewerKindFromProfileType(null)).toBeNull();
    expect(viewerKindFromProfileType('wizard')).toBeNull();
    expect(viewerKindFromProfile({ profileType: viewerKindFromProfileType('manager'), claimedRoles: ['producer'] })).toBe('manager');
  });
});
