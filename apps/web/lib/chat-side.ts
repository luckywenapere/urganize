/**
 * The right-hand column of the full UrgAns chat page: today's focus, the saved
 * chats list, or nothing. Pure so the store and its tests agree.
 */
export type ChatSideMode = 'today' | 'history' | 'closed';

export const CHAT_SIDE_KEY = 'urganize.chat.side';
export const CHAT_SIDE_VERSION = 1;
export const DEFAULT_CHAT_SIDE: ChatSideMode = 'today';

export function isChatSideMode(value: unknown): value is ChatSideMode {
  return value === 'today' || value === 'history' || value === 'closed';
}

/** A button that shows a mode while it is already showing goes back to closed. */
export function toggleChatSide(current: ChatSideMode, target: 'today' | 'history'): ChatSideMode {
  return current === target ? 'closed' : target;
}
