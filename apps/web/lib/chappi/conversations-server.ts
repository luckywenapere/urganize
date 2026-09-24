/**
 * UrgAns chat history — the table half.
 *
 * Every function here takes the service-role client and scopes every query to
 * the caller with `.eq('owner_user_id', userId)`: the table's RLS is defense in
 * depth, but these queries bypass it, so the scoping in THIS file is what keeps
 * one account's chats out of another's. The decisions (what a save does, what
 * a conflict is) are made by the pure functions in conversation-history.ts;
 * this module only turns them into queries. Tested with a recording fake
 * client in conversations-server.test.ts.
 *
 * Deliberately no schema-missing fallback: a missing table is an ordinary 500,
 * and the routes 404 before reaching here while the flag is off.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { encodeNoteCursor, takeNotePage, type NoteCursor } from '@/lib/note-paging';
import {
  CHAT_PAGE_SIZE,
  applySync,
  normalizeChatMessage,
  type ChatDetail,
  type ChatSummary,
  type ChatSyncBody,
  type ChatSyncResult,
  type StoredChatMessage,
  type StoredChatRow,
} from './conversation-history';

export const URGANS_CONVERSATIONS_TABLE = 'urgans_conversations';

const SUMMARY_COLUMNS = 'id, title, message_count, last_message_at, created_at';
const DETAIL_COLUMNS =
  'id, owner_user_id, title, revision, messages, message_count, last_message_at, created_at';

export type ChatConflict = { revision: number; messageIds: string[] };

export type ServerResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string; conflict?: ChatConflict };

type Row = Record<string, unknown>;

const NOT_FOUND = 'Chat not found.';
const TOO_LARGE = 'This chat is too long to save. Start a new chat.';
const CHANGED = 'This chat changed somewhere else.';

function fail(status: number, error: string): ServerResult<never> {
  return { ok: false, status, error };
}

export function toChatSummary(row: Row): ChatSummary {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    messageCount: Number(row.message_count ?? 0),
    lastMessageAt: String(row.last_message_at ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

/** Stored messages, read defensively. Everything in the column was written
 *  through normalizeChatMessage, so nothing should ever be dropped here. */
function toStoredMessages(raw: unknown): StoredChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: StoredChatMessage[] = [];
  for (const item of raw) {
    const message = normalizeChatMessage(item);
    if (message) messages.push(message);
  }
  return messages;
}

function toStoredRow(row: Row): StoredChatRow {
  return {
    ownerUserId: String(row.owner_user_id),
    title: String(row.title ?? ''),
    revision: Number(row.revision ?? 0),
    messages: toStoredMessages(row.messages),
  };
}

async function readOwnedRow(
  admin: SupabaseClient,
  userId: string,
  chatId: string
): Promise<{ row: Row | null; error: string | null }> {
  const { data, error } = await admin
    .from(URGANS_CONVERSATIONS_TABLE)
    .select(DETAIL_COLUMNS)
    .eq('id', chatId)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (error) return { row: null, error: error.message || 'Could not load this chat.' };
  return { row: (data as Row | null) ?? null, error: null };
}

/** After a write that matched nothing, the honest answer is whatever the row
 *  looks like NOW: gone (404) or moved on by another tab (409 with its state). */
async function answerLostRace(
  admin: SupabaseClient,
  userId: string,
  chatId: string
): Promise<ServerResult<never>> {
  const reread = await readOwnedRow(admin, userId, chatId);
  if (reread.error) return fail(500, reread.error);
  if (!reread.row) return fail(404, NOT_FOUND);
  const current = toStoredRow(reread.row);
  return {
    ok: false,
    status: 409,
    error: CHANGED,
    conflict: {
      revision: current.revision,
      messageIds: current.messages.map((message) => message.id),
    },
  };
}

/** One page of the history list, newest first. */
export async function listChats(
  admin: SupabaseClient,
  userId: string,
  cursor: NoteCursor | null,
  pageSize: number = CHAT_PAGE_SIZE
): Promise<ServerResult<{ chats: ChatSummary[]; nextCursor: string | null }>> {
  let query = admin
    .from(URGANS_CONVERSATIONS_TABLE)
    .select(SUMMARY_COLUMNS)
    .eq('owner_user_id', userId);

  if (cursor) {
    // Strictly after the cursor in (last_message_at desc, id desc). Both halves
    // are shape-checked by decodeNoteCursor, so neither can carry a PostgREST
    // filter delimiter. The notes cursor is reused as-is: it is a generic
    // (timestamp, uuid) keyset cursor, and this is only its second consumer.
    query = query.or(
      `last_message_at.lt.${cursor.updatedAt},and(last_message_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query
    .order('last_message_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1);

  if (error) return fail(500, error.message || 'Could not load your chats.');

  const { page, hasMore } = takeNotePage((data || []) as Row[], pageSize);
  const last = page[page.length - 1];
  return {
    ok: true,
    value: {
      chats: page.map(toChatSummary),
      nextCursor:
        hasMore && last
          ? encodeNoteCursor({ updatedAt: String(last.last_message_at), id: String(last.id) })
          : null,
    },
  };
}

/** One whole chat. Missing and somebody else's both answer 404. */
export async function getChat(
  admin: SupabaseClient,
  userId: string,
  chatId: string
): Promise<ServerResult<ChatDetail>> {
  const read = await readOwnedRow(admin, userId, chatId);
  if (read.error) return fail(500, read.error);
  if (!read.row) return fail(404, NOT_FOUND);
  const stored = toStoredRow(read.row);
  return {
    ok: true,
    value: {
      ...toChatSummary(read.row),
      revision: stored.revision,
      messages: stored.messages,
    },
  };
}

/**
 * Applies one save. The update is conditional on the revision the decision
 * was made against, so two tabs saving at once can never both land: the one
 * that matched nothing gets the row's current state back as a conflict.
 */
export async function syncChat(
  admin: SupabaseClient,
  userId: string,
  chatId: string,
  body: ChatSyncBody,
  now: Date = new Date()
): Promise<ServerResult<ChatSyncResult>> {
  const read = await readOwnedRow(admin, userId, chatId);
  if (read.error) return fail(500, read.error);

  const decision = applySync(read.row ? toStoredRow(read.row) : null, body, userId);
  const nowIso = now.toISOString();

  switch (decision.kind) {
    case 'not_found':
      return fail(404, NOT_FOUND);
    case 'too_large':
      return fail(413, TOO_LARGE);
    case 'invalid':
      return fail(400, decision.error);
    case 'conflict':
      return {
        ok: false,
        status: 409,
        error: CHANGED,
        conflict: { revision: decision.revision, messageIds: decision.messageIds },
      };
    case 'insert': {
      const { data, error } = await admin
        .from(URGANS_CONVERSATIONS_TABLE)
        .insert({
          id: chatId,
          owner_user_id: userId,
          title: decision.title,
          messages: decision.messages,
          message_count: decision.messages.length,
          revision: 1,
          last_message_at: nowIso,
        })
        .select('revision, last_message_at')
        .single();
      if (error) {
        // The id already exists: this user's own row created a moment ago by
        // another tab (a conflict), or somebody else's (hidden as not found).
        if ((error as { code?: string }).code === '23505') {
          return answerLostRace(admin, userId, chatId);
        }
        return fail(500, error.message || 'Could not save this chat.');
      }
      const saved = (data as Row | null) ?? {};
      return {
        ok: true,
        value: {
          revision: Number(saved.revision ?? 1),
          messageIds: decision.messages.map((message) => message.id),
          title: decision.title,
          lastMessageAt: String(saved.last_message_at ?? nowIso),
        },
      };
    }
    case 'update': {
      const { data, error } = await admin
        .from(URGANS_CONVERSATIONS_TABLE)
        .update({
          title: decision.title,
          messages: decision.messages,
          message_count: decision.messages.length,
          revision: decision.nextRevision,
          last_message_at: nowIso,
        })
        .eq('id', chatId)
        .eq('owner_user_id', userId)
        .eq('revision', body.baseRevision)
        .select('revision, last_message_at');
      if (error) return fail(500, error.message || 'Could not save this chat.');
      const rows = (data as Row[] | null) ?? [];
      if (rows.length === 0) return answerLostRace(admin, userId, chatId);
      return {
        ok: true,
        value: {
          revision: Number(rows[0].revision ?? decision.nextRevision),
          messageIds: decision.messages.map((message) => message.id),
          title: decision.title,
          lastMessageAt: String(rows[0].last_message_at ?? nowIso),
        },
      };
    }
  }
}

/** Deletes one chat. Idempotent: deleting something already gone succeeds. */
export async function deleteChat(
  admin: SupabaseClient,
  userId: string,
  chatId: string
): Promise<ServerResult<null>> {
  const { error } = await admin
    .from(URGANS_CONVERSATIONS_TABLE)
    .delete()
    .eq('id', chatId)
    .eq('owner_user_id', userId);
  if (error) return fail(500, error.message || 'Could not delete this chat.');
  return { ok: true, value: null };
}
