'use client';

import { useEffect, useState } from 'react';

import { Megaphone, Sparkles } from '@/components/icons';
import { useSceneOverlay } from '@/components/workspace/useSceneOverlay';
import { supabase } from '@/lib/supabase/client';
import { DEFAULT_PROMO_COUNTRY, suggestPromoChannels, type PromoChannel } from '@/lib/promo-channels';
import {
  BUDGET_OPTIONS,
  GOAL_OPTIONS,
  PLAN_SCOPE_OPTIONS,
  deriveScheduleWarnings,
  isTaskInScope,
  summarizeRemovedTasks,
  type AppliedExclusion,
  type ReleasePlanDraftDoc,
} from '@/lib/release-planning';

/**
 * "Here is the plan UrgAns built." Shown at the top of a rollout's activities
 * after a build, until the manager dismisses it.
 *
 * THE "LEFT OUT" LIST IS HIDDEN (founder call, Oyin, 2026-10-17): "it
 * shouldn't be showing this left out part so it doesn't clutter the screen."
 * That overrides the reasoning below, kept as the record of why it was once
 * shown. Hide only: summarizePlanForBanner still derives `scopes`, `drops`
 * and `removedCount`, removed tasks stay in the stored plan document, and
 * UrgAns's own build reply still names what it left out. Restoring the list
 * is re-adding one block in the render below.
 *
 * Former rationale: until 2026-09-15 the manager reviewed a draft
 * before anything was scheduled, so they SAW the model drop a task and why.
 * The plan lands as activities now, and a plan for "a normal release, no
 * marketing" removes around thirty of the playbook's sixty-four — so this is
 * the only place anyone learns what went, and why, and what UrgAns thought
 * was worth a second look. The banner stays until "Got it" (the dismissal is
 * remembered per release, see lib/plan-built-seen.ts) and goes quiet on its
 * own once the plan is more than two weeks old, by which time the activities
 * themselves are the record.
 *
 * It reads the stored document (GET /plan) rather than the build response,
 * because the build finished in a request the modal fired and this component
 * may mount a reload, a day, or a device later. Both derive the "left out"
 * list through the same summarizeRemovedTasks, so they cannot disagree.
 *
 * Renders NOTHING until it has something to show — no skeleton, because the
 * activities under it are the point of the page and a placeholder above them
 * would say "something is loading" about a courtesy.
 */

/** A plan older than this is history the activities already tell. */
const SHOW_FOR_MS = 14 * 24 * 60 * 60 * 1000;

type PlanResponse = {
  plan: {
    doc: ReleasePlanDraftDoc;
    approvedAt: string | null;
    approvedTaskCount: number | null;
  } | null;
  releaseDate: string | null;
};

type Summary = {
  count: number;
  rationale: string | null;
  scopes: Array<{ label: string; reason: string; taskCount: number }>;
  drops: Array<{ id: string; title: string; reason: string | null }>;
  removedCount: number;
  warnings: string[];
  /** "Reach new listeners · Under ₦100k": what UrgAns fitted the plan to.
   *  Only when the tailoring actually ran; null otherwise. */
  shapedFor: string | null;
  /** Tasks UrgAns added on top of the playbook (origin 'ai'). */
  added: Array<{ id: string; title: string; why: string }>;
  /** The few tasks UrgAns marked as the focus for the goal, still in the plan. */
  focus: Array<{ id: string; title: string }>;
};

/** What the plan was fitted to, in the intake's own labels. Exported for tests. */
export function shapedForLine(doc: ReleasePlanDraftDoc): string | null {
  if (!doc.ai.applied) return null;
  const goal =
    doc.intake.goal_text?.trim() ||
    GOAL_OPTIONS.find((option) => option.value === doc.intake.goal)?.label ||
    null;
  const budget = BUDGET_OPTIONS.find((option) => option.value === doc.intake.budget)?.label ?? null;
  const parts = [goal ? goal.charAt(0).toLowerCase() + goal.slice(1) : null, budget ? budget.charAt(0).toLowerCase() + budget.slice(1) : null].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length ? parts.join(' · ') : null;
}

function scopeLabel(scope: AppliedExclusion['scope']): string {
  return PLAN_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope;
}

/** Pure: what the banner says, from the stored document. Exported for tests. */
export function summarizePlanForBanner(
  doc: ReleasePlanDraftDoc,
  approvedTaskCount: number | null,
  releaseDate: string | null,
  todayYmd: string
): Summary {
  const removed = summarizeRemovedTasks(doc);
  const removedIds = new Set(removed.map((task) => task.id));

  // A scope removal is one line for the whole kind of work, with a count,
  // rather than thirty rows carrying the same sentence. Whatever is left over
  // is an individual drop the model made, and those keep their own reason.
  const covered = new Set<string>();
  const scopes = doc.applied_exclusions.map((entry) => {
    let taskCount = 0;
    for (const task of doc.tasks) {
      if (!removedIds.has(task.id) || covered.has(task.id)) continue;
      if (!isTaskInScope(task, entry.scope)) continue;
      covered.add(task.id);
      taskCount += 1;
    }
    return { label: scopeLabel(entry.scope), reason: entry.reason, taskCount };
  });
  const drops = removed
    .filter((task) => !covered.has(task.id))
    .map((task) => ({ id: task.id, title: task.title, reason: task.reason }));

  const count =
    approvedTaskCount ?? doc.tasks.filter((task) => !task.removed).length;

  return {
    count,
    rationale: doc.ai.rationale,
    scopes,
    drops,
    removedCount: removed.length,
    warnings: [...(doc.ai.warnings ?? []), ...deriveScheduleWarnings(doc, releaseDate, todayYmd)],
    shapedFor: shapedForLine(doc),
    added: doc.tasks
      .filter((task) => task.origin === 'ai' && !task.removed)
      .map((task) => ({ id: task.id, title: task.title, why: task.why })),
    focus: doc.tasks
      .filter((task) => task.focus && !task.removed)
      .map((task) => ({ id: task.id, title: task.title })),
  };
}

export function PlanBuiltBanner({
  releaseId,
  onDismiss,
}: {
  releaseId: string;
  onDismiss: () => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  // Promo channels that fit this rollout (GitHub #833). Deterministic, from the
  // same rule the Promo scene's "Good fits" uses, so the plan names a few and
  // the scene is one tap away. Empty (and the line hidden) on any failure,
  // including before the directory's table exists.
  const [promoFits, setPromoFits] = useState<PromoChannel[]>([]);
  const { openScene } = useSceneOverlay();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/releases/${releaseId}/plan`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as PlanResponse | null;
        const plan = body?.plan;
        if (!plan || cancelled) return;
        void fetch(`/api/releases/${releaseId}/promo-channels`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((promo: { ready?: boolean; channels?: PromoChannel[]; genre?: string | null } | null) => {
            if (cancelled || !promo?.ready || !Array.isArray(promo.channels)) return;
            setPromoFits(
              suggestPromoChannels(
                promo.channels,
                { genre: promo.genre ?? null, country: DEFAULT_PROMO_COUNTRY },
                3
              )
            );
          })
          .catch(() => undefined);
        const approvedAt = plan.approvedAt ? Date.parse(plan.approvedAt) : NaN;
        if (Number.isFinite(approvedAt) && Date.now() - approvedAt > SHOW_FOR_MS) return;
        setSummary(
          summarizePlanForBanner(
            plan.doc,
            plan.approvedTaskCount,
            body?.releaseDate ?? null,
            new Date().toISOString().slice(0, 10)
          )
        );
      } catch {
        // A summary nobody was shown costs nothing: the activities are on the
        // page regardless, and the row they came from is still there.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  if (!summary) return null;

  return (
    <section
      aria-label="What UrgAns built"
      className="mb-4 rounded-xl border border-brand/30 bg-brand/5 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand">UrgAns planner</p>
          <h3 className="mt-1 font-display text-lg font-semibold leading-tight text-content-primary">
            UrgAns built this plan: {summary.count} {summary.count === 1 ? 'activity' : 'activities'}.
          </h3>
          {summary.shapedFor ? (
            <p className="mt-1 text-xs font-medium text-brand">Shaped for: {summary.shapedFor}</p>
          ) : null}
          {summary.rationale ? (
            <p className="mt-2 max-w-prose text-sm leading-6 text-content-secondary">{summary.rationale}</p>
          ) : null}

          {summary.focus.length > 0 ? (
            <p className="mt-3 text-sm leading-6 text-content-secondary">
              <span className="font-medium text-content-primary">Start with: </span>
              {summary.focus.map((task) => task.title).join(' · ')}
            </p>
          ) : null}

          {promoFits.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-6 text-content-secondary">
              <p className="min-w-0">
                <span className="font-medium text-content-primary">Promo that fits: </span>
                {promoFits.map((channel) => channel.name).join(' · ')}
              </p>
              <button
                type="button"
                onClick={() => openScene('pitch', releaseId)}
                className="motion-focus inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand/40 px-3 text-xs font-semibold text-brand hover:bg-brand/10"
              >
                <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                Find promo
              </button>
            </div>
          ) : null}

          {summary.added.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-content-primary">
                Added by UrgAns ({summary.added.length})
              </p>
              <ul className="mt-1.5 space-y-1.5 text-sm leading-6 text-content-secondary">
                {summary.added.map((task) => (
                  <li key={task.id} className="flex gap-1.5">
                    <Sparkles className="mt-1.5 h-3 w-3 shrink-0 text-brand" aria-label="Added by UrgAns" />
                    <span>
                      <span className="font-medium text-content-primary">{task.title}</span>
                      {task.why ? `: ${task.why}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {summary.warnings.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-content-primary">Worth a look</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-content-secondary">
                {summary.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onDismiss}
            className="motion-focus mt-4 inline-flex h-9 items-center rounded-lg bg-brand px-3 text-xs font-semibold text-content-inverse"
          >
            Got it
          </button>
        </div>
      </div>
    </section>
  );
}
