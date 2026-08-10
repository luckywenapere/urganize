'use client';

import { Loader2, Plus, Sparkles } from 'lucide-react';

import type { WorkspaceMember } from '@/lib/tasks';
import {
  PLAN_PHASE_BLURBS,
  PLAN_PHASE_LABELS,
  computeTaskYmd,
  type DraftTask,
  type PlanPhase,
} from '@/lib/release-planning';
import { PlanTaskRow } from './PlanTaskRow';

/**
 * One phase of the draft: its heading, its tasks, an add row, and the control
 * that asks UrgAns for a second attempt at this part of the plan.
 */

type PlanPhaseSectionProps = {
  phase: PlanPhase;
  tasks: DraftTask[];
  releaseDate: string | null;
  members: WorkspaceMember[];
  /** Hidden when no model tailored the draft: there is nothing to redraft against. */
  canRegenerate: boolean;
  isRegenerating: boolean;
  regenerateError: string | null;
  disabled?: boolean;
  onRegenerate: () => void;
  onChangeTask: (taskId: string, changes: Partial<DraftTask>) => void;
  onRemoveTask: (taskId: string) => void;
  onRestoreTask: (taskId: string) => void;
  onAddTask: (offsetDays: number) => void;
};

/** Where a task added to this phase should land by default: beside the work
 * already there, or at the phase's own midpoint when it is empty. */
const PHASE_DEFAULT_OFFSET: Record<PlanPhase, number> = {
  setup: -42,
  pre_release: -14,
  release_week: 0,
  post_release: 14,
};

export function PlanPhaseSection({
  phase,
  tasks,
  releaseDate,
  members,
  canRegenerate,
  isRegenerating,
  regenerateError,
  disabled,
  onRegenerate,
  onChangeTask,
  onRemoveTask,
  onRestoreTask,
  onAddTask,
}: PlanPhaseSectionProps) {
  const active = tasks.filter((task) => !task.removed);
  const firstOffset = active.length ? active[0].offset_days : PHASE_DEFAULT_OFFSET[phase];
  const startYmd = releaseDate && active.length ? computeTaskYmd(releaseDate, firstOffset) : null;

  const meta = [
    `${active.length} ${active.length === 1 ? 'task' : 'tasks'}`,
    startYmd
      ? `from ${new Intl.DateTimeFormat('en', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${startYmd}T00:00:00.000Z`))}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-content-primary">
            {PLAN_PHASE_LABELS[phase]}
          </h3>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
            {meta}
          </p>
          <p className="mt-1 text-xs leading-5 text-content-secondary">
            {PLAN_PHASE_BLURBS[phase]}
          </p>
        </div>

        {canRegenerate ? (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={disabled || isRegenerating}
            aria-busy={isRegenerating}
            className="motion-focus motion-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-elevated px-3 text-xs font-semibold text-content-secondary transition-colors hover:border-brand/50 hover:text-content-primary disabled:opacity-60"
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Redrafting
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Redraft this phase
              </>
            )}
          </button>
        ) : null}
      </div>

      {regenerateError ? (
        <p className="mt-3 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs leading-5 text-status-error">
          {regenerateError}
        </p>
      ) : null}

      <div className="mt-3">
        {tasks.length === 0 ? (
          <p className="px-2 py-3 text-xs text-content-tertiary">
            Nothing here yet. Add what this phase needs.
          </p>
        ) : (
          tasks.map((task) => (
            <PlanTaskRow
              key={task.id}
              task={task}
              releaseDate={releaseDate}
              members={members}
              disabled={disabled}
              onChange={(changes) => onChangeTask(task.id, changes)}
              onRemove={() => onRemoveTask(task.id)}
              onRestore={() => onRestoreTask(task.id)}
            />
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => onAddTask(firstOffset)}
        disabled={disabled}
        className="motion-focus mt-2 inline-flex h-11 items-center gap-2 rounded-full px-2 text-xs font-semibold text-content-secondary transition-colors hover:text-content-primary disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add a task
      </button>
    </section>
  );
}
