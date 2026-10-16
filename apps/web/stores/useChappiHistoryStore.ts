'use client';

/**
 * UrgAns chat history — the sync engine and the history list.
 *
 * Behind NEXT_PUBLIC_FEATURE_URGANS_HISTORY (with the assistant flag). Started
 * by components/chappi/ChappiHistoryBridge.tsx for the signed-in user; reset
 * from the SIGNED_OUT branch of lib/auth-store.ts.
 *
 * ── ONE WRITER, ONE DIRECTION ──────────────────────────────────────────────
 * The transcript lives in useChappiStore, which knows nothing about saving.
 * This store SUBSCRIBES to it (one way — useChappiStore never imports this
 * file) and, whenever the transcript changes, saves it: to the server through
 * a revision-checked "replace the tail" PUT, and to the browser cache. The
 * decisions — what to send, what a refused save means — are the pure
 * functions in lib/chappi/conversation-history.ts, which carry the tests.
 *
 * ── CHATS YOU LEFT ─────────────────────────────────────────────────────────
 * Switching chats (or "New chat") keeps the outgoing transcript in memory for
 * the session as a DETACHED copy. It keeps saving until the server has it, and
 * an answer that arrives after the switch lands in it (appendToChat) — the
 * founder's call: a late answer is saved to its own chat, never dropped and
 * never shown under a different one.
 *
 * ── NEVER OVERWRITE WHAT ANOTHER TAB SAVED ─────────────────────────────────
 * A save says "keep your first K messages, then put these". That is only safe
 * when this tab's idea of the server copy (`serverIds`) is something this tab
 * actually SAW. So `serverIds` is only ever set from a save that landed, a
 * chat that was loaded onto the screen, or a conflict whose server side is a
 * prefix of ours. When another tab is AHEAD, its state is adopted only by
 * loading it; if that load fails the entry is left stale on purpose, so the
 * next save is refused again and settled against what is on screen then.
 *
 * ── SESSION TOKEN, NOT auth-store ──────────────────────────────────────────
 * The token comes from supabase.auth.getSession(), never from lib/auth-store:
 * auth-store imports this module to reset it on sign-out, so importing it
 * back would be a cycle.
 */

import { registerSignOutReset } from '@/lib/sign-out-resets';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { ChappiMessage } from '@/lib/chappi/types';
import { useChappiStore } from '@/stores/useChappiStore';
import {
  CHAT_CACHE_SUMMARY_LIMIT,
  CHAT_TITLE_FALLBACK,
  commonPrefixLength,
  deriveConversationTitle,
  hasUnsyncedMessages,
  isChappiHistoryEnabled,
  isWithinResumeWindow,
  mergeChatSummaries,
  newChatId,
  normalizeChatMessage,
  planClientSync,
  resolveConflict,
  shouldOpenNewerChat,
  toStoredMessage,
  upsertChatSummary,
  type ChatDetail,
  type ChatSummary,
  type ChatSyncResult,
  type StoredChatMessage,
} from '@/lib/chappi/conversation-history';
import { homeChatIdFor, isHomeChatId } from '@/lib/chappi/home-chat';
import { clearChatCache, readChatCache, writeChatCache } from '@/lib/chappi/conversation-cache';

const HISTORY_ENABLED = isChappiHistoryEnabled();

/** Batches a user turn and a quick reply into one save. */
const SYNC_DEBOUNCE_MS = 600;
const CACHE_DEBOUNCE_MS = 300;
/** A list loaded this recently is not fetched again on a plain open. */
const LIST_FRESH_MS = 15_000;
/** Backoff for a save that failed on the network or a 5xx. Capped, never
 *  stopped: an hour offline should still save the moment it is back. */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
/** Browsers refuse a keepalive request over 64 KiB outright, so a larger save
 *  made while the page is hidden goes as an ordinary request instead. */
const KEEPALIVE_MAX_BODY = 60_000;
/** Background requests opt out of the /locked redirect (lib/access-redirect.ts):
 *  something the user never clicked must never navigate them off the page. */
const BACKGROUND_HEADERS = { 'x-urganize-prefetch': '1' } as const;
/** The exact body every flag-gated route answers when its feature is off. A
 *  missing chat says 'Chat not found.', which is why the two can be told apart. */
const FLAG_OFF_ERROR = 'Not found.';

/**
 * saved    — the server holds what is on screen (or nothing needs saving)
 * saving   — a save is on its way
 * retrying — a save failed and will be tried again (shown to the user)
 * blocked  — saving is refused for this session: a read-only or locked team,
 *            or a request no retry can fix (shown to the user)
 * too_long — past the chat cap; the user needs a new chat (shown to the user)
 */
export type ChatSaveStatus = 'saved' | 'saving' | 'retrying' | 'blocked' | 'too_long';

type SyncEntry = {
  revision: number;
  serverIds: string[];
  status: ChatSaveStatus;
};

const DEFAULT_ENTRY: SyncEntry = { revision: 0, serverIds: [], status: 'saved' };

type ChappiHistoryState = {
  summaries: ChatSummary[];
  nextCursor: string | null;
  listStatus: 'idle' | 'loading' | 'ready' | 'error';
  isLoadingMore: boolean;
  /** The chat being fetched to open, for its row's loading state. */
  openingId: string | null;
  /** Save state per chat id. */
  sync: Record<string, SyncEntry>;
  /** A 402/403 stopped saving for the rest of the session. */
  savingBlocked: boolean;
  /** Home's permanent chat id (the user's id), or null before history starts. */
  homeChatId: string | null;
  loadList: (options?: { force?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  /** Shows a saved chat. Resolves false if it could not be opened. */
  open: (id: string) => Promise<boolean>;
  /** Deletes a chat. Throws a user-facing message on failure, for the
   *  confirmation dialog to show. */
  remove: (id: string) => Promise<void>;
};

// ── Module state: one session's bookkeeping, never rendered ───────────────

let sessionUserId: string | null = null;
let unsubscribe: (() => void) | null = null;
/** The user has sent something, opened a chat or started a new one since
 *  arriving — after which nothing opens a chat on their behalf. */
let interacted = false;
let listLoadedAt = 0;
let listInFlight: Promise<void> | null = null;
let openSeq = 0;
let cacheTimer: ReturnType<typeof setTimeout> | null = null;
/** Set around a fork's rekey so the subscription does not treat the old id as
 *  a chat being left (its transcript IS the new chat now). */
let suppressDetachFor: string | null = null;

const detached = new Map<string, ChappiMessage[]>();
const tombstones = new Set<string>();
/** A forked chat's old id → its new id, so an answer still addressed to the
 *  old id follows the transcript it belongs to. */
const renamed = new Map<string, string>();
const inFlight = new Map<string, Promise<void>>();
const rerun = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const retryAttempts = new Map<string, number>();
/** When each chat was last used here — the resume clock. Opening a chat by
 *  hand counts; one restored automatically keeps its real last activity, or
 *  reloading every few hours would keep a chat "recent" forever. */
const activityAt = new Map<string, number>();

async function getAccessToken(): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
  } catch {
    return '';
  }
}

function resolveChatId(id: string): string {
  let current = id;
  for (let hops = 0; hops < 8; hops += 1) {
    const next = renamed.get(current);
    if (!next) break;
    current = next;
  }
  return current;
}

function isCurrent(id: string): boolean {
  return useChappiStore.getState().conversationId === id;
}

function transcriptFor(id: string): ChappiMessage[] | null {
  const chappi = useChappiStore.getState();
  if (chappi.conversationId === id) return chappi.messages;
  return detached.get(id) ?? null;
}

function setSyncEntry(id: string, patch: Partial<SyncEntry>) {
  useChappiHistoryStore.setState((state) => ({
    sync: { ...state.sync, [id]: { ...(state.sync[id] ?? DEFAULT_ENTRY), ...patch } },
  }));
}

function upsertSummary(summary: ChatSummary) {
  useChappiHistoryStore.setState((state) => ({
    summaries: upsertChatSummary(state.summaries, summary),
  }));
}

function removeSummary(id: string) {
  useChappiHistoryStore.setState((state) => ({
    summaries: state.summaries.filter((summary) => summary.id !== id),
  }));
}

/** Moves a chat to the top of the list the moment it changes here, before its
 *  save lands. Mirrors the server's title rule: a real title, once set, stays. */
function upsertLocalSummary(id: string, messages: readonly ChappiMessage[]) {
  const existing = useChappiHistoryStore.getState().summaries.find((summary) => summary.id === id);
  const nowIso = new Date().toISOString();
  upsertSummary({
    id,
    title:
      existing && existing.title && existing.title !== CHAT_TITLE_FALLBACK
        ? existing.title
        : deriveConversationTitle(messages),
    messageCount: messages.length,
    lastMessageAt: nowIso,
    createdAt: existing?.createdAt ?? nowIso,
  });
}

function summaryFromDetail(detail: ChatDetail): ChatSummary {
  return {
    id: detail.id,
    title: detail.title,
    messageCount: detail.messageCount,
    lastMessageAt: detail.lastMessageAt,
    createdAt: detail.createdAt,
  };
}

// ── Browser cache ──────────────────────────────────────────────────────────

function writeCacheNow() {
  if (!sessionUserId) return;
  const chappi = useChappiStore.getState();
  const history = useChappiHistoryStore.getState();
  const id = chappi.conversationId;
  const entry = id ? history.sync[id] : undefined;
  writeChatCache({
    userId: sessionUserId,
    current:
      id && chappi.messages.length > 0
        ? {
            id,
            revision: entry?.revision ?? 0,
            serverIds: entry?.serverIds ?? [],
            messages: chappi.messages.map(toStoredMessage),
            lastActivityAt: activityAt.get(id) ?? Date.now(),
          }
        : null,
    summaries: history.summaries.slice(0, CHAT_CACHE_SUMMARY_LIMIT),
  });
}

function scheduleCacheWrite() {
  if (!sessionUserId) return;
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    cacheTimer = null;
    writeCacheNow();
  }, CACHE_DEBOUNCE_MS);
}

// ── Sync engine ──────────────────────────────────────────────────────────────

function scheduleSync(id: string, delay: number = SYNC_DEBOUNCE_MS) {
  if (!sessionUserId || tombstones.has(id)) return;
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void runSync(id);
    }, delay)
  );
}

function scheduleRetry(id: string) {
  const attempt = retryAttempts.get(id) ?? 0;
  retryAttempts.set(id, attempt + 1);
  // The first failure stays quiet: a two-second blip should not flash "not
  // saved" under the composer. From the second, the user is told.
  setSyncEntry(id, { status: attempt >= 1 ? 'retrying' : 'saving' });
  scheduleSync(id, RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
}

/** One save in flight per chat. A change that arrives meanwhile re-runs it
 *  afterwards (the notes autosave loop), so nothing typed mid-save is lost
 *  and two saves for one chat never race each other. */
function runSync(id: string, keepalive = false): Promise<void> {
  const running = inFlight.get(id);
  if (running) {
    rerun.add(id);
    return running;
  }
  const run = (async () => {
    try {
      await syncOnce(id, keepalive);
    } finally {
      inFlight.delete(id);
      if (rerun.delete(id)) scheduleSync(id, 0);
    }
  })();
  inFlight.set(id, run);
  return run;
}

async function syncOnce(id: string, keepalive: boolean): Promise<void> {
  const owner = sessionUserId;
  if (!owner || tombstones.has(id)) return;
  const history = useChappiHistoryStore.getState();
  if (history.savingBlocked) return;
  const entry = history.sync[id] ?? DEFAULT_ENTRY;
  if (entry.status === 'too_long' || entry.status === 'blocked') return;

  const transcript = transcriptFor(id);
  if (!transcript) return;
  const plan = planClientSync(transcript, entry);
  if (!plan) {
    if (entry.status !== 'saved') setSyncEntry(id, { status: 'saved' });
    return;
  }

  const token = await getAccessToken();
  if (owner !== sessionUserId) return;
  if (!token) {
    scheduleRetry(id);
    return;
  }
  if (entry.status !== 'retrying') setSyncEntry(id, { status: 'saving' });

  const body = JSON.stringify(plan);
  let response: Response;
  try {
    response = await fetch(`/api/urgans/conversations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...BACKGROUND_HEADERS,
      },
      body,
      cache: 'no-store',
      keepalive: keepalive && body.length < KEEPALIVE_MAX_BODY,
    });
  } catch {
    if (owner === sessionUserId) scheduleRetry(id);
    return;
  }
  // The account changed while the save was in flight: whatever came back
  // belongs to a session that has ended.
  if (owner !== sessionUserId) return;
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (owner !== sessionUserId) return;

  if (response.ok && data) {
    const result = data as unknown as ChatSyncResult;
    const serverIds = Array.isArray(result.messageIds) ? result.messageIds.map(String) : [];
    const revision = Number(result.revision);
    if (!Number.isInteger(revision) || revision < 1) {
      scheduleRetry(id);
      return;
    }
    retryAttempts.delete(id);
    setSyncEntry(id, { revision, serverIds, status: 'saved' });
    const existing = useChappiHistoryStore
      .getState()
      .summaries.find((summary) => summary.id === id);
    const lastMessageAt = String(result.lastMessageAt || new Date().toISOString());
    upsertSummary({
      id,
      title: String(result.title || CHAT_TITLE_FALLBACK),
      messageCount: serverIds.length,
      lastMessageAt,
      createdAt: existing?.createdAt ?? lastMessageAt,
    });
    scheduleCacheWrite();
    return;
  }

  await handleSyncFailure(id, response.status, data, plan.baseRevision);
}

async function handleSyncFailure(
  id: string,
  status: number,
  data: Record<string, unknown> | null,
  baseRevision: number
): Promise<void> {
  switch (status) {
    case 409: {
      const revision = Number(data?.revision);
      const serverIds = Array.isArray(data?.messageIds)
        ? (data.messageIds as unknown[]).filter((item): item is string => typeof item === 'string')
        : null;
      if (!Number.isInteger(revision) || revision < 0 || !serverIds) {
        scheduleRetry(id);
        return;
      }
      // Settled against the transcript as it is NOW, which may have grown
      // while the refused save was in flight.
      const localIds = (transcriptFor(id) ?? []).map((message) => message.id);
      const outcome = resolveConflict(localIds, serverIds);
      if (outcome === 'adopt') {
        retryAttempts.delete(id);
        setSyncEntry(id, { revision, serverIds, status: 'saved' });
        scheduleCacheWrite();
      } else if (outcome === 'resend') {
        // The server holds a prefix of what is on screen, so adopting its
        // state is safe: the next save only ever appends.
        setSyncEntry(id, { revision, serverIds, status: 'saving' });
        rerun.add(id);
      } else if (outcome === 'reload') {
        // Another tab is ahead. Its state is adopted only by loading it —
        // see "never overwrite what another tab saved" at the top.
        await reloadChat(id);
      } else {
        forkChat(id);
      }
      return;
    }
    case 404:
      if (tombstones.has(id)) return;
      // A fork always saves from revision 0, and a 404 there cannot mean
      // "deleted elsewhere" — it is a feature switched off on the server, or
      // a fault. Stopping here is what makes a fork loop impossible.
      if (baseRevision === 0 || data?.error === FLAG_OFF_ERROR) {
        setSyncEntry(id, { status: 'blocked' });
        return;
      }
      // Saved once, deleted somewhere else since, and this tab has something
      // to add (a save is only ever sent when there is): keep it as a new chat
      // rather than resurrect the deleted one or lose what was typed.
      forkChat(id);
      return;
    case 413:
      setSyncEntry(id, { status: 'too_long' });
      return;
    case 402:
    case 403:
      // A locked or read-only team. Saving stops for the session; the browser
      // copy keeps the chat, and nothing on screen is lost.
      useChappiHistoryStore.setState({ savingBlocked: true });
      setSyncEntry(id, { status: 'blocked' });
      return;
    case 400:
      // Malformed by our own hand; sending it again cannot help.
      setSyncEntry(id, { status: 'blocked' });
      return;
    default:
      scheduleRetry(id);
  }
}

/** The fork outcome: this tab's transcript becomes a brand new chat, saved
 *  from scratch, and the other side keeps the original id. */
function forkChat(oldId: string) {
  const transcript = transcriptFor(oldId);
  if (!transcript || transcript.length === 0) return;
  const newId = newChatId();
  renamed.set(oldId, newId);
  if (isCurrent(oldId)) {
    suppressDetachFor = oldId;
    try {
      useChappiStore.getState().rekeyConversation(newId);
    } finally {
      suppressDetachFor = null;
    }
  } else {
    detached.set(newId, transcript);
    detached.delete(oldId);
  }
  activityAt.set(newId, activityAt.get(oldId) ?? Date.now());
  setSyncEntry(newId, { revision: 0, serverIds: [], status: 'saving' });
  upsertLocalSummary(newId, transcript);
  scheduleSync(newId, 0);
  scheduleCacheWrite();
}

async function fetchChat(id: string): Promise<ChatDetail | null> {
  const owner = sessionUserId;
  const token = await getAccessToken();
  if (!token || owner !== sessionUserId) return null;
  try {
    const response = await fetch(`/api/urgans/conversations/${id}`, {
      headers: { Authorization: `Bearer ${token}`, ...BACKGROUND_HEADERS },
      cache: 'no-store',
    });
    if (owner !== sessionUserId) return null;
    if (response.status === 404) {
      removeSummary(id);
      return null;
    }
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as { chat?: Record<string, unknown> } | null;
    const chat = data?.chat;
    if (!chat || chat.id !== id || !Array.isArray(chat.messages)) return null;
    const messages: StoredChatMessage[] = [];
    for (const item of chat.messages) {
      const message = normalizeChatMessage(item);
      if (message) messages.push(message);
    }
    return {
      id,
      title: String(chat.title ?? CHAT_TITLE_FALLBACK),
      messageCount: Number(chat.messageCount ?? messages.length),
      lastMessageAt: String(chat.lastMessageAt ?? ''),
      createdAt: String(chat.createdAt ?? ''),
      revision: Number(chat.revision ?? 0),
      messages,
    };
  } catch {
    return null;
  }
}

/** The reload outcome: another tab is ahead and this one had nothing new, so
 *  show theirs. If something was typed here while theirs was on its way, the
 *  two sides now differ, and this tab's transcript becomes its own chat. */
async function reloadChat(id: string) {
  const detail = await fetchChat(id);
  if (!sessionUserId || tombstones.has(id)) return;
  if (!detail) {
    // Nothing on screen is missing from the server, so "saved" is true. The
    // entry stays at our old revision on purpose: the next save is refused
    // again and settled against whatever is on screen by then.
    setSyncEntry(id, { status: 'saved' });
    return;
  }
  const serverIds = detail.messages.map((message) => message.id);
  const localIds = (transcriptFor(id) ?? []).map((message) => message.id);
  if (commonPrefixLength(localIds, serverIds) !== localIds.length) {
    forkChat(id);
    return;
  }
  retryAttempts.delete(id);
  setSyncEntry(id, { revision: detail.revision, serverIds, status: 'saved' });
  upsertSummary(summaryFromDetail(detail));
  if (isCurrent(id)) {
    useChappiStore.getState().loadConversation({ id, messages: detail.messages });
  } else if (detached.has(id)) {
    detached.set(id, detail.messages);
  }
  scheduleCacheWrite();
}

/**
 * Opens a chat. `auto` marks an open nobody asked for (resuming on arrival):
 * it gives up if the user starts doing something while the chat is on its
 * way, and it keeps the chat's real last activity rather than "now".
 */
async function openInternal(id: string, auto: boolean): Promise<boolean> {
  if (!sessionUserId) return false;
  const chappi = useChappiStore.getState();
  if (chappi.conversationId === id) return true;

  const local = auto ? undefined : detached.get(id);
  if (local) {
    activityAt.set(id, Date.now());
    chappi.loadConversation({ id, messages: local });
    scheduleSync(id, 0);
    return true;
  }

  const expectedCurrent = chappi.conversationId;
  const seq = (openSeq += 1);
  useChappiHistoryStore.setState({ openingId: id });
  const detail = await fetchChat(id);
  // A later open (or a sign-out) superseded this one while it was fetching.
  if (seq !== openSeq) return false;
  useChappiHistoryStore.setState({ openingId: null });
  if (!detail || !sessionUserId) return false;
  if (auto && (interacted || useChappiStore.getState().conversationId !== expectedCurrent)) {
    return false;
  }

  setSyncEntry(id, {
    revision: detail.revision,
    serverIds: detail.messages.map((message) => message.id),
    status: 'saved',
  });
  upsertSummary(summaryFromDetail(detail));
  const lastAt = Date.parse(detail.lastMessageAt);
  activityAt.set(id, auto && Number.isFinite(lastAt) ? lastAt : Date.now());
  useChappiStore.getState().loadConversation({ id, messages: detail.messages });
  return true;
}

// ── Subscription to the transcript ──────────────────────────────────────────

type ChappiSnapshot = ReturnType<typeof useChappiStore.getState>;

function onTranscriptChange(state: ChappiSnapshot, prev: ChappiSnapshot) {
  if (!sessionUserId) return;
  const idChanged = state.conversationId !== prev.conversationId;
  const replaced = state.epoch !== prev.epoch;

  // Leaving a chat: keep its transcript for the session, so its unsaved tail
  // still saves and a late answer still has somewhere to land.
  const leaving = prev.conversationId;
  if (
    idChanged &&
    leaving &&
    prev.messages.length > 0 &&
    leaving !== suppressDetachFor &&
    !tombstones.has(leaving)
  ) {
    detached.set(leaving, prev.messages);
    scheduleSync(leaving, 0);
  }

  // "New chat": the transcript was replaced by nothing.
  if (replaced && state.conversationId === null && prev.messages.length > 0) {
    interacted = true;
  }

  const id = state.conversationId;
  if (!id) {
    if (idChanged || replaced) scheduleCacheWrite();
    return;
  }

  if (state.messages !== prev.messages) {
    // Added to (or regenerated) here — this session's own activity — as
    // opposed to a saved chat being loaded, which bumps the epoch.
    const changedHere = !replaced && (id === prev.conversationId || prev.conversationId === null);
    if (changedHere) {
      interacted = true;
      activityAt.set(id, Date.now());
      upsertLocalSummary(id, state.messages);
    }
    scheduleSync(id);
    scheduleCacheWrite();
  } else if (idChanged) {
    scheduleCacheWrite();
  }
}

function maybeOpenNewerChat() {
  if (!sessionUserId) return;
  const history = useChappiHistoryStore.getState();
  const chappi = useChappiStore.getState();
  const currentId = chappi.conversationId;
  const entry = currentId ? history.sync[currentId] : undefined;
  const newest = history.summaries[0] ?? null;
  const localDirty = Boolean(
    currentId && hasUnsyncedMessages(chappi.messages, entry?.serverIds ?? [])
  );
  if (
    newest &&
    shouldOpenNewerChat({
      newest,
      now: Date.now(),
      interacted,
      localDirty,
      currentId,
      currentActivityAt: currentId ? activityAt.get(currentId) ?? null : null,
    })
  ) {
    void openInternal(newest.id, true);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts saving for one signed-in user, once per page load: subscribes to the
 * transcript, restores a chat used in the last six hours from the browser
 * copy, saves any tail a reload interrupted, then loads the list and — if the
 * user has not started doing anything — opens a newer chat from another
 * device. A no-op with the flag off.
 */
export function startChappiHistory(userId: string): void {
  if (!HISTORY_ENABLED || !userId) return;
  if (sessionUserId === userId && unsubscribe) return;
  if (sessionUserId && sessionUserId !== userId) {
    // A different account without a sign-out reaching this tab: nothing of the
    // previous account's may stay on screen or in the browser copy.
    resetChappiHistory();
    useChappiStore.getState().resetForSignOut();
  }

  sessionUserId = userId;
  useChappiHistoryStore.setState({ homeChatId: homeChatIdFor(userId) });
  interacted = false;
  unsubscribe = useChappiStore.subscribe(onTranscriptChange);

  const now = Date.now();
  const cached = readChatCache(userId);
  if (cached) {
    useChappiHistoryStore.setState({
      summaries: cached.summaries,
      listStatus: cached.summaries.length > 0 ? 'ready' : 'idle',
    });
    const current = cached.current;
    if (current) {
      setSyncEntry(current.id, {
        revision: current.revision,
        serverIds: current.serverIds,
        status: 'saved',
      });
      activityAt.set(current.id, current.lastActivityAt);
      const chappi = useChappiStore.getState();
      const screenIsFree = chappi.messages.length === 0 && chappi.conversationId === null;
      const recent = isWithinResumeWindow(current.lastActivityAt, now);
      if (current.messages && current.messages.length > 0) {
        if (recent && screenIsFree) {
          chappi.loadConversation({ id: current.id, messages: current.messages });
          scheduleSync(current.id, 0);
        } else if (hasUnsyncedMessages(current.messages, current.serverIds)) {
          // Not resumed on screen, but a tail a reload interrupted still saves.
          detached.set(current.id, current.messages);
          scheduleSync(current.id, 0);
        }
      } else if (recent && screenIsFree) {
        // Too big for the browser copy: fetch it instead.
        void openInternal(current.id, true);
      }
    }
  }

  // A first message sent before this started still saves.
  const chappiNow = useChappiStore.getState();
  if (chappiNow.conversationId && chappiNow.messages.length > 0) {
    scheduleSync(chappiNow.conversationId, 0);
  }

  void useChappiHistoryStore
    .getState()
    .loadList({ force: true })
    .then(() => maybeOpenNewerChat());
}

/** Stops saving and forgets the session's bookkeeping. Leaves the browser
 *  copy alone; resetChappiHistory wipes it too. */
export function stopChappiHistory(): void {
  unsubscribe?.();
  unsubscribe = null;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = null;
  detached.clear();
  tombstones.clear();
  renamed.clear();
  rerun.clear();
  retryAttempts.clear();
  activityAt.clear();
  inFlight.clear();
  sessionUserId = null;
  interacted = false;
  listLoadedAt = 0;
  listInFlight = null;
  openSeq += 1;
  useChappiHistoryStore.setState({
    summaries: [],
    nextCursor: null,
    listStatus: 'idle',
    isLoadingMore: false,
    openingId: null,
    sync: {},
    savingBlocked: false,
    homeChatId: null,
  });
}

/** Sign-out: everything stopChappiHistory does, plus the browser copy.
 *  Called from lib/auth-store.ts BEFORE the transcript itself is reset, so the
 *  reset is not mistaken for leaving a chat that still needs saving. */
export function resetChappiHistory(): void {
  stopChappiHistory();
  clearChatCache();
}

/** Saves everything pending now, skipping the debounce — the page is being
 *  hidden, and a phone may never bring it back. */
export function flushChappiHistory(): void {
  if (!sessionUserId) return;
  for (const [id, timer] of timers) {
    clearTimeout(timer);
    timers.delete(id);
    void runSync(id, true);
  }
  if (cacheTimer) {
    clearTimeout(cacheTimer);
    cacheTimer = null;
  }
  writeCacheNow();
}

/** Back online: retry every failed save now rather than at its backoff. */
export function retryChappiHistory(): void {
  if (!sessionUserId) return;
  for (const id of [...retryAttempts.keys()]) {
    scheduleSync(id, 0);
  }
}

/**
 * Delivers an answer that arrived after its chat left the screen (the
 * founder's "save it to its own chat" call). Appends to the live transcript if
 * that chat is back on screen, else to its detached copy, and saves. Returns
 * false when there is nowhere to put it — history off, a different session, a
 * chat deleted here — and the caller drops it.
 */
export function appendToChat(id: string, message: ChappiMessage): boolean {
  if (!HISTORY_ENABLED || !sessionUserId) return false;
  const target = resolveChatId(id);
  if (tombstones.has(target)) return false;
  const chappi = useChappiStore.getState();
  if (chappi.conversationId === target) {
    chappi.appendMessage(message);
    return true;
  }
  const transcript = detached.get(target);
  if (!transcript) return false;
  const next = [...transcript, message];
  detached.set(target, next);
  activityAt.set(target, Date.now());
  upsertLocalSummary(target, next);
  scheduleSync(target, 0);
  return true;
}

export const useChappiHistoryStore = create<ChappiHistoryState>((set, get) => ({
  summaries: [],
  nextCursor: null,
  listStatus: 'idle',
  isLoadingMore: false,
  openingId: null,
  sync: {},
  savingBlocked: false,
  homeChatId: null,

  loadList: async (options) => {
    if (!sessionUserId) return;
    if (!options?.force) {
      if (listInFlight) return listInFlight;
      if (get().listStatus === 'ready' && Date.now() - listLoadedAt < LIST_FRESH_MS) return;
    }
    const owner = sessionUserId;
    const run = (async () => {
      if (get().summaries.length === 0) set({ listStatus: 'loading' });
      const fallbackStatus = () => (get().summaries.length > 0 ? 'ready' : 'error');
      const token = await getAccessToken();
      if (owner !== sessionUserId) return;
      if (!token) {
        set({ listStatus: fallbackStatus() });
        return;
      }
      try {
        const response = await fetch('/api/urgans/conversations', {
          headers: { Authorization: `Bearer ${token}`, ...BACKGROUND_HEADERS },
          cache: 'no-store',
        });
        if (owner !== sessionUserId) return;
        if (!response.ok) {
          set({ listStatus: fallbackStatus() });
          return;
        }
        const data = (await response.json()) as { chats?: ChatSummary[]; nextCursor?: string | null };
        if (owner !== sessionUserId) return;
        const chats = Array.isArray(data.chats) ? data.chats : [];
        const onServer = new Set(chats.map((chat) => chat.id));
        // Keep only chats created here whose first save has not landed yet.
        // A cached row the server no longer lists was deleted somewhere else
        // (or aged onto a later page) and must not linger as a ghost.
        const { sync } = get();
        const unsaved = get().summaries.filter(
          (summary) => !onServer.has(summary.id) && sync[summary.id]?.revision === 0
        );
        listLoadedAt = Date.now();
        set({
          summaries: mergeChatSummaries(chats, unsaved),
          nextCursor: data.nextCursor ?? null,
          listStatus: 'ready',
        });
        scheduleCacheWrite();
      } catch {
        if (owner === sessionUserId) set({ listStatus: fallbackStatus() });
      }
    })();
    listInFlight = run;
    try {
      await run;
    } finally {
      if (listInFlight === run) listInFlight = null;
    }
  },

  loadMore: async () => {
    const { nextCursor, isLoadingMore } = get();
    if (!nextCursor || isLoadingMore || !sessionUserId) return;
    const owner = sessionUserId;
    set({ isLoadingMore: true });
    try {
      const token = await getAccessToken();
      if (!token || owner !== sessionUserId) return;
      const response = await fetch(
        `/api/urgans/conversations?cursor=${encodeURIComponent(nextCursor)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
      );
      if (owner !== sessionUserId || !response.ok) return;
      const data = (await response.json()) as { chats?: ChatSummary[]; nextCursor?: string | null };
      if (owner !== sessionUserId) return;
      const chats = Array.isArray(data.chats) ? data.chats : [];
      set((state) => ({
        summaries: mergeChatSummaries(chats, state.summaries),
        nextCursor: data.nextCursor ?? null,
      }));
    } catch {
      // The button stays; the next tap tries again.
    } finally {
      if (owner === sessionUserId) set({ isLoadingMore: false });
    }
  },

  open: async (id) => {
    interacted = true;
    return openInternal(id, false);
  },

  remove: async (id) => {
    if (!sessionUserId) throw new Error('Sign in again to delete this session.');
    if (isHomeChatId(id, homeChatIdFor(sessionUserId))) {
      throw new Error("Home's chat stays. Start a session to chat about something else.");
    }
    const owner = sessionUserId;
    // Tombstoned first, so no save can recreate the chat while the delete is out.
    tombstones.add(id);
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    // A save already on its way would land after the delete and bring the
    // chat back, so the delete waits for it.
    const pending = inFlight.get(id);
    if (pending) await pending.catch(() => undefined);

    let ok = false;
    let serverMessage = '';
    try {
      const token = await getAccessToken();
      if (token && owner === sessionUserId) {
        const response = await fetch(`/api/urgans/conversations/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        ok = response.ok;
        if (!ok) {
          const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
          if (typeof data?.error === 'string') serverMessage = data.error;
        }
      }
    } catch {
      ok = false;
    }
    if (owner !== sessionUserId) return;
    if (!ok) {
      tombstones.delete(id);
      scheduleSync(id, 0);
      throw new Error(
        serverMessage && serverMessage !== FLAG_OFF_ERROR
          ? serverMessage
          : 'Could not delete this session. Check your connection and try again.'
      );
    }

    detached.delete(id);
    retryAttempts.delete(id);
    activityAt.delete(id);
    set((state) => {
      const sync = { ...state.sync };
      delete sync[id];
      return { sync, summaries: state.summaries.filter((summary) => summary.id !== id) };
    });
    if (isCurrent(id)) useChappiStore.getState().reset();
    scheduleCacheWrite();
  },
}));

/**
 * Puts Home's permanent chat on screen: opens it if it exists, otherwise a
 * blank transcript whose first message will create it under the fixed id.
 * Whatever was on screen is kept for the session by the usual leave-a-chat
 * path, so a session (or a reply still on its way) is never lost.
 */
export async function showHomeChat(): Promise<void> {
  if (!HISTORY_ENABLED || !sessionUserId) return;
  const homeId = homeChatIdFor(sessionUserId);
  if (!homeId) return;
  const chappi = useChappiStore.getState();
  if (chappi.conversationId === homeId) return;
  if (chappi.conversationId === null && chappi.nextChatId === homeId) return;
  interacted = true;
  const opened = await openInternal(homeId, false);
  if (opened || !sessionUserId) return;
  // Nothing saved under the fixed id yet (or it could not be fetched): start
  // it empty. A save that finds an existing row settles through the normal
  // conflict rules.
  const now = useChappiStore.getState();
  if (now.conversationId === homeId) return;
  now.reset();
  useChappiStore.getState().setNextChatId(homeId);
}

/**
 * The one line the composer shows about saving for the chat on screen, or
 * null. Only states where saving has stopped or failed earn a line; an
 * ordinary save in progress does not.
 */
export function selectChatSaveNotice(
  state: Pick<ChappiHistoryState, 'sync' | 'savingBlocked'>,
  conversationId: string | null
): 'retrying' | 'blocked' | 'too_long' | null {
  if (!conversationId) return null;
  const status = state.sync[conversationId]?.status;
  if (status === 'too_long') return 'too_long';
  if (state.savingBlocked || status === 'blocked') return 'blocked';
  if (status === 'retrying') return 'retrying';
  return null;
}

// Sign-out: see lib/sign-out-resets.ts (runs from lib/auth-store.ts).
registerSignOutReset('chappi-history', resetChappiHistory);
