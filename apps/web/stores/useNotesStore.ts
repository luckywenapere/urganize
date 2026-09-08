'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { sortNotes } from '@/lib/notes';
import type { Note } from '@/types/notes';
import { isNetworkFailure } from '@/lib/offline/network-error';
import { noteBelongsInView, type NotesView } from '@/lib/note-archive';
import { buildPendingNote, isPendingNote, mergePendingNotes } from '@/lib/note-offline';
import { enqueue, mutateQueuedPayload, removeQueued, type QueuedMutation } from '@/lib/offline/queue';
import { isBrowserOnline } from '@/lib/offline/status';

const OFFLINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_OFFLINE === 'true';

type NotePatch = {
  body?: string;
  releaseId?: string | null;
  pinned?: boolean;
  /** True archives, false restores. Absent leaves it alone. */
  archived?: boolean;
};

type NotesStore = {
  notes: Note[];
  hydrated: boolean;
  /** True until the first load settles. Gates the page skeleton; a later
   * navigation back to Notes renders cached rows instead of a skeleton. */
  isInitialLoading: boolean;
  /** True when the server said another page exists. Drives the "Load older
   *  notes" control AND the honest search notice — search filters what is
   *  loaded, so while this is true a miss does not mean the note is gone. */
  hasMore: boolean;
  /** Opaque; only ever echoed back to the server. */
  nextCursor: string | null;
  isLoadingMore: boolean;
  /** Which list is on screen. The archived view is a separate fetch, not a
   *  client-side filter — archived notes are never loaded alongside active
   *  ones, so paging and search both stay honest about one list at a time. */
  view: NotesView;
  setView: (view: NotesView) => void;
  load: (options?: { force?: boolean }) => Promise<void>;
  /** Append the next page. No-op while one is in flight or when there is
   *  nothing more — both are ordinary states, not errors. */
  loadMore: () => Promise<void>;
  /** Swap a synced placeholder for the server's row. Called by the offline
   *  flush, which is the only thing that knows a queued create landed. */
  replacePendingNote: (placeholderId: string, note: Note) => void;
  create: (input?: { body?: string; releaseId?: string | null }) => Promise<Note | null>;
  update: (noteId: string, patch: NotePatch) => Promise<void>;
  remove: (noteId: string) => Promise<void>;
};

// Recency guard + in-flight coalescing, mirroring useWorkspaceIdentityStore.
// Mutations pass { force: true } when they need server truth back.
const NOTES_FRESH_MS = 15_000;
let notesLoadedAt = 0;
let notesInFlight: Promise<void> | null = null;

const NOTES_CACHE_KEY = 'urganize.cache.notes';
const NOTES_CACHE_VERSION = 1;

// Only the newest slice is cached. Unlike the tiny identity blob, a full
// notebook of long bodies can approach the localStorage quota — and the cache
// exists to paint the first screen instantly, which needs the top of the list,
// not all of it. Bodies are cached in full (never truncated) so a note opened
// straight from cache is safe to edit.
const NOTES_CACHE_LIMIT = 50;

// Read by components/loading/known-counts.ts so the skeleton renders this
// user's real row count instead of a generic guess.
const NOTE_COUNT_KEY = 'urganize.notes.note-count';

type NotesCache = {
  userId: string;
  notes: Note[];
};

const isNotesCache = (value: unknown): value is NotesCache => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.userId === 'string' && Array.isArray(record.notes);
};

async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    accessToken: session?.access_token || '',
    userId: session?.user?.id || '',
  };
}

// localStorage.setItem throws on quota (writePersistedState does not guard
// it), and this runs inside an async store action where an uncaught throw
// becomes an unhandled rejection. A cache miss is harmless; a crash is not.
/**
 * Persist the notebook for the next cache-first paint.
 *
 * ONE key, so it holds the ACTIVE list only. Writing the archived list here
 * would poison the next cold load, which paints from this cache before any
 * fetch and always starts in the active view — the reader would see archived
 * notes under their notebook for a moment. Archived notes are rare to read
 * and never urgent, so they simply are not cached.
 */
function cacheNotes(userId: string, notes: Note[], view: NotesView) {
  if (!userId || view !== 'active') return;
  try {
    writePersistedState<NotesCache>(NOTES_CACHE_KEY, NOTES_CACHE_VERSION, {
      userId,
      notes: notes.slice(0, NOTES_CACHE_LIMIT),
    });
    writePersistedState<number>(NOTE_COUNT_KEY, 1, notes.length);
  } catch {
    // Ignore: the next load repaints from the network.
  }
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: [],
  hydrated: false,
  isInitialLoading: true,
  hasMore: false,
  nextCursor: null,
  isLoadingMore: false,
  view: 'active',
  setView: (view) => {
    if (get().view === view) return;
    // Hard reset. The two lists share no rows, so keeping the old ones on
    // screen would show active notes under an "Archived" heading until the
    // fetch landed. isInitialLoading puts the skeleton back for the gap.
    set({ view, notes: [], hasMore: false, nextCursor: null, isInitialLoading: true });
    void get().load({ force: true });
  },
  load: async (options) => {
    if (!options?.force) {
      if (notesInFlight) {
        return notesInFlight;
      }
      if (get().hydrated && Date.now() - notesLoadedAt < NOTES_FRESH_MS) {
        return;
      }
    }

    const run = (async () => {
      const { accessToken, userId } = await getSession();

      // Cache-first paint: show the last known notebook immediately, then let
      // the fetch below correct it.
      if (!get().hydrated) {
        const cached = userId
          ? readPersistedState<NotesCache>(NOTES_CACHE_KEY, NOTES_CACHE_VERSION, isNotesCache)
          : null;
        if (cached && cached.userId === userId) {
          set({ notes: sortNotes(cached.notes), hydrated: true, isInitialLoading: false });
        }
      }

      if (!accessToken) {
        set({ isInitialLoading: false });
        return;
      }

      try {
        const archivedParam = get().view === 'archived' ? '?archived=1' : '';
        const response = await fetch(`/api/notes${archivedParam}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!response.ok) return;

        const payload = (await response.json().catch(() => null)) as {
          notes?: Note[];
          hasMore?: boolean;
          nextCursor?: string | null;
        } | null;
        if (!payload || !Array.isArray(payload.notes)) return;

        // A fetch replaces the list, and a note captured offline is not in
        // it — without this it would vanish the moment anything refreshed,
        // before the flush had a chance to send it.
        const notes = sortNotes(mergePendingNotes(payload.notes, get().notes));
        cacheNotes(userId, notes, get().view);
        notesLoadedAt = Date.now();
        // A fresh load is page one, so any pages appended earlier are
        // dropped along with their cursor — otherwise the list would keep
        // rows the server did not just send.
        set({
          notes,
          hydrated: true,
          hasMore: payload.hasMore === true,
          nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
        });
      } catch (error) {
        // Offline / a dropped connection: keep whatever notebook is already
        // painted (cached or in-memory) rather than letting this become an
        // unhandled rejection at every `void load(...)` call site. A real
        // bug still surfaces — only a recognized network failure is
        // swallowed here.
        if (!isNetworkFailure(error)) throw error;
      } finally {
        set({ isInitialLoading: false });
      }
    })();

    notesInFlight = run;
    try {
      await run;
    } finally {
      if (notesInFlight === run) {
        notesInFlight = null;
      }
    }
  },

  loadMore: async () => {
    const { hasMore, nextCursor, isLoadingMore, notes } = get();
    if (!hasMore || !nextCursor || isLoadingMore) return;

    set({ isLoadingMore: true });
    try {
      const { accessToken, userId } = await getSession();
      if (!accessToken) return;

      const archivedParam = get().view === 'archived' ? '&archived=1' : '';
      const response = await fetch(
        `/api/notes?cursor=${encodeURIComponent(nextCursor)}${archivedParam}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        }
      );
      if (!response.ok) return;

      const payload = (await response.json().catch(() => null)) as {
        notes?: Note[];
        hasMore?: boolean;
        nextCursor?: string | null;
      } | null;
      if (!payload || !Array.isArray(payload.notes)) return;

      // Merge by id rather than concatenating. A note edited between the two
      // requests jumps to the top of the server's ordering, so it can arrive
      // on this page having already been on the first — appending blindly
      // would show it twice. Newest copy wins.
      const byId = new Map(notes.map((note) => [note.id, note]));
      payload.notes.forEach((note) => byId.set(note.id, note));
      const merged = sortNotes([...byId.values()]);

      cacheNotes(userId, merged, get().view);
      set({
        notes: merged,
        hasMore: payload.hasMore === true,
        nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
      });
    } catch (error) {
      // Same posture as load(): a dropped connection leaves the pages already
      // on screen alone. The button stays, so the reader can try again.
      if (!isNetworkFailure(error)) throw error;
    } finally {
      set({ isLoadingMore: false });
    }
  },
  create: async (input) => {
    const { accessToken, userId } = await getSession();
    if (!accessToken) return null;

    const body = input?.body ?? '';
    const releaseId = input?.releaseId ?? null;

    /**
     * Capture with no connection. The placeholder's id IS the queue item's
     * id — that is what lets the flush swap this row for the server's when
     * it lands, and what lets every offline edit find the one pending
     * create to merge into. See lib/note-offline.ts.
     */
    const queueForLater = async (): Promise<Note | null> => {
      if (!OFFLINE_ENABLED || !userId) return null;
      const item = await enqueue<Extract<QueuedMutation, { kind: 'note_create' }>>({
        kind: 'note_create',
        userId,
        payload: { body, releaseId },
      });
      const note = buildPendingNote({ id: item.id, body, releaseId });
      const notes = sortNotes([note, ...get().notes]);
      cacheNotes(userId, notes, get().view);
      set({ notes });
      return note;
    };

    // Known offline: skip a request that can only fail, so the editor opens
    // on the new note immediately rather than after a timeout.
    if (OFFLINE_ENABLED && !isBrowserOnline()) return queueForLater();

    let response: Response;
    try {
      response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body, releaseId }),
      });
    } catch (error) {
      // The connection dropped between the online check and the request.
      // Same answer as being offline outright — the note is not lost.
      if (isNetworkFailure(error)) return queueForLater();
      throw error;
    }
    if (!response.ok) return null;

    const payload = (await response.json().catch(() => null)) as { note?: Note } | null;
    const note = payload?.note;
    if (!note?.id) return null;

    const notes = sortNotes([note, ...get().notes]);
    cacheNotes(userId, notes, get().view);
    set({ notes });
    return note;
  },
  update: async (noteId, patch) => {
    const previous = get().notes;
    const target = previous.find((note) => note.id === noteId);
    if (!target) return;

    // A note that has never reached the server cannot be PATCHed — its id
    // is a queue item's, not a row's. Typing into it updates local state and
    // merges into the ONE pending create, so the note arrives complete as a
    // single POST rather than a create followed by edits with nothing to
    // address. Only body and releaseId can survive that trip, which is why
    // pin and archive are hidden on a pending note rather than silently
    // dropped here.
    if (isPendingNote(target)) {
      const optimistic = sortNotes(
        previous.map((note) =>
          note.id === noteId
            ? {
                ...note,
                ...(patch.body !== undefined ? { body: patch.body } : {}),
                ...(patch.releaseId !== undefined ? { releaseId: patch.releaseId } : {}),
                updatedAt: new Date().toISOString(),
              }
            : note
        )
      );
      set({ notes: optimistic });
      await mutateQueuedPayload<Extract<QueuedMutation, { kind: 'note_create' }>>(noteId, {
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.releaseId !== undefined ? { releaseId: patch.releaseId } : {}),
      });
      return;
    }

    // Optimistic merge (never a replace): a pin toggle in flight must not
    // clobber body text the autosave is separately persisting, and vice versa.
    //
    // This runs BEFORE the first await on purpose. getSession() is async, and
    // anything that inspects the store in between — notably the virgin-note
    // reaper on unmount — would otherwise see the pre-edit body and conclude
    // the note was never typed into.
    const optimistic = sortNotes(
      previous.map((note) =>
        note.id === noteId
          ? {
              ...note,
              ...(patch.body !== undefined ? { body: patch.body } : {}),
              ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
              ...(patch.releaseId !== undefined ? { releaseId: patch.releaseId } : {}),
              ...(patch.archived !== undefined
                ? { archivedAt: patch.archived ? new Date().toISOString() : null }
                : {}),
              updatedAt: new Date().toISOString(),
            }
          : note
      )
    );
    // Archiving moves a note to the OTHER list, so it leaves this one now
    // rather than on the next refetch — the row it was in is exactly where
    // the reader is looking. Restoring from the archived view is the same
    // move in reverse, which is why this asks the shared predicate rather
    // than testing `archived` directly.
    const view = get().view;
    set({ notes: optimistic.filter((note) => noteBelongsInView(note, view)) });

    const { accessToken, userId } = await getSession();
    if (!accessToken) return;

    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error('Could not save the note.');

      const payload = (await response.json().catch(() => null)) as { note?: Note } | null;
      const saved = payload?.note;
      if (saved?.id) {
        // The server is the authority on archived_at, so re-apply the view
        // filter against what it actually stored rather than trusting the
        // optimistic guess above.
        const merged = sortNotes(
          get()
            .notes.map((note) => (note.id === noteId ? saved : note))
            .filter((note) => noteBelongsInView(note, get().view))
        );
        cacheNotes(userId, merged, get().view);
        set({ notes: merged });
      }
    } catch (error) {
      // Server truth beats per-field rollback: another tab or a concurrent
      // patch may have moved on too.
      await get().load({ force: true });
      throw error;
    }
  },
  remove: async (noteId) => {
    // Deleting a note that never reached the server means dropping its
    // queued create. Calling DELETE would 404 against an id the server has
    // never seen, and leaving the item behind would resurrect the note on
    // the next flush — which is precisely what somebody deleting it does
    // not want. This is also the path the virgin-note reaper takes, so an
    // untouched offline note cleans itself up the same way.
    const pending = get().notes.find((note) => note.id === noteId);
    if (pending && isPendingNote(pending)) {
      set({ notes: get().notes.filter((note) => note.id !== noteId) });
      await removeQueued(noteId);
      return;
    }

    const { accessToken, userId } = await getSession();
    if (!accessToken) return;

    const previous = get().notes;
    const optimistic = previous.filter((note) => note.id !== noteId);
    cacheNotes(userId, optimistic, get().view);
    set({ notes: optimistic });

    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error('Could not delete the note.');
    } catch {
      await get().load({ force: true });
    }
  },
  replacePendingNote: (placeholderId, note) => {
    const current = get().notes;
    const swapped = current.some((existing) => existing.id === placeholderId)
      ? current.map((existing) => (existing.id === placeholderId ? note : existing))
      : // The placeholder is gone — a refresh landed between the POST and
        // this callback. Insert rather than drop it: losing the note from
        // the list is worse than a row appearing at the top.
        [note, ...current];
    // Dedupe by id in case both the placeholder swap and a concurrent fetch
    // brought the same server row in.
    const byId = new Map(swapped.map((existing) => [existing.id, existing]));
    const notes = sortNotes([...byId.values()]);
    set({ notes });
  },
}));
