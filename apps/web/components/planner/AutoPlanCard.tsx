'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from '@/components/icons';

/**
 * The rollout onboarding created, while its plan builds on its own
 * (auto-plan, 2026-10-17; mocks/auto-plan, approved by Oyin).
 *
 *   generating  "Building your plan." with a bar that fills over about a
 *               minute, and the three phases sketched underneath, so the
 *               page already has the shape it is about to get.
 *   failed      "Your plan didn't build." with one accent action, Try again,
 *               and "Add an activity yourself" as the quiet way out.
 *
 * No questions in either state: the build used onboarding's answers. The
 * ready state is PlanBuiltBanner's compact form, once activities exist.
 */

export type AutoPlanCardState = 'generating' | 'failed';

/** The bar's full length: the auto build's own ceiling is about a minute. */
const FILL_MS = 60_000;

function useFill(active: boolean, startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!active) return 0;
  const from = startedAt ?? now;
  // Eases toward 95% and never claims done before the activities arrive.
  const fraction = Math.min(0.95, Math.max(0.08, (now - from) / FILL_MS));
  return Math.round(fraction * 100);
}

const SKELETON_PHASES: Array<{ label: string; rows: number[] }> = [
  { label: 'Before release', rows: [86, 70, 76] },
  { label: 'Release week', rows: [62, 80] },
  { label: 'After release', rows: [72] },
];

export function AutoPlanCard({
  state,
  startedAt,
  retrying = false,
  onRetry,
  onAddActivity,
}: {
  state: AutoPlanCardState;
  /** When the build started (ms), for the bar. */
  startedAt: number | null;
  /** Try again is in flight. */
  retrying?: boolean;
  onRetry: () => void;
  onAddActivity: () => void;
}) {
  const generating = state === 'generating' || retrying;
  const fill = useFill(generating, retrying ? null : startedAt);

  if (generating) {
    return (
      <div>
        <section
          aria-live="polite"
          className="rounded-2xl border border-brand/30 bg-gradient-to-b from-brand/[0.06] to-transparent p-6 sm:p-7"
        >
          <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-brand">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            UrgAns
          </p>
          <h3 className="mt-4 font-display text-2xl font-semibold leading-tight text-content-primary">
            Building your plan.
          </h3>
          <p className="mt-2 text-sm text-content-secondary">Under a minute.</p>
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-content-primary/10" aria-hidden="true">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
              style={{ width: `${fill}%` }}
            />
          </div>
        </section>
        <div aria-hidden="true" className="mt-8 space-y-8 opacity-55">
          {SKELETON_PHASES.map((phase) => (
            <div key={phase.label}>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-content-tertiary">{phase.label}</p>
              <div className="mt-3 border-t border-stroke-default">
                {phase.rows.map((width, index) => (
                  <div key={index} className="flex items-center gap-4 border-b border-stroke-default py-4">
                    <span className="h-5 w-5 shrink-0 rounded-full border border-stroke-default" />
                    <span className="h-3 rounded-full bg-content-primary/[0.06]" style={{ width: `${width}%` }} />
                    <span className="ml-auto h-3 w-12 shrink-0 rounded-full bg-content-primary/[0.06]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section role="alert" className="rounded-2xl border border-stroke-default bg-bg-elevated p-6 sm:p-7">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-content-tertiary">UrgAns</p>
      <h3 className="mt-4 font-display text-2xl font-semibold leading-tight text-content-primary">
        Your plan didn&apos;t build.
      </h3>
      <p className="mt-2 text-sm text-content-secondary">Nothing was lost.</p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={onRetry}
          className="motion-press inline-flex h-11 items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-content-inverse transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onAddActivity}
          className="motion-focus text-sm text-content-secondary underline decoration-stroke-strong underline-offset-4 transition-colors hover:text-content-primary"
        >
          Add an activity yourself
        </button>
      </div>
    </section>
  );
}
