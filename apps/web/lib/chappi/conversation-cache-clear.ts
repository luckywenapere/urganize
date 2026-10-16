/**
 * The browser copy's storage key and its sign-out wipe, on their own (URG-314)
 * so lib/auth-store.ts can clear the copy without pulling the history rules
 * (lib/chappi/conversation-history.ts, lib/notes) into every route's first
 * load. lib/chappi/conversation-cache.ts re-exports both.
 */
import { clearPersistedState } from '@/lib/persisted-state';

export const CHAT_CACHE_KEY = 'urganize.cache.urgans-chats';

/** Wipes this browser's copy (sign-out). */
export function clearChatCache(): void {
  try {
    clearPersistedState(CHAT_CACHE_KEY);
  } catch {
    // Nothing to undo.
  }
}
