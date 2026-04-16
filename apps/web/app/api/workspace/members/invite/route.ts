import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../../../_shared/paywall';
import {
  WORKSPACE_MEMBERS_TABLE,
  buildInviteUrl,
  buildTaskSchemaResponse,
  createAdminClient,
  getAuthenticatedUser,
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

const readString = (value: unknown): string => String(value || '').trim();
const normalizeEmail = (value: unknown): string => readString(value).toLowerCase();

function normalizeRole(value: unknown): WorkspaceMemberRole {
  const normalized = readString(value) as WorkspaceMemberRole;
  return WORKSPACE_ROLE_OPTIONS.includes(normalized) ? normalized : 'member';
}

function isValidEmail(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
}

export async function POST(request: NextRequest) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) {
      return auth.error;
    }

    const paywallResponse = await requirePaidAccess(auth.user.id, {
      feature: 'team_collaboration',
      message: 'Upgrade required to invite teammates.',
    });
    if (paywallResponse) return paywallResponse;

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

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
      .select('id,user_id,status')
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

    const now = new Date().toISOString();
    if (existingResult.data?.id) {
      const updateResult = await adminClient
        .from(WORKSPACE_MEMBERS_TABLE)
        .update({
          role,
          status: existingResult.data.user_id ? 'active' : 'invited',
          invited_at: now,
          updated_at: now,
        })
        .eq('id', existingResult.data.id);

      if (updateResult.error) {
        return NextResponse.json(
          { error: updateResult.error.message || 'Could not update workspace member.' },
          { status: 500 }
        );
      }
    } else {
      const insertResult = await adminClient.from(WORKSPACE_MEMBERS_TABLE).insert({
        workspace_id: workspaceId,
        user_id: null,
        email,
        role,
        status: 'invited',
        invited_at: now,
        joined_at: null,
        updated_at: now,
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

    const inviteUrl = buildInviteUrl(email);
    // TODO: replace this console handoff with the app's real transactional email flow once one exists.
    console.info(`[workspace-invite] ${email} -> ${inviteUrl}`);

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
