'use client';

// The deferred first-release prompt (2026-08-28, founder call — supersedes
// URG-217's immediate auto-open). When an account has zero releases, this
// hook arms a ~30s countdown and then OFFERS the create modal, once per
// browser session, instead of opening it the moment the workspace paints.
// The countdown state lives in sessionStorage (lib/first-release-prompt.ts)
// so it spans the two surfaces that mount this hook — /dashboard and
// /dashboard/urgans — rather than restarting on every navigation.
//
// Fire-time guards, in order, all failing toward NOT interrupting (the
// "No releases yet" empty state and its Create release button remain the
// standing surface when the prompt stays silent):
//   1. re-check the predicate from live store snapshots — a release created
//      through any path (UrgAns, MCP, another tab's resync) since the timer
//      was set must win;
//   2. hidden tab → defer to the next visibilitychange rather than greeting
//      the user with a modal that popped while they were away;
//   3. another modal already holds the body scroll lock (WhatsNew, or the
//      user opened a create modal themselves seconds earlier) → consume the
//      session's prompt silently rather than stacking;
//   4. mid-conversation with UrgAns (any of its three surfaces) → consume
//      silently; the assistant is itself an activation path and must not be
//      talked over.
//   5. a guided tour is running, or one has been asked for and not yet
//      reached (lib/tours.ts) → consume silently. A tour's last step hands
//      off to creating or planning, so the two are aiming at the same thing
//      and the tour is the gentler of them. The ARMING effect also waits on
//      the same signal, so the countdown starts after a tour ends rather
//      than running underneath it.
// Mark-then-open ordering: shown is recorded before the modal opens, so a
// crash between the two fails toward silence, never toward a second prompt.

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { selectLiveTurnCount, useChappiStore } from '@/stores/useChappiStore';
import { isFirstReleaseRequired } from '@/lib/first-release-required';
import { isBodyScrollLocked } from '@/lib/body-scroll-lock';
import { tourBlocksPrompts, useTourStore } from '@/stores/useTourStore';
import {
  armPrompt,
  decideFirstReleasePrompt,
  markPromptShown,
  readPromptState,
} from '@/lib/first-release-prompt';
import { useFirstReleaseRequired } from './useFirstReleaseRequired';

/** The first-rollout focus (components/releases/FirstReleaseFocus.tsx) owns
 *  this moment now, so the timed prompt never arms. */
const FOCUS_SUPERSEDES_PROMPT = true;

/** The predicate rebuilt from live snapshots — the same inputs
 *  useFirstReleaseRequired wires reactively, read imperatively at fire time
 *  (the timer callback and the visibility listener run outside render). */
function firstReleaseRequiredNow(): boolean {
  const auth = useAuthStore.getState();
  const releases = useReleaseStore.getState();
  return isFirstReleaseRequired({
    isAuthenticated: auth.isAuthenticated,
    isAuthLoading: auth.isLoading,
    hasCompletedOnboarding: auth.user?.onboarding_completed === true,
    isInitialLoading: releases.isInitialLoading,
    error: releases.error,
    releaseCount: releases.releases.length,
  });
}

export function useFirstReleasePrompt(onPrompt: () => void): void {
  const required = useFirstReleaseRequired();
  // Subscribed, not read imperatively: this holds the ARMING effect, so it has
  // to retrigger it when a tour ends. `tourBlocksPrompts()` above is the
  // fire-time half, which runs in a timer callback outside render.
  const tourBlocking = useTourStore((state) => state.active !== null || state.pendingReplay !== null);

  // Latest-ref so callers can pass an inline closure without churning the
  // arming effect — its deps stay [required].
  const onPromptRef = useRef(onPrompt);
  useEffect(() => {
    onPromptRef.current = onPrompt;
  });

  useEffect(() => {
    if (!required || tourBlocking) return;
    if (typeof window === 'undefined') return;
    // The first-rollout focus (components/releases/FirstReleaseFocus.tsx)
    // supersedes this nudge: it offers the same create flow, with the plan
    // choice, right after the tour. Two prompts for one job would stack.
    if (FOCUS_SUPERSEDES_PROMPT) return;

    let timerId: number | null = null;
    let cancelled = false;

    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      fire();
    }

    function fire() {
      timerId = null;
      if (cancelled || !firstReleaseRequiredNow()) return;
      if (document.visibilityState !== 'visible') {
        document.addEventListener('visibilitychange', onVisible);
        return;
      }
      if (isBodyScrollLocked()) {
        markPromptShown(Date.now());
        return;
      }
      // Live turns, not messages on screen: a chat restored from history is
      // not a conversation in progress, and must not use up the prompt.
      if (selectLiveTurnCount(useChappiStore.getState()) > 0) {
        markPromptShown(Date.now());
        return;
      }
      if (tourBlocksPrompts()) {
        markPromptShown(Date.now());
        return;
      }
      markPromptShown(Date.now());
      onPromptRef.current();
    }

    // armPrompt returning null means sessionStorage is unusable — never set a
    // timer then, or every mount would run a private countdown and the prompt
    // would fire once per navigation instead of once per session.
    const state = readPromptState() ?? armPrompt(Date.now());
    if (!state) return;

    const decision = decideFirstReleasePrompt(state, Date.now());
    if (decision.action === 'done') return;
    if (decision.action === 'fire') {
      // The deadline passed while no surface was mounted (e.g. on /settings).
      fire();
    } else if (decision.action === 'wait') {
      timerId = window.setTimeout(fire, decision.remainingMs);
    }

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [required, tourBlocking]);
}
