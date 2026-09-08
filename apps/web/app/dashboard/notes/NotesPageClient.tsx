'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useNotesStore } from '@/stores/useNotesStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { NotesList } from '@/components/notes/NotesList';
import { NoteEditor, NoteEditorEmpty } from '@/components/notes/NoteEditor';
import { NoteDeleteDialog } from '@/components/notes/NoteDeleteDialog';
import { useNoteSelection } from '@/components/notes/useNoteSelection';
import { useNoteAutosave } from '@/components/notes/useNoteAutosave';
import { NotesPageSkeleton } from '@/components/loading/NotesPageSkeleton';
import { deriveNoteTitle } from '@/lib/notes';
import { searchNotes } from '@/lib/note-search';
import { parseSearchTerms } from '@/lib/task-search';

// Same flag AppTopbar and the API routes read — if a direct link is followed
// while the flag is off, bounce to the workspace (the route has no
// server-side gate; the flag is inlined at build time).
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

// "Turn this note into a release plan" needs the planner as well as notes.
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

/** Free text the intake carries over is capped, so cap it here too rather than
 * shipping a whole notebook page into a prompt. */
const NOTE_PREFILL_MAX = 2000;

export default function NotesPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, loadCommandCenter } = useReleaseStore();
  const {
    notes,
    isInitialLoading,
    hasMore,
    isLoadingMore,
    view,
    setView,
    load,
    loadMore,
    create,
    update,
    remove,
  } = useNotesStore();
  const tasks = useTaskStore((state) => state.tasks);
  const openIntake = usePlannerStore((state) => state.openIntake);
  const { openQuickCreate } = useTaskUI();

  const { selectedNoteId, selectNote } = useNoteSelection();
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  /**
   * Search is local state, deliberately NOT a URL param. Typing would push a
   * history entry per keystroke, and this page already carries `?note=` and
   * `?release=` — a third param that changes on every character would make
   * Back unusable. The catalog's own search bar made the same call.
   */
  const [searchQuery, setSearchQuery] = useState('');

  // Ids created in THIS mount. Only these are ever auto-reaped when left
  // empty — a note that arrived empty from the server is someone's data, not
  // this session's litter.
  const sessionCreatedIds = useRef<Set<string>>(new Set());

  const releaseFilterId = searchParams.get('release');
  const wantsNewNote = searchParams.get('new') === '1';

  // Fire immediately rather than behind authLoading — the stores read their
  // own token from getSession() (local), so waiting on the auth store's GoTrue
  // round trip only delays real data (the ChappiPageClient pattern).
  useEffect(() => {
    if (!NOTES_ENABLED) return;
    void load();
    void loadCommandCenter();
  }, [load, loadCommandCenter]);

  useEffect(() => {
    if (!NOTES_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
    }
  }, [authLoading, router, user]);

  const selectedNote = useMemo(
    () => (selectedNoteId ? notes.find((note) => note.id === selectedNoteId) ?? null : null),
    [notes, selectedNoteId]
  );

  const persistBody = useCallback(
    async (noteId: string, body: string) => {
      await update(noteId, { body });
    },
    [update]
  );

  const autosave = useNoteAutosave({
    noteId: selectedNote?.id ?? null,
    persistedBody: selectedNote?.body ?? '',
    onSave: persistBody,
  });

  /**
   * Auto-delete a note the user opened and never typed into (the Apple Notes
   * behavior). Safe against the autosave because a save is only ever
   * scheduled by a change: no typing means no timer and no in-flight request,
   * and any typing leaves a non-empty body in the store. A note that once had
   * content and was emptied is KEPT — content-bearing notes only die through
   * the confirmation dialog.
   */
  const reapIfVirgin = useCallback(
    (noteId: string | null) => {
      if (!noteId || !sessionCreatedIds.current.has(noteId)) return;
      if (autosave.isSaving()) return;
      // The draft is checked as well as the stored body: this runs
      // synchronously on a note switch, BEFORE the effect that flushes the
      // outgoing note, so the store can still read empty for a note that has
      // real text waiting to be saved.
      if (autosave.getDraft().trim() !== '') return;
      const note = useNotesStore.getState().notes.find((item) => item.id === noteId);
      if (!note || note.body.trim() !== '') return;
      sessionCreatedIds.current.delete(noteId);
      void remove(noteId);
    },
    [autosave, remove]
  );

  const handleSelect = useCallback(
    (noteId: string) => {
      if (noteId === selectedNoteId) return;
      const outgoing = selectedNoteId;
      // Below lg the editor replaces the list, so push a history entry and let
      // browser Back return to the list (the WorkspaceView drill-down model).
      const stacked =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
      selectNote(noteId, { push: stacked });
      reapIfVirgin(outgoing);
    },
    [reapIfVirgin, selectNote, selectedNoteId]
  );

  /**
   * Turn this note into a release plan.
   *
   * Offered when the note has no release, or when its release has no activities
   * yet. Hidden once the linked release has a plan: the action would have
   * nothing to do, and a disabled mystery pill in an already-tight header row
   * on a phone is worse than no pill.
   *
   * The LIVE draft body is what travels, not the stored note, so whatever the
   * manager was still typing rides along.
   */
  const planFromNote = useMemo(() => {
    if (!PLANNER_ENABLED || !selectedNote) return undefined;

    const linkedReleaseId = selectedNote.releaseId;
    if (linkedReleaseId) {
      const hasActivities = tasks.some((task) => task.releaseId === linkedReleaseId);
      if (hasActivities) return undefined;
    }

    return () => {
      openIntake({
        source: 'note',
        releaseId: linkedReleaseId || undefined,
        noteId: selectedNote.id,
        prefill: { extraNotes: autosave.draft.slice(0, NOTE_PREFILL_MAX) },
      });
    };
  }, [selectedNote, tasks, openIntake, autosave.draft]);

  /**
   * Turn this note into an activity.
   *
   * Opens quick-create seeded with the note's derived title and its linked
   * release. Offered unconditionally: the modal carries its own release
   * picker and refuses to submit without one, so an unlinked note is a case
   * it already handles — and hiding the action when unlinked would hide it
   * exactly when it is most useful, since capture-first means most notes have
   * no release yet.
   *
   * The LIVE draft is the source, not the stored body, so a thought still
   * being typed can become work without waiting for the autosave.
   *
   * It deliberately does NOT mutate the note: no auto-link to the release
   * picked in the modal, and the note is not consumed. Linking on a
   * successful create is defensible and would need a create callback
   * threaded through TaskUIProvider; a silent write on an action the user
   * might still cancel is not worth it without one.
   */
  const makeActivityFromNote = useMemo(() => {
    if (!selectedNote) return undefined;
    return () => {
      const title = deriveNoteTitle(autosave.draft);
      if (!title) return;
      openQuickCreate({
        releaseId: selectedNote.releaseId ?? null,
        title,
        source: 'note',
      });
    };
  }, [autosave.draft, openQuickCreate, selectedNote]);

  /**
   * Archive the open note, or restore it if it is already archived.
   *
   * Flushes first: archiving is a deliberate act on a note somebody has
   * probably just been typing in, and the debounce would otherwise still be
   * holding their last sentence when the row leaves the list.
   *
   * Then deselects, because either direction moves the note to the list you
   * are NOT looking at — leaving the editor open on a note absent from the
   * list beside it reads as a bug.
   */
  const handleToggleArchive = useCallback(async () => {
    if (!selectedNote) return;
    const archived = Boolean(selectedNote.archivedAt);
    autosave.flush();
    selectNote(null);
    await update(selectedNote.id, { archived: !archived });
  }, [autosave, selectNote, selectedNote, update]);

  const handleBack = useCallback(() => {
    const outgoing = selectedNoteId;
    selectNote(null);
    reapIfVirgin(outgoing);
  }, [reapIfVirgin, selectNote, selectedNoteId]);

  const handleNewNote = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const outgoing = selectedNoteId;
      // Pre-link while filtered: a global note created here would be invisible
      // in the very list the user is looking at. The chip is right there and
      // clears in one click.
      const note = await create({ releaseId: releaseFilterId || null });
      if (!note) return;
      sessionCreatedIds.current.add(note.id);
      setPendingFocusId(note.id);
      const stacked =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
      selectNote(note.id, { push: stacked });
      reapIfVirgin(outgoing);
    } finally {
      setIsCreating(false);
    }
  }, [create, isCreating, reapIfVirgin, releaseFilterId, selectNote, selectedNoteId]);

  // `?new=1` deep link: create once, then strip the param so a refresh doesn't
  // mint another note. Clicking chrome never creates data — only an explicit
  // deep link does.
  const newNoteHandled = useRef(false);
  useEffect(() => {
    if (!NOTES_ENABLED || !wantsNewNote || newNoteHandled.current) return;
    if (isInitialLoading) return;
    newNoteHandled.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const query = params.toString();
    router.replace(`${pathname ?? ''}${query ? `?${query}` : ''}`, { scroll: false });
    void handleNewNote();
  }, [handleNewNote, isInitialLoading, pathname, router, searchParams, wantsNewNote]);

  // Leaving the page entirely: settle the same debt a deselect would.
  useEffect(
    () => () => {
      const { notes: latest } = useNotesStore.getState();
      sessionCreatedIds.current.forEach((noteId) => {
        const note = latest.find((item) => item.id === noteId);
        if (note && note.body.trim() === '') {
          void useNotesStore.getState().remove(noteId);
        }
      });
    },
    []
  );

  const releaseTitlesById = useMemo(() => {
    const map = new Map<string, string>();
    releases.forEach((release) => map.set(release.id, release.title));
    return map;
  }, [releases]);

  const filterRelease = useMemo(
    () => (releaseFilterId ? releases.find((release) => release.id === releaseFilterId) ?? null : null),
    [releaseFilterId, releases]
  );

  const searchTerms = useMemo(() => parseSearchTerms(searchQuery), [searchQuery]);

  /**
   * The release filter and the search COMPOSE — both narrow, neither clears
   * the other. Release first, then search, so "notes about this release
   * mentioning the promoter" is expressible. Search returns the list
   * unchanged for an empty query, so with no query this is exactly the
   * previous behaviour.
   */
  const visibleNotes = useMemo(() => {
    const scoped = releaseFilterId
      ? notes.filter((note) => note.releaseId === releaseFilterId)
      : notes;
    return searchNotes(scoped, searchQuery);
  }, [notes, releaseFilterId, searchQuery]);

  const pinned = useMemo(() => visibleNotes.filter((note) => note.pinned), [visibleNotes]);
  const others = useMemo(() => visibleNotes.filter((note) => !note.pinned), [visibleNotes]);

  const clearFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('release');
    const query = params.toString();
    router.replace(`${pathname ?? ''}${query ? `?${query}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);

  // A ?note= id that no longer resolves (deleted elsewhere, stale link) drops
  // back to the list instead of rendering an empty editor.
  useEffect(() => {
    if (!selectedNoteId || isInitialLoading) return;
    if (!notes.some((note) => note.id === selectedNoteId)) {
      selectNote(null);
    }
  }, [isInitialLoading, notes, selectNote, selectedNoteId]);

  const handleDeleteConfirmed = useCallback(async () => {
    if (!selectedNote) return;
    const noteId = selectedNote.id;
    sessionCreatedIds.current.delete(noteId);
    await remove(noteId);
    setIsDeleteOpen(false);
    selectNote(null);
  }, [remove, selectNote, selectedNote]);

  if (!NOTES_ENABLED) return null;

  // ONE skeleton, rendered here rather than as a route-segment Suspense
  // fallback — SSR serializes it, hydration reconciles the same JSX, no
  // remount (the ChappiPageClient/WorkspaceView rationale).
  if (authLoading || isInitialLoading) {
    return <NotesPageSkeleton />;
  }

  return (
    <>
      <div className="notes-shell-height flex flex-col gap-4 lg:flex-row lg:gap-6">
        <section
          aria-label="Notes"
          className={`min-h-0 flex-col lg:flex lg:w-[320px] lg:shrink-0 ${
            selectedNote ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <NotesList
            pinned={pinned}
            others={others}
            releaseTitlesById={releaseTitlesById}
            selectedNoteId={selectedNoteId}
            draftOverride={autosave.draft}
            filterRelease={filterRelease}
            filterUnresolved={Boolean(releaseFilterId) && !filterRelease}
            isCreating={isCreating}
            searchQuery={searchQuery}
            searchTerms={searchTerms}
            onSearchChange={setSearchQuery}
            onSelect={handleSelect}
            onNewNote={() => void handleNewNote()}
            onClearFilter={clearFilter}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={() => void loadMore()}
            // The loaded total, NOT the filtered one: it is used to say what
            // a search actually covered, and the release filter narrowing the
            // view does not change how much of the notebook is in memory.
            loadedCount={notes.length}
            view={view}
            onViewChange={setView}
          />
        </section>

        <section
          aria-label="Note editor"
          className={`min-h-0 min-w-0 flex-1 flex-col ${selectedNote ? 'flex' : 'hidden lg:flex'}`}
        >
          {selectedNote ? (
            <NoteEditor
              note={selectedNote}
              draft={autosave.draft}
              saveState={autosave.saveState}
              releases={releases}
              onDraftChange={autosave.setDraft}
              onFlush={autosave.flush}
              onRetry={autosave.flush}
              onSetRelease={(releaseId) => void update(selectedNote.id, { releaseId })}
              onTogglePin={() => void update(selectedNote.id, { pinned: !selectedNote.pinned })}
              onRequestDelete={() => setIsDeleteOpen(true)}
              onToggleArchive={() => void handleToggleArchive()}
              onMakePlan={planFromNote}
              onMakeActivity={makeActivityFromNote}
              onBack={handleBack}
              autoFocus={pendingFocusId === selectedNote.id}
              onAutoFocusConsumed={() => setPendingFocusId(null)}
            />
          ) : (
            <NoteEditorEmpty />
          )}
        </section>
      </div>

      <NoteDeleteDialog
        open={isDeleteOpen && Boolean(selectedNote)}
        noteTitle={deriveNoteTitle(autosave.draft) || 'New note'}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirmed}
      />
    </>
  );
}
