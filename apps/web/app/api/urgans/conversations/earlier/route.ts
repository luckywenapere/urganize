import { NextRequest, NextResponse } from 'next/server';
import { decodeNoteCursor } from '@/lib/note-paging';
import { getEarlierPage } from '@/lib/chappi/conversations-server';
import {
  createAdminClient,
  flagOffResponse,
  isChappiHistoryEnabled,
  requireUrgansAccess,
  serverNotConfiguredResponse,
} from '../_shared';

/**
 * One earlier page of the caller's one Assistant chat (#1207), newest first
 * (`?cursor=` from the previous answer). Read only. Private to the owner: the
 * query is scoped to the caller inside getEarlierPage.
 */
export async function GET(request: NextRequest) {
  if (!isChappiHistoryEnabled()) return flagOffResponse();

  const auth = await requireUrgansAccess(request);
  if ('error' in auth) return auth.error;

  const cursor = decodeNoteCursor(request.nextUrl.searchParams.get('cursor'));

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return serverNotConfiguredResponse();

  const result = await getEarlierPage(adminClient, auth.user.id, cursor);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.value);
}
