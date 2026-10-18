'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePageBarToolsSlot } from '@/components/shell/PageBar';
import { useTimelineFullScreenToolsSlot } from '@/components/releases/TimelineFullScreen';
import { Search, SlidersHorizontal, X } from '@/components/icons';
import { FilterPopover, FilterSheet } from '@/components/shell/ListToolbar';
import { useAuthStore } from '@/lib/auth-store';
import { activeFilterCount as countActiveFilters, type ToolbarControl } from '@/lib/list-toolbar';
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

/** The three filters, as the shared toolbar's controls, so the plan's Filters
 *  button opens the same sheet (phone) and panel (computer) as every list page. */
function planFilterControls(plan: PlanListState): ToolbarControl[] {
  const { filters, setFilters, assignees } = plan;
  const assigneeOptions = [
    { value: 'all', label: 'Anyone' },
    ...(assignees.hasMe ? [{ value: 'me', label: 'Me' }] : []),
    ...assignees.people.map((person) => ({ value: person.id, label: person.name })),
    ...(assignees.hasUnassigned ? [{ value: 'unassigned', label: 'Unassigned' }] : []),
  ];
  return [
    {
      kind: 'filter',
      key: 'status',
      label: 'Status',
      value: filters.status,
      defaultValue: 'all',
      options: PLAN_STATUS_FILTERS.map((value) => ({ value, label: PLAN_STATUS_LABELS[value] })),
      onChange: (value) => setFilters({ ...filters, status: value as PlanStatusFilter }),
    },
    {
      kind: 'filter',
      key: 'assignee',
      label: 'Assignee',
      value: filters.assignee,
      defaultValue: 'all',
      options: assigneeOptions,
      onChange: (value) => setFilters({ ...filters, assignee: value }),
    },
    {
      kind: 'filter',
      key: 'when',
      label: 'Date',
      value: filters.when,
      defaultValue: 'any',
      options: PLAN_WHEN_FILTERS.map((value) => ({ value, label: PLAN_WHEN_LABELS[value] })),
      onChange: (value) => setFilters({ ...filters, when: value as PlanWhenFilter }),
    },
  ];
}

/** The width from which the Filters button opens a panel instead of a sheet:
 *  Tailwind's `lg`, the same line ListToolbar's sheet and panel switch at. */
const PANEL_QUERY = '(min-width: 1024px)';

/**
 * One row: a search field and one Filters button.
 *
 * The button opens the house filter surfaces (menu audit, 2026-10-14): a
 * bottom sheet on a phone or tablet and a small panel under the button on a
 * computer, both from ListToolbar. Until then it opened a 192px box aligned to
 * the button's LEFT edge; the button sits near the right of a phone screen, so
 * the box ran off the side with "Any status" cut off, and it floated over the
 * list at z-20.
 */
/**
 * The plan's controls row.
 *
 * `phoneSearchOnly`: on a computer the top bar's search is already on screen
 * and finds activities too, so a second search field in the page read as two
 * searches (founder, 2026-10-15). With it set, the field shows below lg only.
 *
 * `inPageBar` (founder, 2026-10-15): on a computer the row's buttons (Filter,
 * `extra` such as Group by, and `trailing` such as Legend and Full screen)
 * move up onto the page bar line, beside the breadcrumb, sized and spaced on
 * the line's golden-ratio scale (34px controls, 8 / 13 / 21px gaps). Below lg
 * the row stays in the page as it was. Full screen covers the page bar, so it
 * never passes this.
 */
export function PlanListControls({
  plan,
  trailing,
  extra,
  phoneSearchOnly = false,
  inPageBar = false,
  autoFocusSearch = false,
  onDone,
}: {
  plan: PlanListState;
  trailing?: ReactNode;
  extra?: ReactNode;
  phoneSearchOnly?: boolean;
  inPageBar?: boolean;
  /** Focus the field on mount (the phone timeline's search icon, Oct 18, 2026). */
  autoFocusSearch?: boolean;
  /** A "Done" text button at the row's end that closes the search. */
  onDone?: () => void;
}) {
  const toolsSlot = usePageBarToolsSlot(inPageBar);
  const fullScreenSlot = useTimelineFullScreenToolsSlot();
  // Full screen on a desktop (URG-312): search and Filter go up into the
  // full-screen bar, and so does the trailing legend button (URG-315).
  // Below lg the bar slot is hidden, so the phone keeps the in-page row.
  if (!toolsSlot && fullScreenSlot) {
    return (
      <>
        <div className="lg:hidden">
          <PlanListRow plan={plan} trailing={trailing} search="always" />
        </div>
        {/* URG-315 (2026-10-15, founder call): the legend (info) button goes up
            into the bar too, at its right end beside "Exit full screen", so
            the row it used to hold above the phases is gone. Search stays
            centred: equal flex-1 sides around it. */}
        {createPortal(
          <div className="flex w-full items-center gap-3">
            <div className="flex-1" aria-hidden="true" />
            <div className="w-full max-w-md">
              <PlanListRow plan={plan} search="always" />
            </div>
            <div className="flex flex-1 justify-end">{trailing}</div>
          </div>,
          fullScreenSlot
        )}
      </>
    );
  }
  if (!toolsSlot) {
    return (
      <PlanListRow
        plan={plan}
        trailing={trailing}
        search={phoneSearchOnly ? 'phone' : 'always'}
        autoFocusSearch={autoFocusSearch}
        onDone={onDone}
      />
    );
  }
  return (
    <>
      <div className="lg:hidden">
        <PlanListRow plan={plan} trailing={trailing} search="always" />
      </div>
      {createPortal(
        <div className="flex items-center gap-[13px]" role="toolbar" aria-label="Plan tools">
          {extra}
          <PlanListRow plan={plan} trailing={trailing} search="never" bar />
        </div>,
        toolsSlot
      )}
    </>
  );
}

function PlanListRow({
  plan,
  trailing,
  search,
  bar = false,
  autoFocusSearch = false,
  onDone,
}: {
  plan: PlanListState;
  trailing?: ReactNode;
  search: 'always' | 'phone' | 'never';
  bar?: boolean;
  autoFocusSearch?: boolean;
  onDone?: () => void;
}) {
  const { filters, setFilters } = plan;
  const [open, setOpen] = useState<'sheet' | 'panel' | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const controls = planFilterControls(plan);
  const activeFilterCount = countActiveFilters(controls);
  const close = useCallback(() => setOpen(null), []);
  const clearFilters = useCallback(
    () => setFilters({ ...EMPTY_PLAN_FILTERS, query: filters.query }),
    [filters.query, setFilters]
  );

  // The sheet is a phone surface: if the window grows past the line while it
  // is open, close it rather than leave a hidden sheet holding the scroll lock.
  useEffect(() => {
    if (open !== 'sheet' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(PANEL_QUERY);
    const onChange = () => {
      if (query.matches) setOpen(null);
    };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(null);
      return;
    }
    const wide = typeof window.matchMedia === 'function' && window.matchMedia(PANEL_QUERY).matches;
    setOpen(wide ? 'panel' : 'sheet');
  };

  return (
    <div className={`flex items-center ${bar ? 'gap-2 [&>button]:!h-[34px] [&>button]:!w-[34px]' : 'gap-2'}`} role={bar ? undefined : 'search'} aria-label={bar ? undefined : 'Search this plan'}>
      {search === 'never' ? null : (
      <label className={`relative min-w-0 flex-1 sm:max-w-xs ${search === 'phone' ? 'lg:hidden' : ''}`}>
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
          autoFocus={autoFocusSearch}
          className="motion-focus h-10 w-full rounded-lg border border-stroke-control bg-bg-surface pl-8 pr-3 text-xs text-content-primary placeholder:text-content-tertiary sm:h-9 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>
      )}

      {/* One Filter button at every width (2026-10-14 declutter): three
          dropdowns in a row were the loudest thing above the timeline. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open !== null}
        aria-label={activeFilterCount ? `Filters, ${activeFilterCount} on` : 'Filters'}
        className="motion-focus motion-press relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover sm:h-9 sm:w-9"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        {activeFilterCount ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-content-inverse">
            {activeFilterCount}
          </span>
        ) : null}
      </button>
      {open === 'sheet' ? (
        <FilterSheet
          title="Filters"
          controls={controls}
          count={activeFilterCount}
          onClear={clearFilters}
          onClose={close}
        />
      ) : null}
      {open === 'panel' ? (
        <FilterPopover
          anchor={buttonRef}
          title="Filters"
          controls={controls}
          count={activeFilterCount}
          onClear={clearFilters}
          onClose={close}
          align={bar ? 'end' : 'start'}
        />
      ) : null}

      {hasActivePlanFilters(filters) && !onDone ? (
        <button
          type="button"
          onClick={() => setFilters(EMPTY_PLAN_FILTERS)}
          aria-label="Clear search and filters"
          title="Clear"
          className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary sm:h-9 sm:w-9"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      {onDone ? (
        <button
          type="button"
          onClick={onDone}
          className="motion-focus motion-press inline-flex h-10 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-content-primary transition-colors hover:bg-bg-hover"
        >
          Done
        </button>
      ) : null}
      {trailing ? (
        <div className={`flex shrink-0 items-center ${bar ? 'gap-2 [&>*>button]:!h-[34px] [&>*>button]:!w-[34px]' : 'ml-auto gap-1'}`}>{trailing}</div>
      ) : null}
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
