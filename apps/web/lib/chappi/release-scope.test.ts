/**
 * Phase 0: the assistant must resolve releases the way the rest of the app
 * does, and must never widen the owner set without carrying the artist scope
 * alongside it.
 *
 * These run offline. They do not prove the DATABASE honours the scope — that is
 * release-scope.integration.test.ts, which needs a real project. What they prove
 * is the thing that was actually broken and the thing that could break next:
 * which arguments each surface hands to ReleaseService. The filter itself is
 * ReleaseService's, already shared with /api/releases and exercised in
 * production; the defect was never the filter, it was two callers not passing
 * it anything.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseService } from '@/lib/services/release-service';
import { TaskService } from '@/lib/services/task-service';
import { listOwnedReleases, listVisibleReleases, resolveVisibleOwnerIds } from './release-scope';
import { buildChappiSystemPrompt } from './system-prompt';
import { getChappiTool } from './tools';
import type { ChappiToolContext } from './tools';

const OWNER = 'owner-1';
const TEAMMATE = 'teammate-1';
const ARTIST_SCOPE = { 'owner-1': 'artist-9' };
const RELEASE_SCOPE = { 'owner-1': ['release-3'] };

function makeCtx(overrides: Partial<ChappiToolContext> = {}): ChappiToolContext {
  return {
    user: { id: TEAMMATE, email: 't@example.com' },
    adminClient: {} as never,
    // Empty on purpose: buildChappiSystemPrompt only calls TaskService when
    // this is non-empty, so leaving it empty keeps these cases about releases.
    workspaceIds: [],
    releaseOwnerIds: [OWNER, TEAMMATE],
    artistScopeByOwnerId: ARTIST_SCOPE,
    artistScopeByWorkspaceId: {},
    releaseScopeByOwnerId: RELEASE_SCOPE,
    releaseScopeByWorkspaceId: {},
    origin: 'http://localhost:3000',
    authToken: 'token',
    ...overrides,
  };
}

describe('resolveVisibleOwnerIds', () => {
  it('uses the workspace owner set when there is one', () => {
    expect(resolveVisibleOwnerIds(TEAMMATE, [OWNER, TEAMMATE])).toEqual([OWNER, TEAMMATE]);
  });

  // `.in('owner_user_id', [])` matches NOTHING, so an empty set must not reach
  // the query — a user with no resolved memberships still owns their own work.
  it('falls back to the caller alone rather than an empty set', () => {
    expect(resolveVisibleOwnerIds(TEAMMATE, [])).toEqual([TEAMMATE]);
    expect(resolveVisibleOwnerIds(TEAMMATE, null)).toEqual([TEAMMATE]);
    expect(resolveVisibleOwnerIds(TEAMMATE, undefined)).toEqual([TEAMMATE]);
  });

  it('drops empties and duplicates', () => {
    expect(resolveVisibleOwnerIds(TEAMMATE, [OWNER, '', OWNER, TEAMMATE])).toEqual([
      OWNER,
      TEAMMATE,
    ]);
  });
});

describe('every assistant surface resolves releases the same way', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    spy = vi
      .spyOn(ReleaseService.prototype, 'getReleasesForUser')
      .mockResolvedValue([] as never);
    vi.spyOn(TaskService.prototype, 'getTasksForUser').mockResolvedValue([] as never);
  });

  it('listVisibleReleases passes the owner set AND the artist scope', async () => {
    await listVisibleReleases(makeCtx());
    expect(spy).toHaveBeenCalledWith(TEAMMATE, [OWNER, TEAMMATE], ARTIST_SCOPE, RELEASE_SCOPE);
  });

  it('the system prompt snapshot passes both', async () => {
    await buildChappiSystemPrompt(makeCtx());
    expect(spy).toHaveBeenCalledWith(TEAMMATE, [OWNER, TEAMMATE], ARTIST_SCOPE, RELEASE_SCOPE);
  });

  // The self-inconsistency that started this: the snapshot said "no releases"
  // while list_tasks returned the team's tasks. Both release surfaces must now
  // ask the identical question.
  it.each(['list_releases', 'get_release', 'get_dashboard'])(
    '%s passes both',
    async (toolName) => {
      const tool = getChappiTool(toolName);
      expect(tool, `${toolName} should exist`).toBeTruthy();
      await tool!.execute(makeCtx(), { releaseId: 'rel-1' });
      expect(spy).toHaveBeenCalledWith(TEAMMATE, [OWNER, TEAMMATE], ARTIST_SCOPE, RELEASE_SCOPE);
    }
  );

  // THE LEAK THIS FIX COULD INTRODUCE. Widening the owner set without the scope
  // map hands an artist the manager's whole roster inside the system prompt,
  // with no UI anywhere that would show it happened.
  it('never widens the owner set without the artist scope', async () => {
    await listVisibleReleases(makeCtx());
    await buildChappiSystemPrompt(makeCtx());
    for (const call of spy.mock.calls) {
      const [, owners, scope] = call as [string, string[] | undefined, unknown];
      if ((owners || []).length > 1) {
        expect(scope, 'a widened owner set must carry the artist scope').toBeDefined();
      }
    }
  });
});

describe('delete_release stays owner-only', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // DELETE /api/releases/[releaseId] runs ensureReleaseOwnership against the
  // caller alone. Widening this would show a teammate a confirmation card for a
  // deletion that 403s the moment they approve it — worse than the honest
  // refusal they get today. If this test fails because someone "made it
  // consistent", the route is what has to change first.
  it('resolves releases without the team owner set', async () => {
    const spy = vi
      .spyOn(ReleaseService.prototype, 'getReleasesForUser')
      .mockResolvedValue([] as never);

    await listOwnedReleases(makeCtx());
    expect(spy).toHaveBeenCalledWith(TEAMMATE);

    spy.mockClear();
    const tool = getChappiTool('delete_release');
    expect(tool?.confirm, 'delete_release must stay confirmation-gated').toBeTruthy();
    await tool!.confirm!(makeCtx(), { releaseId: 'rel-1' });
    expect(spy).toHaveBeenCalledWith(TEAMMATE);
  });
});
