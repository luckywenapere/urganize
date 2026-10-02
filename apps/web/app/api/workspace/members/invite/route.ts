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
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { checkSeatAllowance, recordLimitHit } from '@/lib/seats-server';
import { captureActivationIfReached } from '@/lib/activation-server';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

type InviteWorkspaceMemberBody = {
  email?: unknown;
  role?: unknown;
  /** Artist-scope for ARTIST invites (founder decision, 2026-07-23): the
   * invitee only sees releases whose artist_id matches. */
  artistId?: unknown;
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

// Plain-English access description for the invite email. The recipient has
// no idea what our role enum means, and 'guest' in particular reads as less
// than it is.
const WORKSPACE_ROLE_ACCESS_LABEL: Record<WorkspaceMemberRole, string> = {
  owner: 'full access',
  admin: 'manager access',
  member: 'team access',
  guest: 'read-only access',
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
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can invite teammates.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as InviteWorkspaceMemberBody;
    const email = normalizeEmail(body.email);
    const role = normalizeRole(body.role);
    const artistScopeId = readString(body.artistId).slice(0, 100) || null;

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
        { error: existingResult.error.message || 'Could not load that teammate.' },
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
      // Only written when set — keeps unscoped invites working before the
      // artist_scope_id migration is applied.
      if (artistScopeId) {
        updatePayload.artist_scope_id = artistScopeId;
      }

      const updateResult = await adminClient
        .from(WORKSPACE_MEMBERS_TABLE)
        .update(updatePayload)
        .eq('id', existingResult.data.id);

      if (updateResult.error) {
        return NextResponse.json(
          { error: updateResult.error.message || 'Could not update that teammate.' },
          { status: 500 }
        );
      }

      if (isAlreadyActive) {
        // No URL to send — the user is already on the workspace. Surface a
        // 200 with no inviteUrl so the caller can show a confirmation.
        activeToken = '';
      }
    } else {
      // Seat cap — INSIDE this branch on purpose. `existingResult.data?.id` is
      // known-falsy here, so we are provably about to create a NEW seat.
      // Checking any earlier would also block a RE-invite of somebody who
      // already occupies a seat, which changes no total and must always be
      // allowed. Fails open on an unreadable count or tier; see
      // checkSeatAllowance.
      const seats = await checkSeatAllowance(adminClient, workspaceId);
      if (!seats.allowed) {
        await recordLimitHit(adminClient, {
          workspaceId,
          actorUserId: auth.user.id,
          key: seats.key,
          limit: seats.limit,
          current: seats.current,
        });
        // 409, matching the invite-link cap already in this route group. The
        // client renders `error` verbatim, so this string is what the manager
        // reads.
        return NextResponse.json({ error: seats.message }, { status: 409 });
      }

      const insertPayload: Record<string, unknown> = {
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
      };
      if (artistScopeId) {
        insertPayload.artist_scope_id = artistScopeId;
      }
      const insertResult = await adminClient.from(WORKSPACE_MEMBERS_TABLE).insert(insertPayload);

      if (insertResult.error) {
        if (isTaskSchemaMissingError(insertResult.error)) {
          return buildTaskSchemaResponse();
        }

        return NextResponse.json(
          { error: insertResult.error.message || 'Could not send that invite.' },
          { status: 500 }
        );
      }
    }

    const inviteUrl = activeToken ? buildInviteUrl(activeToken) : null;

    // Deliver the invite. The row and its token are already committed, so a
    // failed send is a degraded outcome and never an error: the response
    // still carries inviteUrl and the caller falls back to "copy this and
    // send it yourself". emailSent tells the UI which of those happened so
    // it can't claim an email went out when none did.
    let emailSent = false;
    if (inviteUrl) {
      if (isEmailConfigured()) {
        const inviterLabel =
          membership.name ||
          readString(auth.user.user_metadata?.full_name) ||
          readString(auth.user.email) ||
          'A teammate';
        const result = await sendEmail(adminClient, {
          templateId: 'workspace_invite',
          to: email,
          props: {
            workspaceName: access.primaryWorkspace?.name || 'their team',
            inviterLabel,
            inviteUrl,
            accessLabel: WORKSPACE_ROLE_ACCESS_LABEL[role],
          },
          trigger: 'teammate_invited',
          actorUserId: auth.user.id,
        });
        emailSent = result.ok;
        if (!result.ok) {
          console.error(`[workspace-invite] email failed for ${email}`, result.error);
        }
      }
      // Kept even once email works: the server log is how the founder
      // recovers a link when a send bounces or a recipient loses it.
      console.info(`[workspace-invite] ${email} -> ${inviteUrl} (emailed: ${emailSent})`);
    } else {
      console.info(`[workspace-invite] ${email} -> already-active member, no link needed`);
    }

    // Activation (2026-10-01): the first teammate invited, after a real
    // rollout, completes the pair. Credited to the workspace OWNER, who may not
    // be the person who pressed the button.
    await captureActivationIfReached(adminClient, { workspaceId, trigger: 'invite' });

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('team_member_invited', {
        role,
      })
    );

    return NextResponse.json({ ok: true, inviteUrl, emailSent });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
