import type { ChatSummary } from './conversation-history';

/**
 * Home's chat is ONE permanent conversation per person (2026-10-10, founder
 * call): it never expires, never lands in the Sessions list and cannot be
 * deleted from it, so throwaway chats go in Sessions and the Home chat stays
 * clean.
 *
 * Its id is the person's own user id. Both are uuids, a chat id only has to be
 * unique among chats, and a fixed id is what lets any device find it again
 * with no new column or migration.
 */
export function homeChatIdFor(userId: string | null | undefined): string | null {
  return typeof userId === 'string' && userId.length > 0 ? userId : null;
}

export function isHomeChatId(id: string | null | undefined, homeChatId: string | null): boolean {
  return Boolean(id) && Boolean(homeChatId) && id === homeChatId;
}

/** Sessions are every saved chat except the Home chat. */
export function withoutHomeChat<T extends Pick<ChatSummary, 'id'>>(
  chats: readonly T[],
  homeChatId: string | null
): T[] {
  return homeChatId ? chats.filter((chat) => chat.id !== homeChatId) : [...chats];
}
