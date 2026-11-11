// The one Assistant chat (#1207, Oyin, 11 Nov 2026): one chat per person that
// never resets, under the person's own user id (lib/chappi/home-chat.ts).
//
// Pure and client-safe. Three decisions live here:
//
//   1. When the chat is long, its oldest messages move to an EARLIER PAGE (a
//      row with thread_key 'main_archive'), so the chat itself always fits one
//      row's caps. planMainArchive says what moves.
//   2. An old free-standing session is FOLDED in as an earlier page, headed by
//      a divider with its title and date. foldedSessionMessages builds it.
//   3. The server can add to the chat on its own (the 8am brief, and the move
//      in 1). A tab that was open then must catch up WITHOUT forking the chat
//      into a new one, which is what a refused save does for any other chat.
//      rebaseOnServer is that catch-up.

import type { StoredChatMessage } from './conversation-history';

/** Move old messages out once the chat holds this many. */
export const MAIN_ARCHIVE_AT_MESSAGES = 360;
/** ...or once it is this big, well under the 1 MB row cap. */
export const MAIN_ARCHIVE_AT_BYTES = 650_000;
/** How many of the newest messages stay in the chat after a move. */
export const MAIN_KEEP_MESSAGES = 120;

/** The chats-list row of an earlier page. Never shown in a list. */
export const MAIN_ARCHIVE_THREAD = 'main_archive';
export const EARLIER_PAGE_TITLE = 'Earlier';

export type MainArchivePlan = { archive: StoredChatMessage[]; keep: StoredChatMessage[] };

/**
 * What to move to an earlier page, or null when the chat is short enough. The
 * newest MAIN_KEEP_MESSAGES always stay, and the cut never leaves a reply
 * stranded at the top of the chat without the question it answered.
 */
export function planMainArchive(
  messages: readonly StoredChatMessage[],
  force = false
): MainArchivePlan | null {
  const tooMany = messages.length >= MAIN_ARCHIVE_AT_MESSAGES;
  const tooBig = JSON.stringify(messages).length >= MAIN_ARCHIVE_AT_BYTES;
  if (!force && !tooMany && !tooBig) return null;
  let cut = Math.max(0, messages.length - MAIN_KEEP_MESSAGES);
  // Start the kept part on something someone said, not on an answer.
  while (cut > 0 && cut < messages.length && messages[cut].role !== 'user' && messages[cut].kind !== 'brief') {
    cut += 1;
  }
  if (cut <= 0 || cut >= messages.length) {
    // A chat of answers with no question to cut at: keep the newest part anyway.
    cut = Math.max(1, messages.length - MAIN_KEEP_MESSAGES);
    if (cut >= messages.length) return null;
  }
  return { archive: messages.slice(0, cut), keep: messages.slice(cut) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3 Oct" (Lagos), for a folded session's divider. */
export function shortDateLabel(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const lagos = new Date(at + 60 * 60 * 1000);
  return `${lagos.getUTCDate()} ${MONTHS[lagos.getUTCMonth()]}`;
}

/** The divider that heads a folded session. */
export function foldedSessionLabel(title: string, at: string): string {
  const name = title && title !== 'New chat' ? `"${title.slice(0, 80)}"` : 'an earlier chat';
  const when = shortDateLabel(at);
  return when ? `From ${name} · ${when}` : `From ${name}`;
}

/**
 * An old session as it reads in the one chat: a divider with its title and
 * date, then its messages exactly as they were. The divider's id is derived
 * from the session's, so folding twice can never add a second divider.
 */
export function foldedSessionMessages(session: {
  id: string;
  title: string;
  lastMessageAt: string;
  messages: readonly StoredChatMessage[];
}): StoredChatMessage[] {
  const dividerId = `fold-${session.id}`.slice(0, 100);
  const rest = session.messages.filter((message) => message.id !== dividerId);
  return [
    {
      id: dividerId,
      role: 'assistant',
      kind: 'divider',
      content: foldedSessionLabel(session.title, session.lastMessageAt),
      at: session.lastMessageAt,
    },
    ...rest,
  ];
}

/** True when a session was already folded (its first message is its divider). */
export function isFoldedSession(id: string, messages: readonly StoredChatMessage[]): boolean {
  return messages[0]?.id === `fold-${id}`.slice(0, 100);
}

/**
 * Which saved chats are old free-standing sessions to fold: everything that is
 * not the one chat, not already an earlier page, and not a rollout's or a
 * project's own chat. `keep` holds the rollout and project chat ids the person
 * could have made (lib/rollout-session.ts). A chat we cannot place is kept as
 * it is rather than guessed at.
 */
export function looseSessionIds(
  rows: ReadonlyArray<{ id: string; threadKey: string | null }>,
  userId: string,
  keep: ReadonlySet<string>
): string[] {
  return rows
    .filter((row) => row.id !== userId && row.threadKey === null && !keep.has(row.id))
    .map((row) => row.id);
}

/**
 * Catching up with the server's copy of the one chat.
 *
 * `local` is what is on screen, `knownServerIds` is what this tab last saw the
 * server hold, `server` is what it holds now. The result is the server's copy
 * with anything this tab added since its last save put after it, in order.
 * Messages the tab had seen saved but the server no longer holds were moved to
 * an earlier page, so they are NOT put back.
 */
export function rebaseOnServer<T extends { id: string }>(
  local: readonly T[],
  knownServerIds: readonly string[],
  server: readonly T[]
): { messages: T[]; added: number } {
  const known = new Set(knownServerIds);
  const onServer = new Set(server.map((message) => message.id));
  const extra = local.filter((message) => !known.has(message.id) && !onServer.has(message.id));
  return { messages: [...server, ...extra], added: extra.length };
}
