'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { fetchUiDraft, saveUiDraft } from '@/lib/ui-drafts';

type NoteColor = 'butter' | 'coral' | 'sage' | 'sky';

type Note = {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  pinned: boolean;
  updatedAt: string;
};

type DraftNote = {
  title: string;
  body: string;
  color: NoteColor;
};

const colorClassByNote: Record<NoteColor, string> = {
  butter: 'bg-[#f6edc8]',
  coral: 'bg-[#f3d7cd]',
  sage: 'bg-[#dfe7d3]',
  sky: 'bg-[#d6e4ee]',
};

const noteStorageKey = (userId: string) => `urganize.notes.v1.${userId}`;
const NOTES_SCOPE = 'notes-board';
const NOTES_SYNC_INTERVAL_MS = 3500;
const NOTES_SAVE_DEBOUNCE_MS = 500;

const emptyDraft: DraftNote = {
  title: '',
  body: '',
  color: 'butter',
};

type NotesDraftPayload = {
  notes: Note[];
};

const isNote = (item: unknown): item is Note => {
  if (!item || typeof item !== 'object') return false;
  const note = item as Partial<Note>;
  return (
    typeof note.id === 'string' &&
    typeof note.title === 'string' &&
    typeof note.body === 'string' &&
    typeof note.updatedAt === 'string' &&
    (note.color === 'butter' || note.color === 'coral' || note.color === 'sage' || note.color === 'sky') &&
    typeof note.pinned === 'boolean'
  );
};

const parseNotes = (value: string | null): Note[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNote);
  } catch {
    return [];
  }
};

const parseNotesDraftPayload = (value: unknown): NotesDraftPayload | null => {
  if (!value || typeof value !== 'object') return null;
  const notes = (value as { notes?: unknown }).notes;
  if (!Array.isArray(notes)) return null;
  const validNotes = notes.filter(isNote);
  return { notes: validNotes };
};

export default function NotesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState<DraftNote>(emptyDraft);
  const [search, setSearch] = useState('');
  const lastRemoteUpdatedAtRef = useRef<string | null>(null);
  const lastSerializedNotesRef = useRef('[]');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingRemoteSyncRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }

    let cancelled = false;

    const loadNotes = async () => {
      const localNotes = parseNotes(window.localStorage.getItem(noteStorageKey(user.id)));
      if (!cancelled) {
        setNotes(localNotes);
        lastSerializedNotesRef.current = JSON.stringify(localNotes);
      }

      const remoteDraft = await fetchUiDraft<NotesDraftPayload>(NOTES_SCOPE, noteStorageKey(user.id));
      if (cancelled) return;

      const remotePayload = parseNotesDraftPayload(remoteDraft.payload);
      const remoteNotes = remotePayload?.notes || [];
      const nextNotes = remoteNotes.length > 0 ? remoteNotes : localNotes;
      setNotes(nextNotes);
      window.localStorage.setItem(noteStorageKey(user.id), JSON.stringify(nextNotes));
      lastSerializedNotesRef.current = JSON.stringify(nextNotes);
      lastRemoteUpdatedAtRef.current = remoteDraft.updatedAt || null;
      setIsLoading(false);
    };

    void loadNotes();

    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user || isLoading) return;
    window.localStorage.setItem(noteStorageKey(user.id), JSON.stringify(notes));
    const serializedNotes = JSON.stringify(notes);
    lastSerializedNotesRef.current = serializedNotes;
    hasPendingRemoteSyncRef.current = true;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void (async () => {
        await saveUiDraft<NotesDraftPayload>(NOTES_SCOPE, noteStorageKey(user.id), { notes });
        hasPendingRemoteSyncRef.current = false;
      })();
    }, NOTES_SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [isLoading, notes, user]);

  useEffect(() => {
    if (!user || isLoading) return;

    let cancelled = false;

    const syncFromRemote = async () => {
      const remoteDraft = await fetchUiDraft<NotesDraftPayload>(NOTES_SCOPE, noteStorageKey(user.id));
      if (cancelled || !remoteDraft.payload) return;

      const remotePayload = parseNotesDraftPayload(remoteDraft.payload);
      if (!remotePayload) return;

      const serializedRemoteNotes = JSON.stringify(remotePayload.notes);
      const remoteUpdatedAt = remoteDraft.updatedAt || null;

      if (remoteUpdatedAt && lastRemoteUpdatedAtRef.current === remoteUpdatedAt) return;
      if (hasPendingRemoteSyncRef.current) return;
      if (serializedRemoteNotes === lastSerializedNotesRef.current) {
        lastRemoteUpdatedAtRef.current = remoteUpdatedAt;
        return;
      }

      lastRemoteUpdatedAtRef.current = remoteUpdatedAt;
      lastSerializedNotesRef.current = serializedRemoteNotes;
      setNotes(remotePayload.notes);
      window.localStorage.setItem(noteStorageKey(user.id), serializedRemoteNotes);
    };

    const interval = setInterval(() => {
      void syncFromRemote();
    }, NOTES_SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isLoading, user]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    if (!query) return sorted;
    return sorted.filter((note) => {
      return note.title.toLowerCase().includes(query) || note.body.toLowerCase().includes(query);
    });
  }, [notes, search]);

  const handleCreateNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title && !body) return;

    const nextNote: Note = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      body,
      color: draft.color,
      pinned: false,
      updatedAt: new Date().toISOString(),
    };

    setNotes((current) => [nextNote, ...current]);
    setDraft(emptyDraft);
  };

  const updateNote = (noteId: string, patch: Partial<Note>) => {
    setNotes((current) =>
      current.map((note) =>
        note.id === noteId
          ? {
              ...note,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : note
      )
    );
  };

  const deleteNote = (noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
  };

  if (isLoading || authLoading) {
    return (
      <LoadingScreen
        variant="dashboard"
        eyebrow="Notes"
        title="Loading your note board"
        description="Preparing your capture space for ideas, reminders, and launch fragments."
      />
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1220px] px-4 py-20 sm:px-8 sm:py-10 md:py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Notes</p>
            <h1 className="mt-2 text-[clamp(2.4rem,6vw,4.1rem)] tracking-tight text-content-primary">Capture the release as it happens</h1>
            <p className="mt-3 max-w-2xl text-sm text-content-secondary">
              Quick ideas, campaign hooks, lyric fragments, meeting notes, or launch-day reminders. This board stays lightweight and editable like a studio notebook.
            </p>
          </div>
          <div className="w-full max-w-sm rounded-[26px] border border-stroke-default bg-bg-surface/95 p-3 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] sm:w-auto">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes"
              className="w-full rounded-[18px] border border-stroke-subtle bg-bg-elevated px-4 py-3 text-sm text-content-primary outline-none focus:border-brand"
            />
          </div>
        </div>

        <section className="mt-8 rounded-[30px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] sm:p-6">
          <form onSubmit={handleCreateNote} className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_220px]">
            <div className="space-y-3">
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Note title"
                className="w-full rounded-[20px] border border-stroke-subtle bg-bg-elevated px-4 py-3 text-base text-content-primary outline-none focus:border-brand"
              />
              <textarea
                value={draft.body}
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                placeholder="Drop an idea, reminder, caption draft, or checklist add-on..."
                rows={5}
                className="w-full resize-none rounded-[22px] border border-stroke-subtle bg-bg-elevated px-4 py-3 text-sm text-content-primary outline-none focus:border-brand"
              />
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-[24px] border border-stroke-subtle bg-bg-elevated/80 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Card tone</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['butter', 'coral', 'sage', 'sky'] as NoteColor[]).map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, color }))}
                      className={`h-9 w-9 rounded-full border ${colorClassByNote[color]} ${
                        draft.color === color ? 'border-brand ring-2 ring-brand/20' : 'border-stroke-default'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="rounded-[18px] bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
              >
                Save note
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 columns-1 gap-5 sm:columns-2 xl:columns-3">
          {filteredNotes.length === 0 ? (
            <div className="break-inside-avoid rounded-[28px] border border-dashed border-stroke-default bg-bg-surface/80 p-8 text-center shadow-[0_18px_48px_-28px_rgba(0,0,0,0.25)]">
              <p className="text-sm uppercase tracking-[0.16em] text-content-tertiary">No notes yet</p>
              <p className="mt-3 text-sm text-content-secondary">
                Start with a release idea, rollout reminder, or content hook. New notes appear here as editable cards.
              </p>
            </div>
          ) : (
            filteredNotes.map((note) => (
              <article
                key={note.id}
                className={`${colorClassByNote[note.color]} mb-5 break-inside-avoid rounded-[28px] border border-black/10 p-5 shadow-[0_20px_40px_-30px_rgba(0,0,0,0.35)]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <input
                      value={note.title}
                      onChange={(event) => updateNote(note.id, { title: event.target.value })}
                      placeholder="Untitled note"
                      className="w-full bg-transparent text-lg font-semibold text-content-primary outline-none placeholder:text-content-tertiary"
                    />
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-content-tertiary">
                      {new Date(note.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateNote(note.id, { pinned: !note.pinned })}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      note.pinned
                        ? 'border-brand bg-brand text-content-inverse'
                        : 'border-stroke-default bg-white/45 text-content-secondary'
                    }`}
                  >
                    {note.pinned ? 'Pinned' : 'Pin'}
                  </button>
                </div>

                <textarea
                  value={note.body}
                  onChange={(event) => updateNote(note.id, { body: event.target.value })}
                  rows={7}
                  className="mt-4 w-full resize-none bg-transparent text-sm leading-6 text-content-primary outline-none placeholder:text-content-tertiary"
                  placeholder="Write here..."
                />

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    {(['butter', 'coral', 'sage', 'sky'] as NoteColor[]).map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateNote(note.id, { color })}
                        aria-label={`Set note color to ${color}`}
                        className={`h-7 w-7 rounded-full border ${colorClassByNote[color]} ${
                          note.color === color ? 'border-brand ring-2 ring-brand/20' : 'border-black/10'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteNote(note.id)}
                    className="rounded-full border border-status-error/25 bg-white/40 px-3 py-1 text-xs text-status-error hover:bg-white/70"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
