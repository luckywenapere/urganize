'use client';

import { useEffect, useRef, useState } from 'react';

import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import {
  SETUP_PROMPT_DWELL_MS,
  SETUP_PROMPT_STORAGE_KEY,
  SETUP_PROMPT_STORAGE_VERSION,
  hasBeenPrompted,
  isPromptedList,
  markPrompted,
  shouldArmSetupPrompt,
} from '@/lib/release-setup-prompt';

type UseReleaseSetupPromptInput = {
  flagOn: boolean;
  releaseId: string | null;
  templatePending: boolean;
  hasReleaseDate: boolean;
  /** True while another surface owns the screen (the create modal). The
   * trigger holds — listeners re-arm the moment it clears. */
  suspended: boolean;
  /** A scene being open counts as "exploring" and fires immediately. */
  sceneOpen: boolean;
};

/**
 * Trigger logic for the type-first setup nudge (founder call, 2026-09-01:
 * "prompted after they are seen scrolling around their release"). Fires on
 * the FIRST of:
 *   1. any scroll — one capture-phase document listener. Scroll events don't
 *      bubble, but the capture phase sees them from INNER containers too, so
 *      this covers both the desktop activities list (TasksPanel's
 *      lg:overflow-y-auto body) and the mobile page scroll without threading
 *      a ref into TasksPanel;
 *   2. a scene opening (Metadata, Calendar, …);
 *   3. a short dwell (SETUP_PROMPT_DWELL_MS) — a brand-new release has no
 *      activities, so a scroll-only trigger could literally never fire.
 *
 * One nudge per release EVER, marked in localStorage the moment the sheet
 * opens (not on dismiss); the undismissable SetReleaseDateCard remains the
 * persistent path. Restricted storage fails open to once-per-mount. The
 * arming rules are pure and unit-tested in lib/release-setup-prompt.ts;
 * storage is only ever read inside effects (the render-time-storage-read
 * trap WorkspaceView documents).
 */
export function useReleaseSetupPrompt(input: UseReleaseSetupPromptInput): {
  open: boolean;
  dismiss: () => void;
} {
  const { flagOn, releaseId, templatePending, hasReleaseDate, suspended, sceneOpen } = input;
  const [open, setOpen] = useState(false);

  // The prompt is about ONE release; switching scope closes it rather than
  // letting release A's sheet hang over release B.
  const prevReleaseRef = useRef(releaseId);
  useEffect(() => {
    if (prevReleaseRef.current === releaseId) return;
    prevReleaseRef.current = releaseId;
    setOpen(false);
  }, [releaseId]);

  useEffect(() => {
    if (open || suspended || !releaseId) return;

    const stored = readPersistedState(
      SETUP_PROMPT_STORAGE_KEY,
      SETUP_PROMPT_STORAGE_VERSION,
      isPromptedList
    );
    const armed = shouldArmSetupPrompt({
      flagOn,
      releaseId,
      templatePending,
      hasReleaseDate,
      alreadyPrompted: hasBeenPrompted(stored, releaseId),
    });
    if (!armed) return;

    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      try {
        // Re-read at fire time so two tabs don't clobber each other's marks
        // more than they have to; writePersistedState doesn't guard quota
        // throws, so the wrap is load-bearing (fail open, never crash).
        const latest = readPersistedState(
          SETUP_PROMPT_STORAGE_KEY,
          SETUP_PROMPT_STORAGE_VERSION,
          isPromptedList
        );
        writePersistedState(
          SETUP_PROMPT_STORAGE_KEY,
          SETUP_PROMPT_STORAGE_VERSION,
          markPrompted(latest, releaseId)
        );
      } catch {
        // Restricted storage → the marker just doesn't persist.
      }
      setOpen(true);
    };

    // Already exploring a scene the moment we arm → that IS the trigger.
    if (sceneOpen) {
      fire();
      return;
    }

    const onScroll = () => fire();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    const timer = window.setTimeout(fire, SETUP_PROMPT_DWELL_MS);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.clearTimeout(timer);
    };
  }, [flagOn, hasReleaseDate, open, releaseId, sceneOpen, suspended, templatePending]);

  return { open, dismiss: () => setOpen(false) };
}
