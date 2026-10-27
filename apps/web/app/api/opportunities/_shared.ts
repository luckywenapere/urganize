import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildReadOnlyResponse,
  isReadOnlyWorkspaceMember,
  loadWorkspaceAccessContext,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';
import { isOpportunitiesEnabled } from '@/lib/paused-features';

// Shared gate for the Opportunities routes. Paused Oct 27, 2026
// (lib/paused-features.ts): with the feature off every route answers 404
// 'Not found.' BEFORE auth, the same as the Relationships routes, so it is
// indistinguishable from a route that does not exist (and UrgAns's
// isFlagGateOff reads it as "the feature is off"). Then auth and the paywall,
// then the team rules.

export const isOpportunitiesRouteEnabled = (): boolean => isOpportunitiesEnabled();

export const notFoundResponse = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

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
  if (!isOpportunitiesRouteEnabled()) return { error: notFoundResponse() };

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
