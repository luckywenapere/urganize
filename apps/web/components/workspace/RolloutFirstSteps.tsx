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

// A step only shows when the place it sends you to exists.
const COVER_ART_ENABLED = process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true';

const UNKNOWN: FirstStepsFacts = { hasCoverArt: null, hasTeam: null };

/**
 * The first steps on a new rollout (URG-293; rules in lib/rollout-first-steps.ts).
 * One obvious next action, front and centre, with the short checklist under it.
 * Each item ticks itself off from what the rollout holds, re-read whenever a
 * scene closes or the tab comes back, and the card goes once all are done.
 *
 * While it shows it REPLACES the rollout's next moves (`fallback`), so a brand
 * new rollout offers one thing to do, not four. The moment it goes, the next
 * moves come back.
 */
export function RolloutFirstSteps({
  release,
  isOwner,
  fallback,
}: {
  release: { id: string; createdAt: string | null; isTest: boolean };
  isOwner: boolean;
  fallback: ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const openSettings = useOpenSettings();
  const { activeScene, openScene } = useSceneOverlay();
  const [facts, setFacts] = useState<FirstStepsFacts>(UNKNOWN);
  const [factsKnown, setFactsKnown] = useState(false);
  // null until the mount effect has read storage (no render-time storage reads).
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  const canInvite = getRolePermissions(user?.role).role === 'manager';
  const isNew = useMemo(
    () => isOwner && !release.isTest && isRolloutNew(release.createdAt, new Date()),
    [isOwner, release.isTest, release.createdAt]
  );

  useEffect(() => {
    const list = readPersistedState(
      FIRST_STEPS_DISMISSED_KEY,
      FIRST_STEPS_DISMISSED_VERSION,
      isDismissedList
    );
    setDismissed(Boolean(list?.includes(release.id)));
  }, [release.id]);

  const load = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/releases/${release.id}/first-steps`, {
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
    }
  }, [release.id]);

  // A different rollout starts from unknown, never from the last one's ticks.
  useEffect(() => {
    setFacts(UNKNOWN);
    setFactsKnown(false);
  }, [release.id]);

  // Read on arrival and every time a scene closes (that is where the cover art
  // gets added), only while the rollout is new and not hidden.
  useEffect(() => {
    if (!isNew || dismissed !== false || activeScene) return;
    void load();
  }, [isNew, dismissed, activeScene, load]);

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

  const steps = useMemo(
    () => buildFirstSteps(facts, { cover: COVER_ART_ENABLED, team: canInvite }),
    [facts, canInvite]
  );
  const visible =
    dismissed === false &&
    shouldShowFirstSteps({
      isOwner,
      isTest: release.isTest,
      createdAt: release.createdAt,
      now: new Date(),
      dismissed: false,
      factsKnown,
      steps,
    });

  if (!visible) return <>{fallback}</>;

  const next = nextFirstStep(steps);
  const doneCount = steps.filter((step) => step.done).length;

  const go = (step: FirstStep) => {
    captureAnalyticsEvent({
      name: 'rollout_first_step_clicked',
      properties: { release_id: release.id, step: step.key, done: doneCount, total: steps.length },
    });
    if (step.key === 'cover') openScene('coverart', release.id);
    else openSettings({ segment: 'team', section: 'teammates' });
  };

  const dismiss = () => {
    const list = readPersistedState(
      FIRST_STEPS_DISMISSED_KEY,
      FIRST_STEPS_DISMISSED_VERSION,
      isDismissedList
    );
    writePersistedState(
      FIRST_STEPS_DISMISSED_KEY,
      FIRST_STEPS_DISMISSED_VERSION,
      withDismissed(list, release.id)
    );
    setDismissed(true);
    captureAnalyticsEvent({
      name: 'rollout_first_steps_dismissed',
      properties: { release_id: release.id, done: doneCount, total: steps.length },
    });
  };

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

      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
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
    </section>
  );
}
