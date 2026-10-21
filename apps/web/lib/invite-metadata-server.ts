import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  isInviteLinkToken,
  looksLikeInviteLinkCode,
  verifyInviteLinkToken,
} from '@/lib/invite-link';

// What an invite link says about itself, read by BOTH the public GET
// /api/invites/[token] and the server-rendered /invite/accept and /join/[code]
// pages, so the HTML a phone gets on weak data already holds the real invite (or
// the real "link not available") instead of "Loading invite" (the curator join
// page's fix, 2026-08-14). Never returns user_id or the token itself.

const WORKSPACE_MEMBERS_TABLE = 'workspace_members';
const WORKSPACES_TABLE = 'workspaces';
const PROFILES_TABLE = 'profiles';

export type InviteMetadataBody =
  | { status: 'valid' | 'expired' | 'accepted'; workspaceName: string; inviterName: string | null; invitedEmail: string; role: string }
  | { error: string };

export type InviteMetadataResult = { status: number; body: InviteMetadataBody };

type InviteRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email: string;
  role: string;
  status: string;
  invite_token: string | null;
  invite_expires_at: string | null;
  joined_at: string | null;
};

async function loadInvite(admin: SupabaseClient, token: string): Promise<InviteRow | null> {
  const result = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,workspace_id,user_id,email,role,status,invite_token,invite_expires_at,joined_at')
    .eq('invite_token', token)
    .maybeSingle();

  if (result.error) {
    console.error('[invites/token] lookup error:', result.error.message);
    return null;
  }
  return (result.data as InviteRow | null) || null;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now();
}

// Shared context lookup for both invite kinds: workspace name + the owner's
// display name for the "invited to X by Y" line on the accept page.
async function loadWorkspaceContext(
  admin: SupabaseClient,
  workspaceId: string
): Promise<{ workspaceName: string; inviterName: string | null }> {
  const [workspaceResult, ownerProfileResult] = await Promise.all([
    admin.from(WORKSPACES_TABLE).select('id,owner_id,name').eq('id', workspaceId).maybeSingle(),
    admin
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('role', 'owner')
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const workspaceName = workspaceResult.data?.name || 'a team';
  const ownerUserId = ownerProfileResult.data?.user_id || workspaceResult.data?.owner_id || null;

  let inviterName: string | null = null;
  if (ownerUserId) {
    const ownerProfile = await admin
      .from(PROFILES_TABLE)
      .select('name,email,artist_name')
      .eq('id', ownerUserId)
      .maybeSingle();
    inviterName =
      ownerProfile.data?.name || ownerProfile.data?.artist_name || ownerProfile.data?.email || null;
  }

  return { workspaceName, inviterName };
}

type LinkRow = {
  id: string;
  workspace_id: string;
  role: string;
  artist_scope_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

/** Look up a short /join/<code> link row. Null when the code doesn't match
 * a row OR the table isn't migrated yet (tolerant read). */
async function loadLinkByCode(admin: SupabaseClient, code: string): Promise<LinkRow | null> {
  try {
    const result = await admin
      .from('workspace_invite_links')
      .select('id,workspace_id,role,artist_scope_id,expires_at,revoked_at')
      .eq('code', code)
      .maybeSingle();
    if (result.error) return null;
    return (result.data as LinkRow | null) || null;
  } catch {
    return null;
  }
}

export async function loadInviteMetadata(rawToken: unknown): Promise<InviteMetadataResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { status: 500, body: { error: 'Server environment is not configured.' } };
  }

  const token = String(rawToken || '').trim();
  if (!token) {
    return { status: 400, body: { error: 'Missing invite token.' } };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Shareable LINK tokens (wl.*) are stateless — verified by signature, not
  // a DB row. Multi-use until expiry; whoever holds one joins as a member.
  if (isInviteLinkToken(token)) {
    const verdict = verifyInviteLinkToken(token);
    if (verdict.status === 'invalid') {
      return { status: 404, body: { error: 'Invite not found.' } };
    }
    if (verdict.status === 'expired') {
      return { status: 200, body: {
        status: 'expired',
        workspaceName: 'a team',
        inviterName: null,
        invitedEmail: '',
        role: 'member',
      } };
    }
    const context = await loadWorkspaceContext(admin, verdict.workspaceId);
    return { status: 200, body: {
      status: 'valid',
      workspaceName: context.workspaceName,
      inviterName: context.inviterName,
      invitedEmail: '',
      role: verdict.role,
    } };
  }

  // Short /join/<code> links (workspace_invite_links). Checked BEFORE the
  // legacy member-row lookup — codes never collide with UUID tokens (no
  // dashes) and the lookup is tolerant of the table not being migrated.
  if (looksLikeInviteLinkCode(token)) {
    const link = await loadLinkByCode(admin, token);
    if (link) {
      if (link.revoked_at || isExpired(link.expires_at)) {
        return { status: 200, body: {
          status: 'expired',
          workspaceName: 'a team',
          inviterName: null,
          invitedEmail: '',
          role: link.role || 'member',
        } };
      }
      const context = await loadWorkspaceContext(admin, link.workspace_id);
      return { status: 200, body: {
        status: 'valid',
        workspaceName: context.workspaceName,
        inviterName: context.inviterName,
        invitedEmail: '',
        role: link.role || 'member',
      } };
    }
    // No matching link row — fall through to the legacy member-row lookup.
  }

  const invite = await loadInvite(admin, token);
  if (!invite) {
    return { status: 404, body: { error: 'Invite not found.' } };
  }

  // Fetch the workspace + inviter so the accept page can show context.
  // The inviter is the workspace owner; we don't have a separate "invited_by"
  // column on workspace_members today, so we infer from owner.
  const { workspaceName, inviterName } = await loadWorkspaceContext(admin, invite.workspace_id);

  const expired = isExpired(invite.invite_expires_at);
  const status: 'valid' | 'expired' | 'accepted' =
    invite.status === 'active' || invite.user_id ? 'accepted' : expired ? 'expired' : 'valid';

  return { status: 200, body: {
    status,
    workspaceName,
    inviterName,
    invitedEmail: invite.email,
    role: invite.role,
  } };
}

/** What the accept page and the client agree the server read. */
export type InviteInitialLoad =
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; metadata: Exclude<InviteMetadataBody, { error: string }> };

/** Undefined when the server could not read it: the client then asks for itself. */
export async function readInitialInvite(rawToken: string): Promise<InviteInitialLoad | undefined> {
  const token = rawToken.trim();
  if (!token) return { kind: 'invalid', message: 'Missing invite token.' };
  try {
    const result = await loadInviteMetadata(token);
    if (result.status >= 500) return undefined;
    if ('error' in result.body) return { kind: 'invalid', message: result.body.error };
    return { kind: 'ready', metadata: result.body };
  } catch {
    return undefined;
  }
}
