// SERVER ONLY — imports node:crypto; never import from client components.
//
// Stateless workspace invite LINKS (founder request, 2026-07-23): the
// Linear-style "anyone with this link joins the team" flow, for when the
// manager doesn't have the person's email. Unlike the per-email invites in
// workspace_members (single-use, row-backed), a link token is SELF-CONTAINED:
// `wl.<base64url payload>.<hmac>` where the payload carries the workspace id
// and an expiry, signed with a server secret. No schema change, multi-use
// until expiry, and tamper-proof — changing the workspace id or expiry
// invalidates the signature.
//
// Trade-off accepted for v1: a link can't be revoked before its expiry
// (there's no stored state to delete). The 7-day lifetime bounds that; a
// revocable link needs a workspaces column and can layer on later.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const INVITE_LINK_TTL_DAYS = 7;
const TOKEN_PREFIX = 'wl';

// The service-role key doubles as the HMAC secret: it's already required
// server-side, never shipped to clients, and rotating it invalidates
// outstanding links — which is the correct behavior on a key rotation.
function getSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
}

type InviteLinkPayload = {
  /** Workspace the link admits into. */
  w: string;
  /** Role granted on join — always 'member' in v1. */
  r: 'member';
  /** Optional artist scope: the joiner only sees this artist's releases. */
  a?: string;
  /** Expiry, epoch seconds. */
  exp: number;
};

const b64url = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');
const fromB64url = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(`${TOKEN_PREFIX}.${encodedPayload}`).digest('base64url');
}

export function isInviteLinkToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`);
}

// ── Short join codes (founder request, 2026-07-23) ─────────────────────────
// The presentable Linear-style form: go.urganize.app/join/<code>, backed by
// the workspace_invite_links table. The stateless wl.* tokens above remain
// verifiable so links minted before the table existed keep working until
// they expire.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 12;

/** Short, URL-friendly, unambiguous (no 0/O/1/l/I) crypto-random code. */
export function generateInviteLinkCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/** Shape check for a join code — distinct from UUIDs (which carry dashes)
 * and wl.* tokens (which carry dots). */
export function looksLikeInviteLinkCode(token: string): boolean {
  return /^[A-Za-z0-9]{8,24}$/.test(token);
}

/** Mint a link token for a workspace. Throws if the server secret is missing.
 * `artistScopeId` makes it an ARTIST link — the joiner only sees that
 * artist's releases (founder decision, 2026-07-23). */
export function mintInviteLinkToken(
  workspaceId: string,
  artistScopeId?: string | null
): { token: string; expiresAt: string } {
  const secret = getSecret();
  if (!secret) throw new Error('Server environment is not configured.');
  const exp = Math.floor(Date.now() / 1000) + INVITE_LINK_TTL_DAYS * 24 * 60 * 60;
  const payload: InviteLinkPayload = { w: workspaceId, r: 'member', exp };
  if (artistScopeId) payload.a = artistScopeId;
  const encoded = b64url(JSON.stringify(payload));
  return {
    token: `${TOKEN_PREFIX}.${encoded}.${sign(encoded, secret)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export type InviteLinkVerdict =
  | { status: 'valid'; workspaceId: string; role: 'member'; artistScopeId: string | null }
  | { status: 'expired' }
  | { status: 'invalid' };

/** Verify a link token: signature first (constant-time), then expiry. */
export function verifyInviteLinkToken(token: string): InviteLinkVerdict {
  const secret = getSecret();
  if (!secret) return { status: 'invalid' };

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return { status: 'invalid' };
  const [, encoded, providedSig] = parts;

  const expectedSig = sign(encoded, secret);
  const provided = Buffer.from(providedSig);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { status: 'invalid' };
  }

  try {
    const payload = JSON.parse(fromB64url(encoded)) as Partial<InviteLinkPayload>;
    if (typeof payload.w !== 'string' || !payload.w || typeof payload.exp !== 'number') {
      return { status: 'invalid' };
    }
    if (payload.exp * 1000 <= Date.now()) return { status: 'expired' };
    return {
      status: 'valid',
      workspaceId: payload.w,
      role: 'member',
      artistScopeId: typeof payload.a === 'string' && payload.a ? payload.a : null,
    };
  } catch {
    return { status: 'invalid' };
  }
}
