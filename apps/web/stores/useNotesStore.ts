'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { sortNotes } from '@/lib/notes';
import type { Note } from '@/types/notes';

type NotePatch = {
  body?: string;
  releaseId?: string | null;
  pinned?: boolean;
};

type NotesStore = {
  notes: Note[];
  hydrated: boolean;
  /** True until the first load settles. Gates the page skeleton; a later
   * navigation back to Notes renders cached rows instead of a skeleton. */
  isInitialLoading: boolean;
  load: (options?: { force?: boolean }) => Promise<void>;
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
function cacheNotes(userId: string, notes: Note[]) {
  if (!userId) return;
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
        const response = await fetch('/api/notes', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!response.ok) return;

        const payload = (await response.json().catch(() => null)) as { notes?: Note[] } | null;
        if (!payload || !Array.isArray(payload.notes)) return;

        const notes = sortNotes(payload.notes);
        cacheNotes(userId, notes);
        notesLoadedAt = Date.now();
        set({ notes, hydrated: true });
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
  create: async (input) => {
    const { accessToken, userId } = await getSession();
    if (!accessToken) return null;

    // No optimistic phantom row: the editor needs a real id to autosave into,
    // and a note the server has never seen has nowhere to save to.
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: input?.body ?? '',
        releaseId: input?.releaseId ?? null,
      }),
    });
    if (!response.ok) return null;

    const payload = (await response.json().catch(() => null)) as { note?: Note } | null;
    const note = payload?.note;
    if (!note?.id) return null;

    const notes = sortNotes([note, ...get().notes]);
    cacheNotes(userId, notes);
    set({ notes });
    return note;
  },
  update: async (noteId, patch) => {
    const { accessToken, userId } = await getSession();
    if (!accessToken) return;

    const previous = get().notes;
    const target = previous.find((note) => note.id === noteId);
    if (!target) return;

    // Optimistic merge (never a replace): a pin toggle in flight must not
    // clobber body text the autosave is separately persisting, and vice versa.
    const optimistic = sortNotes(
      previous.map((note) =>
        note.id === noteId
          ? {
              ...note,
              ...(patch.body !== undefined ? { body: patch.body } : {}),
              ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
              ...(patch.releaseId !== undefined ? { releaseId: patch.releaseId } : {}),
              updatedAt: new Date().toISOString(),
            }
          : note
      )
    );
    set({ notes: optimistic });

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
        const merged = sortNotes(
          get().notes.map((note) => (note.id === noteId ? saved : note))
        );
        cacheNotes(userId, merged);
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
    const { accessToken, userId } = await getSession();
    if (!accessToken) return;

    const previous = get().notes;
    const optimistic = previous.filter((note) => note.id !== noteId);
    cacheNotes(userId, optimistic);
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
}));
