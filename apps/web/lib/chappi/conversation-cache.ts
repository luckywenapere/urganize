/**
 * The browser copy of UrgAns chat history: the chat on screen plus the first
 * page of the history list, so a reload paints instantly (offline included)
 * and an unsaved tail survives until it can be saved.
 *
 * Keyed to the account INSIDE the payload (the useSceneDataStore pattern), so
 * a copy written for one account is never read back for another, and wiped on
 * sign-out besides. Imports no store, so lib/auth-store.ts can reach it.
 *
 * ── WHOLE OR NOTHING ───────────────────────────────────────────────────────
 * A transcript that does not fit the storage budget is dropped whole, leaving
 * its sync state (id, revision, server ids). A partial prefix would be worse
 * than nothing: the next save would compute "keep what we share, send the
 * rest" against it and truncate the server copy to match. With the messages
 * gone, resuming fetches the chat from the server instead.
 */

import {
  clearPersistedState,
  readPersistedState,
  writePersistedState,
} from '@/lib/persisted-state';
import { withinPersistBudget } from '@/lib/scene-cache';
import {
  CHAT_CACHE_SUMMARY_LIMIT,
  isChatCachePayload,
  isWithinResumeWindow,
  type ChatCachePayload,
} from './conversation-history';

export const CHAT_CACHE_KEY = 'urganize.cache.urgans-chats';
/** Bump to invalidate every browser copy fleet-wide if the shape changes. */
export const CHAT_CACHE_VERSION = 1;

/** This account's browser copy, or null. */
export function readChatCache(userId: string): ChatCachePayload | null {
  if (!userId) return null;
  const cached = readPersistedState(CHAT_CACHE_KEY, CHAT_CACHE_VERSION, isChatCachePayload);
  return cached && cached.userId === userId ? cached : null;
}

/** Shrinks a payload to the storage budget, in the order that loses least:
 *  the list is capped, then the transcript goes (whole), then the list. */
export function fitChatCachePayload(payload: ChatCachePayload): ChatCachePayload | null {
  const capped: ChatCachePayload = {
    ...payload,
    summaries: payload.summaries.slice(0, CHAT_CACHE_SUMMARY_LIMIT),
  };
  if (withinPersistBudget(JSON.stringify(capped))) return capped;

  const withoutMessages: ChatCachePayload = capped.current
    ? { ...capped, current: { ...capped.current, messages: null } }
    : capped;
  if (withinPersistBudget(JSON.stringify(withoutMessages))) return withoutMessages;

  const bare: ChatCachePayload = { ...withoutMessages, summaries: [] };
  return withinPersistBudget(JSON.stringify(bare)) ? bare : null;
}

export function writeChatCache(payload: ChatCachePayload): void {
  const fitted = fitChatCachePayload(payload);
  if (!fitted) return;
  try {
    writePersistedState(CHAT_CACHE_KEY, CHAT_CACHE_VERSION, fitted);
  } catch {
    // setItem throws on a full quota and in Safari private mode. The server
    // copy is the durable record; losing the browser one costs a slower paint.
  }
}

export function clearChatCache(): void {
  try {
    clearPersistedState(CHAT_CACHE_KEY);
  } catch {
    // Nothing to undo.
  }
}

/**
 * For the page skeleton only: how many messages the chat about to resume
 * has, or 0. Deliberately does not check the account — it is read before auth
 * resolves, and a wrong guess costs a skeleton shape, never data.
 */
export function readResumableChatHint(now: number): number {
  const cached = readPersistedState(CHAT_CACHE_KEY, CHAT_CACHE_VERSION, isChatCachePayload);
  const current = cached?.current;
  if (!current?.messages?.length) return 0;
  return isWithinResumeWindow(current.lastActivityAt, now) ? current.messages.length : 0;
}
