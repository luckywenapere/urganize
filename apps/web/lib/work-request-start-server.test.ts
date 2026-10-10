import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { makeFakeSupabase, type FakeDb, type FakeRow } from './test-support/fake-supabase';

// The plan limits and the "is this person on this team" rule each have their own
// tests. What is under test here is what this module DOES with their answers.
const ensureOwnedWorkspace = vi.fn();
const checkActiveReleaseAllowance = vi.fn();
const checkSeatAllowance = vi.fn();
const countHireMembers = vi.fn();
const recordLimitHit = vi.fn();
const isTeamAssignee = vi.fn();
const checkArtistAllowance = vi.fn();
const createWorkspaceArtist = vi.fn();
const isReleasePlannerEnabled = vi.fn();

vi.mock('./tasks-server', () => ({ ensureOwnedWorkspace: (...a: unknown[]) => ensureOwnedWorkspace(...a) }));
vi.mock('./release-cap-server', () => ({
  checkActiveReleaseAllowance: (...a: unknown[]) => checkActiveReleaseAllowance(...a),
}));
vi.mock('./seats-server', () => ({
  checkSeatAllowance: (...a: unknown[]) => checkSeatAllowance(...a),
  countHireMembers: (...a: unknown[]) => countHireMembers(...a),
  recordLimitHit: (...a: unknown[]) => recordLimitHit(...a),
}));
vi.mock('./task-assignee-server', () => ({ isTeamAssignee: (...a: unknown[]) => isTeamAssignee(...a) }));
vi.mock('./artists-server', () => ({
  checkArtistAllowance: (...a: unknown[]) => checkArtistAllowance(...a),
  createWorkspaceArtist: (...a: unknown[]) => createWorkspaceArtist(...a),
}));
vi.mock('./release-planning', () => ({ isReleasePlannerEnabled: () => isReleasePlannerEnabled() }));

import {
  loadSharedReleaseTitles,
  loadStartKindsForReceived,
  startWorkFromRequest,
  type StartRequestRow,
} from './work-request-start-server';
import { MAX_HIRES_PER_TEAM } from './work-requests';

const ALLOWED = { allowed: true, limit: null, current: 0, remaining: null };

const manager = { id: 'mgr', email: 'mgr@example.com' } as User;
const person = { id: 'des', email: 'Des@Example.com' } as User;

function request(over: Partial<StartRequestRow> = {}): StartRequestRow {
  return {
    id: 'req-1',
    sender_user_id: 'sender',
    recipient_user_id: 'mgr',
    workspace_id: null,
    role: 'manager',
    release_id: null,
    task_id: null,
    next_release: null,
    sender_name: 'Dorian',
    ...over,
  };
}

function db(over: FakeDb = {}): FakeDb {
  return {
    releases: [],
    artists: [],
    tasks: [],
    work_requests: [{ id: 'req-1', shared_release_id: null, started_at: null }],
    workspace_members: [],
    release_metadata: [],
    release_events: [],
    workspaces: [],
    ...over,
  };
}

/** The fake has no auth admin API, which the module uses to find a person's email. */
function withAuth(client: SupabaseClient, emails: Record<string, string | null> = {}) {
  const getUserById = vi.fn(async (id: string) => ({
    data: { user: emails[id] ? { id, email: emails[id] } : null },
    error: null,
  }));
  return Object.assign(client, { auth: { admin: { getUserById } } }) as SupabaseClient;
}

/** Make the member insert answer however a test needs, and record what it was given. */
function memberInsert(
  client: SupabaseClient,
  behave: (row: FakeRow, attempt: number) => { error: { message: string; code?: string } | null } | null
) {
  const seen: FakeRow[] = [];
  const realFrom = client.from.bind(client);
  (client as unknown as { from: (table: string) => unknown }).from = (table: string) => {
    const real = realFrom(table) as unknown as Record<string, (...args: unknown[]) => unknown>;
    if (table !== 'workspace_members') return real;
    return {
      ...real,
      insert: (row: FakeRow) => {
        seen.push(row);
        const answered = behave(row, seen.length);
        return answered ? Promise.resolve(answered) : real.insert(row);
      },
    };
  };
  return seen;
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureOwnedWorkspace.mockResolvedValue({ id: 'ws-mgr' });
  checkActiveReleaseAllowance.mockResolvedValue({ verdict: ALLOWED, workspaceId: 'ws-mgr' });
  checkSeatAllowance.mockResolvedValue(ALLOWED);
  checkArtistAllowance.mockResolvedValue(ALLOWED);
  countHireMembers.mockResolvedValue(0);
  recordLimitHit.mockResolvedValue(undefined);
  isTeamAssignee.mockResolvedValue(false);
  createWorkspaceArtist.mockResolvedValue({ data: { id: 'artist-new', name: 'Dorian' }, error: null });
  isReleasePlannerEnabled.mockReturnValue(false);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('startWorkFromRequest: nothing to start', () => {
  it('answers null for a plain ask with no rollout behind it', async () => {
    const fake = makeFakeSupabase(db());
    const result = await startWorkFromRequest(
      fake.client,
      request({ role: 'producer', release_id: null }),
      person
    );
    expect(result).toBeNull();
    expect(fake.writes).toEqual([]);
  });
});

describe('startWorkFromRequest: an artist asked a manager', () => {
  it('makes the rollout in the manager’s team under the artist, and puts the artist on it', async () => {
    const fake = makeFakeSupabase(db());
    const admin = withAuth(fake.client, { sender: 'Dorian@Example.com' });
    isTeamAssignee.mockResolvedValue(false);

    const result = await startWorkFromRequest(admin, request({ next_release: 'Midnight EP' }), manager);

    expect(result).toMatchObject({
      status: 'started',
      kind: 'manager_rollout',
      releaseTitle: 'Midnight EP',
      personAdded: true,
      taskTitle: null,
    });
    const created = fake.inserts.find((i) => i.table === 'releases')!.row;
    expect(created).toMatchObject({
      owner_user_id: 'mgr',
      artist_id: 'artist-new',
      artist_name: 'Dorian',
      title: 'Midnight EP',
      release_date: null,
      status: 'draft',
      release_type: 'single',
    });
    // The artist is on the manager's team, scoped to their own artist, and takes a seat.
    const member = fake.inserts.find((i) => i.table === 'workspace_members')!.row;
    expect(member).toMatchObject({
      workspace_id: 'ws-mgr',
      user_id: 'sender',
      email: 'dorian@example.com',
      artist_scope_id: 'artist-new',
      is_hire: false,
      status: 'active',
    });
  });

  it('records the shared rollout on the request, once', async () => {
    const fake = makeFakeSupabase(db());
    const admin = withAuth(fake.client, { sender: 'd@example.com' });
    const result = await startWorkFromRequest(admin, request(), manager);
    const row = fake.writes.find((w) => w.op === 'update' && w.table === 'work_requests');
    expect(row?.patch).toMatchObject({ shared_release_id: (result as { releaseId: string }).releaseId });
    expect(typeof row?.patch?.started_at).toBe('string');

    // A second start finds started_at already set, so the pointer is not rewritten.
    const after = fake.writes.filter((w) => w.op === 'update' && w.table === 'work_requests').length;
    await startWorkFromRequest(admin, request(), manager);
    const requests = (await admin.from('work_requests').select('*')) as unknown as { data: FakeRow[] };
    expect(requests.data[0].shared_release_id).toBe((result as { releaseId: string }).releaseId);
    expect(after).toBe(1);
  });

  it('titles the rollout with the default when the artist said nothing, and caps what they did say', async () => {
    const plain = makeFakeSupabase(db());
    await startWorkFromRequest(withAuth(plain.client, { sender: 'd@example.com' }), request({ next_release: '   ' }), manager);
    expect(plain.inserts.find((i) => i.table === 'releases')!.row.title).toBe('Untitled rollout');

    const long = makeFakeSupabase(db());
    await startWorkFromRequest(
      withAuth(long.client, { sender: 'd@example.com' }),
      request({ next_release: 'x'.repeat(500) }),
      manager
    );
    expect(String(long.inserts.find((i) => i.table === 'releases')!.row.title)).toHaveLength(120);
  });

  it('owes a plan: the planner when it is on, the template when it is not', async () => {
    const off = makeFakeSupabase(db());
    await startWorkFromRequest(withAuth(off.client, { sender: 'd@example.com' }), request(), manager);
    expect(off.inserts.find((i) => i.table === 'releases')!.row.metadata).toEqual({ template_pending: true });

    isReleasePlannerEnabled.mockReturnValue(true);
    const on = makeFakeSupabase(db());
    await startWorkFromRequest(withAuth(on.client, { sender: 'd@example.com' }), request(), manager);
    expect(on.inserts.find((i) => i.table === 'releases')!.row.metadata).toEqual({ planner_pending: true });
  });

  it('uses the manager’s artist of that name instead of making a second one', async () => {
    const fake = makeFakeSupabase(db({ artists: [{ id: 'artist-old', name: 'Dorian', workspace_id: 'ws-mgr', slug: 'dorian' }] }));
    await startWorkFromRequest(withAuth(fake.client, { sender: 'd@example.com' }), request(), manager);
    expect(createWorkspaceArtist).not.toHaveBeenCalled();
    expect(checkArtistAllowance).not.toHaveBeenCalled();
    expect(fake.inserts.find((i) => i.table === 'releases')!.row.artist_id).toBe('artist-old');
  });

  it('writes the same two side rows a normal rollout gets', async () => {
    const fake = makeFakeSupabase(db());
    await startWorkFromRequest(withAuth(fake.client, { sender: 'd@example.com' }), request(), manager);
    expect(fake.inserts.some((i) => i.table === 'release_metadata')).toBe(true);
    expect(fake.inserts.find((i) => i.table === 'release_events')!.row).toMatchObject({
      type: 'release_created',
      payload_json: expect.objectContaining({ via: 'directory_request' }),
    });
  });

  describe('the plan has no room', () => {
    it('refuses the rollout, says so, and makes nothing', async () => {
      checkActiveReleaseAllowance.mockResolvedValue({
        verdict: { allowed: false, key: 'active_releases', limit: 1, current: 1, message: 'Solo is limited to 1 rollout.' },
        workspaceId: 'ws-mgr',
      });
      const fake = makeFakeSupabase(db());
      const result = await startWorkFromRequest(withAuth(fake.client), request(), manager);
      expect(result).toEqual({ status: 'not_started', kind: 'manager_rollout', reason: 'rollout_limit', detail: 'Solo is limited to 1 rollout.' });
      expect(recordLimitHit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ key: 'active_releases', limit: 1, current: 1, ownerUserId: 'mgr' })
      );
      expect(fake.inserts).toEqual([]);
    });

    it('refuses a new artist when the roster is full, and makes nothing', async () => {
      checkArtistAllowance.mockResolvedValue({ allowed: false, key: 'artists', limit: 1, current: 1, message: 'One artist on Solo.' });
      const fake = makeFakeSupabase(db());
      const result = await startWorkFromRequest(withAuth(fake.client), request(), manager);
      expect(result).toMatchObject({ status: 'not_started', reason: 'artist_limit', detail: 'One artist on Solo.' });
      expect(fake.inserts).toEqual([]);
    });

    it('still starts the rollout when there is no free seat, and says the artist is not on it yet', async () => {
      checkSeatAllowance.mockResolvedValue({ allowed: false, key: 'seats', limit: 1, current: 1, message: 'No seat.' });
      const fake = makeFakeSupabase(db());
      const result = await startWorkFromRequest(withAuth(fake.client, { sender: 'd@example.com' }), request(), manager);
      expect(result).toMatchObject({ status: 'started', personAdded: false });
      expect(fake.inserts.some((i) => i.table === 'workspace_members')).toBe(false);
      expect(recordLimitHit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: 'seats' }));
    });

    it('does not ask for a seat when the artist is already on the team', async () => {
      isTeamAssignee.mockResolvedValue(true);
      const fake = makeFakeSupabase(db());
      const result = await startWorkFromRequest(withAuth(fake.client), request(), manager);
      expect(result).toMatchObject({ status: 'started', personAdded: true });
      expect(checkSeatAllowance).not.toHaveBeenCalled();
      expect(fake.inserts.some((i) => i.table === 'workspace_members')).toBe(false);
    });

    it('starts without the artist when their email cannot be found', async () => {
      const fake = makeFakeSupabase(db());
      const result = await startWorkFromRequest(withAuth(fake.client, { sender: null }), request(), manager);
      expect(result).toMatchObject({ status: 'started', personAdded: false });
    });
  });

  it('brings an old invite back to life instead of failing on the unique email', async () => {
    const fake = makeFakeSupabase(
      db({ workspace_members: [{ id: 'old', workspace_id: 'ws-mgr', email: 'd@example.com', status: 'removed', is_hire: false }] })
    );
    const admin = withAuth(fake.client, { sender: 'd@example.com' });
    memberInsert(admin, () => ({ error: { message: 'duplicate key', code: '23505' } }));
    const result = await startWorkFromRequest(admin, request(), manager);
    expect(result).toMatchObject({ status: 'started', personAdded: true });
    const row = fake.writes.find((w) => w.op === 'update' && w.table === 'workspace_members')!.patch!;
    expect(row).toMatchObject({ user_id: 'sender', status: 'active', is_hire: false, artist_scope_id: 'artist-new' });
  });

  it('retries a signed artist without is_hire when that column is not there yet', async () => {
    const fake = makeFakeSupabase(db());
    const admin = withAuth(fake.client, { sender: 'd@example.com' });
    const seen = memberInsert(admin, (row, attempt) =>
      attempt === 1 && 'is_hire' in row ? { error: { message: 'no column', code: '42703' } } : null
    );
    const result = await startWorkFromRequest(admin, request(), manager);
    expect(result).toMatchObject({ status: 'started', personAdded: true });
    expect(seen).toHaveLength(2);
    expect('is_hire' in seen[1]).toBe(false);
  });

  it('answers failed, never throws, when a read blows up', async () => {
    const fake = makeFakeSupabase(db(), { failSelectOn: ['artists'] });
    const result = await startWorkFromRequest(withAuth(fake.client), request(), manager);
    expect(result).toMatchObject({ status: 'not_started', kind: 'manager_rollout', reason: 'failed' });
  });
});

describe('startWorkFromRequest: a team asked somebody to do a job', () => {
  const hireRequest = (over: Partial<StartRequestRow> = {}) =>
    request({
      role: 'graphic_designer',
      workspace_id: 'ws-team',
      release_id: 'rel-1',
      sender_user_id: 'owner',
      recipient_user_id: 'des',
      ...over,
    });

  const team = (over: FakeDb = {}): FakeDb =>
    db({
      releases: [{ id: 'rel-1', title: 'Midnight EP', owner_user_id: 'owner', artist_id: 'artist-1' }],
      ...over,
    });

  /** The sender and the release owner are on the team, the person is not. */
  function onlyThemOnTheTeam() {
    isTeamAssignee.mockImplementation(async (_c: unknown, _ws: string, user: string) => user === 'owner');
  }

  it('puts the person on the team as a hire, held to the one artist, and takes no seat', async () => {
    onlyThemOnTheTeam();
    const fake = makeFakeSupabase(team());
    const result = await startWorkFromRequest(withAuth(fake.client), hireRequest(), person);

    expect(result).toMatchObject({
      status: 'started',
      kind: 'hire_join',
      releaseId: 'rel-1',
      releaseTitle: 'Midnight EP',
      personAdded: true,
      taskTitle: null,
    });
    const member = fake.inserts.find((i) => i.table === 'workspace_members')!.row;
    expect(member).toMatchObject({
      workspace_id: 'ws-team',
      user_id: 'des',
      email: 'des@example.com',
      is_hire: true,
      artist_scope_id: 'artist-1',
      role: 'member',
      status: 'active',
    });
    // A hire is not a seat: the seat ceiling is never consulted.
    expect(checkSeatAllowance).not.toHaveBeenCalled();
  });

  it('makes the activity they were asked about theirs', async () => {
    onlyThemOnTheTeam();
    const fake = makeFakeSupabase(
      team({ tasks: [{ id: 'task-1', title: 'Cover art', release_id: 'rel-1', assigned_to_user_id: 'owner' }] })
    );
    const result = await startWorkFromRequest(withAuth(fake.client), hireRequest({ task_id: 'task-1' }), person);
    expect(result).toMatchObject({ status: 'started', taskTitle: 'Cover art' });
    expect((await fake.client.from('tasks').select('*').eq('id', 'task-1')).data?.[0].assigned_to_user_id).toBe('des');
  });

  // A task id on a request is something the sender typed into a form.
  it('never reaches into an activity that belongs to a different rollout', async () => {
    onlyThemOnTheTeam();
    const fake = makeFakeSupabase(
      team({ tasks: [{ id: 'task-9', title: 'Someone else', release_id: 'rel-other', assigned_to_user_id: 'x' }] })
    );
    const result = await startWorkFromRequest(withAuth(fake.client), hireRequest({ task_id: 'task-9' }), person);
    expect(result).toMatchObject({ status: 'started', taskTitle: null });
    expect(fake.writes.some((w) => w.op === 'update' && w.table === 'tasks')).toBe(false);
  });

  it('does not add somebody who is already on the team', async () => {
    isTeamAssignee.mockResolvedValue(true);
    const fake = makeFakeSupabase(team());
    const result = await startWorkFromRequest(withAuth(fake.client), hireRequest(), person);
    expect(result).toMatchObject({ status: 'started', personAdded: true });
    expect(fake.inserts.some((i) => i.table === 'workspace_members')).toBe(false);
    expect(countHireMembers).not.toHaveBeenCalled();
  });

  it('stops at the hire ceiling, counting active hires only', async () => {
    onlyThemOnTheTeam();
    countHireMembers.mockResolvedValue(MAX_HIRES_PER_TEAM);
    const fake = makeFakeSupabase(team());
    const result = await startWorkFromRequest(withAuth(fake.client), hireRequest(), person);
    expect(result).toMatchObject({ status: 'not_started', reason: 'hire_limit' });
    expect(countHireMembers).toHaveBeenCalledWith(expect.anything(), 'ws-team', { activeOnly: true });
    expect(fake.inserts).toEqual([]);
  });

  it('lets the hire in when the count could not be read', async () => {
    onlyThemOnTheTeam();
    countHireMembers.mockResolvedValue(null);
    const fake = makeFakeSupabase(team());
    expect(await startWorkFromRequest(withAuth(fake.client), hireRequest(), person)).toMatchObject({ status: 'started' });
  });

  it('says there was nothing to join when the team asked has gone, the rollout is gone, or it moved teams', async () => {
    onlyThemOnTheTeam();
    const noTeam = makeFakeSupabase(team());
    expect(await startWorkFromRequest(withAuth(noTeam.client), hireRequest({ workspace_id: null }), person)).toMatchObject({
      reason: 'sender_left',
    });

    const gone = makeFakeSupabase(db());
    expect(await startWorkFromRequest(withAuth(gone.client), hireRequest(), person)).toMatchObject({ reason: 'release_gone' });

    // The rollout now belongs to somebody outside the team that asked.
    isTeamAssignee.mockResolvedValue(false);
    const moved = makeFakeSupabase(team());
    expect(await startWorkFromRequest(withAuth(moved.client), hireRequest(), person)).toMatchObject({ reason: 'release_gone' });
  });

  it('says so when the person who asked has left the team in the days it took to answer', async () => {
    // The rollout owner is on the team; the sender is not.
    isTeamAssignee.mockImplementation(async (_c: unknown, _ws: string, user: string) => user === 'owner');
    const fake = makeFakeSupabase(team());
    const result = await startWorkFromRequest(withAuth(fake.client), hireRequest({ sender_user_id: 'left' }), person);
    expect(result).toMatchObject({ reason: 'sender_left' });
    expect(fake.inserts).toEqual([]);
  });

  it('refuses to add a hire with no artist to hold them to', async () => {
    onlyThemOnTheTeam();
    const fake = makeFakeSupabase(team({ releases: [{ id: 'rel-1', title: 'EP', owner_user_id: 'owner', artist_id: null }] }));
    expect(await startWorkFromRequest(withAuth(fake.client), hireRequest(), person)).toMatchObject({ reason: 'failed' });
    expect(fake.inserts).toEqual([]);
  });

  it('never adds a hire as a full member when the is_hire column is not there yet', async () => {
    onlyThemOnTheTeam();
    const fake = makeFakeSupabase(team());
    const admin = withAuth(fake.client);
    const seen = memberInsert(admin, () => ({ error: { message: 'no column', code: '42703' } }));
    expect(await startWorkFromRequest(admin, hireRequest(), person)).toMatchObject({ status: 'not_started', reason: 'failed' });
    // One attempt, and no retry without the column: that would take a seat nobody agreed to.
    expect(seen).toHaveLength(1);
  });

  it('answers failed when the person has no email on record', async () => {
    onlyThemOnTheTeam();
    const fake = makeFakeSupabase(team());
    const noEmail = { id: 'des', email: undefined } as unknown as User;
    expect(await startWorkFromRequest(withAuth(fake.client, { des: null }), hireRequest(), noEmail)).toMatchObject({
      reason: 'failed',
    });
  });
});

describe('loadStartKindsForReceived', () => {
  it('says a manager request can start a rollout without reading anything', async () => {
    const fake = makeFakeSupabase(db());
    const from = vi.spyOn(fake.client, 'from');
    const kinds = await loadStartKindsForReceived(fake.client, [{ id: 'a', role: 'manager', status: 'new' }]);
    expect(kinds.get('a')).toBe('manager_rollout');
    expect(from).not.toHaveBeenCalled();
  });

  it('says a job request can put you on a rollout only when there is one behind it', async () => {
    const fake = makeFakeSupabase(
      db({
        work_requests: [
          { id: 'with', release_id: 'rel-1' },
          { id: 'without', release_id: null },
        ],
      })
    );
    const kinds = await loadStartKindsForReceived(fake.client, [
      { id: 'with', role: 'producer', status: 'new' },
      { id: 'without', role: 'producer', status: 'new' },
    ]);
    expect(kinds.get('with')).toBe('hire_join');
    expect(kinds.has('without')).toBe(false);
  });

  it('ignores a request that has already been answered', async () => {
    const fake = makeFakeSupabase(db({ work_requests: [{ id: 'x', release_id: 'r' }] }));
    const kinds = await loadStartKindsForReceived(fake.client, [
      { id: 'x', role: 'producer', status: 'interested' },
      { id: 'y', role: 'manager', status: 'closed' },
    ]);
    expect(kinds.size).toBe(0);
  });

  it('keeps the manager answers and drops the rest when the read fails', async () => {
    const fake = makeFakeSupabase(db(), { failSelectOn: ['work_requests'] });
    const kinds = await loadStartKindsForReceived(fake.client, [
      { id: 'm', role: 'manager', status: 'new' },
      { id: 'p', role: 'producer', status: 'new' },
    ]);
    expect([...kinds.entries()]).toEqual([['m', 'manager_rollout']]);
  });

  // The recipient never sees which rollout; the answer is the word and nothing else.
  it('returns the word and never a rollout id', async () => {
    const fake = makeFakeSupabase(db({ work_requests: [{ id: 'p', release_id: 'secret-rollout' }] }));
    const kinds = await loadStartKindsForReceived(fake.client, [{ id: 'p', role: 'producer', status: 'new' }]);
    expect(JSON.stringify([...kinds.entries()])).not.toContain('secret-rollout');
  });
});

describe('loadSharedReleaseTitles', () => {
  const releases = [
    { id: 'mine', title: 'Mine', owner_user_id: 'me' },
    { id: 'theirs-reachable', title: 'Reachable', owner_user_id: 'owner-a' },
    { id: 'theirs-closed', title: 'Closed', owner_user_id: 'owner-b' },
  ];

  it('gives titles only for rollouts the person can open', async () => {
    const fake = makeFakeSupabase(
      db({
        releases,
        workspaces: [
          { id: 'ws-a', owner_id: 'owner-a' },
          { id: 'ws-b', owner_id: 'owner-b' },
        ],
        workspace_members: [
          { workspace_id: 'ws-a', user_id: 'me', status: 'active' },
          { workspace_id: 'ws-b', user_id: 'me', status: 'invited' },
        ],
      })
    );
    const titles = await loadSharedReleaseTitles(fake.client, 'me', ['mine', 'theirs-reachable', 'theirs-closed']);
    expect([...titles.entries()].sort()).toEqual([
      ['mine', 'Mine'],
      ['theirs-reachable', 'Reachable'],
    ]);
  });

  it('gives nothing for no ids, without reading', async () => {
    const fake = makeFakeSupabase(db());
    const from = vi.spyOn(fake.client, 'from');
    expect((await loadSharedReleaseTitles(fake.client, 'me', ['', ''])).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to the default title for a rollout with none', async () => {
    const fake = makeFakeSupabase(db({ releases: [{ id: 'r', title: null, owner_user_id: 'me' }] }));
    expect((await loadSharedReleaseTitles(fake.client, 'me', ['r'])).get('r')).toBe('Untitled rollout');
  });

  it('gives an empty map, not an error, when a read fails', async () => {
    const fake = makeFakeSupabase(db({ releases }), { failSelectOn: ['workspaces'] });
    const titles = await loadSharedReleaseTitles(fake.client, 'me', ['mine', 'theirs-reachable']);
    expect(titles.has('theirs-reachable')).toBe(false);
  });
});
