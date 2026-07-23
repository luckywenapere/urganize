import { createHmac } from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  INVITE_LINK_TTL_DAYS,
  isInviteLinkToken,
  mintInviteLinkToken,
  verifyInviteLinkToken,
} from './invite-link';

// The helper signs with the service-role key; tests run with a fixed value.
beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key-for-invite-links';
});

describe('invite-link tokens', () => {
  it('mint → verify roundtrip resolves the workspace', () => {
    const { token, expiresAt } = mintInviteLinkToken('ws-123');
    expect(isInviteLinkToken(token)).toBe(true);
    const verdict = verifyInviteLinkToken(token);
    expect(verdict).toEqual({
      status: 'valid',
      workspaceId: 'ws-123',
      role: 'member',
      artistScopeId: null,
    });
    const msLeft = Date.parse(expiresAt) - Date.now();
    expect(msLeft).toBeGreaterThan((INVITE_LINK_TTL_DAYS - 1) * 24 * 60 * 60 * 1000);
    expect(msLeft).toBeLessThanOrEqual(INVITE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
  });

  it('carries the artist scope for artist links', () => {
    const { token } = mintInviteLinkToken('ws-123', 'artist-9');
    expect(verifyInviteLinkToken(token)).toEqual({
      status: 'valid',
      workspaceId: 'ws-123',
      role: 'member',
      artistScopeId: 'artist-9',
    });
  });

  it('rejects a tampered payload (workspace swap)', () => {
    const { token } = mintInviteLinkToken('ws-123');
    const [prefix, , sig] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ w: 'ws-ATTACKER', r: 'member', exp: Math.floor(Date.now() / 1000) + 999999 }),
      'utf8'
    ).toString('base64url');
    expect(verifyInviteLinkToken(`${prefix}.${forgedPayload}.${sig}`)).toEqual({
      status: 'invalid',
    });
  });

  it('rejects a tampered signature', () => {
    const { token } = mintInviteLinkToken('ws-123');
    const flipped = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA');
    expect(verifyInviteLinkToken(flipped)).toEqual({ status: 'invalid' });
  });

  it('reports expiry (not invalid) for a correctly-signed stale token', () => {
    // Mint with a past expiry by signing manually through the public API:
    // easiest is to freeze a token whose exp already passed — rebuild one
    // using the same code path via a negative TTL simulation.
    const { token } = mintInviteLinkToken('ws-123');
    const [prefix, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      w: string;
      r: string;
      exp: number;
    };
    payload.exp = Math.floor(Date.now() / 1000) - 60;
    const staleB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    // Re-sign the stale payload with the real secret — mirrors
    // lib/invite-link.ts's sign() exactly.
    const sig = createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY as string)
      .update(`${prefix}.${staleB64}`)
      .digest('base64url');
    expect(verifyInviteLinkToken(`${prefix}.${staleB64}.${sig}`)).toEqual({ status: 'expired' });
  });

  it('rejects garbage tokens', () => {
    expect(verifyInviteLinkToken('')).toEqual({ status: 'invalid' });
    expect(verifyInviteLinkToken('wl.notbase64')).toEqual({ status: 'invalid' });
    expect(verifyInviteLinkToken('xx.a.b')).toEqual({ status: 'invalid' });
    expect(isInviteLinkToken('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });
});
