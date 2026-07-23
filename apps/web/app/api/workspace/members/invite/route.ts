import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  WORKSPACE_MEMBERS_TABLE,
  buildInviteUrl,
  buildTaskSchemaResponse,
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
} from '@/lib/tasks-server';
import { type WorkspaceMemberRole } from '@/lib/tasks';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

type InviteWorkspaceMemberBody = {
  email?: unknown;
  role?: unknown;
};

const WORKSPACE_ROLE_OPTIONS: WorkspaceMemberRole[] = ['owner', 'admin', 'member', 'guest'];

// The invite form's picker sends PROFILE-flavored roles (Manager / Artist /
// Team Member / Viewer). These map onto workspace roles; before this map
// existed every choice silently fell through to 'member' (2026-07-23
// collaboration audit). Viewer → guest = read-only.
const PROFILE_TO_WORKSPACE_ROLE: Record<string, WorkspaceMemberRole> = {
  manager: 'admin',
  artist: 'member',
  'team-member': 'member',
  viewer: 'guest',
};

const readString = (value: unknown): string => String(value || '').trim();
const normalizeEmail = (value: unknown): string => readString(value).toLowerCase();

function normalizeRole(value: unknown): WorkspaceMemberRole {
  const raw = readString(value).toLowerCase();
  const mapped = PROFILE_TO_WORKSPACE_ROLE[raw];
  if (mapped) return mapped;
  const normalized = raw as WorkspaceMemberRole;
  // 'owner' can't be granted via invite — there is one owner per workspace.
  if (normalized === 'owner') return 'admin';
  return WORKSPACE_ROLE_OPTIONS.includes(normalized) ? normalized : 'member';
}

function isValidEmail(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
}

export async function POST(request: NextRequest) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await requireAuthenticatedAdmin(request);
    if ('error' in auth) {
      return auth.error;
    }

    const { adminClient } = auth;

    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;
    const membership = access.memberships.find((item) => item.workspaceId === workspaceId) || null;

    if (!workspaceId || !membership) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can invite teammates.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as InviteWorkspaceMemberBody;
    const email = normalizeEmail(body.email);
    const role = normalizeRole(body.role);

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    const existingResult = await adminClient
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('id,user_id,status,invite_token,invite_expires_at')
      .eq('workspace_id', workspaceId)
      .eq('email', email)
      .maybeSingle();

    if (existingResult.error) {
      if (isTaskSchemaMissingError(existingResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: existingResult.error.message || 'Could not load workspace member.' },
        { status: 500 }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    // 30-day expiry. Long enough that an invitee who reads the email a
    // week later still has plenty of time; short enough that stale invites
    // don't sit around indefinitely. Stored as ISO; the accept endpoint
    // compares against Date.now() to reject expired tokens.
    const expiresAtIso = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    // randomUUID is 128 bits of crypto-strength entropy — sufficient for
    // single-use invite tokens. We always mint a fresh token on (re-)invite
    // so an attacker who got hold of an old invite link can't keep using
    // it indefinitely.
    const inviteToken = randomUUID();

    // Typed as a plain string so the already-active branch can blank it
    // (randomUUID's template-literal return type doesn't unify with '').
    let activeToken: string = inviteToken;
    if (existingResult.data?.id) {
      // If the row is ALREADY active (user_id set), the invite is a no-op
      // from a token perspective — they don't need a fresh link. Keep the
      // existing row's status and skip token regeneration.
      const isAlreadyActive = Boolean(existingResult.data.user_id);
      const updatePayload: Record<string, unknown> = {
        role,
        status: isAlreadyActive ? 'active' : 'invited',
        invited_at: nowIso,
        updated_at: nowIso,
      };
      if (!isAlreadyActive) {
        updatePayload.invite_token = inviteToken;
        updatePayload.invite_expires_at = expiresAtIso;
      }

      const updateResult = await adminClient
        .from(WORKSPACE_MEMBERS_TABLE)
        .update(updatePayload)
        .eq('id', existingResult.data.id);

      if (updateResult.error) {
        return NextResponse.json(
          { error: updateResult.error.message || 'Could not update workspace member.' },
          { status: 500 }
        );
      }

      if (isAlreadyActive) {
        // No URL to send — the user is already on the workspace. Surface a
        // 200 with no inviteUrl so the caller can show a confirmation.
        activeToken = '';
      }
    } else {
      const insertResult = await adminClient.from(WORKSPACE_MEMBERS_TABLE).insert({
        workspace_id: workspaceId,
        user_id: null,
        email,
        role,
        status: 'invited',
        invite_token: inviteToken,
        invite_expires_at: expiresAtIso,
        invited_at: nowIso,
        joined_at: null,
        updated_at: nowIso,
      });

      if (insertResult.error) {
        if (isTaskSchemaMissingError(insertResult.error)) {
          return buildTaskSchemaResponse();
        }

        return NextResponse.json(
          { error: insertResult.error.message || 'Could not invite workspace member.' },
          { status: 500 }
        );
      }
    }

    const inviteUrl = activeToken ? buildInviteUrl(activeToken) : null;
    // TODO: replace this console handoff with the app's real transactional email flow once one exists.
    if (inviteUrl) {
      console.info(`[workspace-invite] ${email} -> ${inviteUrl}`);
    } else {
      console.info(`[workspace-invite] ${email} -> already-active member, no link needed`);
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('team_member_invited', {
        role,
      })
    );

    return NextResponse.json({ ok: true, inviteUrl });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
