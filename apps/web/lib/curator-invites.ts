// SERVER ONLY — imports node:crypto; never import from client components.
//
// Curator invite codes. Playlist owners get into the product one way only: an
// admin mints a single-use link, sends it, and the join route consumes it.
//
// Why a row-backed code rather than the stateless wl.* HMAC tokens in
// lib/invite-link.ts: those are multi-use by construction (nothing is stored,
// so nothing can be marked used) and they carry a workspace id, which a
// curator must never be given. Single use is the whole point here, so the row
// IS the mechanism: the join route stamps used_at in a conditional update, and
// two people racing the same link cannot both get in.

import { randomBytes } from 'crypto';
import type { CuratorInviteState } from '@/types/pitching';

/** Default lifetime of a minted link. Long enough to send and follow up on. */
export const CURATOR_INVITE_TTL_DAYS = 14;

/** Upper bound on the expiry an admin may ask for. */
export const CURATOR_INVITE_MAX_TTL_DAYS = 90;

// Unambiguous alphabet (no 0/O/1/l/I) so a code survives being read aloud or
// retyped. Same choice as the workspace join codes.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 14;

/** Short, URL-friendly, crypto-random invite code. */
export function generateCuratorInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/** Shape check before any database read, so a junk path never hits the table. */
export function looksLikeCuratorInviteCode(code: string): boolean {
  return /^[A-Za-z0-9]{8,32}$/.test(code);
}

export type CuratorInviteRow = {
  id?: unknown;
  code?: unknown;
  created_at?: unknown;
  expires_at?: unknown;
  revoked_at?: unknown;
  used_by?: unknown;
  used_at?: unknown;
};

/**
 * One place decides what a row means, so the admin list and the join route can
 * never disagree about whether a link still works.
 *
 * Order matters: used beats revoked (revoking after the fact does not undo a
 * join) and revoked beats expired (an admin decision is more informative than
 * a clock).
 */
export function resolveCuratorInviteState(row: CuratorInviteRow): CuratorInviteState {
  if (row.used_at) return 'used';
  if (row.revoked_at) return 'revoked';
  const expiresAt = row.expires_at ? new Date(String(row.expires_at)).getTime() : 0;
  if (expiresAt && expiresAt <= Date.now()) return 'expired';
  return 'active';
}

/**
 * May THIS user finish a claim they already made on this link?
 *
 * The join flow consumes the invite before it writes the two profile rows, so a
 * failure in between leaves the link marked used by someone who never got a
 * curator profile. Without a resume path that account is stranded permanently:
 * the link reads 'used', nothing self-serves a new one, and if the profiles
 * write landed then role='curator' also keeps them off the team side.
 *
 * Only the ORIGINAL claimant may resume, which is what keeps this from
 * reopening the single-use guarantee — a different user still gets refused.
 *
 * Note `used_at` outranks `revoked_at` in resolveCuratorInviteState, so a
 * revoked link can still report 'used'. Revocation is checked separately here:
 * a link the founder turned off stays off, even for its claimant.
 */
export function canResumeCuratorInviteClaim(input: {
  state: CuratorInviteState;
  revokedAt: string | null | undefined;
  usedBy: string | null | undefined;
  userId: string;
}): boolean {
  if (input.state !== 'used') return false;
  if (input.revokedAt) return false;
  const userId = String(input.userId || '').trim();
  if (!userId) return false;
  return String(input.usedBy || '').trim() === userId;
}

/** Expiry timestamp for a freshly minted link. */
export function curatorInviteExpiry(days: number = CURATOR_INVITE_TTL_DAYS): string {
  const safeDays = Number.isFinite(days)
    ? Math.min(Math.max(Math.floor(days), 1), CURATOR_INVITE_MAX_TTL_DAYS)
    : CURATOR_INVITE_TTL_DAYS;
  return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();
}
