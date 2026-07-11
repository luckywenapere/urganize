import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  WORKSPACE_MEMBERS_TABLE,
  buildTaskSchemaResponse,
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  loadWorkspaceAccessContext,
} from '@/lib/tasks-server';
import { type WorkspaceMemberRole } from '@/lib/tasks';

type UpdateWorkspaceMemberBody = {
  role?: unknown;
};

const WORKSPACE_ROLE_OPTIONS: WorkspaceMemberRole[] = ['owner', 'admin', 'member', 'guest'];
const readString = (value: unknown): string => String(value || '').trim();

function normalizeRole(value: unknown): WorkspaceMemberRole {
  const normalized = readString(value) as WorkspaceMemberRole;
  return WORKSPACE_ROLE_OPTIONS.includes(normalized) ? normalized : 'member';
}

async function resolveMutableMembership(
  adminClient: SupabaseClient,
  user: User
) {
  const access = await loadWorkspaceAccessContext(adminClient, user);
  const workspaceId = access.primaryWorkspaceId;
  const membership = access.memberships.find((item) => item.workspaceId === workspaceId) || null;

  if (!workspaceId || !membership) {
    return { error: NextResponse.json({ error: 'Workspace not found.' }, { status: 404 }) };
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only owners and admins can manage teammates.' }, { status: 403 }) };
  }

  return { workspaceId, membership };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const { id } = await context.params;

  try {
    const access = await resolveMutableMembership(adminClient, auth.user);
    if ('error' in access) {
      return access.error;
    }

    const memberResult = await adminClient
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('id,role')
      .eq('id', id)
      .eq('workspace_id', access.workspaceId)
      .maybeSingle();

    if (memberResult.error) {
      if (isTaskSchemaMissingError(memberResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: memberResult.error.message || 'Could not load workspace member.' },
        { status: 500 }
      );
    }

    if (!memberResult.data) {
      return NextResponse.json({ error: 'Workspace member not found.' }, { status: 404 });
    }

    if (readString(memberResult.data.role) === 'owner') {
      return NextResponse.json({ error: 'The workspace owner cannot be changed here.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as UpdateWorkspaceMemberBody;
    const role = normalizeRole(body.role);

    const updateResult = await adminClient
      .from(WORKSPACE_MEMBERS_TABLE)
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', access.workspaceId);

    if (updateResult.error) {
      if (isTaskSchemaMissingError(updateResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: updateResult.error.message || 'Could not update workspace member.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update workspace member.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const { id } = await context.params;

  try {
    const access = await resolveMutableMembership(adminClient, auth.user);
    if ('error' in access) {
      return access.error;
    }

    const memberResult = await adminClient
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('id,role')
      .eq('id', id)
      .eq('workspace_id', access.workspaceId)
      .maybeSingle();

    if (memberResult.error) {
      if (isTaskSchemaMissingError(memberResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: memberResult.error.message || 'Could not load workspace member.' },
        { status: 500 }
      );
    }

    if (!memberResult.data) {
      return NextResponse.json({ error: 'Workspace member not found.' }, { status: 404 });
    }

    if (readString(memberResult.data.role) === 'owner') {
      return NextResponse.json({ error: 'The workspace owner cannot be removed.' }, { status: 400 });
    }

    const deleteResult = await adminClient
      .from(WORKSPACE_MEMBERS_TABLE)
      .update({
        status: 'removed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', access.workspaceId);

    if (deleteResult.error) {
      if (isTaskSchemaMissingError(deleteResult.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: deleteResult.error.message || 'Could not remove workspace member.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not remove workspace member.' },
      { status: 500 }
    );
  }
}
