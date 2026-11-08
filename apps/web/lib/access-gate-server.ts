// SERVER ONLY — imports node:crypto and uses the service-role client.
//
// Closed sign-up (invite-only), 2026-10-15: the reads and writes behind the
// rules in lib/access-gate.ts. Every check here is a server check; the screens
// on /auth and /onboarding only save an invite-less visitor a wasted wizard.
//
// Where it is enforced:
//   - requireActiveAccount (app/api/_shared/paywall.ts): 402 reason
//     'not_approved' before the billing gate, so every protected route holds
//     an unapproved account and the fetch interceptor takes them to /locked.
//   - ensureOwnedWorkspace (lib/tasks-server.ts): no team and no trial clock
//     for an unapproved account, whichever route asks.
//   - POST /api/curator/activate-team, /api/trial/start*, PATCH
//     /api/user/onboarding.
//
// CACHE: positive answers only, the team-access cache's rule. Approval is never
// taken back by any code path, so a cached yes cannot go stale, and a no is
// always read fresh, so the request right after "Let in" goes through. This
// cache is separate from getTeamAccessForUser's (which is also positive-only),
// and approving an account clears that one too.

import { createHash, randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';
import { invalidateTeamAccess } from '@/lib/team-billing-server';
import {
  decideAppAccess,
  emailBindingIsOpen,
  looksLikeAccessCode,
  normalizeAccessEmail,
  resolveAccessInviteState,
  SIGNUP_OPEN,
  type AccessSource,
} from '@/lib/access-gate';

export const ACCESS_INVITES_TABLE = 'access_invites';

const APPROVED_TTL_MS = 10 * 60 * 1000;
const APPROVED_MAX_ENTRIES = 2_000;
const approvedCache = new Map<string, number>();

function rememberApproved(userId: string): void {
  if (!userId) return;
  if (approvedCache.size >= APPROVED_MAX_ENTRIES) {
    const oldest = approvedCache.keys().next().value;
    if (oldest !== undefined) approvedCache.delete(oldest);
  }
  approvedCache.set(userId, Date.now() + APPROVED_TTL_MS);
}

function isApprovedCached(userId: string): boolean {
  const expiresAt = approvedCache.get(userId);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    approvedCache.delete(userId);
    return false;
  }
  return true;
}

/** Tests only. */
export function clearAccessApprovalCache(): void {
  approvedCache.clear();
}

export function createAccessAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Unambiguous alphabet (no 0/O/1/l/I), so a code survives being read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 16;

export function generateAccessCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export function hashAccessCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Stamps the approval. Conditional on it being empty, so the first source
 * wins and a second call is a no-op. Never throws.
 */
export async function approveUser(
  admin: SupabaseClient,
  userId: string,
  source: AccessSource,
  now: Date = new Date()
): Promise<boolean> {
  try {
    const { error } = await admin
      .from('profiles')
      .update({ access_approved_at: now.toISOString(), access_source: source })
      .eq('id', userId)
      .is('access_approved_at', null);
    if (error) {
      console.warn('[access-gate] approve failed', { userId, source, message: error.message });
      return false;
    }
    rememberApproved(userId);
    invalidateTeamAccess(userId);
    return true;
  } catch (error) {
    console.warn('[access-gate] approve threw', { userId, source, error });
    return false;
  }
}

async function hasForeignMembership(admin: SupabaseClient, userId: string): Promise<boolean> {
  const memberships = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .neq('status', 'removed');
  if (memberships.error) throw memberships.error;
  const ids = Array.from(
    new Set(
      ((memberships.data || []) as Array<{ workspace_id: string | null }>)
        .map((row) => row.workspace_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (!ids.length) return false;
  const workspaces = await admin.from('workspaces').select('id,owner_id').in('id', ids);
  if (workspaces.error) throw workspaces.error;
  return ((workspaces.data || []) as Array<{ owner_id: string | null }>).some(
    (row) => Boolean(row.owner_id) && row.owner_id !== userId
  );
}

async function findOpenEmailInvite(
  admin: SupabaseClient,
  email: string
): Promise<{ id: string } | null> {
  if (!email) return null;
  const result = await admin
    .from(ACCESS_INVITES_TABLE)
    .select('id,used_at,revoked_at')
    .eq('email', email)
    .is('used_at', null)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  const row = result.data as { id: string; used_at: unknown; revoked_at: unknown } | null;
  return row && emailBindingIsOpen(row) ? { id: row.id } : null;
}

async function markInviteUsed(admin: SupabaseClient, inviteId: string, userId: string): Promise<boolean> {
  const result = await admin
    .from(ACCESS_INVITES_TABLE)
    .update({ used_by: userId, used_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('used_at', null)
    .is('revoked_at', null)
    .select('id');
  if (result.error) return false;
  return Array.isArray(result.data) && result.data.length > 0;
}

export type AppAccessResult = { allowed: boolean; reason?: 'read_error' };

/**
 * May this account use the app? Never throws.
 *
 * Fails OPEN on a read error (not cached), the rule every access read in this
 * codebase follows: a database blip must not lock real teams out, and the
 * column read failing because the migration is not applied yet is exactly that
 * case. Fails CLOSED for an account we can read and that matches no rule.
 */
export async function getAppAccess(
  userId: string,
  email?: string | null,
  adminClient?: SupabaseClient | null
): Promise<AppAccessResult> {
  if (!userId) return { allowed: false };
  if (isApprovedCached(userId)) return { allowed: true };
  if (isAllowlistedEmail(email)) return { allowed: true };

  const admin = adminClient ?? createAccessAdminClient();
  if (!admin) return { allowed: true, reason: 'read_error' };

  try {
    const profile = await admin
      .from('profiles')
      .select('access_approved_at,email')
      .eq('id', userId)
      .maybeSingle();
    if (profile.error) {
      console.warn('[access-gate] profile read failed, allowing', profile.error.message);
      return { allowed: true, reason: 'read_error' };
    }
    const row = (profile.data || null) as { access_approved_at: string | null; email: string | null } | null;
    if (row?.access_approved_at) {
      rememberApproved(userId);
      return { allowed: true };
    }

    const normalizedEmail = normalizeAccessEmail(email || row?.email || '');
    const allowlisted = isAllowlistedEmail(normalizedEmail);
    const [foreign, emailInvite] = await Promise.all([
      allowlisted ? Promise.resolve(false) : hasForeignMembership(admin, userId),
      allowlisted ? Promise.resolve(null) : findOpenEmailInvite(admin, normalizedEmail),
    ]);

    const decision = decideAppAccess({
      approvedAt: null,
      allowlisted,
      hasForeignMembership: foreign,
      hasEmailInvite: Boolean(emailInvite),
      signupOpen: SIGNUP_OPEN,
    });
    if (!decision.allowed) return { allowed: false };

    if (decision.stamp === 'invite_email' && emailInvite) {
      await markInviteUsed(admin, emailInvite.id, userId);
    }
    if (decision.stamp) await approveUser(admin, userId, decision.stamp);
    rememberApproved(userId);
    return { allowed: true };
  } catch (error) {
    console.warn('[access-gate] read failed, allowing', error);
    return { allowed: true, reason: 'read_error' };
  }
}

/** Plain yes/no for the guards that refuse rather than redirect. */
export async function isAppAccessAllowed(
  userId: string,
  email?: string | null,
  adminClient?: SupabaseClient | null
): Promise<boolean> {
  return (await getAppAccess(userId, email, adminClient)).allowed;
}

export type RedeemOutcome = 'approved' | 'invalid' | 'used' | 'expired' | 'revoked' | 'error';

/**
 * Redeems a /start/<code> link for this account. Single use: the conditional
 * update is the lock, so two people racing one link cannot both get in. The
 * same account redeeming its own link again is answered 'approved'.
 */
export async function redeemAccessCode(
  admin: SupabaseClient,
  userId: string,
  code: unknown,
  now: Date = new Date()
): Promise<RedeemOutcome> {
  if (!looksLikeAccessCode(code)) return 'invalid';
  try {
    const found = await admin
      .from(ACCESS_INVITES_TABLE)
      .select('id,expires_at,revoked_at,used_at,used_by')
      .eq('code_hash', hashAccessCode(code))
      .maybeSingle();
    if (found.error) return 'error';
    const row = found.data as
      | { id: string; expires_at: string | null; revoked_at: string | null; used_at: string | null; used_by: string | null }
      | null;
    if (!row) return 'invalid';
    if (row.used_at && row.used_by === userId) {
      await approveUser(admin, userId, 'invite_link', now);
      return 'approved';
    }
    const state = resolveAccessInviteState(row, now);
    if (state !== 'open') return state;
    const claimed = await markInviteUsed(admin, row.id, userId);
    if (!claimed) return 'used';
    await approveUser(admin, userId, 'invite_link', now);
    return 'approved';
  } catch {
    return 'error';
  }
}

/** What /start/<code> shows before sign-in. No account is touched. */
export async function peekAccessCode(
  admin: SupabaseClient,
  code: unknown,
  now: Date = new Date()
): Promise<'open' | 'used' | 'expired' | 'revoked' | 'invalid'> {
  if (!looksLikeAccessCode(code)) return 'invalid';
  const found = await admin
    .from(ACCESS_INVITES_TABLE)
    .select('expires_at,revoked_at,used_at')
    .eq('code_hash', hashAccessCode(code))
    .maybeSingle();
  if (found.error || !found.data) return 'invalid';
  return resolveAccessInviteState(found.data as Record<string, unknown>, now);
}

/** Escapes LIKE wildcards so an email with `_` matches only itself. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (match) => `\\${match}`);

/**
 * Is this email let in before an account exists? For POST /api/access/check,
 * which stops an invite-less visitor before the onboarding wizard. True for an
 * allowlisted email, an existing approved account, an open founder invite, or a
 * pending team invite. Fails OPEN on a read error: this is a courtesy screen,
 * the real gate is server-side after sign-up.
 */
export async function isEmailLetIn(admin: SupabaseClient, rawEmail: unknown): Promise<boolean> {
  const email = normalizeAccessEmail(rawEmail);
  if (!email) return false;
  if (isAllowlistedEmail(email)) return true;
  const pattern = escapeLike(email);
  try {
    const [profile, invite, member] = await Promise.all([
      admin.from('profiles').select('access_approved_at').ilike('email', pattern).limit(1).maybeSingle(),
      findOpenEmailInvite(admin, email),
      admin
        .from('workspace_members')
        .select('id')
        .ilike('email', pattern)
        .neq('status', 'removed')
        .limit(1)
        .maybeSingle(),
    ]);
    if (profile.error || member.error) return true;
    if ((profile.data as { access_approved_at: string | null } | null)?.access_approved_at) return true;
    if (invite) return true;
    if (member.data) return true;
    return false;
  } catch {
    return true;
  }
}
