import { NextRequest, NextResponse } from 'next/server';
import { foldLooseSessions } from '@/lib/chappi/main-thread-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import {
  createAdminClient,
  flagOffResponse,
  isChappiHistoryEnabled,
  requireUrgansAccess,
  serverNotConfiguredResponse,
} from '../_shared';

/**
 * Folds the caller's old free-standing sessions into their one Assistant chat
 * (#1207). Called once per page load by the history store; finds nothing to do
 * after the first time. Rollout and project chats are never touched.
 */
export async function POST(request: NextRequest) {
  if (!isChappiHistoryEnabled()) return flagOffResponse();

  const auth = await requireUrgansAccess(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return serverNotConfiguredResponse();

  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  const result = await foldLooseSessions(adminClient, auth.user.id, {
    releaseOwnerIds: access.releaseOwnerIds,
    workspaceIds: access.workspaceIds,
  });
  return NextResponse.json(result);
}
