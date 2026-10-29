import { describe, expect, it } from 'vitest';
import { RELEASE_TEAM_MESSAGES, canPlanRelease, resolveReleaseTeam } from './release-team';

const ME = 'user-me';
const OWNER = 'user-owner';
const owners = { own: ME, joined: OWNER, other: 'user-other' };

const base = {
  userId: ME,
  requestedWorkspaceId: null as string | null,
  primaryWorkspaceId: 'own' as string | null,
  ownerByWorkspaceId: owners,
};

describe('which team a new rollout belongs to', () => {
  it('a Manager who joined a team adds to that team, not their own empty one', () => {
    expect(
      resolveReleaseTeam({
        ...base,
        requestedWorkspaceId: 'joined',
        memberships: [
          { workspaceId: 'own', role: 'owner' },
          { workspaceId: 'joined', role: 'admin', status: 'active' },
        ],
      })
    ).toEqual({ kind: 'team', workspaceId: 'joined' });
  });

  it('with no team named, a Manager whose primary team is the joined one adds there', () => {
    expect(
      resolveReleaseTeam({
        ...base,
        primaryWorkspaceId: 'joined',
        memberships: [
          { workspaceId: 'own', role: 'owner' },
          { workspaceId: 'joined', role: 'admin' },
        ],
      })
    ).toEqual({ kind: 'team', workspaceId: 'joined' });
  });

  it('a team member keeps the old path in the app, and is refused when they name the team', () => {
    const memberships = [
      { workspaceId: 'own', role: 'owner' },
      { workspaceId: 'joined', role: 'member' },
    ];
    expect(resolveReleaseTeam({ ...base, primaryWorkspaceId: 'joined', memberships })).toEqual({ kind: 'own' });
    expect(resolveReleaseTeam({ ...base, requestedWorkspaceId: 'joined', memberships })).toEqual({
      kind: 'refused',
      status: 403,
      message: RELEASE_TEAM_MESSAGES.managersOnly,
    });
  });

  it('a viewer cannot add to the team; by default they keep their own', () => {
    const memberships = [
      { workspaceId: 'own', role: 'owner' },
      { workspaceId: 'joined', role: 'guest' },
    ];
    expect(resolveReleaseTeam({ ...base, requestedWorkspaceId: 'joined', memberships })).toEqual({
      kind: 'refused',
      status: 403,
      message: RELEASE_TEAM_MESSAGES.viewOnly,
    });
    expect(resolveReleaseTeam({ ...base, primaryWorkspaceId: 'joined', memberships })).toEqual({ kind: 'own' });
  });

  it('an invite not yet accepted grants nothing', () => {
    const memberships = [
      { workspaceId: 'own', role: 'owner' },
      { workspaceId: 'joined', role: 'admin', status: 'invited' },
    ];
    expect(resolveReleaseTeam({ ...base, requestedWorkspaceId: 'joined', memberships })).toEqual({
      kind: 'refused',
      status: 404,
      message: RELEASE_TEAM_MESSAGES.notFound,
    });
    expect(resolveReleaseTeam({ ...base, primaryWorkspaceId: 'joined', memberships })).toEqual({ kind: 'own' });
  });

  it('an owner in their own team takes the old path', () => {
    const memberships = [{ workspaceId: 'own', role: 'owner' }];
    expect(resolveReleaseTeam({ ...base, requestedWorkspaceId: 'own', memberships })).toEqual({ kind: 'own' });
    expect(resolveReleaseTeam({ ...base, memberships })).toEqual({ kind: 'own' });
  });

  it('refuses a team the caller is not in', () => {
    expect(
      resolveReleaseTeam({ ...base, requestedWorkspaceId: 'other', memberships: [{ workspaceId: 'own', role: 'owner' }] })
    ).toEqual({ kind: 'refused', status: 404, message: RELEASE_TEAM_MESSAGES.notFound });
  });

  it("a picked artist decides the team when none is named (an owner's artist on their own page)", () => {
    const memberships = [
      { workspaceId: 'own', role: 'owner' },
      { workspaceId: 'joined', role: 'admin' },
    ];
    // Primary is the joined team, but the artist is in their own team.
    expect(
      resolveReleaseTeam({ ...base, primaryWorkspaceId: 'joined', artistWorkspaceId: 'own', artistId: 'a1', memberships })
    ).toEqual({ kind: 'own' });
    // Primary is their own team, but the artist is the joined team's.
    expect(resolveReleaseTeam({ ...base, artistWorkspaceId: 'joined', artistId: 'a2', memberships })).toEqual({
      kind: 'team',
      workspaceId: 'joined',
    });
  });

  it('refuses an artist from a different team than the one named', () => {
    expect(
      resolveReleaseTeam({
        ...base,
        requestedWorkspaceId: 'joined',
        artistWorkspaceId: 'own',
        artistId: 'a1',
        memberships: [
          { workspaceId: 'own', role: 'owner' },
          { workspaceId: 'joined', role: 'admin' },
        ],
      })
    ).toEqual({ kind: 'refused', status: 400, message: RELEASE_TEAM_MESSAGES.otherTeamArtist });
  });

  it('a Manager scoped to one artist adds only for that artist', () => {
    const memberships = [
      { workspaceId: 'own', role: 'owner' },
      { workspaceId: 'joined', role: 'admin' },
    ];
    const artistScopeByWorkspaceId = { joined: 'scoped-artist' };
    expect(resolveReleaseTeam({ ...base, requestedWorkspaceId: 'joined', memberships, artistScopeByWorkspaceId })).toEqual({
      kind: 'team',
      workspaceId: 'joined',
      artistId: 'scoped-artist',
    });
    expect(
      resolveReleaseTeam({
        ...base,
        requestedWorkspaceId: 'joined',
        artistWorkspaceId: 'joined',
        artistId: 'someone-else',
        memberships,
        artistScopeByWorkspaceId,
      })
    ).toEqual({ kind: 'refused', status: 403, message: RELEASE_TEAM_MESSAGES.scoped });
  });

  it('no team resolved at all keeps the old path', () => {
    expect(
      resolveReleaseTeam({ ...base, primaryWorkspaceId: null, memberships: [], ownerByWorkspaceId: {} })
    ).toEqual({ kind: 'own' });
  });
});

describe('who may plan a rollout', () => {
  it('the owner, as before', () => {
    expect(canPlanRelease({ userId: ME, releaseOwnerId: ME, membershipInOwnersTeam: null })).toBe(true);
  });
  it("a Manager of the owner's team", () => {
    expect(canPlanRelease({ userId: ME, releaseOwnerId: OWNER, membershipInOwnersTeam: { role: 'admin', status: 'active' } })).toBe(true);
  });
  it('not a team member, a Viewer, an unaccepted invite or a stranger', () => {
    expect(canPlanRelease({ userId: ME, releaseOwnerId: OWNER, membershipInOwnersTeam: { role: 'member' } })).toBe(false);
    expect(canPlanRelease({ userId: ME, releaseOwnerId: OWNER, membershipInOwnersTeam: { role: 'guest' } })).toBe(false);
    expect(canPlanRelease({ userId: ME, releaseOwnerId: OWNER, membershipInOwnersTeam: { role: 'admin', status: 'invited' } })).toBe(false);
    expect(canPlanRelease({ userId: ME, releaseOwnerId: OWNER, membershipInOwnersTeam: null })).toBe(false);
    expect(canPlanRelease({ userId: ME, releaseOwnerId: '', membershipInOwnersTeam: { role: 'admin' } })).toBe(false);
  });
});
