import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildReadOnlyResponse,
  isReadOnlyWorkspaceMember,
  loadWorkspaceAccessContext,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';
import { isRelationshipsEnabled } from '@/app/api/relationships/_shared';
import { isUuid } from '@/lib/next-records';
import { findRecordArtist, findTeamArtist, type RecordsResult } from '@/lib/next-records-server';

// The one gate for the next-record routes (2026-10-27). No flag: it is live at
// deploy (founder rule). The team comes from the signed-in user, never from the
// request; a teammate scoped to one artist reaches only that artist's records;
// guests are read-only, like everywhere else.

export type RecordsContext = {
  adminClient: SupabaseClient;
  userId: string;
  workspaceId: string;
  artistId: string;
  /** Typed people may become team contacts (Relationships on, not scoped). */
  canUseContacts: boolean;
};

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

export async function resolveRecordsContext(
  request: NextRequest,
  target: { artistId: string } | { recordId: string },
  options: { write: boolean }
): Promise<{ error: NextResponse } | { context: RecordsContext }> {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return { error: auth.error ?? NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) };

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  const workspaceId = access.primaryWorkspaceId;
  if (!workspaceId) return { error: NextResponse.json({ error: 'Team not found.' }, { status: 404 }) };

  let artistId: string | null;
  if ('artistId' in target) {
    if (!isUuid(target.artistId)) return { error: notFound() };
    artistId = (await findTeamArtist(auth.adminClient, workspaceId, target.artistId))?.id ?? null;
  } else {
    if (!isUuid(target.recordId)) return { error: notFound() };
    artistId = await findRecordArtist(auth.adminClient, workspaceId, target.recordId);
  }
  if (!artistId) return { error: notFound() };

  const scope = access.artistScopeByWorkspaceId[workspaceId];
  if (scope && scope !== artistId) return { error: notFound() };

  if (options.write && isReadOnlyWorkspaceMember(access, workspaceId)) return { error: buildReadOnlyResponse() };

  return {
    context: {
      adminClient: auth.adminClient,
      userId: auth.user.id,
      workspaceId,
      artistId,
      canUseContacts: isRelationshipsEnabled() && !scope,
    },
  };
}

export async function readJson(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => ({}));
}

export function respond<T>(result: RecordsResult<T>, key: string, status = 200): NextResponse {
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ [key]: result.value }, { status });
}
