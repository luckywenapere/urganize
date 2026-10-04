import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildReadOnlyResponse,
  isReadOnlyWorkspaceMember,
  loadWorkspaceAccessContext,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';

// Shared gate for the Opportunities routes. Not behind a feature flag: the
// area is on for everyone. Auth and the paywall run first, then the team rules.

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID_SHAPE.test(value);

export type OpportunitiesContext = {
  adminClient: SupabaseClient;
  userId: string;
  workspaceId: string;
};

/**
 * Resolves who is asking and which team's opportunities they may touch.
 *
 *  - A teammate limited to ONE artist does not get the team's whole list:
 *    opportunities are team-wide and would show work on artists they cannot see.
 *  - Guests are read-only, like everywhere else.
 */
export async function resolveOpportunitiesContext(
  request: NextRequest,
  options: { write: boolean }
): Promise<{ error: NextResponse } | { context: OpportunitiesContext }> {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return { error: auth.error ?? NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) };

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  const workspaceId = access.primaryWorkspaceId;
  if (!workspaceId) return { error: NextResponse.json({ error: 'Team not found.' }, { status: 404 }) };

  if (access.artistScopeByWorkspaceId[workspaceId]) {
    return {
      error: NextResponse.json(
        { error: 'Your access is limited to one artist, so the team opportunities are not available to you.' },
        { status: 403 }
      ),
    };
  }

  if (options.write && isReadOnlyWorkspaceMember(access, workspaceId)) return { error: buildReadOnlyResponse() };

  return { context: { adminClient: auth.adminClient, userId: auth.user.id, workspaceId } };
}
