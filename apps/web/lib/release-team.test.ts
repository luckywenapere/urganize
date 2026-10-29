import { describe, expect, it } from 'vitest';
import { resolveReleaseTeam } from './release-team';

const ME = 'user-me';
const OWNER = 'user-owner';
const owners = { own: ME, joined: OWNER };

describe('which team a new rollout belongs to', () => {
  it('a Manager who joined a team adds to that team, not their own empty one', () => {
    expect(
      resolveReleaseTeam({
        userId: ME,
        requestedWorkspaceId: 'joined',
        memberships: [
          { workspaceId: 'own', role: 'owner' },
          { workspaceId: 'joined', role: 'admin' },
        ],
        primaryWorkspaceId: 'own',
        ownerByWorkspaceId: owners,
      })
    ).toEqual({ kind: 'team', workspaceId: 'joined' });
  });

  it('with no team named, the primary team decides (a joined team for an invitee)', () => {
    expect(
      resolveReleaseTeam({
        userId: ME,
        requestedWorkspaceId: null,
        memberships: [
          { workspaceId: 'own', role: 'owner' },
          { workspaceId: 'joined', role: 'member' },
        ],
        primaryWorkspaceId: 'joined',
        ownerByWorkspaceId: owners,
      })
    ).toEqual({ kind: 'team', workspaceId: 'joined' });
  });

  it('an owner in their own team takes the old path', () => {
    expect(
      resolveReleaseTeam({
        userId: ME,
        requestedWorkspaceId: 'own',
        memberships: [{ workspaceId: 'own', role: 'owner' }],
        primaryWorkspaceId: 'own',
        ownerByWorkspaceId: owners,
      })
    ).toEqual({ kind: 'own' });
    expect(
      resolveReleaseTeam({
        userId: ME,
        requestedWorkspaceId: null,
        memberships: [{ workspaceId: 'own', role: 'owner' }],
        primaryWorkspaceId: 'own',
        ownerByWorkspaceId: owners,
      })
    ).toEqual({ kind: 'own' });
  });

  it('refuses a team the caller is not in', () => {
    expect(
      resolveReleaseTeam({
        userId: ME,
        requestedWorkspaceId: 'stranger',
        memberships: [{ workspaceId: 'own', role: 'owner' }],
        primaryWorkspaceId: 'own',
        ownerByWorkspaceId: owners,
      })
    ).toEqual({ kind: 'refused', status: 404, message: 'Team not found.' });
  });

  it('a viewer cannot add to the team; by default they keep their own', () => {
    const memberships = [
      { workspaceId: 'own', role: 'owner' },
      { workspaceId: 'joined', role: 'guest' },
    ];
    expect(
      resolveReleaseTeam({ userId: ME, requestedWorkspaceId: 'joined', memberships, primaryWorkspaceId: 'joined', ownerByWorkspaceId: owners })
    ).toEqual({ kind: 'refused', status: 403, message: 'Your role on this team is view-only.' });
    expect(
      resolveReleaseTeam({ userId: ME, requestedWorkspaceId: null, memberships, primaryWorkspaceId: 'joined', ownerByWorkspaceId: owners })
    ).toEqual({ kind: 'own' });
  });

  it('no team resolved at all keeps the old path', () => {
    expect(
      resolveReleaseTeam({ userId: ME, requestedWorkspaceId: null, memberships: [], primaryWorkspaceId: null, ownerByWorkspaceId: {} })
    ).toEqual({ kind: 'own' });
  });
});
