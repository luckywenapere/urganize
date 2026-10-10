import { describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase, type FakeDb, type FakeRow } from './test-support/fake-supabase';
import {
  addFeaturedPick,
  loadActiveTeammates,
  loadFeaturedForAdmin,
  loadLiveSharedRollouts,
  loadManagerRecords,
  loadRisingForAdmin,
  loadShelvesForViewer,
  removeFeaturedPick,
  runOnTheRiseSweep,
} from './directory-featuring-server';
import { SHELF_SIZE } from './directory-featuring';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const MONTH = '2026-10-01';

function profile(userId: string, over: FakeRow = {}): FakeRow {
  return {
    user_id: userId,
    display_name: `Name ${userId}`,
    slug: `slug-${userId}`,
    roles: [],
    city: 'Lagos',
    availability: 'open',
    visibility: 'public',
    ...over,
  };
}

function release(id: string, owner: string, over: FakeRow = {}): FakeRow {
  return {
    id,
    owner_user_id: owner,
    artist_id: 'artist-1',
    release_date: '2026-09-20',
    status: 'draft',
    metadata: {},
    ...over,
  };
}

function db(over: FakeDb = {}): FakeDb {
  return {
    person_profiles: [],
    profiles: [],
    releases: [],
    tasks: [],
    delivery_records: [],
    directory_featured: [],
    directory_rising: [],
    ...over,
  };
}

describe('loadManagerRecords', () => {
  it('works out a record from the rollouts a person owns that came out', async () => {
    const { client } = makeFakeSupabase(
      db({
        releases: [
          release('r1', 'm1', { release_date: '2026-09-20' }),
          release('r2', 'm1', { release_date: '2026-03-01', artist_id: 'artist-2' }),
          release('r3', 'm1', { release_date: '2027-01-01', artist_id: 'artist-3' }),
        ],
      })
    );
    const records = await loadManagerRecords(client, ['m1'], NOW);
    expect(records.get('m1')).toEqual({ releasesRun: 2, artistsManaged: 2, artistsActive: 2 });
  });

  it('gives nobody an entry when they own nothing, rather than zeros', async () => {
    const { client } = makeFakeSupabase(db({ releases: [release('r1', 'other')] }));
    const records = await loadManagerRecords(client, ['m1'], NOW);
    expect(records.has('m1')).toBe(false);
  });

  it('skips test rollouts', async () => {
    const { client } = makeFakeSupabase(
      db({ releases: [release('r1', 'm1', { metadata: { test_release: true } })] })
    );
    const records = await loadManagerRecords(client, ['m1'], NOW);
    expect(records.get('m1')).toEqual({ releasesRun: 0, artistsManaged: 0, artistsActive: 0 });
  });

  it('counts a rollout as run once every activity is done, with no date', async () => {
    const { client } = makeFakeSupabase(
      db({
        releases: [release('r1', 'm1', { release_date: null })],
        tasks: [
          { id: 't1', release_id: 'r1', status: 'done' },
          { id: 't2', release_id: 'r1', status: 'done' },
        ],
      })
    );
    expect((await loadManagerRecords(client, ['m1'], NOW)).get('m1')?.releasesRun).toBe(1);
  });

  it('does not count it when one activity is still open', async () => {
    const { client } = makeFakeSupabase(
      db({
        releases: [release('r1', 'm1', { release_date: null })],
        tasks: [
          { id: 't1', release_id: 'r1', status: 'done' },
          { id: 't2', release_id: 'r1', status: 'todo' },
        ],
      })
    );
    expect((await loadManagerRecords(client, ['m1'], NOW)).get('m1')?.releasesRun).toBe(0);
  });

  it('answers an empty map for no people without asking the database', async () => {
    const { client, writes } = makeFakeSupabase(db());
    const from = vi.spyOn(client, 'from');
    expect((await loadManagerRecords(client, [], NOW)).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('answers an empty map, never an error, when a read fails', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = makeFakeSupabase(db({ releases: [release('r1', 'm1')] }), { failSelectOn: ['releases'] });
    expect((await loadManagerRecords(client, ['m1'], NOW)).size).toBe(0);
    quiet.mockRestore();
  });
});

describe('loadLiveSharedRollouts', () => {
  it('returns the ones that came out, and leaves out the ones that did not', async () => {
    const { client } = makeFakeSupabase(
      db({
        releases: [
          release('a', 'm1', { release_date: '2026-09-01' }),
          release('b', 'm1', { release_date: '2027-01-01' }),
        ],
      })
    );
    const live = await loadLiveSharedRollouts(client, ['a', 'b'], NOW);
    expect(live && [...live]).toEqual(['a']);
  });

  it('never counts a test rollout as live', async () => {
    const { client } = makeFakeSupabase(
      db({ releases: [release('a', 'm1', { release_date: '2026-09-01', metadata: { test_release: true } })] })
    );
    expect([...((await loadLiveSharedRollouts(client, ['a'], NOW)) ?? [])]).toEqual([]);
  });

  it('is an empty set for nothing to check, and null when it cannot tell', async () => {
    const { client } = makeFakeSupabase(db());
    expect([...((await loadLiveSharedRollouts(client, [], NOW)) ?? ['x'])]).toEqual([]);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = makeFakeSupabase(db({ releases: [release('a', 'm1')] }), { failSelectOn: ['releases'] });
    expect(await loadLiveSharedRollouts(failing.client, ['a'], NOW)).toBeNull();
    quiet.mockRestore();
  });
});

describe('loadShelvesForViewer', () => {
  const featured = (userId: string, role: string, over: FakeRow = {}): FakeRow => ({
    id: `f-${userId}-${role}`,
    user_id: userId,
    role,
    starts_on: '2026-10-01',
    ends_on: '2026-12-31',
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  });

  it('shows somebody Urganize picked who is published', async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('p1')],
        directory_featured: [featured('p1', 'producer')],
      })
    );
    const { shelves } = await loadShelvesForViewer(client, { userId: 'me' }, NOW);
    expect(shelves).toHaveLength(1);
    expect(shelves[0].role).toBe('producer');
    expect(shelves[0].featured.map((p) => p.userId)).toEqual(['p1']);
  });

  it('does not show a pick whose dates have not started or have ended', async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('p1'), profile('p2')],
        directory_featured: [
          featured('p1', 'producer', { starts_on: '2026-11-01', ends_on: '2027-01-31' }),
          featured('p2', 'producer', { starts_on: '2026-06-01', ends_on: '2026-08-31' }),
        ],
      })
    );
    expect((await loadShelvesForViewer(client, { userId: 'me' }, NOW)).shelves).toEqual([]);
  });

  // Featured spots go to published profiles only, and somebody who unlists leaves
  // the shelf at once rather than at the next sweep.
  it('drops a pick the moment their profile is no longer published', async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('p1', { visibility: 'private' })],
        directory_featured: [featured('p1', 'producer')],
      })
    );
    expect((await loadShelvesForViewer(client, { userId: 'me' }, NOW)).shelves).toEqual([]);
  });

  it("shows this month's On the rise and not last month's", async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('p1'), profile('p2')],
        directory_rising: [
          { id: 'a', month: MONTH, role: 'pr', user_id: 'p1', rank: 1 },
          { id: 'b', month: '2026-09-01', role: 'pr', user_id: 'p2', rank: 1 },
        ],
      })
    );
    const { shelves } = await loadShelvesForViewer(client, { userId: 'me' }, NOW);
    expect(shelves[0].onTheRise.map((p) => p.userId)).toEqual(['p1']);
  });

  it('never puts the viewer on their own shelf', async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('me'), profile('p1')],
        directory_featured: [featured('me', 'producer'), featured('p1', 'producer')],
      })
    );
    const { shelves } = await loadShelvesForViewer(client, { userId: 'me' }, NOW);
    expect(shelves[0].featured.map((p) => p.userId)).toEqual(['p1']);
  });

  it('leads an artist with managers and a manager with creatives', async () => {
    const rows = {
      person_profiles: [profile('m1'), profile('p1')],
      directory_featured: [featured('m1', 'manager'), featured('p1', 'producer')],
    };
    const asArtist = makeFakeSupabase(db({ ...rows, profiles: [{ id: 'me', role: 'artist' }] }));
    const artist = await loadShelvesForViewer(asArtist.client, { userId: 'me' }, NOW);
    expect(artist.viewer).toBe('artist');
    expect(artist.shelves.map((s) => s.role)).toEqual(['manager', 'producer']);

    const asManager = makeFakeSupabase(db({ ...rows, profiles: [{ id: 'me', role: 'manager' }] }));
    const manager = await loadShelvesForViewer(asManager.client, { userId: 'me' }, NOW);
    expect(manager.viewer).toBe('manager');
    expect(manager.shelves.map((s) => s.role)).toEqual(['producer', 'manager']);
  });

  it("treats a viewer's own manager role as beating an artist account", async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('me', { roles: ['manager'] })],
        profiles: [{ id: 'me', role: 'artist' }],
      })
    );
    expect((await loadShelvesForViewer(client, { userId: 'me' }, NOW)).viewer).toBe('manager');
  });

  it("attaches a manager's record to their card, and nobody else's", async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('m1'), profile('p1')],
        directory_featured: [featured('m1', 'manager'), featured('p1', 'producer')],
        releases: [release('r1', 'm1', { release_date: '2026-09-01' })],
      })
    );
    const { shelves } = await loadShelvesForViewer(client, { userId: 'me' }, NOW);
    const manager = shelves.find((s) => s.role === 'manager')!.featured[0];
    const producer = shelves.find((s) => s.role === 'producer')!.featured[0];
    expect(manager.managerRecord?.releasesRun).toBe(1);
    expect(producer.managerRecord).toBeNull();
  });

  it('keeps each shelf to six', async () => {
    const people = Array.from({ length: 9 }, (_, i) => `p${i}`);
    const { client } = makeFakeSupabase(
      db({
        person_profiles: people.map((id) => profile(id)),
        directory_featured: people.map((id) => featured(id, 'producer')),
      })
    );
    const { shelves } = await loadShelvesForViewer(client, { userId: 'me' }, NOW);
    expect(shelves[0].featured).toHaveLength(SHELF_SIZE);
  });

  it('is an empty shelf, not an error, when the tables are not there yet', async () => {
    const { client } = makeFakeSupabase(db(), { failSelectOn: ['directory_featured', 'directory_rising'] });
    const result = await loadShelvesForViewer(client, { userId: 'me' }, NOW);
    expect(result.shelves).toEqual([]);
  });

  it('carries what a card shows, and nothing it should not', async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('p1', { roles: ['producer'] })],
        directory_featured: [featured('p1', 'producer')],
        delivery_records: [{ user_id: 'p1', role: 'producer', release_id: 'r1' }],
      })
    );
    const [shelf] = (await loadShelvesForViewer(client, { userId: 'me' }, NOW)).shelves;
    const card = shelf.featured[0];
    expect(Object.keys(card).sort()).toEqual(
      ['availability', 'city', 'displayName', 'isPublic', 'managerRecord', 'roles', 'slug', 'userId'].sort()
    );
    expect(card.isPublic).toBe(true);
  });
});

describe('runOnTheRiseSweep', () => {
  // A creative, a manager with a working team, and the rollout they were on.
  function season(extra: FakeDb = {}): FakeDb {
    return db({
      person_profiles: [profile('mgr'), profile('des')],
      releases: [release('r1', 'mgr', { release_date: '2026-09-20' })],
      delivery_records: [{ id: 'd1', user_id: 'des', role: 'graphic_designer', release_id: 'r1' }],
      tasks: [
        { id: 't1', release_id: 'r1', assigned_to_user_id: 'a', updated_at: '2026-10-01T00:00:00.000Z', status: 'done' },
        { id: 't2', release_id: 'r1', assigned_to_user_id: 'b', updated_at: '2026-10-02T00:00:00.000Z', status: 'done' },
      ],
      ...extra,
    });
  }

  it('writes this month once, for the creative and the manager', async () => {
    const fake = makeFakeSupabase(season());
    const result = await runOnTheRiseSweep(fake.client, NOW);
    expect(result).toEqual({ computed: true, people: 2 });
    const rows = fake.inserts.filter((i) => i.table === 'directory_rising').map((i) => i.row);
    expect(rows.map((r) => `${r.role}:${r.user_id}:${r.rank}`).sort()).toEqual(['graphic_designer:des:1', 'manager:mgr:1']);
    expect(rows.every((r) => r.month === MONTH)).toBe(true);
  });

  it('leaves the month alone on every later run', async () => {
    const fake = makeFakeSupabase(season());
    await runOnTheRiseSweep(fake.client, NOW);
    const before = fake.inserts.length;
    const again = await runOnTheRiseSweep(fake.client, new Date('2026-10-20T12:00:00.000Z'));
    expect(again).toEqual({ computed: false, people: 0, reason: 'already_computed' });
    expect(fake.inserts).toHaveLength(before);
  });

  it('starts a new month when the month turns over', async () => {
    const fake = makeFakeSupabase(season());
    await runOnTheRiseSweep(fake.client, NOW);
    const next = await runOnTheRiseSweep(fake.client, new Date('2026-11-02T12:00:00.000Z'));
    // The release is still inside the window, so November gets its own snapshot.
    expect(next.computed).toBe(true);
    expect(fake.inserts.some((i) => i.table === 'directory_rising' && i.row.month === '2026-11-01')).toBe(true);
  });

  it('keeps trying each day while the month has nobody, then locks once it fills', async () => {
    const empty = makeFakeSupabase(db());
    expect(await runOnTheRiseSweep(empty.client, NOW)).toEqual({
      computed: false,
      people: 0,
      reason: 'nobody_qualifies',
    });
    // Nothing was written, so tomorrow's run is not blocked by "already computed".
    expect(empty.inserts).toEqual([]);
  });

  it('leaves out a manager whose team is not really working in Urganize', async () => {
    const fake = makeFakeSupabase(
      season({
        tasks: [{ id: 't1', release_id: 'r1', assigned_to_user_id: 'a', updated_at: '2026-10-01T00:00:00.000Z', status: 'done' }],
      })
    );
    await runOnTheRiseSweep(fake.client, NOW);
    const roles = fake.inserts.filter((i) => i.table === 'directory_rising').map((i) => i.row.role);
    expect(roles).toEqual(['graphic_designer']);
  });

  it('does not count tasks assigned to the owner as a teammate, nor old activity', async () => {
    const fake = makeFakeSupabase(
      season({
        tasks: [
          { id: 't1', release_id: 'r1', assigned_to_user_id: 'mgr', updated_at: '2026-10-01T00:00:00.000Z', status: 'done' },
          { id: 't2', release_id: 'r1', assigned_to_user_id: 'a', updated_at: '2026-10-01T00:00:00.000Z', status: 'done' },
          { id: 't3', release_id: 'r1', assigned_to_user_id: 'b', updated_at: '2026-06-01T00:00:00.000Z', status: 'done' },
        ],
      })
    );
    await runOnTheRiseSweep(fake.client, NOW);
    const roles = fake.inserts.filter((i) => i.table === 'directory_rising').map((i) => i.row.role);
    expect(roles).not.toContain('manager');
  });

  it('leaves out anybody who is not published', async () => {
    const fake = makeFakeSupabase(season({ person_profiles: [profile('mgr', { visibility: 'private' }), profile('des', { visibility: 'private' })] }));
    expect(await runOnTheRiseSweep(fake.client, NOW)).toMatchObject({ computed: false, reason: 'nobody_qualifies' });
  });

  it('leaves out a rollout that has not come out and one older than ninety days', async () => {
    const fake = makeFakeSupabase(
      season({
        releases: [
          release('r1', 'mgr', { release_date: '2026-12-01' }),
          release('r2', 'mgr', { release_date: '2026-06-01' }),
        ],
      })
    );
    expect(await runOnTheRiseSweep(fake.client, NOW)).toMatchObject({ computed: false, reason: 'nobody_qualifies' });
  });

  it('leaves out test rollouts', async () => {
    const fake = makeFakeSupabase(season({ releases: [release('r1', 'mgr', { metadata: { test_release: true } })] }));
    expect(await runOnTheRiseSweep(fake.client, NOW)).toMatchObject({ computed: false, reason: 'nobody_qualifies' });
  });

  it('records why somebody is on it, as numbers and never as a score', async () => {
    const fake = makeFakeSupabase(season());
    await runOnTheRiseSweep(fake.client, NOW);
    const creative = fake.inserts.find((i) => i.table === 'directory_rising' && i.row.role === 'graphic_designer')!.row;
    expect(creative.evidence).toEqual({ live_releases: 1, delivered_total: 1, active_teammates: null });
  });

  it('says so, and writes nothing, when the table cannot be read', async () => {
    const fake = makeFakeSupabase(season(), { failSelectOn: ['directory_rising'] });
    expect(await runOnTheRiseSweep(fake.client, NOW)).toEqual({ computed: false, people: 0, reason: 'table_unreadable' });
    expect(fake.inserts.filter((i) => i.table === 'directory_rising')).toEqual([]);
  });

  it('never throws', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = makeFakeSupabase(season(), { failSelectOn: ['releases'] });
    await expect(runOnTheRiseSweep(fake.client, NOW)).resolves.toMatchObject({ computed: false });
    quiet.mockRestore();
  });
});

describe('loadActiveTeammates', () => {
  it('counts different teammates once each', async () => {
    const { client } = makeFakeSupabase(
      db({
        releases: [release('r1', 'm1'), release('r2', 'm1')],
        tasks: [
          { id: 't1', release_id: 'r1', assigned_to_user_id: 'a', updated_at: '2026-10-05T00:00:00.000Z' },
          { id: 't2', release_id: 'r2', assigned_to_user_id: 'a', updated_at: '2026-10-05T00:00:00.000Z' },
          { id: 't3', release_id: 'r2', assigned_to_user_id: 'b', updated_at: '2026-10-05T00:00:00.000Z' },
        ],
      })
    );
    expect((await loadActiveTeammates(client, ['m1'], NOW)).get('m1')).toBe(2);
  });

  it('is empty for nobody, and for a read that fails', async () => {
    const { client } = makeFakeSupabase(db());
    expect((await loadActiveTeammates(client, [], NOW)).size).toBe(0);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = makeFakeSupabase(db(), { failSelectOn: ['releases'] });
    expect((await loadActiveTeammates(failing.client, ['m1'], NOW)).size).toBe(0);
    quiet.mockRestore();
  });
});

describe('addFeaturedPick', () => {
  const pick = (over: Record<string, unknown> = {}) => ({
    userId: 'p1',
    role: 'producer',
    pickedBy: 'admin-1',
    ...over,
  });

  it('features a published person for a quarter starting today', async () => {
    const fake = makeFakeSupabase(db({ person_profiles: [profile('p1')] }));
    const result = await addFeaturedPick(fake.client, pick(), NOW);
    expect(result).toMatchObject({ ok: true, startsOn: '2026-10-10', endsOn: '2027-01-09' });
    const row = fake.inserts.find((i) => i.table === 'directory_featured')!.row;
    expect(row).toMatchObject({ user_id: 'p1', role: 'producer', picked_by: 'admin-1', note: null });
  });

  it('keeps a trimmed note and refuses one past the cap', async () => {
    const fake = makeFakeSupabase(db({ person_profiles: [profile('p1')] }));
    await addFeaturedPick(fake.client, pick({ note: '  Mixed the EP.  ' }), NOW);
    expect(fake.inserts.find((i) => i.table === 'directory_featured')!.row.note).toBe('Mixed the EP.');
    const tooLong = await addFeaturedPick(fake.client, pick({ note: 'x'.repeat(201) }), NOW);
    expect(tooLong).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses somebody who is not published, whether private or not a person at all', async () => {
    const fake = makeFakeSupabase(db({ person_profiles: [profile('p1', { visibility: 'private' })] }));
    expect(await addFeaturedPick(fake.client, pick(), NOW)).toMatchObject({ ok: false, status: 409 });
    expect(await addFeaturedPick(fake.client, pick({ userId: 'nobody' }), NOW)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(fake.inserts).toEqual([]);
  });

  it('refuses a missing person, a role that is not one, and a date that does not exist', async () => {
    const fake = makeFakeSupabase(db({ person_profiles: [profile('p1')] }));
    expect(await addFeaturedPick(fake.client, pick({ userId: '  ' }), NOW)).toMatchObject({ ok: false, status: 400 });
    expect(await addFeaturedPick(fake.client, pick({ role: 'wizard' }), NOW)).toMatchObject({ ok: false, status: 400 });
    expect(await addFeaturedPick(fake.client, pick({ startsOn: '2026-02-30' }), NOW)).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('refuses the seventh pick for a role on the same dates', async () => {
    const six = Array.from({ length: SHELF_SIZE }, (_, i) => ({
      id: `f${i}`,
      user_id: `u${i}`,
      role: 'producer',
      starts_on: '2026-10-01',
      ends_on: '2026-12-31',
    }));
    const fake = makeFakeSupabase(db({ person_profiles: [profile('p1')], directory_featured: six }));
    expect(await addFeaturedPick(fake.client, pick(), NOW)).toMatchObject({
      ok: false,
      status: 409,
      error: expect.stringMatching(/full/i),
    });
    expect(fake.inserts).toEqual([]);
  });

  it('lets another role, and a later quarter, be scheduled while one is full', async () => {
    const six = Array.from({ length: SHELF_SIZE }, (_, i) => ({
      id: `f${i}`,
      user_id: `u${i}`,
      role: 'producer',
      starts_on: '2026-10-01',
      ends_on: '2026-12-31',
    }));
    const fake = makeFakeSupabase(db({ person_profiles: [profile('p1')], directory_featured: six }));
    expect(await addFeaturedPick(fake.client, pick({ role: 'pr' }), NOW)).toMatchObject({ ok: true });
    expect(await addFeaturedPick(fake.client, pick({ startsOn: '2027-01-01' }), NOW)).toMatchObject({ ok: true });
  });

  it('says plainly when the database refuses', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = makeFakeSupabase(db({ person_profiles: [profile('p1')] }), { failInsertOn: 'directory_featured' });
    expect(await addFeaturedPick(fake.client, pick(), NOW)).toMatchObject({ ok: false, status: 500 });
    quiet.mockRestore();
  });
});

describe('removeFeaturedPick', () => {
  it('removes the pick', async () => {
    const fake = makeFakeSupabase(db({ directory_featured: [{ id: 'f1' }, { id: 'f2' }] }));
    expect(await removeFeaturedPick(fake.client, 'f1')).toEqual({ ok: true });
    expect(fake.writes.find((w) => w.op === 'delete')?.rows?.map((r) => r.id)).toEqual(['f1']);
  });

  it('asks which one when it is not told', async () => {
    const fake = makeFakeSupabase(db());
    expect(await removeFeaturedPick(fake.client, '')).toMatchObject({ ok: false });
    expect(fake.writes).toEqual([]);
  });
});

describe('the admin reads', () => {
  it('flags a pick whose person has since unpublished, so it can still be removed', async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('p1'), profile('p2', { visibility: 'private' })],
        directory_featured: [
          { id: 'f1', user_id: 'p1', role: 'producer', starts_on: '2026-10-01', ends_on: '2026-12-31', note: null },
          { id: 'f2', user_id: 'p2', role: 'producer', starts_on: '2026-10-01', ends_on: '2026-12-31', note: 'x' },
        ],
      })
    );
    const { featured, candidates } = await loadFeaturedForAdmin(client, NOW);
    expect(featured.map((f) => [f.userId, f.listed])).toEqual([
      ['p1', true],
      ['p2', false],
    ]);
    // Only published, claimed people can be picked.
    expect(candidates.map((c) => c.userId)).toEqual(['p1']);
  });

  it('leaves out a pick that has already ended', async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('p1')],
        directory_featured: [{ id: 'f1', user_id: 'p1', role: 'producer', starts_on: '2026-01-01', ends_on: '2026-03-31' }],
      })
    );
    expect((await loadFeaturedForAdmin(client, NOW)).featured).toEqual([]);
  });

  it('says what went wrong rather than showing an empty list that looks like a finding', async () => {
    const { client } = makeFakeSupabase(db(), { failSelectOn: ['directory_featured'] });
    expect((await loadFeaturedForAdmin(client, NOW)).error).toBeTruthy();
  });

  it("reads this month's On the rise with names", async () => {
    const { client } = makeFakeSupabase(
      db({
        person_profiles: [profile('p1')],
        directory_rising: [
          { id: 'a', month: MONTH, role: 'pr', user_id: 'p1', rank: 1 },
          { id: 'b', month: '2026-09-01', role: 'pr', user_id: 'p1', rank: 2 },
        ],
      })
    );
    const { month, people } = await loadRisingForAdmin(client, NOW);
    expect(month).toBe(MONTH);
    expect(people).toEqual([{ userId: 'p1', displayName: 'Name p1', role: 'pr', rank: 1 }]);
  });

  it('answers an empty list when the table is missing', async () => {
    const { client } = makeFakeSupabase(db(), { failSelectOn: ['directory_rising'] });
    expect((await loadRisingForAdmin(client, NOW)).people).toEqual([]);
  });
});
