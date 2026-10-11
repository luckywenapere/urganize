import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  seats: vi.fn(),
  artists: vi.fn(),
  releases: vi.fn(),
  limitHit: vi.fn(),
}));

vi.mock('@/lib/seats-server', () => ({
  checkSeatAllowance: mocks.seats,
  recordLimitHit: mocks.limitHit,
}));
vi.mock('@/lib/release-cap-server', () => ({ checkActiveReleaseAllowance: mocks.releases }));
vi.mock('@/lib/artists-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/artists-server')>('@/lib/artists-server');
  return { ...actual, checkArtistAllowance: mocks.artists };
});

import { assignPersonToTask, startSharedRollout } from './work-request-collab-server';

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

/**
 * A tiny in-memory stand-in for the slice of the Supabase client these two
 * functions use: select / insert / update with eq, neq, is, and single reads.
 * Deliberately thin: the rules under test live in lib/work-request-collab.ts,
 * and this only proves the I/O half does what the plan says.
 */
function fakeClient(db: Db, users: Record<string, string>) {
  let idCounter = 0;
  const matches = (row: Row, filters: Array<[string, string, unknown]>) =>
    filters.every(([op, col, val]) =>
      op === 'eq' ? row[col] === val : op === 'neq' ? row[col] !== val : row[col] == null
    );

  const builder = (table: string) => {
    const filters: Array<[string, string, unknown]> = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const rows = () => (db[table] ??= []);
    let single = false;
    const run = () => {
      if (mode === 'insert') {
        const row = { id: `id-${++idCounter}`, ...payload };
        rows().push(row);
        return { data: row, error: null };
      }
      const hit = rows().filter((row) => matches(row, filters));
      if (mode === 'update') {
        hit.forEach((row) => Object.assign(row, payload));
        return { data: hit[0] ?? null, error: null };
      }
      return { data: single ? (hit[0] ?? null) : hit, error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      order: () => api,
      eq: (c: string, v: unknown) => (filters.push(['eq', c, v]), api),
      neq: (c: string, v: unknown) => (filters.push(['neq', c, v]), api),
      is: (c: string, v: unknown) => (filters.push(['is', c, v]), api),
      insert: (p: Row) => ((mode = 'insert'), (payload = p), api),
      update: (p: Row) => ((mode = 'update'), (payload = p), api),
      maybeSingle: async () => ((single = true), run()),
      single: async () => ((single = true), run()),
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    };
    return api;
  };

  return {
    from: builder,
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: users[id] ? { email: users[id] } : null } }),
      },
    },
  } as unknown as SupabaseClient;
}

const allowed = { allowed: true, limit: null, current: 0, remaining: null };
const baseInput = {
  acceptorUserId: 'manager',
  workspaceId: 'ws1',
  senderUserId: 'artist',
  senderName: 'Dorian',
  askReleaseNote: 'A single, out in spring',
};

let db: Db;
beforeEach(() => {
  mocks.seats.mockReset().mockResolvedValue(allowed);
  mocks.artists.mockReset().mockResolvedValue(allowed);
  mocks.releases.mockReset().mockResolvedValue({ verdict: allowed, workspaceId: 'ws1' });
  mocks.limitHit.mockReset();
  db = {
    workspaces: [{ id: 'ws1', owner_id: 'manager' }],
    workspace_members: [],
    artists: [],
    releases: [],
    release_metadata: [],
    release_events: [],
    person_profiles: [],
    tasks: [],
  };
});

describe('startSharedRollout', () => {
  it('puts the artist on the team limited to their own artist, and starts one rollout for them', async () => {
    const result = await startSharedRollout(fakeClient(db, { artist: 'D@Example.com' }), baseInput);

    expect(result.ok).toBe(true);
    const artist = db.artists[0];
    expect(artist.name).toBe('Dorian');
    expect(db.workspace_members).toHaveLength(1);
    expect(db.workspace_members[0]).toMatchObject({
      user_id: 'artist',
      email: 'd@example.com',
      role: 'member',
      status: 'active',
      artist_scope_id: artist.id,
    });
    expect(db.releases).toHaveLength(1);
    expect(db.releases[0]).toMatchObject({
      owner_user_id: 'manager',
      artist_id: artist.id,
      title: 'Dorian rollout',
      status: 'draft',
      description: 'A single, out in spring',
    });
    expect(db.release_metadata).toHaveLength(1);
    expect(db.release_events).toHaveLength(1);
  });

  it('refuses on a full team and creates NOTHING, so the yes can be handed back', async () => {
    mocks.seats.mockResolvedValue({
      allowed: false,
      key: 'seats',
      limit: 1,
      current: 1,
      message: 'Your Solo plan has 1 seat.',
      upgradeTo: 'manager',
    });
    const result = await startSharedRollout(fakeClient(db, { artist: 'd@example.com' }), baseInput);

    expect(result.ok).toBe(false);
    expect('block' in result && result.block.code).toBe('seat_limit');
    expect(db.workspace_members).toHaveLength(0);
    expect(db.artists).toHaveLength(0);
    expect(db.releases).toHaveLength(0);
    expect(mocks.limitHit).toHaveBeenCalledOnce();
  });

  it('does not charge a seat for somebody already on the team, and reuses their roster artist', async () => {
    db.artists.push({ id: 'a1', workspace_id: 'ws1', slug: 'dorian', name: 'Dorian' });
    db.workspace_members.push({
      id: 'm1',
      workspace_id: 'ws1',
      user_id: 'artist',
      email: 'd@example.com',
      status: 'active',
      artist_scope_id: 'a1',
    });
    mocks.seats.mockResolvedValue({ allowed: false, key: 'seats', limit: 1, current: 1, message: 'full', upgradeTo: 'manager' });

    const result = await startSharedRollout(fakeClient(db, { artist: 'd@example.com' }), baseInput);

    expect(result.ok).toBe(true);
    expect(mocks.seats).not.toHaveBeenCalled();
    expect(db.workspace_members).toHaveLength(1);
    expect(db.artists).toHaveLength(1);
    expect(db.releases[0].artist_id).toBe('a1');
  });

  it('claims a pending invite to the same address instead of adding a second row', async () => {
    db.workspace_members.push({
      id: 'm9',
      workspace_id: 'ws1',
      user_id: null,
      email: 'd@example.com',
      status: 'invited',
      artist_scope_id: null,
    });
    const result = await startSharedRollout(fakeClient(db, { artist: 'd@example.com' }), baseInput);

    expect(result.ok).toBe(true);
    expect(db.workspace_members).toHaveLength(1);
    expect(db.workspace_members[0]).toMatchObject({ user_id: 'artist', status: 'active' });
  });

  it('only lets an owner or admin take somebody on', async () => {
    db.workspaces[0].owner_id = 'someone-else';
    db.workspace_members.push({
      id: 'mm',
      workspace_id: 'ws1',
      user_id: 'manager',
      status: 'active',
      role: 'member',
    });
    const result = await startSharedRollout(fakeClient(db, { artist: 'd@example.com' }), baseInput);
    expect('block' in result && result.block.code).toBe('not_team_manager');
    expect(db.releases).toHaveLength(0);
  });

  it('never moves or touches a rollout the artist already has elsewhere', async () => {
    db.releases.push({ id: 'theirs', owner_user_id: 'artist', title: 'My own', status: 'draft' });
    await startSharedRollout(fakeClient(db, { artist: 'd@example.com' }), baseInput);
    expect(db.releases.find((row) => row.id === 'theirs')).toEqual({
      id: 'theirs',
      owner_user_id: 'artist',
      title: 'My own',
      status: 'draft',
    });
  });
});

describe('assignPersonToTask', () => {
  const input = { taskId: 't1', requestReleaseId: 'r1', recipientUserId: 'tunde' };

  it('records the person on the activity, and nothing else about the task', async () => {
    db.person_profiles.push({ id: 'p1', user_id: 'tunde' });
    db.tasks.push({ id: 't1', release_id: 'r1', assigned_person_id: null, assigned_to_user_id: 'owner' });
    expect(await assignPersonToTask(fakeClient(db, {}), input)).toBe('link');
    expect(db.tasks[0]).toEqual({
      id: 't1',
      release_id: 'r1',
      assigned_person_id: 'p1',
      assigned_to_user_id: 'owner',
    });
  });

  it('never overwrites somebody already on it, and never follows a moved task', async () => {
    db.person_profiles.push({ id: 'p1', user_id: 'tunde' });
    db.tasks.push({ id: 't1', release_id: 'r1', assigned_person_id: 'p9' });
    expect(await assignPersonToTask(fakeClient(db, {}), input)).toBe('already_taken');
    expect(db.tasks[0].assigned_person_id).toBe('p9');

    db.tasks[0] = { id: 't1', release_id: 'other', assigned_person_id: null };
    expect(await assignPersonToTask(fakeClient(db, {}), input)).toBe('task_mismatch');
    expect(db.tasks[0].assigned_person_id).toBeNull();
  });

  it('leaves a person with no directory record alone', async () => {
    db.tasks.push({ id: 't1', release_id: 'r1', assigned_person_id: null });
    expect(await assignPersonToTask(fakeClient(db, {}), input)).toBe('no_profile');
  });
});
