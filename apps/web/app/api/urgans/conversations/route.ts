import { NextRequest, NextResponse } from 'next/server';
import { decodeNoteCursor } from '@/lib/note-paging';
import { listChats } from '@/lib/chappi/conversations-server';
import {
  createAdminClient,
  flagOffResponse,
  isChappiHistoryEnabled,
  requireActiveAuthenticatedUser,
  serverNotConfiguredResponse,
} from './_shared';

/**
 * The caller's saved UrgAns chats, newest first, one keyset page at a time
 * (`?cursor=` from the previous page). Private to the owner: the query is
 * scoped to the caller inside listChats. A GET, so a read-only team keeps it.
 */
export async function GET(request: NextRequest) {
  if (!isChappiHistoryEnabled()) return flagOffResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  // Tolerant by design: a junk cursor starts from the top rather than 400ing.
  const cursor = decodeNoteCursor(request.nextUrl.searchParams.get('cursor'));

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return serverNotConfiguredResponse();

  const result = await listChats(adminClient, auth.user.id, cursor);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.value);
}
