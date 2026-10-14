'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import {
  EMPTY_PLAN_FILTERS,
  PLAN_STATUS_FILTERS,
  PLAN_STATUS_LABELS,
  PLAN_WHEN_FILTERS,
  PLAN_WHEN_LABELS,
  hasActivePlanFilters,
  selectPlanTasks,
  type PlanFilters,
  type PlanStatusFilter,
  type PlanWhenFilter,
} from '@/lib/plan-focus';
import type { Task } from '@/types/tasks';

/**
 * The rollout plan's short list, its search and its filters (URG-258).
 *
 * One hook, used by both views of a rollout's activities (the timeline and the
 * buckets), so the two cannot disagree about what "the main list" is. The
 * rule itself lives in lib/plan-focus.ts and is unit-tested; this file owns
 * the state and the one row of controls.
 *
 * State resets when the rollout changes: a search typed on one rollout is not
 * a question about the next.
 */
export function usePlanList(tasks: Task[], rolloutId: string | null) {
  const [filters, setFilters] = useState<PlanFilters>(EMPTY_PLAN_FILTERS);
  const [showAll, setShowAll] = useState(false);
  const [forRollout, setForRollout] = useState(rolloutId);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);

  // Reset during render rather than in an effect, so the next rollout never
  // paints one frame filtered by the last one's search.
  if (forRollout !== rolloutId) {
    setForRollout(rolloutId);
    setFilters(EMPTY_PLAN_FILTERS);
    setShowAll(false);
  }

  const result = useMemo(
    () => selectPlanTasks(tasks, { filters, showAll, currentUserId }),
    [tasks, filters, showAll, currentUserId]
  );

  const assignees = useMemo(() => {
    const byId = new Map<string, string>();
    let hasUnassigned = false;
    for (const task of tasks) {
      if (!task.assignedToUserId) {
        hasUnassigned = true;
        continue;
      }
      if (task.assignedToUserId === currentUserId) continue;
      if (!byId.has(task.assignedToUserId)) {
        byId.set(task.assignedToUserId, task.assignee?.name || task.assignee?.email || 'Teammate');
      }
    }
    return {
      people: [...byId.entries()].map(([id, name]) => ({ id, name })),
      hasMe: tasks.some((task) => currentUserId && task.assignedToUserId === currentUserId),
      hasUnassigned,
    };
  }, [tasks, currentUserId]);

  return {
    ...result,
    filters,
    setFilters,
    showAll,
    setShowAll,
    assignees,
    totalCount: tasks.length,
  };
}

export type PlanListState = ReturnType<typeof usePlanList>;

const SELECT_CLASS =
  'motion-focus h-9 shrink-0 cursor-pointer appearance-none rounded-lg border border-stroke-control bg-bg-surface px-3 text-xs font-medium text-content-primary transition-colors hover:bg-bg-hover';

function FilterSelects({ plan }: { plan: PlanListState }) {
  const { filters, setFilters, assignees } = plan;
  return (
    <>
      <select
        aria-label="Status"
        value={filters.status}
        onChange={(event) =>
          setFilters({ ...filters, status: event.target.value as PlanStatusFilter })
        }
        className={SELECT_CLASS}
      >
        {PLAN_STATUS_FILTERS.map((value) => (
          <option key={value} value={value}>
            {PLAN_STATUS_LABELS[value]}
          </option>
        ))}
      </select>
      <select
        aria-label="Assignee"
        value={filters.assignee}
        onChange={(event) => setFilters({ ...filters, assignee: event.target.value })}
        className={SELECT_CLASS}
      >
        <option value="all">Anyone</option>
        {assignees.hasMe ? <option value="me">Me</option> : null}
        {assignees.people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
        {assignees.hasUnassigned ? <option value="unassigned">Unassigned</option> : null}
      </select>
      <select
        aria-label="Date"
        value={filters.when}
        onChange={(event) =>
          setFilters({ ...filters, when: event.target.value as PlanWhenFilter })
        }
        className={SELECT_CLASS}
      >
        {PLAN_WHEN_FILTERS.map((value) => (
          <option key={value} value={value}>
            {PLAN_WHEN_LABELS[value]}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * One row: a search field and three filters. On a phone the three filters sit
 * behind one button so the row still fits a 375px screen without wrapping.
 */
export function PlanListControls({ plan, trailing }: { plan: PlanListState; trailing?: ReactNode }) {
  const { filters, setFilters } = plan;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const activeFilterCount =
    Number(filters.status !== 'all') +
    Number(filters.assignee !== 'all') +
    Number(filters.when !== 'any');

  useEffect(() => {
    if (!filtersOpen) return;
    const close = (event: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [filtersOpen]);

  return (
    <div className="flex items-center gap-2" role="search" aria-label="Search this plan">
      <label className="relative min-w-0 flex-1 sm:max-w-xs">
        <span className="sr-only">Search activities</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary"
          aria-hidden="true"
        />
        <input
          type="search"
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          placeholder="Search activities"
          className="motion-focus h-9 w-full rounded-lg border border-stroke-control bg-bg-surface pl-8 pr-3 text-xs text-content-primary placeholder:text-content-tertiary [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>

      {/* One Filter button at every width (2026-10-14 declutter): three
          dropdowns in a row were the loudest thing above the timeline. */}
      <div ref={popoverRef} className="relative">
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-label={activeFilterCount ? `Filters, ${activeFilterCount} on` : 'Filters'}
          className="motion-focus motion-press relative grid h-9 w-9 place-items-center rounded-lg border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {activeFilterCount ? (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-content-inverse">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {filtersOpen ? (
          <div className="absolute left-0 top-11 z-20 flex w-48 flex-col gap-2 rounded-xl border border-stroke-default bg-bg-surface p-2 shadow-lg [&>select]:w-full">
            <FilterSelects plan={plan} />
          </div>
        ) : null}
      </div>

      {hasActivePlanFilters(filters) ? (
        <button
          type="button"
          onClick={() => setFilters(EMPTY_PLAN_FILTERS)}
          aria-label="Clear search and filters"
          title="Clear"
          className="motion-focus motion-press grid h-9 w-9 shrink-0 place-items-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      {trailing ? <div className="ml-auto flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </div>
  );
}

/** The one quiet control under the list: reveal the rest, or go back. */
export function PlanShowAllToggle({ plan }: { plan: PlanListState }) {
  if (plan.filtering) {
    if (plan.visible.length > 0) return null;
    return (
      <p className="py-6 text-center text-sm text-content-secondary">No activities match.</p>
    );
  }
  if (plan.hiddenCount === 0) return null;
  return (
    <div className="flex justify-center pt-1">
      <button
        type="button"
        onClick={() => plan.setShowAll(!plan.showAll)}
        aria-expanded={plan.showAll}
        className="motion-focus rounded-md px-2 py-1 text-xs font-medium text-content-secondary underline-offset-4 transition-colors hover:text-content-primary hover:underline"
      >
        {plan.showAll ? 'Show key activities' : `Show all ${plan.totalCount} activities`}
      </button>
    </div>
  );
}
