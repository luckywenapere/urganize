import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

// A directory profile is one PERSON's own record, so the person_profile branch
// of resolveActionScope has a rule no team object has: only the profile's own
// user may act on it, and everyone else gets the 404 a missing profile gets.

const getTeamAccessForUser = vi.fn();
const getWorkspaceTier = vi.fn();

vi.mock('../team-billing-server', () => ({
  getWorkspaceTier: (...args: unknown[]) => getWorkspaceTier(...args),
  getTeamAccessForUser: (...args: unknown[]) => getTeamAccessForUser(...args),
}));
vi.mock('../release-access-server', () => ({
  ensureReleaseTeamReadAccess: vi.fn(),
  ensureReleaseTeamWriteAccess: vi.fn(),
}));
vi.mock('../press-kit-access-server', () => ({ ensurePressKitAccess: vi.fn() }));

import { resolveActionScope } from './server';

const ME: User = { id: 'user-1', email: 'me@example.com' } as User;
const SOMEONE_ELSE: User = { id: 'user-2', email: 'other@example.com' } as User;

const action = { access: 'owner_write' as const, objectTypes: ['person_profile' as const] };

/** A stub that answers person_profiles with `profileOwner` and workspaces with a row. */
const admin = (profileOwner: string | null, queryError = false) =>
  ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'person_profiles') {
              return queryError
                ? { data: null, error: { message: 'boom' } }
                : { data: profileOwner === null ? null : { user_id: profileOwner }, error: null };
            }
            return { data: { id: 'own-workspace' }, error: null };
          },
        }),
      }),
    }),
  }) as never;

beforeEach(() => {
  getTeamAccessForUser.mockReset();
  getWorkspaceTier.mockReset();
  getTeamAccessForUser.mockResolvedValue({ primaryWorkspaceId: 'team-ws' });
  getWorkspaceTier.mockResolvedValue('manager');
});

describe('resolveActionScope on a person_profile', () => {
  it('admits the profile owner, on the tier of the team they actually work in', async () => {
    const result = await resolveActionScope(admin('user-1'), action, 'profile-1', ME);
    expect(result).toEqual({
      ok: true,
      scope: {
        objectType: 'person_profile',
        release: null,
        ownerUserId: 'user-1',
        workspaceId: 'team-ws',
        tier: 'manager',
      },
    });
    expect(getWorkspaceTier).toHaveBeenCalledWith('team-ws');
  });

  it('gives anyone else the same 404 a missing profile gets', async () => {
    const other = await resolveActionScope(admin('user-1'), action, 'profile-1', SOMEONE_ELSE);
    const missing = await resolveActionScope(admin(null), action, 'profile-1', ME);
    expect(other).toEqual({ ok: false, status: 404, error: 'Profile not found.' });
    expect(missing).toEqual(other);
  });

  it('refuses an unclaimed profile, which has no user to match', async () => {
    const result = await resolveActionScope(admin(''), action, 'profile-1', ME);
    expect(result.ok).toBe(false);
  });

  it('refuses on a read error rather than guessing', async () => {
    const result = await resolveActionScope(admin('user-1', true), action, 'profile-1', ME);
    expect(result.ok).toBe(false);
  });

  it('falls back to the own workspace, and fails open to label when no tier resolves', async () => {
    getTeamAccessForUser.mockResolvedValue({ primaryWorkspaceId: null });
    getWorkspaceTier.mockResolvedValue(null);
    const result = await resolveActionScope(admin('user-1'), action, 'profile-1', ME);
    expect(result.ok && result.scope.tier).toBe('label');
  });
});
