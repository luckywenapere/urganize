import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildReadOnlyResponse,
  isReadOnlyWorkspaceMember,
  loadWorkspaceAccessContext,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';

// Shared gate for the Relationships routes (Phase 2).
//
// Order matters and matches the other flagged route groups: the feature flag
// answers 404 BEFORE anything else (so a switched-off feature is
// indistinguishable from one that does not exist), then auth and the paywall,
// then the team rules.
//
// The body is exactly 'Not found.' on purpose: lib/chappi/tool-families/shared's
// isFlagGateOff reads that string as "the feature is off", and a different
// 404 body would be mistaken for an ownership miss.

export const isRelationshipsEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_RELATIONSHIPS === 'true';

export const notFoundResponse = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID_SHAPE.test(value);

export type RelationshipsContext = {
  adminClient: SupabaseClient;
  userId: string;
  workspaceId: string;
};

/**
 * Resolves who is asking and which team's contacts they may touch.
 *
 * Two rules sit here rather than in each route:
 *  - A teammate limited to ONE artist (workspace_members.artist_scope_id) does
 *    not get the team's whole contact book. Contacts are team-wide, so a scoped
 *    member would otherwise see people who work on artists they cannot see.
 *  - Guests are read-only, like everywhere else.
 */
export async function resolveRelationshipsContext(
  request: NextRequest,
  options: { write: boolean }
): Promise<{ error: NextResponse } | { context: RelationshipsContext }> {
  if (!isRelationshipsEnabled()) return { error: notFoundResponse() };

  const auth = await requireAuthenticatedAdmin(request);
  // `error` is always a response when present; the helper's type is just loose.
  if ('error' in auth) return { error: auth.error ?? NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) };

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  const workspaceId = access.primaryWorkspaceId;
  if (!workspaceId) {
    return { error: NextResponse.json({ error: 'Team not found.' }, { status: 404 }) };
  }

  if (access.artistScopeByWorkspaceId[workspaceId]) {
    return {
      error: NextResponse.json(
        { error: 'Your access is limited to one artist, so the team contacts are not available to you.' },
        { status: 403 }
      ),
    };
  }

  if (options.write && isReadOnlyWorkspaceMember(access, workspaceId)) {
    return { error: buildReadOnlyResponse() };
  }

  return { context: { adminClient: auth.adminClient, userId: auth.user.id, workspaceId } };
}
