// Folding old free-standing sessions into the one Assistant chat (#1207).
//
// "New session" is retired: the Assistant tab is one chat. Every session a
// person made before is folded in as an earlier page of that chat (the row
// keeps its id and its time, gains thread_key 'main_archive', and its messages
// are headed by a divider with the old title and date). Rollout and project
// chats are left exactly where they are.
//
// A copy of every row is written to urgans_conversations_folded BEFORE it is
// changed, so nothing is ever lost. Idempotent: a folded row is no longer a
// candidate, so running it again finds nothing.
//
// Every query is scoped to the caller, like conversations-server.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { URGANS_CONVERSATIONS_TABLE } from './conversations-server';
import { normalizeChatMessage, type StoredChatMessage } from './conversation-history';
import { MAIN_ARCHIVE_THREAD, foldedSessionMessages, looseSessionIds } from './main-thread';
import { projectSessionIdFor, rolloutSessionIdFor } from '@/lib/rollout-session';

const FOLDED_TABLE = 'urgans_conversations_folded';
const MAX_FOLD_PER_CALL = 100;

type Row = Record<string, unknown>;

function storedMessages(raw: unknown): StoredChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredChatMessage[] = [];
  for (const item of raw) {
    const message = normalizeChatMessage(item);
    if (message) out.push(message);
  }
  return out;
}

/**
 * The rollout and project chat ids this person could have made: one per
 * rollout and project in any team they belong to. A chat matching none of
 * these, that is not the one chat, is an old session.
 */
async function loadKeepIds(
  admin: SupabaseClient,
  userId: string,
  releaseOwnerIds: readonly string[],
  workspaceIds: readonly string[]
): Promise<Set<string> | null> {
  const keep = new Set<string>();
  if (releaseOwnerIds.length > 0) {
    const { data, error } = await admin.from('releases').select('id').in('owner_user_id', [...releaseOwnerIds]);
    if (error) return null;
    for (const row of (data ?? []) as Row[]) {
      const id = rolloutSessionIdFor(userId, String(row.id));
      if (id) keep.add(id);
    }
  }
  if (workspaceIds.length > 0) {
    const { data, error } = await admin.from('next_records').select('id').in('workspace_id', [...workspaceIds]);
    if (error) return null;
    for (const row of (data ?? []) as Row[]) {
      const id = projectSessionIdFor(userId, String(row.id));
      if (id) keep.add(id);
    }
  }
  return keep;
}

export type FoldResult = { folded: number };

/**
 * Folds this person's old sessions into their one chat. Never throws; a read
 * it cannot make leaves everything as it is (a chat is only folded when we are
 * sure it is not a rollout's or a project's).
 */
export async function foldLooseSessions(
  admin: SupabaseClient,
  userId: string,
  access: { releaseOwnerIds: readonly string[]; workspaceIds: readonly string[] }
): Promise<FoldResult> {
  try {
    const { data, error } = await admin
      .from(URGANS_CONVERSATIONS_TABLE)
      .select('id, thread_key, title, messages, message_count, revision, last_message_at, created_at, updated_at')
      .eq('owner_user_id', userId)
      .is('thread_key', null)
      .neq('id', userId)
      .limit(MAX_FOLD_PER_CALL);
    if (error || !data || data.length === 0) return { folded: 0 };
    const rows = data as Row[];

    const keep = await loadKeepIds(admin, userId, access.releaseOwnerIds, access.workspaceIds);
    if (!keep) return { folded: 0 };
    const loose = new Set(
      looseSessionIds(
        rows.map((row) => ({ id: String(row.id), threadKey: (row.thread_key as string | null) ?? null })),
        userId,
        keep
      )
    );

    let folded = 0;
    for (const row of rows) {
      const id = String(row.id);
      if (!loose.has(id)) continue;

      // The copy first. If it cannot be written, this row is left alone.
      const copy = await admin.from(FOLDED_TABLE).upsert(
        {
          id,
          owner_user_id: userId,
          title: row.title ?? null,
          messages: row.messages ?? null,
          message_count: row.message_count ?? null,
          revision: row.revision ?? null,
          last_message_at: row.last_message_at ?? null,
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
          folded_into: userId,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );
      if (copy.error) continue;

      const messages = foldedSessionMessages({
        id,
        title: String(row.title ?? ''),
        lastMessageAt: String(row.last_message_at ?? row.created_at ?? new Date().toISOString()),
        messages: storedMessages(row.messages),
      });
      const revision = Number(row.revision ?? 0);
      const updated = await admin
        .from(URGANS_CONVERSATIONS_TABLE)
        .update({
          thread_key: MAIN_ARCHIVE_THREAD,
          messages,
          message_count: messages.length,
          revision: revision + 1,
        })
        .eq('id', id)
        .eq('owner_user_id', userId)
        .eq('revision', revision)
        .is('thread_key', null)
        .select('id');
      if (!updated.error && ((updated.data as Row[] | null) ?? []).length > 0) folded += 1;
    }
    return { folded };
  } catch {
    return { folded: 0 };
  }
}
