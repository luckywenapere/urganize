import { NextRequest, NextResponse } from 'next/server';
import { parseSyncBody } from '@/lib/chappi/conversation-history';
import { deleteChat, getChat, syncChat } from '@/lib/chappi/conversations-server';
import {
  createAdminClient,
  flagOffResponse,
  invalidChatIdResponse,
  isChappiHistoryEnabled,
  isChatId,
  requireActiveAuthenticatedUser,
  serverNotConfiguredResponse,
} from '../_shared';

type Context = { params: Promise<{ conversationId: string }> };

async function readChatId(context: Context): Promise<string | null> {
  const { conversationId } = await context.params;
  return isChatId(conversationId) ? conversationId : null;
}

/** One whole saved chat. Missing and somebody else's both answer 404. */
export async function GET(request: NextRequest, context: Context) {
  if (!isChappiHistoryEnabled()) return flagOffResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const chatId = await readChatId(context);
  if (!chatId) return invalidChatIdResponse();

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return serverNotConfiguredResponse();

  const result = await getChat(adminClient, auth.user.id, chatId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ chat: result.value });
}

/**
 * Saves a chat: `{ baseRevision, keepCount, append }`. The first save creates
 * the row (the browser chose the id). A save built on a stale revision is
 * refused with 409 and the server's `revision` + `messageIds`, which the
 * browser uses to settle it. A write, so a read-only team gets the standard
 * 403 from the gate — and the browser stops saving for the session.
 */
export async function PUT(request: NextRequest, context: Context) {
  if (!isChappiHistoryEnabled()) return flagOffResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const chatId = await readChatId(context);
  if (!chatId) return invalidChatIdResponse();

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const parsed = parseSyncBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return serverNotConfiguredResponse();

  const result = await syncChat(adminClient, auth.user.id, chatId, parsed.body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.conflict ?? {}) },
      { status: result.status }
    );
  }
  return NextResponse.json(result.value);
}

/** Deletes a chat. Idempotent: an already-deleted chat answers success. */
export async function DELETE(request: NextRequest, context: Context) {
  if (!isChappiHistoryEnabled()) return flagOffResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const chatId = await readChatId(context);
  if (!chatId) return invalidChatIdResponse();

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return serverNotConfiguredResponse();

  const result = await deleteChat(adminClient, auth.user.id, chatId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
