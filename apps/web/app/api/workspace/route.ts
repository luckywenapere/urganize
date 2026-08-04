import { NextRequest, NextResponse } from 'next/server';
import {
  WORKSPACES_TABLE,
  requireAuthenticatedAdmin,
  loadWorkspaceAccessContext,
} from '@/lib/tasks-server';

// Rename the caller's workspace (URG-214). Owner-only — unlike the artist
// and logo routes, which any workspace member may edit, the workspace name
// is the label's own identity and renaming it is scoped to whoever owns the
// workspace (same "owner" role check as the workspace-members mutation
// routes). Gated by both flags, mirroring /api/workspace/identity.
const isFlagOn = () =>
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

const MAX_NAME_LENGTH = 80;

type UpdateWorkspaceBody = {
  name?: unknown;
};

export async function PATCH(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  const body = (await request.json().catch(() => ({}))) as UpdateWorkspaceBody;
  const rawName = typeof body.name === 'string' ? body.name : '';
  const nextName = rawName.trim();

  if (!nextName) {
    return NextResponse.json({ error: 'Workspace name cannot be empty.' }, { status: 400 });
  }
  if (nextName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Workspace name must be ${MAX_NAME_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId || !access.primaryWorkspace) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const workspaceId = access.primaryWorkspaceId;
    const membership = access.memberships.find((member) => member.workspaceId === workspaceId);

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the workspace owner can rename the workspace.' },
        { status: 403 }
      );
    }

    const updateResult = await adminClient
      .from(WORKSPACES_TABLE)
      .update({ name: nextName, updated_at: new Date().toISOString() })
      .eq('id', workspaceId)
      .select('id,name')
      .single();

    if (updateResult.error || !updateResult.data) {
      return NextResponse.json(
        { error: updateResult.error?.message || 'Could not rename workspace.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ workspaceId, name: updateResult.data.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not rename workspace.' },
      { status: 500 }
    );
  }
}
