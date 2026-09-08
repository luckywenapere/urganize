/**
 * The offline mutation queue: FIFO storage plus the pure decision logic for
 * what happens to a queued item on each flush attempt. This module knows
 * nothing about tasks, notes, or uploads — it stores opaque records and
 * calls back into caller-supplied replay functions, so each feature's own
 * store/hook owns the actual mutation shape and how to apply a successful
 * replay (swap a temp id, update a cached row, run the existing upload
 * write-through). Keeping that split is what lets a new queueable kind be
 * added without touching this file's flush loop.
 *
 * Storage is IndexedDB (lib/offline/idb.ts) because a cover-art/song File
 * has to survive alongside its metadata, and localStorage's quota rules
 * out anything that size.
 */

import { idbDelete, idbGetAll, idbPut } from './idb';

export type QueuedMutationKind =
  | 'task_create'
  | 'note_create'
  | 'cover_art_upload'
  | 'song_upload';

export type TaskCreatePayload = {
  title: string;
  releaseId: string;
  groupId?: string | null;
  assignedToUserId?: string | null;
  dueDate?: string | null;
};

export type NoteCreatePayload = {
  body: string;
  releaseId?: string | null;
};

export type CoverArtUploadPayload = {
  releaseId: string;
  dimensions?: { width: number; height: number } | null;
};

export type SongUploadPayload = {
  releaseId: string;
};

type QueuedItemBase = {
  id: string;
  /** The session user id at enqueue time. A flush only ever replays items
   * belonging to the CURRENTLY signed-in user — a shared device or a
   * mid-session account switch must never sync one person's queued work
   * under another's session. */
  userId: string;
  createdAt: number;
  /** How many flush attempts have already run against this item. Only
   * server-error (5xx) outcomes increment this — a network failure stops
   * the flush before any attempt counts against the item, and a client
   * error (4xx) drops it immediately regardless of count. */
  attempts: number;
};

export type QueuedMutation =
  | (QueuedItemBase & { kind: 'task_create'; payload: TaskCreatePayload })
  | (QueuedItemBase & { kind: 'note_create'; payload: NoteCreatePayload })
  | (QueuedItemBase & { kind: 'cover_art_upload'; payload: CoverArtUploadPayload; blob: File })
  | (QueuedItemBase & { kind: 'song_upload'; payload: SongUploadPayload; blob: File });

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `offline-${crypto.randomUUID()}`;
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueue<T extends QueuedMutation>(
  item: Omit<T, 'id' | 'createdAt' | 'attempts'> & { id?: string }
): Promise<T> {
  const record = {
    ...item,
    id: item.id ?? generateId(),
    createdAt: Date.now(),
    attempts: 0,
  } as T;
  await idbPut(record);
  notifyListeners();
  return record;
}

export async function listQueued(userId?: string): Promise<QueuedMutation[]> {
  const all = await idbGetAll<QueuedMutation>();
  const scoped = userId ? all.filter((item) => item.userId === userId) : all;
  return scoped.slice().sort((a, b) => a.createdAt - b.createdAt);
}

export async function pendingCount(userId: string): Promise<number> {
  return (await listQueued(userId)).length;
}

/** Merges into a still-queued item's payload — for the case where a note
 * that hasn't synced yet is edited again before it ever reaches the
 * server: the autosave loop should update the ONE pending create rather
 * than queue a second mutation that would race it. No-ops if the item is
 * gone (already synced or dropped). */
export async function mutateQueuedPayload<T extends QueuedMutation>(
  id: string,
  patch: Partial<T['payload']>
): Promise<void> {
  const all = await idbGetAll<QueuedMutation>();
  const existing = all.find((item) => item.id === id);
  if (!existing) return;
  await idbPut({ ...existing, payload: { ...existing.payload, ...patch } });
  notifyListeners();
}

/**
 * Drop one queued item without replaying it.
 *
 * The case this exists for: deleting a note that was captured offline and
 * has never reached the server. There is no server row to DELETE — its id
 * is this queue item's id — and leaving the item behind would resurrect the
 * note on the next flush, which is exactly what somebody deleting it does
 * not want.
 *
 * Silent when the id is not queued: already synced, already dropped and
 * never there are all the same to a caller that just wants it gone.
 */
export async function removeQueued(id: string): Promise<void> {
  await idbDelete(id);
  notifyListeners();
}

type PendingCountListener = () => void;
const listeners = new Set<PendingCountListener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

/** Subscribes to "the queue changed" — no payload, callers re-read
 * pendingCount() themselves. Kept this simple because the only consumer is
 * a banner that just needs to know when to re-check. */
export function subscribeQueueChanges(listener: PendingCountListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- Flush decision logic (pure, unit-tested independently of IndexedDB) ----

export type FlushAttemptResult =
  | { kind: 'success' }
  | { kind: 'network_failure' }
  | { kind: 'client_error'; status: number }
  | { kind: 'server_error'; status: number };

export type FlushDecision =
  | { action: 'dequeue' }
  | { action: 'requeue' }
  | { action: 'drop'; reason: 'client_error' | 'exhausted' }
  | { action: 'stop' };

/** A server error gets this many total flush ATTEMPTS (not flush RUNS —
 * each call to flush() only tries an item once) before it's given up on.
 * Three, not one: the AI-provider retry philosophy this repo already
 * applies server-side (lib/ai/provider.ts) — a single 500 is often
 * transient, but a queued mutation that keeps failing across three
 * separate reconnects is unlikely to ever succeed and would otherwise
 * block every item behind it forever. */
export const MAX_SERVER_ERROR_ATTEMPTS = 3;

/**
 * Decides what happens to ONE queued item after one replay attempt.
 * Deliberately synchronous and side-effect-free: the flush loop is the
 * only thing that touches storage, based on what this returns.
 *
 * - success → the mutation landed, remove it.
 * - network_failure → the connection dropped mid-flush; every item after
 *   this one would fail the same way, so the whole run stops here rather
 *   than burning through attempts on items that never got a real try.
 * - client_error (4xx) → the server rejected the request outright (bad
 *   data, a release that no longer exists, an ownership check). No number
 *   of retries fixes that — drop it and let the caller surface a "1
 *   change couldn't sync" notice, but keep trying the rest of the queue.
 * - server_error (5xx) → probably transient. Requeue and try again on the
 *   next flush, up to MAX_SERVER_ERROR_ATTEMPTS attempts total.
 */
export function decideFlushOutcome(result: FlushAttemptResult, attemptsSoFar: number): FlushDecision {
  switch (result.kind) {
    case 'success':
      return { action: 'dequeue' };
    case 'network_failure':
      return { action: 'stop' };
    case 'client_error':
      return { action: 'drop', reason: 'client_error' };
    case 'server_error':
      return attemptsSoFar + 1 >= MAX_SERVER_ERROR_ATTEMPTS
        ? { action: 'drop', reason: 'exhausted' }
        : { action: 'requeue' };
  }
}

export type FlushOutcome = { synced: number; dropped: number };

export type FlushHandlers = {
  /** Runs the actual replay for one item. Must classify its own failure
   * into a FlushAttemptResult — never throw. */
  replay(item: QueuedMutation, token: string): Promise<FlushAttemptResult & { data?: unknown }>;
  /** Called once per successfully-synced item, with whatever `replay`
   * returned in `data` (a server task/note/asset row) — this is the hook
   * a store uses to swap a temp id for the real one. */
  onSynced?(item: QueuedMutation, data: unknown): void;
  onDropped?(item: QueuedMutation, reason: 'client_error' | 'exhausted'): void;
};

/**
 * Replays every queued item for `userId`, oldest first, stopping at the
 * first network failure (see decideFlushOutcome). Never throws — a flush
 * that can't make progress just returns what it managed before the
 * network failure, and the caller (an `online` event, a manual retry) is
 * free to call it again later.
 */
export async function flush(
  userId: string,
  getAccessToken: () => Promise<string>,
  handlers: FlushHandlers
): Promise<FlushOutcome> {
  const items = await listQueued(userId);
  let synced = 0;
  let dropped = 0;

  for (const item of items) {
    const token = await getAccessToken();
    if (!token) break; // No session to replay under — try again once one exists.

    let attemptResult: FlushAttemptResult & { data?: unknown };
    try {
      attemptResult = await handlers.replay(item, token);
    } catch {
      // A replay implementation that throws instead of classifying is a
      // bug in that handler, but it must not corrupt the queue — treat an
      // unclassified throw as a network failure (the safest assumption:
      // stop rather than risk dropping something that might have worked).
      attemptResult = { kind: 'network_failure' };
    }

    const decision = decideFlushOutcome(attemptResult, item.attempts);

    if (decision.action === 'dequeue') {
      await idbDelete(item.id);
      synced += 1;
      handlers.onSynced?.(item, attemptResult.data);
      continue;
    }
    if (decision.action === 'drop') {
      await idbDelete(item.id);
      dropped += 1;
      handlers.onDropped?.(item, decision.reason);
      continue;
    }
    if (decision.action === 'requeue') {
      await idbPut({ ...item, attempts: item.attempts + 1 });
      continue;
    }
    // 'stop' — a network failure. Halt here; everything from this item
    // onward stays queued exactly as it was.
    break;
  }

  if (synced > 0 || dropped > 0) notifyListeners();
  return { synced, dropped };
}
