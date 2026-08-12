'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { PLAN_PHASE_ORDER } from '@/lib/release-planning';

/**
 * The plan's loading shape, used for two different waits:
 *
 *  - reading a draft that already exists, and
 *  - the twenty-odd seconds while UrgAns drafts a new one.
 *
 * The second is why it reserves four phase groups with descending task counts
 * rather than a generic block: the manager is about to see a plan, and the
 * frame they wait in should be the frame it arrives in.
 */

const PHASE_ROWS: Record<string, number> = {
  setup: 5,
  pre_release: 4,
  release_week: 4,
  post_release: 3,
};

export function PlanSceneSkeleton({ label }: { label?: string }) {
  return (
    <div>
      {label ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-brand"
        >
          {label}
        </p>
      ) : null}

      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock className="h-3 w-40" />
          <SkeletonBlock className="h-3 w-16" />
        </div>

        <div className="mt-4 space-y-4">
          {PLAN_PHASE_ORDER.map((phase) => (
            <div
              key={phase}
              className="rounded-xl border border-stroke-default bg-bg-surface p-4 sm:p-5"
            >
              <SkeletonBlock className="h-5 w-32" />
              <SkeletonBlock className="mt-2 h-3 w-24" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: PHASE_ROWS[phase] ?? 3 }).map((_, index) => (
                  <div key={index} className="space-y-1.5 border-b border-stroke-subtle pb-3">
                    <SkeletonBlock className="h-4 w-3/5" />
                    <SkeletonBlock className="h-3 w-4/5" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
