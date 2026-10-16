/**
 * UrgAns chat history — the pure half.
 *
 * Everything that decides whether a chat is saved correctly lives here, with
 * no store, no fetch and no storage, so every rule is unit-tested
 * (conversation-history.test.ts). The IO around it is thin on purpose:
 *   - lib/chappi/conversations-server.ts   reads/writes the table
 *   - app/api/urgans/conversations/**      the routes
 *   - lib/chappi/conversation-cache.ts     the browser copy
 *   - stores/useChappiHistoryStore.ts      the sync engine and the list
 *
 * ── THE MODEL ──────────────────────────────────────────────────────────────
 * One row per chat, holding the transcript as a JSON array, written whole by
 * a revision-checked "replace the tail" save (the release_plan_drafts
 * "document read and written whole" precedent). The browser is the only
 * writer: history is exactly what the user saw, and /api/urgans stays
 * stateless. A save says "the server was at revision R; keep its first K
 * messages; put these after them". The revision check is what makes two tabs
 * on one chat safe — and that is a NORMAL path here, not an edge case: the
 * side rail mounts the conversation on every page, and resume-if-recent loads
 * the same chat into each tab.
 *
 * ── WHY NOT ONE ROW PER MESSAGE ────────────────────────────────────────────
 * Rows ordered by insertion keep every message but silently interleave two
 * tabs' turns, and nothing notices. A revision check notices, and the
 * resolver below decides: adopt, resend, reload, or fork into a new chat so
 * neither side's words are lost.
 */

import { deriveNoteTitle } from '@/lib/notes';
import type { ChappiMessage } from './types';

/** How recently a chat must have been touched to come back on reopen
 *  (founder decision, 2026-09-24: "resume if recent"). */
export const CHAT_RESUME_WINDOW_MS = 6 * 60 * 60 * 1000;
/** A timestamp this far in the future is a fast clock, not a forgery. */
export const CHAT_CLOCK_SKEW_MS = 5 * 60 * 1000;
/** How much history /api/urgans forwards to the model. Shared with the route
 *  so the client never sends more than the model will ever read. */
export const CHAPPI_HISTORY_LIMIT = 20;
/** Per-message text cap — the MAX_NOTE_BODY_LENGTH precedent. Text over it is
 *  CLAMPED, never refused: refusing one message would jam every later save. */
export const MAX_CHAT_MESSAGE_LENGTH = 20_000;
/** Messages in one chat. Past it the chat stops saving and says so. */
export const MAX_CHAT_MESSAGES = 500;
/** Serialized transcript size, so one row can never grow without bound. */
export const MAX_CHAT_BYTES = 1_000_000;
export const MAX_CHAT_MESSAGE_ID_LENGTH = 100;
const MAX_BRIEF_SECTIONS = 10;
const MAX_BRIEF_SECTION_LENGTH = 60;
/** One page of the history list. */
export const CHAT_PAGE_SIZE = 30;
/** How many list rows the browser keeps for an instant first paint. */
export const CHAT_CACHE_SUMMARY_LIMIT = 30;
/**
 * Title for a chat with no user message yet. THIS VALUE IS STORED and compared
 * (applySync below, useChappiHistoryStore), so it stays 'New chat' even though
 * the app now calls a conversation a session (2026-10-07): renaming it would
 * freeze every saved untitled chat at the old marker. Show a title through
 * displayChatTitle instead.
 */
export const CHAT_TITLE_FALLBACK = 'New chat';

/** What a conversation is called on screen when it has no title of its own yet. */
export const SESSION_TITLE_DISPLAY = 'New session';

/** A saved conversation's title as people see it. The stored marker reads as "New session". */
export function displayChatTitle(title: string | null | undefined): string {
  const trimmed = (title ?? '').trim();
  return !trimmed || trimmed === CHAT_TITLE_FALLBACK ? SESSION_TITLE_DISPLAY : trimmed;
}

export type ChatRole = 'user' | 'assistant';

/** What is saved for one message. The same shape as ChappiMessage, minus
 *  anything that only matters on screen. */
export type StoredChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  briefSections?: string[];
};

/** One row of the history list. */
export type ChatSummary = {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
};

/** A whole saved chat. */
export type ChatDetail = ChatSummary & {
  revision: number;
  messages: StoredChatMessage[];
};

/** What this browser believes the server holds for one chat. */
export type ChatSyncMeta = {
  revision: number;
  serverIds: string[];
};

/** One save: "you were at baseRevision; keep your first keepCount messages;
 *  put these after them". */
export type ChatSyncBody = {
  baseRevision: number;
  keepCount: number;
  append: StoredChatMessage[];
};

export type ChatSyncResult = {
  revision: number;
  messageIds: string[];
  title: string;
  lastMessageAt: string;
};

/** Chat history is on (both flags). Lives in ./history-flag so root-chain
 *  modules can read it without this file; re-exported for everything else. */
export { isChappiHistoryEnabled } from './history-flag';

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isChatId(value: unknown): value is string {
  return typeof value === 'string' && UUID_SHAPE.test(value);
}

/**
 * A random v4 uuid, for chat ids (a uuid column) and message ids.
 *
 * `crypto.randomUUID` exists only in a secure context, so a dev server opened
 * on a LAN address over plain http has none. `getRandomValues` does exist
 * there, and the fallback builds the same v4 shape from it.
 */
export function newChatId(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // Fall through to the manual build.
    }
  }
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function clampContent(content: string): string {
  return content.length > MAX_CHAT_MESSAGE_LENGTH
    ? content.slice(0, MAX_CHAT_MESSAGE_LENGTH)
    : content;
}

function cleanBriefSections(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const sections = raw
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .slice(0, MAX_BRIEF_SECTIONS)
    .map((item) => item.slice(0, MAX_BRIEF_SECTION_LENGTH));
  return sections.length > 0 ? sections : undefined;
}

/** The saved form of a transcript message. */
export function toStoredMessage(message: ChappiMessage): StoredChatMessage {
  const stored: StoredChatMessage = {
    id: message.id,
    role: message.role,
    content: clampContent(message.content),
  };
  const sections = cleanBriefSections(message.briefSections);
  if (sections) stored.briefSections = sections;
  return stored;
}

/**
 * Validates one incoming message. Returns null only for a shape no legitimate
 * client could send. Two things it deliberately never does, because conflict
 * detection compares id lists position by position: it never rewrites an id
 * (not even trimming it), and it never drops a message for being empty.
 */
export function normalizeChatMessage(raw: unknown): StoredChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, role, content, briefSections } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_CHAT_MESSAGE_ID_LENGTH) {
    return null;
  }
  if (role !== 'user' && role !== 'assistant') return null;
  if (typeof content !== 'string') return null;
  const message: StoredChatMessage = { id, role, content: clampContent(content) };
  const sections = cleanBriefSections(briefSections);
  if (sections) message.briefSections = sections;
  return message;
}

/** The chat's title: the first line of the first thing the user said. */
export function deriveConversationTitle(
  messages: ReadonlyArray<{ role: string; content: string }>
): string {
  const firstUser = messages.find(
    (message) => message.role === 'user' && message.content.trim().length > 0
  );
  return (firstUser ? deriveNoteTitle(firstUser.content) : '') || CHAT_TITLE_FALLBACK;
}

export type ParseSyncResult =
  | { ok: true; body: ChatSyncBody }
  | { ok: false; error: string; status: 400 | 413 };

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Validates a save request. A batch far past the chat cap is answered as
 *  too large (413) rather than malformed, so the client says "start a new
 *  chat" instead of "something went wrong". */
export function parseSyncBody(raw: unknown): ParseSyncResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'A save needs a body.', status: 400 };
  }
  const { baseRevision, keepCount, append } = raw as Record<string, unknown>;
  if (!isWholeNumber(baseRevision) || !isWholeNumber(keepCount)) {
    return { ok: false, error: 'baseRevision and keepCount must be whole numbers.', status: 400 };
  }
  if (!Array.isArray(append)) {
    return { ok: false, error: 'append must be a list of messages.', status: 400 };
  }
  if (append.length > MAX_CHAT_MESSAGES * 2) {
    return { ok: false, error: 'This chat is too long to save. Start a new chat.', status: 413 };
  }
  const messages: StoredChatMessage[] = [];
  for (const item of append) {
    const message = normalizeChatMessage(item);
    if (!message) {
      return { ok: false, error: 'Each message needs an id, a role and text.', status: 400 };
    }
    messages.push(message);
  }
  return { ok: true, body: { baseRevision, keepCount, append: messages } };
}

export function commonPrefixLength(a: readonly string[], b: readonly string[]): number {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) index += 1;
  return index;
}

/**
 * The save this browser needs to make, or null when the server already holds
 * exactly this transcript. Keeps the longest prefix both sides share and
 * sends everything after it — which covers appending, and a regenerated reply
 * replacing one that was already saved.
 */
export function planClientSync(
  local: readonly ChappiMessage[],
  meta: ChatSyncMeta
): ChatSyncBody | null {
  if (local.length === 0) return null;
  const keepCount = commonPrefixLength(
    local.map((message) => message.id),
    meta.serverIds
  );
  if (keepCount === local.length && keepCount === meta.serverIds.length) return null;
  return {
    baseRevision: meta.revision,
    keepCount,
    append: local.slice(keepCount).map(toStoredMessage),
  };
}

/** True when the server does not hold exactly these messages. */
export function hasUnsyncedMessages(
  messages: ReadonlyArray<{ id: string }>,
  serverIds: readonly string[]
): boolean {
  const prefix = commonPrefixLength(
    messages.map((message) => message.id),
    serverIds
  );
  return prefix !== messages.length || prefix !== serverIds.length;
}

/** The parts of a stored row the save decision needs. */
export type StoredChatRow = {
  ownerUserId: string;
  title: string;
  revision: number;
  messages: StoredChatMessage[];
};

export type SyncDecision =
  | { kind: 'insert'; messages: StoredChatMessage[]; title: string }
  | { kind: 'update'; messages: StoredChatMessage[]; title: string; nextRevision: number }
  | { kind: 'not_found' }
  | { kind: 'conflict'; revision: number; messageIds: string[] }
  | { kind: 'too_large' }
  | { kind: 'invalid'; error: string };

/**
 * The server's answer to a save, decided without touching the database.
 *
 * A missing row with a base above zero is a chat that WAS saved and has since
 * been deleted (on another device, say), so it is never re-created here: the
 * client decides whether it has anything worth keeping, and forks if it does.
 * Somebody else's chat gets the same answer as a missing one.
 */
export function applySync(
  stored: StoredChatRow | null,
  body: ChatSyncBody,
  userId: string
): SyncDecision {
  let next: StoredChatMessage[];
  if (!stored) {
    if (body.baseRevision !== 0) return { kind: 'not_found' };
    if (body.keepCount !== 0) {
      return { kind: 'invalid', error: 'A new chat cannot keep earlier messages.' };
    }
    next = body.append;
  } else {
    if (stored.ownerUserId !== userId) return { kind: 'not_found' };
    const conflict: SyncDecision = {
      kind: 'conflict',
      revision: stored.revision,
      messageIds: stored.messages.map((message) => message.id),
    };
    if (stored.revision !== body.baseRevision) return conflict;
    if (body.keepCount > stored.messages.length) return conflict;
    next = [...stored.messages.slice(0, body.keepCount), ...body.append];
  }

  if (next.length === 0) return { kind: 'invalid', error: 'A chat needs at least one message.' };
  if (next.length > MAX_CHAT_MESSAGES) return { kind: 'too_large' };
  const ids = new Set(next.map((message) => message.id));
  if (ids.size !== next.length) return { kind: 'invalid', error: 'Each message needs its own id.' };
  if (JSON.stringify(next).length > MAX_CHAT_BYTES) return { kind: 'too_large' };

  const title =
    !stored || !stored.title || stored.title === CHAT_TITLE_FALLBACK
      ? deriveConversationTitle(next)
      : stored.title;
  return stored
    ? { kind: 'update', messages: next, title, nextRevision: stored.revision + 1 }
    : { kind: 'insert', messages: next, title };
}

export type ConflictOutcome = 'adopt' | 'resend' | 'reload' | 'fork';

/**
 * Settles a save the server refused because its revision had moved.
 *   adopt  — both sides already agree (a retried save that had landed).
 *   resend — the server is behind this tab; try again from its revision.
 *   reload — another tab is ahead and this one has nothing new; show theirs.
 *   fork   — the two sides wrote different things; this tab's transcript
 *            becomes a new chat, so neither side's words are lost.
 */
export function resolveConflict(
  localIds: readonly string[],
  serverIds: readonly string[]
): ConflictOutcome {
  const prefix = commonPrefixLength(localIds, serverIds);
  if (prefix === localIds.length && prefix === serverIds.length) return 'adopt';
  if (prefix === serverIds.length) return 'resend';
  if (prefix === localIds.length) return 'reload';
  return 'fork';
}

/** Touched recently enough to resume. Inclusive at six hours; a clock a few
 *  minutes fast is tolerated, anything further in the future is not. */
export function isWithinResumeWindow(at: number, now: number): boolean {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return false;
  const elapsed = now - at;
  return elapsed <= CHAT_RESUME_WINDOW_MS && elapsed >= -CHAT_CLOCK_SKEW_MS;
}

export type NewerChatInput = {
  newest: ChatSummary | null;
  now: number;
  /** The user has typed, opened a chat or started a new one since arriving. */
  interacted: boolean;
  /** The chat on screen has messages the server does not hold yet. */
  localDirty: boolean;
  currentId: string | null;
  /** When the chat on screen was last touched here, if there is one. */
  currentActivityAt: number | null;
};

/**
 * The cross-device half of resume: a chat continued on the phone should be
 * the one the laptop reopens. Only ever on arrival — it never moves someone
 * who has started using this tab, and never abandons unsaved local work.
 */
export function shouldOpenNewerChat(input: NewerChatInput): boolean {
  const { newest, now, interacted, localDirty, currentId, currentActivityAt } = input;
  if (!newest || interacted || localDirty) return false;
  if (newest.id === currentId) return false;
  const at = Date.parse(newest.lastMessageAt);
  if (!isWithinResumeWindow(at, now)) return false;
  if (currentActivityAt !== null && Number.isFinite(currentActivityAt) && at <= currentActivityAt) {
    return false;
  }
  return true;
}

function isStoredChatMessage(value: unknown): value is StoredChatMessage {
  if (!value || typeof value !== 'object') return false;
  const { id, role, content, briefSections } = value as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= MAX_CHAT_MESSAGE_ID_LENGTH &&
    (role === 'user' || role === 'assistant') &&
    typeof content === 'string' &&
    (briefSections === undefined ||
      (Array.isArray(briefSections) && briefSections.every((item) => typeof item === 'string')))
  );
}

function isChatSummary(value: unknown): value is ChatSummary {
  if (!value || typeof value !== 'object') return false;
  const { id, title, messageCount, lastMessageAt, createdAt } = value as Record<string, unknown>;
  return (
    isChatId(id) &&
    typeof title === 'string' &&
    isWholeNumber(messageCount) &&
    typeof lastMessageAt === 'string' &&
    typeof createdAt === 'string'
  );
}

/** The browser copy of the chat on screen. `messages` is null when the whole
 *  transcript did not fit the storage budget — never a partial prefix, which
 *  would make the next save truncate the server copy to match it. */
export type ChatCacheCurrent = {
  id: string;
  revision: number;
  serverIds: string[];
  messages: StoredChatMessage[] | null;
  lastActivityAt: number;
};

export type ChatCachePayload = {
  userId: string;
  current: ChatCacheCurrent | null;
  summaries: ChatSummary[];
};

function isChatCacheCurrent(value: unknown): value is ChatCacheCurrent {
  if (!value || typeof value !== 'object') return false;
  const { id, revision, serverIds, messages, lastActivityAt } = value as Record<string, unknown>;
  return (
    isChatId(id) &&
    isWholeNumber(revision) &&
    Array.isArray(serverIds) &&
    serverIds.every((item) => typeof item === 'string') &&
    (messages === null || (Array.isArray(messages) && messages.every(isStoredChatMessage))) &&
    typeof lastActivityAt === 'number' &&
    Number.isFinite(lastActivityAt)
  );
}

export function isChatCachePayload(value: unknown): value is ChatCachePayload {
  if (!value || typeof value !== 'object') return false;
  const { userId, current, summaries } = value as Record<string, unknown>;
  return (
    typeof userId === 'string' &&
    userId.length > 0 &&
    (current === null || isChatCacheCurrent(current)) &&
    Array.isArray(summaries) &&
    summaries.every(isChatSummary)
  );
}

function compareSummaries(a: ChatSummary, b: ChatSummary): number {
  const byTime = Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt);
  if (byTime !== 0 && Number.isFinite(byTime)) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Inserts or replaces one row, keeping the list newest first. */
export function upsertChatSummary(list: readonly ChatSummary[], summary: ChatSummary): ChatSummary[] {
  return [...list.filter((item) => item.id !== summary.id), summary].sort(compareSummaries);
}

/** A fresh server page plus local chats it has not seen yet (a new chat whose
 *  first save is still on its way). The server wins for any chat it knows. */
export function mergeChatSummaries(
  server: readonly ChatSummary[],
  local: readonly ChatSummary[]
): ChatSummary[] {
  const known = new Set(server.map((item) => item.id));
  return [...server, ...local.filter((item) => !known.has(item.id))].sort(compareSummaries);
}
