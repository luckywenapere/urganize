import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

// Pins the fix made mid-build: release.draft_plan's access level had to move
// from 'team_write' to 'owner_write' because the legacy /plan/* route group
// (release_plan_drafts, GET/PUT/DELETE plan, approve, regenerate-phase) is
// still owner-keyed in eight places — a deliberate, recorded deferral (see
// lib/release-access-guard.test.ts's own header). A team-write teammate could
// have tapped "Draft the plan", cleared the entitlement gate, and then hit a
// 404 loading the very draft they just created. This test exercises
// resolveActionScope's branching directly rather than through a route, since
// every route already goes through this one function.
//
// Both access-check functions are mocked rather than exercised for real
// (they need a live Supabase client) — what is under test here is which one
// resolveActionScope calls for each access level, and what it does with the
// answer, not the access-check logic itself (that lives in
// lib/release-access-server.ts and lib/release-access.ts, both already
// covered by lib/release-access-guard.test.ts and lib/release-access.test.ts).

const ensureReleaseTeamReadAccess = vi.fn();
const ensureReleaseTeamWriteAccess = vi.fn();

vi.mock('../release-access-server', () => ({
  ensureReleaseTeamReadAccess: (...args: unknown[]) => ensureReleaseTeamReadAccess(...args),
  ensureReleaseTeamWriteAccess: (...args: unknown[]) => ensureReleaseTeamWriteAccess(...args),
}));

vi.mock('../team-billing-server', () => ({
  getWorkspaceTier: vi.fn(async () => 'label'),
}));

import { resolveActionScope } from './server';

const OWNER: User = { id: 'owner-1', email: 'owner@example.com' } as User;
const TEAMMATE: User = { id: 'teammate-1', email: 'teammate@example.com' } as User;

// findOwnedWorkspaceId's own query — a chainable stub returning no row is
// enough; tier resolution is mocked above and not what this file is testing.
const fakeAdmin = () =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }) as never;

const readOk = (ownerUserId: string) => ({ release: { ownerUserId } }) as never;
const writeOk = (ownerUserId: string) => ({ release: { ownerUserId } }) as never;
const refused = (status: number, message: string) =>
  ({ error: { status, json: async () => ({ error: message }) } }) as never;

// mockReset (not mockClear) between every test: it also drains any queued
// mockResolvedValueOnce values, which mockClear leaves in place — a leftover
// queued value from one test silently answering a later test's call is
// exactly the kind of false pass this file exists to avoid.
beforeEach(() => {
  ensureReleaseTeamReadAccess.mockReset();
  ensureReleaseTeamWriteAccess.mockReset();
});

describe('resolveActionScope', () => {
  it("'team_write' resolves through write access, never read", async () => {
    ensureReleaseTeamWriteAccess.mockResolvedValueOnce(writeOk(OWNER.id));

    const result = await resolveActionScope(fakeAdmin(), { access: 'team_write', objectTypes: ['release'] }, 'release-1', TEAMMATE);

    expect(result.ok).toBe(true);
    expect(ensureReleaseTeamWriteAccess).toHaveBeenCalledTimes(1);
    expect(ensureReleaseTeamReadAccess).not.toHaveBeenCalled();
  });

  it("'team_read' resolves through read access, never write", async () => {
    ensureReleaseTeamReadAccess.mockResolvedValueOnce(readOk(OWNER.id));

    const result = await resolveActionScope(fakeAdmin(), { access: 'team_read', objectTypes: ['release'] }, 'release-1', TEAMMATE);

    expect(result.ok).toBe(true);
    expect(ensureReleaseTeamReadAccess).toHaveBeenCalledTimes(1);
    expect(ensureReleaseTeamWriteAccess).not.toHaveBeenCalled();
  });

  it("'owner_write' resolves through read access too — write access is never consulted", async () => {
    ensureReleaseTeamReadAccess.mockResolvedValueOnce(readOk(OWNER.id));

    await resolveActionScope(fakeAdmin(), { access: 'owner_write', objectTypes: ['release'] }, 'release-1', OWNER);

    expect(ensureReleaseTeamReadAccess).toHaveBeenCalledTimes(1);
    expect(ensureReleaseTeamWriteAccess).not.toHaveBeenCalled();
  });

  it("'owner_write' succeeds when the caller IS the release owner", async () => {
    ensureReleaseTeamReadAccess.mockResolvedValueOnce(readOk(OWNER.id));

    const result = await resolveActionScope(fakeAdmin(), { access: 'owner_write', objectTypes: ['release'] }, 'release-1', OWNER);

    expect(result).toMatchObject({ ok: true });
  });

  // The fix itself: a visible-but-non-owner team member must get the SAME
  // 404 a stranger would — never a 403, which would confirm the release
  // exists and that they merely lack permission on it.
  it("'owner_write' refuses a visible non-owner teammate with a plain 404, not a 403", async () => {
    ensureReleaseTeamReadAccess.mockResolvedValueOnce(readOk(OWNER.id));

    const result = await resolveActionScope(fakeAdmin(), { access: 'owner_write', objectTypes: ['release'] }, 'release-1', TEAMMATE);

    expect(result).toEqual({ ok: false, status: 404, error: 'Release not found.' });
  });

  it("a non-member gets the visibility check's own refusal untouched, for every access level", async () => {
    for (const access of ['team_write', 'team_read', 'owner_write'] as const) {
      ensureReleaseTeamReadAccess.mockReset();
      ensureReleaseTeamWriteAccess.mockReset();
      const check = access === 'team_write' ? ensureReleaseTeamWriteAccess : ensureReleaseTeamReadAccess;
      check.mockResolvedValueOnce(refused(404, 'Release not found.'));

      const result = await resolveActionScope(
        fakeAdmin(),
        { access, objectTypes: ['release'] },
        'release-1',
        TEAMMATE
      );

      expect(result).toEqual({ ok: false, status: 404, error: 'Release not found.' });
    }
  });

  // Mutation guard: this is the branch the fix actually added. Deleting the
  // ownership check (or comparing the wrong id) must fail this exact
  // expectation, not just the "succeeds for the owner" test above — a bug
  // that always resolves true would still pass that one alone.
  it('mutation guard: the ownership compare is the only thing standing between team_write-shaped access and owner_write', async () => {
    ensureReleaseTeamReadAccess.mockImplementation(async () => readOk(OWNER.id));

    const asOwner = await resolveActionScope(fakeAdmin(), { access: 'owner_write', objectTypes: ['release'] }, 'release-1', OWNER);
    const asTeammate = await resolveActionScope(fakeAdmin(), { access: 'owner_write', objectTypes: ['release'] }, 'release-1', TEAMMATE);

    expect(asOwner.ok).toBe(true);
    expect(asTeammate.ok).toBe(false);
  });
});
