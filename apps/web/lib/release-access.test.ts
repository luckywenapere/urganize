import { describe, expect, it } from 'vitest';

import {
  RELEASE_NOT_FOUND_MESSAGE,
  decideReleaseAccess,
  type ReleaseAccessContextSlice,
} from './release-access';

const OWNER = 'owner-user-id';
const ME = 'me-user-id';
const ARTIST_A = 'artist-a';
const ARTIST_B = 'artist-b';

const memberAccess = (
  overrides: Partial<ReleaseAccessContextSlice> = {}
): ReleaseAccessContextSlice => ({
  releaseOwnerIds: [ME, OWNER],
  artistScopeByOwnerId: {},
  memberRoleByOwnerId: { [ME]: 'owner', [OWNER]: 'member' },
  ...overrides,
});

const decide = (
  input: Partial<Parameters<typeof decideReleaseAccess>[0]> = {}
) =>
  decideReleaseAccess({
    releaseOwnerId: OWNER,
    releaseArtistId: ARTIST_A,
    userId: ME,
    access: memberAccess(),
    write: false,
    ...input,
  });

describe('RELEASE_NOT_FOUND_MESSAGE', () => {
  it("is the exact string every release route group answers with — and is NOT the flag-gate 'Not found.'", () => {
    expect(RELEASE_NOT_FOUND_MESSAGE).toBe('Rollout not found.');
    expect(RELEASE_NOT_FOUND_MESSAGE).not.toBe('Not found.');
  });
});

describe('decideReleaseAccess', () => {
  it('allows the owner to read', () => {
    expect(decide({ releaseOwnerId: ME })).toBe('allow');
  });

  it('allows the owner to write even with an EMPTY role map (a corrupted owner-membership row must never lock an owner out)', () => {
    expect(
      decide({
        releaseOwnerId: ME,
        write: true,
        access: memberAccess({ memberRoleByOwnerId: {}, releaseOwnerIds: [] }),
      })
    ).toBe('allow');
  });

  it('allows a member of the owner workspace to read', () => {
    expect(decide()).toBe('allow');
  });

  it("allows 'member', 'admin', and a non-owner holding 'owner' role in someone else's workspace to write", () => {
    for (const role of ['member', 'admin', 'owner']) {
      expect(
        decide({
          write: true,
          access: memberAccess({ memberRoleByOwnerId: { [OWNER]: role } }),
        })
      ).toBe('allow');
    }
  });

  it('refuses a non-member read as not_found', () => {
    expect(
      decide({ access: memberAccess({ releaseOwnerIds: [ME] }) })
    ).toBe('not_found');
  });

  it('refuses a non-member WRITE as not_found, never read_only — a probe must not learn the release exists', () => {
    expect(
      decide({
        write: true,
        // Even with a (stale) role entry present, visibility decides first.
        access: memberAccess({
          releaseOwnerIds: [ME],
          memberRoleByOwnerId: { [OWNER]: 'guest' },
        }),
      })
    ).toBe('not_found');
  });

  it("refuses an artist-scoped member on the wrong artist's release — read and write alike", () => {
    const access = memberAccess({
      artistScopeByOwnerId: { [OWNER]: ARTIST_B },
    });
    expect(decide({ access })).toBe('not_found');
    expect(decide({ access, write: true })).toBe('not_found');
  });

  it('allows an artist-scoped member on the matching artist', () => {
    expect(
      decide({
        access: memberAccess({ artistScopeByOwnerId: { [OWNER]: ARTIST_A } }),
      })
    ).toBe('allow');
  });

  it('allows a guest to read (guests see the whole workspace)', () => {
    expect(
      decide({
        access: memberAccess({ memberRoleByOwnerId: { [OWNER]: 'guest' } }),
      })
    ).toBe('allow');
  });

  it('refuses a guest write as read_only', () => {
    expect(
      decide({
        write: true,
        access: memberAccess({ memberRoleByOwnerId: { [OWNER]: 'guest' } }),
      })
    ).toBe('read_only');
  });

  it('treats a visible member with NO role entry as read-only for writes (fail closed, the isReadOnlyWorkspaceMember rule)', () => {
    expect(
      decide({
        write: true,
        access: memberAccess({ memberRoleByOwnerId: {} }),
      })
    ).toBe('read_only');
  });

  it('an empty-string artist scope value is inert', () => {
    expect(
      decide({
        access: memberAccess({ artistScopeByOwnerId: { [OWNER]: '' } }),
      })
    ).toBe('allow');
  });

  it('the empty context (a curator account) resolves not_found for read and write', () => {
    const empty: ReleaseAccessContextSlice = {
      releaseOwnerIds: [],
      artistScopeByOwnerId: {},
      memberRoleByOwnerId: {},
    };
    expect(decide({ access: empty })).toBe('not_found');
    expect(decide({ access: empty, write: true })).toBe('not_found');
  });

  it('empty owner/user ids never spuriously allow', () => {
    // '' === '' must not take the owner fast path.
    expect(
      decide({
        releaseOwnerId: '',
        userId: '',
        access: memberAccess({ releaseOwnerIds: [''] }),
      })
    ).toBe('not_found');
  });
});
