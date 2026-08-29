import { describe, expect, it } from 'vitest';
import {
  PENDING_INVITE_METADATA_KEY,
  readPendingInviteToken,
  resolveLegacyInviteClaim,
} from './invite-claims-server';

// The DB-touching halves (claimWorkspaceInvite, claimPendingWorkspaceInvite)
// follow this repo's convention: pure decisions are what get unit tests, the
// query plumbing is exercised by the routes it was extracted from. These two
// functions ARE the decisions — the metadata reader guards a hot path that
// runs on every workspace-aware request, and the legacy-claim resolver
// encodes the accept route's long-standing ordering rules.

describe('readPendingInviteToken', () => {
  const withMetadata = (metadata: unknown) =>
    readPendingInviteToken({ user_metadata: metadata as Record<string, unknown> });

  it('returns the trimmed token when present', () => {
    expect(withMetadata({ [PENDING_INVITE_METADATA_KEY]: '  abc123DEF  ' })).toBe('abc123DEF');
  });

  it('returns null when the key is absent — the steady state, which must cost nothing', () => {
    expect(withMetadata({ name: 'Someone', role: 'artist-team' })).toBeNull();
  });

  it('returns null for missing or non-object metadata', () => {
    expect(withMetadata(undefined)).toBeNull();
    expect(withMetadata(null)).toBeNull();
    expect(withMetadata('pending_invite_token=abc')).toBeNull();
  });

  it('returns null for non-string values — user_metadata is user-writable, so every shape arrives eventually', () => {
    expect(withMetadata({ [PENDING_INVITE_METADATA_KEY]: 42 })).toBeNull();
    expect(withMetadata({ [PENDING_INVITE_METADATA_KEY]: { token: 'abc' } })).toBeNull();
    expect(withMetadata({ [PENDING_INVITE_METADATA_KEY]: ['abc'] })).toBeNull();
    expect(withMetadata({ [PENDING_INVITE_METADATA_KEY]: null })).toBeNull();
  });

  it('returns null for empty or whitespace-only strings', () => {
    expect(withMetadata({ [PENDING_INVITE_METADATA_KEY]: '' })).toBeNull();
    expect(withMetadata({ [PENDING_INVITE_METADATA_KEY]: '   ' })).toBeNull();
  });

  it('drops implausibly long values instead of querying with them', () => {
    expect(withMetadata({ [PENDING_INVITE_METADATA_KEY]: 'x'.repeat(513) })).toBeNull();
    // A real wl.* token (~200 chars) stays comfortably inside the cap.
    expect(withMetadata({ [PENDING_INVITE_METADATA_KEY]: 'x'.repeat(512) })).toBe('x'.repeat(512));
  });
});

describe('resolveLegacyInviteClaim', () => {
  const NOW = Date.parse('2026-08-29T12:00:00Z');
  const baseRow = {
    id: 'row-1',
    workspace_id: 'ws-1',
    user_id: null as string | null,
    status: 'invited',
    invite_expires_at: null as string | null,
    joined_at: null as string | null,
  };

  it('claims a pending, unexpired row', () => {
    expect(resolveLegacyInviteClaim(baseRow, 'user-1', NOW)).toEqual({ action: 'claim' });
  });

  it('claims a pending row with no expiry at all', () => {
    expect(
      resolveLegacyInviteClaim({ ...baseRow, invite_expires_at: null }, 'user-1', NOW)
    ).toEqual({ action: 'claim' });
  });

  it('is idempotent for the user who already accepted it', () => {
    expect(
      resolveLegacyInviteClaim({ ...baseRow, status: 'active', user_id: 'user-1' }, 'user-1', NOW)
    ).toEqual({ action: 'already_member' });
  });

  it('rejects a row already accepted by someone else', () => {
    expect(
      resolveLegacyInviteClaim({ ...baseRow, status: 'active', user_id: 'user-2' }, 'user-1', NOW)
    ).toEqual({ action: 'reject', reason: 'already_used' });
  });

  it('treats a bound user_id as accepted even when status is not active', () => {
    // Mirrors the route's `invite.status === 'active' || invite.user_id`
    // guard — a row someone holds is used, whatever its status string says.
    expect(
      resolveLegacyInviteClaim({ ...baseRow, user_id: 'user-2' }, 'user-1', NOW)
    ).toEqual({ action: 'reject', reason: 'already_used' });
  });

  it('rejects an expired pending row', () => {
    expect(
      resolveLegacyInviteClaim(
        { ...baseRow, invite_expires_at: '2026-08-29T11:59:59Z' },
        'user-1',
        NOW
      )
    ).toEqual({ action: 'reject', reason: 'expired' });
  });

  it('treats an expiry of exactly now as expired', () => {
    expect(
      resolveLegacyInviteClaim(
        { ...baseRow, invite_expires_at: '2026-08-29T12:00:00Z' },
        'user-1',
        NOW
      )
    ).toEqual({ action: 'reject', reason: 'expired' });
  });

  it('claims when the expiry is in the future', () => {
    expect(
      resolveLegacyInviteClaim(
        { ...baseRow, invite_expires_at: '2026-08-29T12:00:01Z' },
        'user-1',
        NOW
      )
    ).toEqual({ action: 'claim' });
  });

  it('claims when the expiry string is unparseable — matches the route, which only enforces dates it can read', () => {
    expect(
      resolveLegacyInviteClaim({ ...baseRow, invite_expires_at: 'not-a-date' }, 'user-1', NOW)
    ).toEqual({ action: 'claim' });
  });

  it('answers "used" before "expired" — an invite you already used is used, not expired', () => {
    expect(
      resolveLegacyInviteClaim(
        {
          ...baseRow,
          status: 'active',
          user_id: 'user-2',
          invite_expires_at: '2020-01-01T00:00:00Z',
        },
        'user-1',
        NOW
      )
    ).toEqual({ action: 'reject', reason: 'already_used' });
  });

  it('answers "already_member" before "expired" for the original acceptor', () => {
    expect(
      resolveLegacyInviteClaim(
        {
          ...baseRow,
          status: 'active',
          user_id: 'user-1',
          invite_expires_at: '2020-01-01T00:00:00Z',
        },
        'user-1',
        NOW
      )
    ).toEqual({ action: 'already_member' });
  });
});
