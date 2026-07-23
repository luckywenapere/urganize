import { NextRequest, NextResponse } from 'next/server';
import {
  buildInviteUrl,
  buildJoinUrl,
  loadWorkspaceAccessContext,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';
import {
  INVITE_LINK_TTL_DAYS,
  generateInviteLinkCode,
  mintInviteLinkToken,
} from '@/lib/invite-link';

/**
 * POST — mint a shareable workspace invite LINK (founder request,
 * 2026-07-23): the Linear-style "anyone with this link joins" flow for when
 * the manager doesn't have the person's email. Owner/admin only. The link
 * points at the same /invite/accept page as email invites; whoever opens it
 * signs in (or up) and joins the workspace as a member. Stateless HMAC
 * token, valid for INVITE_LINK_TTL_DAYS — see lib/invite-link.ts.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;
    const membership = access.memberships.find((item) => item.workspaceId === workspaceId) || null;

    if (!workspaceId || !membership) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can create invite links.' },
        { status: 403 }
      );
    }

    // Optional ARTIST scope (founder decision, 2026-07-23): an artist link
    // admits the joiner with visibility limited to that artist's releases.
    const body = (await request.json().catch(() => ({}))) as { artistId?: unknown };
    const artistScopeId = String(body?.artistId || '').trim().slice(0, 100) || null;

    // Preferred form: a SHORT /join/<code> link backed by
    // workspace_invite_links (presentable, Linear-style, revocable later).
    // If the table isn't migrated yet, fall back to the stateless wl.*
    // token so the feature never hard-fails.
    const code = generateInviteLinkCode();
    const expiresAtIso = new Date(
      Date.now() + INVITE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const insertResult = await adminClient.from('workspace_invite_links').insert({
      workspace_id: workspaceId,
      code,
      role: 'member',
      artist_scope_id: artistScopeId,
      created_by: auth.user.id,
      expires_at: expiresAtIso,
    });

    if (!insertResult.error) {
      return NextResponse.json({
        ok: true,
        inviteUrl: buildJoinUrl(code),
        expiresAt: expiresAtIso,
        ttlDays: INVITE_LINK_TTL_DAYS,
        artistScopeId,
      });
    }

    console.warn(
      '[invite-link] short-code insert failed (table not migrated yet?):',
      insertResult.error.message
    );
    const { token, expiresAt } = mintInviteLinkToken(workspaceId, artistScopeId);
    return NextResponse.json({
      ok: true,
      inviteUrl: buildInviteUrl(token),
      expiresAt,
      ttlDays: INVITE_LINK_TTL_DAYS,
      artistScopeId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create invite link.' },
      { status: 500 }
    );
  }
}
