'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, X } from '@/components/icons';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { useSceneOverlay } from '@/components/workspace/useSceneOverlay';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { useAuthStore } from '@/lib/auth-store';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { getRolePermissions } from '@/lib/role-permissions';
import {
  FIRST_STEPS_COPY as COPY,
  FIRST_STEPS_DISMISSED_KEY,
  FIRST_STEPS_DISMISSED_VERSION,
  buildFirstSteps,
  isDismissedList,
  isRolloutNew,
  nextFirstStep,
  shouldShowFirstSteps,
  withDismissed,
  type FirstStep,
  type FirstStepsFacts,
} from '@/lib/rollout-first-steps';
import { supabase } from '@/lib/supabase/client';

/** The Ideas card listens for this to open its text box; "Add your idea" sends
 *  it. The card sends IDEAS_CHANGED_EVENT after a note is saved, so the step
 *  ticks itself off. */
export const ADD_IDEA_EVENT = 'urganize:add-idea';
export const IDEAS_CHANGED_EVENT = 'urganize:ideas-changed';

const UNKNOWN: FirstStepsFacts = { hasIdea: null, hasTeam: null };
/** Never keep the rollout's next moves waiting on the first-steps read longer
 *  than this (same fallthrough as the next-moves store, URG-367). */
const FIRST_STEPS_SETTLE_MS = 4000;

/** What the first-steps card is doing on this rollout right now. */
export type RolloutFirstStepsState = {
  /**
   * 'showing': the card is on screen. 'pending': it may show (a new rollout,
   * not hidden) but the facts are still loading. 'hidden': it will not show.
   * The page treats pending like showing for what it holds back (the
   * distribution check, the role gaps, the pinned card), so those never flash
   * up and vanish while the card loads; at worst they arrive a moment late.
   */
  status: 'showing' | 'pending' | 'hidden';
  steps: FirstStep[];
  go: (step: FirstStep) => void;
  dismiss: () => void;
};

/**
 * The first steps on a new rollout (URG-293; rules in lib/rollout-first-steps.ts),
 * as a hook so the page can ask whether the card is up (Oct 17, 2026 just-
 * planned cuts: while it shows, the distribution check, the role gaps and the
 * pinned "Confirm your release date" card stand down, and the pin becomes
 * step 1). Each item ticks itself off from what the rollout holds, re-read
 * whenever a scene closes or the tab comes back. Call it once per page and
 * hand the result to <RolloutFirstSteps>, so phone and computer share it.
 */
export function useRolloutFirstSteps({
  release,
  isOwner,
  ideaAvailable = false,
  pinnedConfirmDate = null,
}: {
  release: { id: string; createdAt: string | null; isTest: boolean } | null;
  isOwner: boolean;
  /** The Ideas card is on screen (ideas on, plan not built yet): "Add your idea" is a step. */
  ideaAvailable?: boolean;
  /** The pinned "Confirm your release date" activity, while open. */
  pinnedConfirmDate?: { title: string; onOpen: () => void } | null;
}): RolloutFirstStepsState {
  const user = useAuthStore((state) => state.user);
  const openSettings = useOpenSettings();
  const { activeScene } = useSceneOverlay();
  const [facts, setFacts] = useState<FirstStepsFacts>(UNKNOWN);
  const [factsKnown, setFactsKnown] = useState(false);
  // True once a read has finished either way, so an unreachable server ends
  // 'pending' instead of holding the page's other blocks back.
  const [factsSettled, setFactsSettled] = useState(false);
  // null until the mount effect has read storage (no render-time storage reads).
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  const releaseId = release?.id ?? null;
  const releaseIsTest = release?.isTest ?? true;
  const releaseCreatedAt = release?.createdAt ?? null;

  const canInvite = getRolePermissions(user?.role).role === 'manager';
  const isNew = useMemo(
    () => Boolean(releaseId) && isOwner && !releaseIsTest && isRolloutNew(releaseCreatedAt, new Date()),
    [releaseId, isOwner, releaseIsTest, releaseCreatedAt]
  );

  useEffect(() => {
    if (!releaseId) return;
    const list = readPersistedState(
      FIRST_STEPS_DISMISSED_KEY,
      FIRST_STEPS_DISMISSED_VERSION,
      isDismissedList
    );
    setDismissed(Boolean(list?.includes(releaseId)));
  }, [releaseId]);

  const load = useCallback(async () => {
    if (!releaseId) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/releases/${releaseId}/first-steps`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as { firstSteps?: FirstStepsFacts } | null;
      if (!body?.firstSteps) return;
      setFacts(body.firstSteps);
      setFactsKnown(true);
    } catch {
      // Unreachable server: the card simply does not show.
    } finally {
      setFactsSettled(true);
    }
  }, [releaseId]);

  // A different rollout starts from unknown, never from the last one's ticks.
  useEffect(() => {
    setFacts(UNKNOWN);
    setFactsKnown(false);
    setFactsSettled(false);
  }, [releaseId]);

  // Read on arrival and every time a scene closes (that is where the cover art
  // gets added), only while the rollout is new and not hidden.
  useEffect(() => {
    if (!isNew || dismissed !== false || activeScene) return;
    void load();
  }, [isNew, dismissed, activeScene, load]);

  // Never hold the rollout's next moves on a hung read: after a few seconds
  // 'pending' ends and, unless the facts landed, the next moves show.
  useEffect(() => {
    if (!isNew || dismissed !== false || factsSettled) return;
    const timer = setTimeout(() => setFactsSettled(true), FIRST_STEPS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [isNew, dismissed, factsSettled, releaseId]);

  // A saved idea ticks its step off.
  useEffect(() => {
    if (!isNew || dismissed !== false) return;
    const onChanged = () => void load();
    window.addEventListener(IDEAS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(IDEAS_CHANGED_EVENT, onChanged);
  }, [isNew, dismissed, load]);

  // Coming back from Settings → Team (or another tab) re-reads the team.
  useEffect(() => {
    if (!isNew || dismissed !== false) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isNew, dismissed, load]);

  const pinnedTitle = pinnedConfirmDate?.title ?? null;
  const steps = useMemo(
    () =>
      buildFirstSteps(
        facts,
        { idea: ideaAvailable, team: canInvite },
        pinnedTitle !== null ? { title: pinnedTitle } : null
      ),
    [facts, canInvite, ideaAvailable, pinnedTitle]
  );
  const visible =
    Boolean(release) &&
    dismissed === false &&
    shouldShowFirstSteps({
      isOwner,
      isTest: releaseIsTest,
      createdAt: releaseCreatedAt,
      now: new Date(),
      dismissed: false,
      factsKnown,
      steps,
    });
  const status: RolloutFirstStepsState['status'] = visible
    ? 'showing'
    : isNew && dismissed !== true && !factsKnown && !factsSettled
      ? 'pending'
      : 'hidden';

  const doneCount = steps.filter((step) => step.done).length;
  const onOpenPinned = pinnedConfirmDate?.onOpen;

  const go = (step: FirstStep) => {
    if (!releaseId) return;
    captureAnalyticsEvent({
      name: 'rollout_first_step_clicked',
      properties: { release_id: releaseId, step: step.key, done: doneCount, total: steps.length },
    });
    if (step.key === 'date') onOpenPinned?.();
    else if (step.key === 'idea') window.dispatchEvent(new CustomEvent(ADD_IDEA_EVENT, { detail: { releaseId } }));
    else openSettings({ segment: 'team', section: 'teammates' });
  };

  const dismiss = () => {
    if (!releaseId) return;
    const list = readPersistedState(
      FIRST_STEPS_DISMISSED_KEY,
      FIRST_STEPS_DISMISSED_VERSION,
      isDismissedList
    );
    writePersistedState(
      FIRST_STEPS_DISMISSED_KEY,
      FIRST_STEPS_DISMISSED_VERSION,
      withDismissed(list, releaseId)
    );
    setDismissed(true);
    captureAnalyticsEvent({
      name: 'rollout_first_steps_dismissed',
      properties: { release_id: releaseId, done: doneCount, total: steps.length },
    });
  };

  return { status, steps, go, dismiss };
}

/**
 * The first steps card. One obvious next action, front and centre, with the
 * short checklist under it; the card goes once all are done.
 *
 * While it shows it REPLACES the rollout's next moves (`fallback`), so a brand
 * new rollout offers one thing to do, not four. The moment it goes, the next
 * moves come back.
 */
export function RolloutFirstSteps({
  state,
  fallback,
}: {
  state: RolloutFirstStepsState;
  fallback: ReactNode;
}) {
  // While it is still working out whether to show (pending), draw neither: the
  // next moves used to paint here first and then be swapped out for the first
  // steps card (URG-367). The hook gives up after FIRST_STEPS_SETTLE_MS.
  if (state.status === 'pending') return null;
  if (state.status !== 'showing') return <>{fallback}</>;
  const { steps, go, dismiss } = state;
  const next = nextFirstStep(steps);
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <section
      aria-label={COPY.label}
      data-rollout-first-steps
      className="relative mb-4 rounded-2xl border border-brand/30 bg-brand/5 p-4"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={COPY.dismiss}
        className="motion-focus absolute right-3 top-3 grid h-7 w-7 place-items-center text-content-tertiary transition-colors hover:text-content-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2 pr-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          {COPY.label}
        </h2>
        <span className="text-[11px] text-content-tertiary">
          · {COPY.progress(doneCount, steps.length)}
        </span>
      </div>

      {next ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-brand">{COPY.next}</p>
            <p className="mt-0.5 text-base font-semibold text-content-primary">{next.title}</p>
            <p className="mt-0.5 text-sm text-content-secondary">{next.detail}</p>
          </div>
          <button
            type="button"
            onClick={() => go(next)}
            className="motion-focus motion-press inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {next.action}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* One step is already the big action above; a chip for it is a cut-off echo. */}
      {steps.length > 1 ? (
      <ol className="mt-4 grid gap-2">
        {steps.map((step, index) => (
          <li key={step.key}>
            <button
              type="button"
              onClick={() => go(step)}
              disabled={step.done}
              className="motion-focus flex w-full items-center gap-2 rounded-xl border border-stroke-default bg-bg-surface px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-bg-hover disabled:cursor-default"
            >
              <span
                aria-hidden="true"
                className={
                  step.done
                    ? 'grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-white'
                    : 'grid h-5 w-5 shrink-0 place-items-center rounded-full border border-stroke-default text-[11px] text-content-tertiary'
                }
              >
                {step.done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span
                className={
                  step.done
                    ? 'min-w-0 truncate text-content-tertiary line-through'
                    : 'min-w-0 truncate font-medium text-content-primary'
                }
              >
                {step.title}
              </span>
              <span className="sr-only">{step.done ? ' (done)' : ''}</span>
            </button>
          </li>
        ))}
      </ol>
      ) : null}
    </section>
  );
}
