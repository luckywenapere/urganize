'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type NoteSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 800;
const SAVED_DECAY_MS = 2000;

type UseNoteAutosaveOptions = {
  /** The open note's id, or null when nothing is selected. */
  noteId: string | null;
  /** The note's persisted body, used to seed the draft on selection change. */
  persistedBody: string;
  /** Persists the body. Rejects on failure. */
  onSave: (noteId: string, body: string) => Promise<void>;
};

export type NoteAutosave = {
  draft: string;
  saveState: NoteSaveState;
  setDraft: (body: string) => void;
  /** Persists a pending edit right now (blur, pane switch, unmount). */
  flush: () => void;
  /** True while a save is in flight — the virgin-note reaper consults this. */
  isSaving: () => boolean;
  /**
   * The draft as of right now, readable without waiting for a re-render.
   * The reaper needs this: it runs synchronously on a note switch, before the
   * effect that flushes the outgoing note, so the store can still show an
   * empty body for a note the user has actually typed into.
   */
  getDraft: () => string;
};

/**
 * Debounced autosave for the note editor.
 *
 *   idle → dirty → saving → saved → idle
 *                     ↳ error → (dirty on next keystroke, or retry)
 *
 * The draft lives here; the store holds persisted truth. Two properties the
 * rest of the page depends on:
 *
 *  1. A save is only ever SCHEDULED by a change. A note nobody typed into has
 *     no timer and no in-flight request — which is what makes the virgin-note
 *     reaper in NotesPageClient safe.
 *  2. Every flush path is idempotent: flushing a draft equal to the last one
 *     sent is a no-op, so blur-then-switch doesn't double-save.
 */
export function useNoteAutosave({
  noteId,
  persistedBody,
  onSave,
}: UseNoteAutosaveOptions): NoteAutosave {
  const [draft, setDraftState] = useState(persistedBody);
  const [saveState, setSaveState] = useState<NoteSaveState>('idle');

  const draftRef = useRef(persistedBody);
  const lastFlushedRef = useRef(persistedBody);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const saveSeqRef = useRef(0);
  const noteIdRef = useRef(noteId);
  /** Set after a failed save so Retry re-sends even with an unchanged draft. */
  const resendRef = useRef(false);

  // Keep the latest onSave without making flush's identity churn on every
  // parent render (flush is wired into unmount cleanup, where a changing
  // identity would fire the cleanup mid-edit).
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const runSave = useCallback(async () => {
    const id = noteIdRef.current;
    if (!id) return;

    // A save already running will pick up newer text on its next lap (the
    // loop below re-reads the draft), so never start a second one.
    if (inFlightRef.current) return;

    if (draftRef.current === lastFlushedRef.current && !resendRef.current) {
      // Nothing new since the last send — including the type-then-erase case,
      // which lands back on the seeded value.
      setSaveState((state) => (state === 'dirty' ? 'idle' : state));
      return;
    }

    const seq = saveSeqRef.current + 1;
    saveSeqRef.current = seq;
    inFlightRef.current = true;
    resendRef.current = false;
    setSaveState('saving');

    try {
      // Send once, then keep going while the draft moves under us: text typed
      // while a request was airborne goes out immediately, since the user
      // already waited out one debounce for it.
      let target = draftRef.current;
      do {
        lastFlushedRef.current = target;
        await onSaveRef.current(id, target);
        if (saveSeqRef.current !== seq) return;
        target = draftRef.current;
      } while (target !== lastFlushedRef.current);

      setSaveState('saved');
      if (decayRef.current) clearTimeout(decayRef.current);
      decayRef.current = setTimeout(() => setSaveState('idle'), SAVED_DECAY_MS);
    } catch {
      if (saveSeqRef.current !== seq) return;
      // Arm an explicit resend rather than rewinding lastFlushed: a failed
      // save makes the store reload server truth, so comparing text can't
      // tell us whether this edit landed. Retry must re-send even when the
      // user hasn't typed anything since.
      resendRef.current = true;
      setSaveState('error');
    } finally {
      if (saveSeqRef.current === seq) {
        inFlightRef.current = false;
      }
    }
  }, []);

  const setDraft = useCallback(
    (body: string) => {
      draftRef.current = body;
      setDraftState(body);
      setSaveState('dirty');
      if (decayRef.current) {
        clearTimeout(decayRef.current);
        decayRef.current = null;
      }
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runSave();
      }, DEBOUNCE_MS);
    },
    [runSave]
  );

  const flush = useCallback(() => {
    clearTimer();
    void runSave();
  }, [runSave]);

  const isSaving = useCallback(() => inFlightRef.current, []);

  const getDraft = useCallback(() => draftRef.current, []);

  // Selection change: flush whatever the outgoing note still owes, then reseed
  // for the incoming one. Runs before the new note's first keystroke, so no
  // edit can be attributed to the wrong id.
  useEffect(() => {
    if (noteIdRef.current === noteId) return;

    const outgoingId = noteIdRef.current;
    const pendingBody = draftRef.current;
    clearTimer();
    if (outgoingId && pendingBody !== lastFlushedRef.current) {
      // Fire-and-forget: the store already applied this optimistically, so the
      // list stays correct even though we're leaving the note behind.
      void onSaveRef.current(outgoingId, pendingBody).catch(() => undefined);
    }

    noteIdRef.current = noteId;
    draftRef.current = persistedBody;
    lastFlushedRef.current = persistedBody;
    saveSeqRef.current += 1;
    inFlightRef.current = false;
    resendRef.current = false;
    setDraftState(persistedBody);
    setSaveState('idle');
  }, [noteId, persistedBody]);

  // Unmount (navigating away): same debt settlement as a selection change.
  useEffect(
    () => () => {
      clearTimer();
      if (decayRef.current) clearTimeout(decayRef.current);
      const id = noteIdRef.current;
      if (id && draftRef.current !== lastFlushedRef.current) {
        void onSaveRef.current(id, draftRef.current).catch(() => undefined);
      }
    },
    []
  );

  return { draft, saveState, setDraft, flush, isSaving, getDraft };
}
