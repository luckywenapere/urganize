'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { sameContent } from '@/lib/press-kits';
import type { PressKitSectionContent } from '@/types/press-kits';

export type SectionSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 800;
const SAVED_DECAY_MS = 2000;

type Options = {
  /** The open section's id, or null when the kit has not loaded yet. */
  sectionId: string | null;
  /** The section's persisted body, used to seed the draft on section change. */
  persistedContent: PressKitSectionContent;
  /** Persists the body. Rejects on failure. */
  onSave: (sectionId: string, content: PressKitSectionContent) => Promise<void>;
};

export type PressKitSectionAutosave = {
  draft: PressKitSectionContent;
  saveState: SectionSaveState;
  /** Replace one field. The rest of the section is left alone. */
  setField: (key: string, value: unknown) => void;
  setDraft: (content: PressKitSectionContent) => void;
  /** Persists a pending edit right now (blur, section switch, unmount). */
  flush: () => void;
};

/**
 * Debounced autosave for one press kit section.
 *
 *   idle → dirty → saving → saved → idle
 *                     ↳ error → (dirty on next keystroke, or retry)
 *
 * Follows the notes editor's discipline exactly, because it is the same
 * problem: one save in flight at a time, and when it returns look at the draft
 * again rather than recursing, so words typed while a request was airborne go
 * out on the next lap instead of racing it. There is no save button anywhere
 * in this feature, so losing an edit here is a bug and not a trade-off.
 *
 * The one difference from the notes hook is the unit: a section body is an
 * object, so comparisons go through sameContent rather than string equality.
 */
export function usePressKitSection({
  sectionId,
  persistedContent,
  onSave,
}: Options): PressKitSectionAutosave {
  const [draft, setDraftState] = useState<PressKitSectionContent>(persistedContent);
  const [saveState, setSaveState] = useState<SectionSaveState>('idle');

  const draftRef = useRef<PressKitSectionContent>(persistedContent);
  const lastFlushedRef = useRef<PressKitSectionContent>(persistedContent);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const saveSeqRef = useRef(0);
  const sectionIdRef = useRef(sectionId);
  /** Set after a failed save so Retry re-sends even with an unchanged draft. */
  const resendRef = useRef(false);

  // Held in a ref so flush's identity never churns: it is wired into unmount
  // cleanup, where a changing identity would fire the cleanup mid-edit.
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
    const id = sectionIdRef.current;
    if (!id) return;
    if (inFlightRef.current) return;

    if (sameContent(draftRef.current, lastFlushedRef.current) && !resendRef.current) {
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
        await onSaveRef.current(id, target);
        if (saveSeqRef.current !== seq) return;
        target = draftRef.current;
      } while (!sameContent(target, lastFlushedRef.current));

      setSaveState('saved');
      if (decayRef.current) clearTimeout(decayRef.current);
      decayRef.current = setTimeout(() => setSaveState('idle'), SAVED_DECAY_MS);
    } catch {
      if (saveSeqRef.current !== seq) return;
      // Arm an explicit resend rather than rewinding lastFlushed: a failed save
      // makes the page reload server truth, so comparing bodies cannot tell us
      // whether this edit landed.
      resendRef.current = true;
      setSaveState('error');
    } finally {
      if (saveSeqRef.current === seq) {
        inFlightRef.current = false;
      }
    }
  }, []);

  const schedule = useCallback(() => {
    if (decayRef.current) {
      clearTimeout(decayRef.current);
      decayRef.current = null;
    }
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSave();
    }, DEBOUNCE_MS);
  }, [runSave]);

  const setDraft = useCallback(
    (content: PressKitSectionContent) => {
      draftRef.current = content;
      setDraftState(content);
      setSaveState('dirty');
      schedule();
    },
    [schedule]
  );

  const setField = useCallback(
    (key: string, value: unknown) => {
      const next = { ...draftRef.current, [key]: value };
      draftRef.current = next;
      setDraftState(next);
      setSaveState('dirty');
      schedule();
    },
    [schedule]
  );

  const flush = useCallback(() => {
    clearTimer();
    void runSave();
  }, [runSave]);

  // Section change: settle what the outgoing one still owes, then reseed for
  // the incoming one, so no edit is attributed to the wrong section.
  useEffect(() => {
    if (sectionIdRef.current === sectionId) return;

    const outgoingId = sectionIdRef.current;
    const pending = draftRef.current;
    clearTimer();
    if (outgoingId && !sameContent(pending, lastFlushedRef.current)) {
      void onSaveRef.current(outgoingId, pending).catch(() => undefined);
    }

    sectionIdRef.current = sectionId;
    draftRef.current = persistedContent;
    lastFlushedRef.current = persistedContent;
    saveSeqRef.current += 1;
    inFlightRef.current = false;
    resendRef.current = false;
    setDraftState(persistedContent);
    setSaveState('idle');
  }, [sectionId, persistedContent]);

  // Unmount (navigating away): the same debt settlement.
  useEffect(
    () => () => {
      clearTimer();
      if (decayRef.current) clearTimeout(decayRef.current);
      const id = sectionIdRef.current;
      if (id && !sameContent(draftRef.current, lastFlushedRef.current)) {
        void onSaveRef.current(id, draftRef.current).catch(() => undefined);
      }
    },
    []
  );

  return { draft, saveState, setField, setDraft, flush };
}
