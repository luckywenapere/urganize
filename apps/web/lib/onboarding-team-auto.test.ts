import { beforeEach, describe, expect, it, vi } from 'vitest';

// #1412 (27 Nov 2026): "Set up your team" is no longer a step of sign-up. The
// team is made for the new account, named "{First name}'s Team", and who the
// team is for is asked later by the "Who are you?" card on Home. These cases
// hold the server half: what the automatic team writes, and what it must not.

const ensureOwnedWorkspace = vi.fn();
vi.mock('./tasks-server', () => ({
  ensureOwnedWorkspace: (...args: unknown[]) => ensureOwnedWorkspace(...args),
  loadProfilesByIds: vi.fn(async () => new Map()),
}));
vi.mock('./invite-claims-server', () => ({ claimWorkspaceInvite: vi.fn() }));
vi.mock('./activation-server', () => ({ captureActivationIfReached: vi.fn() }));
vi.mock('./artists-server', () => ({ ARTISTS_TABLE: 'artists', checkArtistAllowance: vi.fn() }));
vi.mock('./seats-server', () => ({ recordLimitHit: vi.fn() }));
vi.mock('./next-records-server', () => ({ addSong: vi.fn(), createRecord: vi.fn() }));
vi.mock('./access-gate-server', () => ({ escapeLike: (value: string) => value }));

import { createOnboardingTeam } from './onboarding-team-server';

type Write = { table: string; values: Record<string, unknown> };

/** Answers profile reads from `profile` and records every update. */
function fakeAdmin(profile: Record<string, unknown> | null) {
  const writes: Write[] = [];
  const admin = {
    from(table: string) {
      let values: Record<string, unknown> | null = null;
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (next: Record<string, unknown>) => {
          values = next;
          return builder;
        },
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: table === 'profiles' ? profile : null, error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          if (values) writes.push({ table, values });
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { admin: admin as never, writes };
}

const user = { id: 'u1', email: 'tunde.b@example.com' } as never;

beforeEach(() => {
  ensureOwnedWorkspace.mockReset();
  ensureOwnedWorkspace.mockResolvedValue({ id: 'w1', name: "tunde.b's Team" });
});

describe('the team made for a new account', () => {
  it('is named after their first name and asks nothing about them', async () => {
    const { admin, writes } = fakeAdmin({ onboarding_persona: null, role: 'artist-manager' });
    const result = await createOnboardingTeam(admin, user, { name: '', whoFor: null, displayName: 'Tunde Bello' });

    expect(result).toEqual({ ok: true, value: { workspaceId: 'w1', name: "Tunde's Team" } });
    expect(writes.filter((write) => write.table === 'workspaces').map((write) => write.values.name)).toEqual(["Tunde's Team"]);
    // No persona, no role, no step: Home asks "Who are you?" instead.
    expect(writes.filter((write) => write.table === 'profiles')).toEqual([]);
  });

  it('is "My Team" when Google gave no name', async () => {
    const { admin } = fakeAdmin(null);
    const result = await createOnboardingTeam(admin, user, { name: '', whoFor: null, displayName: '' });
    expect(result).toMatchObject({ ok: true, value: { name: 'My Team' } });
  });

  // An older account that never finished onboarding can own a team with a name
  // somebody chose (from its organization, or typed in Team settings) and have
  // no persona. The automatic name must not replace it.
  it('leaves a name somebody chose alone, persona or not', async () => {
    ensureOwnedWorkspace.mockResolvedValue({ id: 'w1', name: 'Northline Music' });
    for (const profile of [{ onboarding_persona: 'music_manager' }, { onboarding_persona: null }, null]) {
      const { admin, writes } = fakeAdmin(profile);
      const result = await createOnboardingTeam(admin, user, { name: '', whoFor: null, displayName: 'Tunde Bello' });
      expect(result).toEqual({ ok: true, value: { workspaceId: 'w1', name: 'Northline Music' } });
      expect(writes).toEqual([]);
    }
  });

  it('writes nothing when it runs again after a reload', async () => {
    ensureOwnedWorkspace.mockResolvedValue({ id: 'w1', name: "Tunde's Team" });
    const { admin, writes } = fakeAdmin({ onboarding_persona: null });
    const result = await createOnboardingTeam(admin, user, { name: '', whoFor: null, displayName: 'Tunde Bello' });
    expect(result).toEqual({ ok: true, value: { workspaceId: 'w1', name: "Tunde's Team" } });
    expect(writes).toEqual([]);
  });
});

describe('the team screen, where it is still used', () => {
  it('names the team and saves who it is for', async () => {
    const { admin, writes } = fakeAdmin({ onboarding_persona: null, role: 'artist-manager' });
    const result = await createOnboardingTeam(admin, user, { name: ' Northline Music ', whoFor: 'artist', displayName: 'Tunde Bello' });

    expect(result).toEqual({ ok: true, value: { workspaceId: 'w1', name: 'Northline Music' } });
    const profile = writes.find((write) => write.table === 'profiles')?.values;
    expect(profile).toMatchObject({ onboarding_persona: 'independent_artist', onboarding_step: 2, role: 'artist' });
  });
});
