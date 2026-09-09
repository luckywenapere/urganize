import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { buildJoinUrl, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { resolveLoginState, type TeamLogin } from '@/lib/team-logins';

/**
 * Shared bits for the workspace invite-link route group (the "team logins"
 * surface, founder request 2026-08-16).
 *
 * Deliberately NOT importing app/api/releases/_shared.ts: that module carries
 * the deprecated schema-missing-fallback helpers and lib/schema-fallback-guard
 * .test.ts fails the build for new files that reach for them. The EPK /
 * notes / capture route groups all keep a local ownership helper for the same
 * reason, and this follows them.
 */

export const INVITE_LINKS_TABLE = 'workspace_invite_links';

export type ManageableWorkspace = { workspaceId: string };

/**
 * Owner/admin gate. Minting and revoking sign-in links is the single most
 * consequential thing a non-owner could do in this workspace — a link is
 * standing access — so it stays on the same footing the teammate invite and
 * removal routes already use.
 */
export async function requireLinkManager(
  adminClient: SupabaseClient,
  user: User
): Promise<{ error: NextResponse } | ManageableWorkspace> {
  const access = await loadWorkspaceAccessContext(adminClient, user);
  const workspaceId = access.primaryWorkspaceId;
  const membership = access.memberships.find((item) => item.workspaceId === workspaceId) || null;

  if (!workspaceId || !membership) {
    return { error: NextResponse.json({ error: 'Team not found.' }, { status: 404 }) };
  }
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return {
      error: NextResponse.json(
        { error: 'Only owners and admins can manage team logins.' },
        { status: 403 }
      ),
    };
  }

  return { workspaceId };
}

export type InviteLinkRow = {
  id: string;
  code: string;
  label: string | null;
  release_id: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

/** Columns the list endpoint reads. `code` is included because the URL is the
 * point of the row — but note the endpoint is owner/admin-gated, so a code
 * never reaches anyone who couldn't mint a fresh one anyway. */
export const INVITE_LINK_COLUMNS = 'id,code,label,release_id,created_at,expires_at,revoked_at';

/** Row → the client-facing shape. `releaseTitles` is a lookup the caller
 * builds in one query rather than a join, since most rows share a release. */
export function toTeamLogin(
  row: InviteLinkRow,
  releaseTitles: Map<string, string>
): TeamLogin {
  return {
    id: row.id,
    url: buildJoinUrl(row.code),
    label: row.label || null,
    releaseTitle: row.release_id ? releaseTitles.get(row.release_id) || null : null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    state: resolveLoginState({ revokedAt: row.revoked_at, expiresAt: row.expires_at }),
  };
}

/**
 * Titles for the releases referenced by a batch of rows, in one query.
 * Tolerant by design: a failure here costs a subtitle, never the list, so it
 * degrades to an empty map rather than propagating.
 */
export async function loadReleaseTitles(
  adminClient: SupabaseClient,
  rows: InviteLinkRow[]
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(rows.map((row) => row.release_id).filter((id): id is string => Boolean(id)))
  );
  if (ids.length === 0) return new Map();

  try {
    const result = await adminClient.from('releases').select('id,title').in('id', ids);
    if (result.error || !result.data) return new Map();
    return new Map(
      (result.data as { id: string; title: string | null }[]).map((row) => [
        row.id,
        row.title || 'Untitled rollout',
      ])
    );
  } catch {
    return new Map();
  }
}

/**
 * True when the error is Postgres complaining about a column this feature's
 * migration adds. Lets the routes keep working — minus labels and release
 * context — on an environment where 20260816100000 hasn't been applied yet,
 * which is the same tolerance the POST route already had for the table
 * itself. This is NOT the deprecated schema-fallback pattern: nothing here
 * returns migration SQL for the user to run, and the request still succeeds.
 */
export function isMissingTeamLoginColumn(error: { message?: string } | null): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('label') ||
    message.includes('release_id') ||
    message.includes('revoked_by')
  ) && message.includes('column');
}
