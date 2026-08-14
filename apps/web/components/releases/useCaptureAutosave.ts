'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CapturePageDraft } from '@/types/capture';

export type CaptureSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 800;
const SAVED_DECAY_MS = 2000;

type UseCaptureAutosaveOptions = {
  /** The page's id, or null before one exists. Changing it reseeds the draft. */
  pageId: string | null;
  /** Server truth, used to seed the draft when the page id changes. */
  persisted: CapturePageDraft;
  /** Persists the whole draft. Rejects on failure. */
  onSave: (draft: CapturePageDraft) => Promise<void>;
};

export type CaptureAutosave = {
  draft: CapturePageDraft;
  saveState: CaptureSaveState;
  /** Patch one or more fields. Schedules a save. */
  setField: (patch: Partial<CapturePageDraft>) => void;
  /** Persist a pending edit right now (blur, toggle, scene close). */
  flush: () => void;
};

const isSameDraft = (left: CapturePageDraft, right: CapturePageDraft): boolean =>
  left.headline === right.headline &&
  left.incentive === right.incentive &&
  left.destinationUrl === right.destinationUrl &&
  left.destinationLabel === right.destinationLabel &&
  left.buttonLabel === right.buttonLabel &&
  left.graphicAssetId === right.graphicAssetId &&
  left.collectName === right.collectName &&
  left.consentNote === right.consentNote &&
  left.isPaused === right.isPaused;

/**
 * Debounced autosave for the capture-page editor.
 *
 *   idle → dirty → saving → saved → idle
 *                     ↳ error → (dirty on next edit, or retry)
 *
 * Deliberately modeled on components/notes/useNoteAutosave rather than shared
 * with it: that hook's unit of work is a single string and half its surface
 * (getDraft, isSaving) exists for the virgin-note reaper, which has no
 * analogue here. Generalising one hook over both would mean a type parameter
 * and an equality function for the sake of two call sites — this repo's
 * "refactor when justified by real use" line. What IS copied, on purpose, is
 * the discipline:
 *
 *  1. Only ONE save in flight. Edits made while a request is airborne go out
 *     on the next lap of the loop below, not as a competing request that could
 *     land out of order and resurrect older text.
 *  2. Every flush is idempotent — flushing an unchanged draft is a no-op, so
 *     blur-then-toggle doesn't double-save.
 *  3. Unmount settles the debt. Closing the scene mid-edit still saves, which
 *     matters more here than in notes: the scene closes on a pill tap, not a
 *     navigation, so there is no "are you sure" moment to catch it.
 */
export function useCaptureAutosave({
  pageId,
  persisted,
  onSave,
}: UseCaptureAutosaveOptions): CaptureAutosave {
  const [draft, setDraftState] = useState<CapturePageDraft>(persisted);
  const [saveState, setSaveState] = useState<CaptureSaveState>('idle');

  const draftRef = useRef<CapturePageDraft>(persisted);
  const lastFlushedRef = useRef<CapturePageDraft>(persisted);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const saveSeqRef = useRef(0);
  const pageIdRef = useRef(pageId);
  /** Set after a failed save so a retry re-sends even with an unchanged draft. */
  const resendRef = useRef(false);

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
    if (!pageIdRef.current) return;
    if (inFlightRef.current) return;

    if (isSameDraft(draftRef.current, lastFlushedRef.current) && !resendRef.current) {
      setSaveState((state) => (state === 'dirty' ? 'idle' : state));
      return;
    }

    const seq = saveSeqRef.current + 1;
    saveSeqRef.current = seq;
    inFlightRef.current = true;
    resendRef.current = false;
    setSaveState('saving');

    try {
      let target = draftRef.current;
      do {
        lastFlushedRef.current = target;
        await onSaveRef.current(target);
        // A page switch (or unmount) bumped the sequence while we were in the
        // air — this response belongs to a draft nobody is looking at now.
        if (saveSeqRef.current !== seq) return;
        target = draftRef.current;
      } while (!isSameDraft(target, lastFlushedRef.current));

      setSaveState('saved');
      if (decayRef.current) clearTimeout(decayRef.current);
      decayRef.current = setTimeout(() => setSaveState('idle'), SAVED_DECAY_MS);
    } catch {
      if (saveSeqRef.current !== seq) return;
      resendRef.current = true;
      setSaveState('error');
    } finally {
      if (saveSeqRef.current === seq) {
        inFlightRef.current = false;
      }
    }
  }, []);

  const setField = useCallback(
    (patch: Partial<CapturePageDraft>) => {
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraftState(next);
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

  // Page identity changed (created, or a different release's scene opened in
  // the same mount): settle what the outgoing page owes, then reseed.
  useEffect(() => {
    if (pageIdRef.current === pageId) return;

    const outgoingId = pageIdRef.current;
    const pending = draftRef.current;
    clearTimer();
    if (outgoingId && !isSameDraft(pending, lastFlushedRef.current)) {
      void onSaveRef.current(pending).catch(() => undefined);
    }

    pageIdRef.current = pageId;
    draftRef.current = persisted;
    lastFlushedRef.current = persisted;
    saveSeqRef.current += 1;
    inFlightRef.current = false;
    resendRef.current = false;
    setDraftState(persisted);
    setSaveState('idle');
  }, [pageId, persisted]);

  // Unmount (the scene closed, or the workspace navigated): same settlement.
  useEffect(
    () => () => {
      clearTimer();
      if (decayRef.current) clearTimeout(decayRef.current);
      if (pageIdRef.current && !isSameDraft(draftRef.current, lastFlushedRef.current)) {
        void onSaveRef.current(draftRef.current).catch(() => undefined);
      }
    },
    []
  );

  return { draft, saveState, setField, flush };
}
