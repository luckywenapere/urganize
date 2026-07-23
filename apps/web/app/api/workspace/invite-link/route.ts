import { NextRequest, NextResponse } from 'next/server';
import {
  buildInviteUrl,
  loadWorkspaceAccessContext,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';
import { INVITE_LINK_TTL_DAYS, mintInviteLinkToken } from '@/lib/invite-link';

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

    const { token, expiresAt } = mintInviteLinkToken(workspaceId);
    return NextResponse.json({
      ok: true,
      inviteUrl: buildInviteUrl(token),
      expiresAt,
      ttlDays: INVITE_LINK_TTL_DAYS,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create invite link.' },
      { status: 500 }
    );
  }
}
