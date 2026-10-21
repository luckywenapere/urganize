'use client';

import { useMemo } from 'react';

import type { PlanReleaseType } from '@/lib/release-planning';
import {
  PLANNER_PREVIEW_COPY,
  buildPlannerTemplatePreview,
  previewSourceLine,
  previewSummaryLine,
} from '@/lib/planner-template-preview';

/**
 * The free look at the plan, shown on the planner's first question (v1.92.0).
 *
 * Built from the hand-written playbook in the browser: no request, no model,
 * no credits. The cost and the balance stay in the planner's footer line right
 * under it, so a person sees what they get, what it costs and what they have
 * on one screen, on a phone too (the phone's top bar has no credits chip).
 */
export function PlannerTemplatePreview({ releaseType }: { releaseType: PlanReleaseType }) {
  const preview = useMemo(() => buildPlannerTemplatePreview(releaseType), [releaseType]);

  return (
    <section
      aria-labelledby="planner-preview-heading"
      className="mt-5 rounded-xl border border-stroke-subtle bg-bg-elevated p-3 sm:p-4"
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
        {PLANNER_PREVIEW_COPY.kicker}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id="planner-preview-heading" className="font-display text-base font-semibold text-content-primary">
          {PLANNER_PREVIEW_COPY.heading}
        </h3>
        <p className="text-sm font-medium text-content-secondary">{previewSummaryLine(preview)}</p>
      </div>

      <ul className="mt-3 grid grid-cols-3 gap-2" aria-label="Activities by phase">
        {preview.phases.map((phase) => (
          <li
            key={phase.phase}
            className="min-w-0 rounded-lg border border-stroke-subtle bg-bg-surface px-2.5 py-2"
          >
            <span className="block font-display text-lg font-semibold leading-none text-content-primary">
              {phase.count}
            </span>
            <span className="mt-1 block truncate text-xs text-content-secondary">{phase.label}</span>
          </li>
        ))}
      </ul>

      {preview.examples.length ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-content-primary">{PLANNER_PREVIEW_COPY.examplesLabel}</p>
          <ul className="mt-1.5 space-y-1">
            {preview.examples.map((title) => (
              <li key={title} className="flex gap-2 text-sm leading-5 text-content-secondary">
                <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                <span className="min-w-0 break-words">{title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 border-t border-stroke-subtle pt-3 text-xs leading-5 text-content-secondary">
        {previewSourceLine(preview)} {PLANNER_PREVIEW_COPY.noCharge}
      </p>
    </section>
  );
}
