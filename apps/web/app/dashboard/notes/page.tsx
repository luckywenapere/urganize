'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { NotesBoardSkeleton } from '@/components/loading/NotesBoardSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
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

const noteCardClassByColor: Record<NoteColor, string> = {
  butter: 'note-card note-card-butter',
  coral: 'note-card note-card-coral',
  sage: 'note-card note-card-sage',
  sky: 'note-card note-card-sky',
};

const noteSwatchClassByColor: Record<NoteColor, string> = {
  butter: 'note-card-butter',
  coral: 'note-card-coral',
  sage: 'note-card-sage',
  sky: 'note-card-sky',
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
      // Runs at submit-time inside an event handler, not during render — the
      // impurity is fine here. Disable react-hooks/purity for this line so
      // we don't have to pre-allocate IDs upstream.
      // eslint-disable-next-line react-hooks/purity
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

  if (isLoading || authLoading || !user) {
    return <NotesBoardSkeleton />;
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1220px] px-4 pb-8 pt-20 sm:px-8 sm:py-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Notes</p>
            <h1 className="mt-2 text-[clamp(2.4rem,6vw,4.1rem)] tracking-tight text-content-primary">Capture notes</h1>
            <p className="mt-3 max-w-2xl text-sm text-content-secondary">
              Keep ideas, reminders, and meeting notes in one board.
            </p>
          </div>
          <div className="panel-shell w-full max-w-sm p-3 sm:w-auto">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes"
              className="input h-12 rounded-[18px]"
            />
          </div>
        </div>

        <section className="panel-shell mt-8 p-5 sm:p-6">
          <PaywallGate>
            {({ requireAccess }) => (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void requireAccess(() => handleCreateNote(event));
                }}
                className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_220px]"
              >
            <div className="space-y-3">
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Note title"
                className="input rounded-[20px] text-base"
              />
              <textarea
                value={draft.body}
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                placeholder="Write the note"
                rows={5}
                className="input min-h-[132px] resize-none rounded-[22px] py-3 text-sm"
              />
            </div>
            <div className="panel-shell-subtle flex flex-col gap-4 p-4 lg:justify-between">
              <div>
                <p className="field-label">Color</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['butter', 'coral', 'sage', 'sky'] as NoteColor[]).map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, color }))}
                      className={`h-9 w-9 rounded-full border ${noteSwatchClassByColor[color]} ${
                        draft.color === color ? 'border-brand ring-2 ring-brand/20' : 'border-stroke-default'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-[18px] bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
              >
                Add note
              </button>
            </div>
              </form>
            )}
          </PaywallGate>
        </section>

        <section className="mt-8 columns-1 gap-5 sm:columns-2 xl:columns-3">
          {filteredNotes.length === 0 ? (
            <div className="break-inside-avoid">
              <EmptyState title="No notes yet" description="Add an idea, reminder, or meeting note." />
            </div>
          ) : (
            filteredNotes.map((note) => (
              <article
                key={note.id}
                className={`${noteCardClassByColor[note.color]} mb-5 break-inside-avoid p-5`}
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
                    className={`min-h-10 rounded-full border px-3 py-2 text-xs font-semibold ${
                      note.pinned
                        ? 'border-brand bg-brand text-content-inverse'
                        : 'border-stroke-default bg-bg-overlay text-content-secondary hover:bg-bg-hover'
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
                  placeholder="Write note"
                />

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    {(['butter', 'coral', 'sage', 'sky'] as NoteColor[]).map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateNote(note.id, { color })}
                        aria-label={`Set note color to ${color}`}
                        className={`h-7 w-7 rounded-full border ${noteSwatchClassByColor[color]} ${
                          note.color === color ? 'border-brand ring-2 ring-brand/20' : 'border-stroke-default'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteNote(note.id)}
                    className="rounded-full border border-status-error/25 bg-status-error/10 px-3 py-2 text-xs text-status-error hover:bg-status-error/14"
                  >
                    Remove
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
