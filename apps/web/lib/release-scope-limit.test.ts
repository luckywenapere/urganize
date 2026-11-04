// Chosen-rollout access (#853): the pure check every gate uses, and the task
// list filter that closed the artist-limit leak in /api/tasks and UrgAns.
import { describe, expect, it } from 'vitest';
import { decideReleaseAccess, isReleaseInScope, type ReleaseAccessContextSlice } from './release-access';
import { dropRowsOutsideScope } from './services/task-service';

const OWNER = 'owner-1';
const ME = 'me';

const base: ReleaseAccessContextSlice = {
  releaseOwnerIds: [OWNER, ME],
  artistScopeByOwnerId: {},
  memberRoleByOwnerId: { [OWNER]: 'member' },
};

describe('isReleaseInScope', () => {
  it('no limit sees everything', () => {
    expect(isReleaseInScope({ ownerId: OWNER, artistId: 'a1', releaseId: 'r1' }, base)).toBe(true);
  });

  it('chosen rollouts see only those', () => {
    const access = { ...base, releaseScopeByOwnerId: { [OWNER]: ['r1'] } };
    expect(isReleaseInScope({ ownerId: OWNER, artistId: 'a1', releaseId: 'r1' }, access)).toBe(true);
    expect(isReleaseInScope({ ownerId: OWNER, artistId: 'a1', releaseId: 'r2' }, access)).toBe(false);
  });

  it('an empty list sees nothing, never everything', () => {
    const access = { ...base, releaseScopeByOwnerId: { [OWNER]: [] } };
    expect(isReleaseInScope({ ownerId: OWNER, artistId: 'a1', releaseId: 'r1' }, access)).toBe(false);
  });

  it('a rollout limit with no release id to test fails closed', () => {
    const access = { ...base, releaseScopeByOwnerId: { [OWNER]: ['r1'] } };
    expect(isReleaseInScope({ ownerId: OWNER, artistId: 'a1' }, access)).toBe(false);
  });

  it('the limit only applies in the workspace it was set in', () => {
    const access = { ...base, releaseScopeByOwnerId: { [OWNER]: ['r1'] } };
    expect(isReleaseInScope({ ownerId: 'someone-else', artistId: 'a1', releaseId: 'r9' }, access)).toBe(true);
  });

  it('the artist limit still holds', () => {
    const access = { ...base, artistScopeByOwnerId: { [OWNER]: 'a1' } };
    expect(isReleaseInScope({ ownerId: OWNER, artistId: 'a2', releaseId: 'r1' }, access)).toBe(false);
  });
});

describe('decideReleaseAccess with chosen rollouts', () => {
  const access = { ...base, releaseScopeByOwnerId: { [OWNER]: ['r1'] } };
  it('a rollout outside the list is not found, not read-only', () => {
    expect(
      decideReleaseAccess({ releaseOwnerId: OWNER, releaseArtistId: 'a1', releaseId: 'r2', userId: ME, access, write: true })
    ).toBe('not_found');
  });
  it('a rollout inside the list is allowed', () => {
    expect(
      decideReleaseAccess({ releaseOwnerId: OWNER, releaseArtistId: 'a1', releaseId: 'r1', userId: ME, access, write: true })
    ).toBe('allow');
  });
  it('the owner is never limited', () => {
    expect(
      decideReleaseAccess({ releaseOwnerId: ME, releaseArtistId: 'a1', releaseId: 'r2', userId: ME, access, write: true })
    ).toBe('allow');
  });
});

describe('dropRowsOutsideScope', () => {
  type Row = { id: string; workspace_id: string; release_id: string | null };
  const rows: Row[] = [
    { id: 't1', workspace_id: 'w1', release_id: 'r1' },
    { id: 't2', workspace_id: 'w1', release_id: 'r2' },
    { id: 't3', workspace_id: 'w1', release_id: null },
    { id: 't4', workspace_id: 'w2', release_id: 'r9' },
  ];
  const pick = (row: Row) => ({ workspaceId: row.workspace_id, releaseId: row.release_id });
  const admin = (artists: Record<string, string>) =>
    ({
      from: () => ({
        select: () => ({
          in: async (_col: string, ids: string[]) => ({
            data: ids.map((id) => ({ id, artist_id: artists[id] ?? null })),
            error: null,
          }),
        }),
      }),
    }) as never;

  it('an unlimited caller gets every row without a read', async () => {
    const out = await dropRowsOutsideScope({} as never, rows, { workspaceIds: ['w1', 'w2'], artistScopeByWorkspaceId: {}, releaseScopeByWorkspaceId: {} }, pick);
    expect(out.map((r) => r.id)).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('chosen rollouts keep only their tasks, drop tasks with no rollout, and leave other workspaces alone', async () => {
    const out = await dropRowsOutsideScope(admin({}), rows, { workspaceIds: ['w1', 'w2'], artistScopeByWorkspaceId: {}, releaseScopeByWorkspaceId: { w1: ['r1'] } }, pick);
    expect(out.map((r) => r.id)).toEqual(['t1', 't4']);
  });

  it('the artist limit now holds on task lists too (the old leak)', async () => {
    const out = await dropRowsOutsideScope(
      admin({ r1: 'a1', r2: 'a2' }),
      rows,
      { workspaceIds: ['w1', 'w2'], artistScopeByWorkspaceId: { w1: 'a1' }, releaseScopeByWorkspaceId: {} },
      pick
    );
    expect(out.map((r) => r.id)).toEqual(['t1', 't4']);
  });

  describe('project tasks (4 Nov 2026)', () => {
    type ProjectRow = { id: string; workspace_id: string; release_id: string | null; record_id: string | null };
    const projectRows: ProjectRow[] = [
      { id: 'p1', workspace_id: 'w1', release_id: null, record_id: 'rec1' },
      { id: 'p2', workspace_id: 'w1', release_id: null, record_id: 'rec2' },
      { id: 't1', workspace_id: 'w1', release_id: 'r1', record_id: null },
    ];
    const pickProject = (row: ProjectRow) => ({
      workspaceId: row.workspace_id,
      releaseId: row.release_id,
      recordId: row.record_id,
    });

    it('an artist-limited member sees their own artist projects only', async () => {
      const out = await dropRowsOutsideScope(
        admin({ r1: 'a1', rec1: 'a1', rec2: 'a2' }),
        projectRows,
        { workspaceIds: ['w1'], artistScopeByWorkspaceId: { w1: 'a1' }, releaseScopeByWorkspaceId: {} },
        pickProject
      );
      expect(out.map((r) => r.id)).toEqual(['p1', 't1']);
    });

    it('a rollout-limited member sees no project tasks', async () => {
      const out = await dropRowsOutsideScope(
        admin({ r1: 'a1', rec1: 'a1' }),
        projectRows,
        { workspaceIds: ['w1'], artistScopeByWorkspaceId: { w1: 'a1' }, releaseScopeByWorkspaceId: { w1: ['r1'] } },
        pickProject
      );
      expect(out.map((r) => r.id)).toEqual(['t1']);
    });
  });
});
