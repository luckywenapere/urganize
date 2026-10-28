'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarClock, Check, ChevronDown, ChevronRight, Flag, Info } from '@/components/icons';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';
import {
  buildReleaseTimeline,
  closedSummaryLine,
  dayPosition,
  daysForDragDelta,
  foldPastWeeks,
  formatCatchUpRange,
  groupItemsByWeek,
  hoistStartHere,
  isClosedTone,
  phoneWeekHeading,
  isoForDayOffset,
  rolloutClosedSummary,
  itemPosition,
  narrowTimeline,
  type ReleaseTimeline,
  type TimelineItem,
  type TimelinePhaseGroup,
  type TimelineTone,
  type TimelineWeek,
} from '@/lib/release-timeline';
import { getAccessToken } from '@/components/content-calendar/get-access-token';
import { useKeepInViewport } from '@/lib/use-keep-in-viewport';
import { PlanViewToggle } from '@/components/workspace/PlanViewToggle';
import {
  PlanListControls,
  PlanShowAllToggle,
  usePlanList,
} from '@/components/workspace/PlanListControls';
import { RolloutPhaseStrip } from '@/components/workspace/RolloutPhases';
import { PlanSuggestionToast } from '@/components/workspace/PlanSuggestions';
import { pickStartHereTaskId } from '@/lib/plan-core';
import { formatPhaseDates, summarizeRolloutPhases } from '@/lib/rollout-phases';
import { EMPTY_PLAN_FILTERS } from '@/lib/plan-focus';
import { useRolloutPhoneChrome } from '@/stores/useRolloutPhoneChrome';
import { useTaskStore } from '@/stores/useTaskStore';
import { TASKS_CHANGED_EVENT } from '@/components/tasks/TaskUIProvider';
import { BulkSelectBar, SelectBox, SelectToggleButton, isSelectableTask } from '@/components/tasks/BulkSelect';

/**
 * The release Timeline — every activity on one week axis, anchored to release
 * day. Internally the Gantt view; "Timeline" everywhere a user can read.
 *
 * Reads `tasks` straight from the props the panel already has, so unlike every
 * other scene it has NO fetch, no API route, no cache entry and no skeleton of
 * its own. It is a lens on data the workspace is already holding, which is also
 * why it is excluded from CacheableSceneName — there is nothing to cache.
 *
 * All layout arithmetic lives in lib/release-timeline.ts, which is unit-tested;
 * this file owns rendering and the drag gesture only. In particular the two
 * rules most likely to be broken from here are enforced over there: a bar runs
 * FORWARD from its due date, and single-day work is a marker rather than a
 * one-cell bar.
 */

const TONE_BAR_CLASS: Record<TimelineTone, string> = {
  done: 'bg-brand/40',
  cancelled: 'bg-stroke-strong',
  overdue: 'bg-status-error',
  catch_up: 'bg-status-warning',
  blocked: 'bg-status-warning',
  in_progress: 'bg-brand',
  scheduled: 'bg-stroke-control',
};

const TONE_DOT_CLASS: Record<TimelineTone, string> = {
  done: 'bg-brand/50 border-brand/50',
  cancelled: 'bg-bg-surface border-stroke-strong',
  overdue: 'bg-status-error border-status-error',
  catch_up: 'bg-status-warning border-status-warning',
  blocked: 'bg-status-warning border-status-warning',
  in_progress: 'bg-brand border-brand',
  scheduled: 'bg-bg-surface border-stroke-control',
};

/** A milestone still ahead reads as the legend's filled diamond, not as a
 * quiet scheduled dot: it is the date the plan is steering for. */
function dotClass(item: { isMilestone?: boolean; tone: TimelineTone }): string {
  return item.isMilestone && item.tone === 'scheduled'
    ? 'bg-brand border-brand'
    : TONE_DOT_CLASS[item.tone];
}

const TONE_LABEL: Record<TimelineTone, string> = {
  done: 'Done',
  cancelled: 'Cancelled',
  overdue: 'Overdue',
  catch_up: 'Catch up',
  blocked: 'Blocked',
  in_progress: 'In progress',
  scheduled: 'Scheduled',
};

/** The states worth a WORD beside the title, not just a colour on the bar.
 * Overdue and in-progress differ only by red versus green on the grid, and red
 * versus green is the pair colour-blind readers confuse most; catch-up and
 * blocked also share one amber. Saying the state in text is what keeps the grid
 * readable without hue. Done, cancelled and scheduled are the quiet defaults. */
const TONE_TAG_CLASS: Partial<Record<TimelineTone, string>> = {
  overdue: 'text-status-error',
  catch_up: 'text-status-warning',
  blocked: 'text-status-warning',
};

/** Row height, shared by the grid rows and their labels so the two columns
 * stay locked together without a table. */
const ROW_CLASS = 'h-8';

/**
 * Select mode on the Timeline (bulk mark as done, founder approved the mock
 * 2026-10-24). Same Select button and bar as the list. While it is on, a tap
 * on a row, its label or its bar picks it instead of opening it, and nothing
 * drags. Release day and other milestones, locked, done and cancelled work
 * cannot be picked. Context rather than props because the rows sit four
 * components down in both the grid and the week list.
 */
type TimelineSelection = {
  selected: ReadonlySet<string>;
  selectable: ReadonlySet<string>;
  toggle: (taskId: string) => void;
};
const TimelineSelectContext = createContext<TimelineSelection | null>(null);
const useTimelineSelection = () => useContext(TimelineSelectContext);

type TimelineSceneProps = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'releaseDate'>;
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
  /** Re-read the workspace after a reschedule lands. */
  onRescheduled: () => void;
  /**
   * Drop this scene's own empty states because a standing banner above it
   * already says the same thing AND offers the button to act on it.
   *
   * Only ever true when the timeline is the release's MAIN VIEW: the banner
   * slot (SetReleaseDateCard / PlanReleaseCard) renders above the body there,
   * and stacking "Set a release date first" under a form that sets the release
   * date is two blocks of chrome for one job — the thing a phone can least
   * afford. Opened as a scene, the banner is not there and these states are
   * the only thing that would explain an empty screen, so they stay.
   */
  suppressEmptyState?: boolean;
  /**
   * The check before distribution, drawn on the phase row's line on a
   * computer instead of as its own banner above the timeline (2026-10-16,
   * founder: "they can all enter one line and be much more compact").
   */
  statusSlot?: ReactNode;
  /**
   * The phone rollout view (rollout declutter, founder approved Oct 18, 2026).
   * Search, Filter and the colour key hide behind the header's search icon,
   * the phase line goes (the header's meta line says the phase), and the
   * week list folds past weeks into Catch up. The computer is unchanged.
   */
  phone?: boolean;
};

export function TimelineScene({
  release,
  tasks,
  onOpenTask,
  onToast,
  onRescheduled,
  suppressEmptyState = false,
  statusSlot,
  phone = false,
}: TimelineSceneProps) {
  const phoneSearchOpen = useRolloutPhoneChrome((state) => state.searchOpen);
  const setPhoneSearchOpen = useRolloutPhoneChrome((state) => state.setSearchOpen);
  // The plan tools sit in the page bar (or the full-screen bar) on a computer,
  // so their in-page row is empty there and must not keep its gap.
  const toolsInBar = tasks.length > 0;
  // Phases default OPEN (`?? false` at the two call sites below). They shipped
  // collapsed in 2026-08, which was defensible while this was a scene you chose
  // to open — and is exactly wrong now that it is what a release lands on: the
  // whole reason the buckets were retired as the main view is that they ship
  // collapsed, so a release with 63 activities opened onto five closed drawers
  // and five counts. Replacing that with four closed drawers would answer
  // nothing. The narrow week list has always rendered everything expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // "No date yet" is one collapsed row until tapped (Oct 17, 2026).
  const [undatedOpen, setUndatedOpen] = useState(false);
  // Day offsets applied locally while a reschedule is in flight, so the bar
  // stays where the user dropped it instead of snapping back for a round trip
  // and then jumping forward again when the refetch lands.
  const [optimisticDays, setOptimisticDays] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState<{ taskId: string; days: number } | null>(null);
  const axisRef = useRef<HTMLDivElement | null>(null);

  // The plan opens on its key activities (URG-258); search, filters and
  // "Show all" decide the rest, and cancelled work stays out until asked for
  // (URG-389).
  const plan = usePlanList(tasks, release.id);

  // ---- Select mode (bulk mark as done) -----------------------------------
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isMarkingDone, setIsMarkingDone] = useState(false);
  const completeTasks = useTaskStore((state) => state.completeTasks);
  const exitSelecting = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);
  const [selectionScope, setSelectionScope] = useState(release.id);
  if (selectionScope !== release.id) {
    setSelectionScope(release.id);
    setSelecting(false);
    setSelectedIds(new Set());
  }
  useEffect(() => {
    if (!selecting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitSelecting();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selecting, exitSelecting]);

  // The axis is built from every activity that CAN show, so a bar sits in the
  // same week whichever list is showing. Hidden cancelled work is left out of
  // it (URG-389): a dropped activity months out must not stretch the grid into
  // empty columns nobody can see anything in. When cancelled work is showing
  // (the toggle, or a search or filter, which look at everything) it is on the
  // axis like the rest.
  const cancelledVisible = plan.showCancelled || plan.filtering;
  const axisTasks = useMemo(
    () => (cancelledVisible ? tasks : tasks.filter((task) => task.status !== 'cancelled')),
    [tasks, cancelledVisible]
  );
  const timeline = useMemo(
    () => buildReleaseTimeline({ tasks: axisTasks, releaseDate: release.releaseDate ?? null }),
    [axisTasks, release.releaseDate]
  );
  // Nothing left to do (URG-389): one calm line instead of a grid or an
  // empty state that says "generate a plan" to someone who finished one.
  const closed = useMemo(() => rolloutClosedSummary(tasks), [tasks]);

  // Pre-release, Release and Post-release with dates and progress (URG-292),
  // from every activity rather than the short list: the strip answers "where
  // does this release stand", which is a question about the whole plan.
  const phaseSummaries = useMemo(
    () => summarizeRolloutPhases(tasks, release.releaseDate ?? null),
    [tasks, release.releaseDate]
  );
  const phaseDates = useMemo(
    () => Object.fromEntries(phaseSummaries.map((summary) => [summary.phase, formatPhaseDates(summary)])),
    [phaseSummaries]
  );

  // A smaller plan (URG-318): Start here on its first open task. The rest of
  // the plan's work as one-tap suggestions left the timeline on Oct 17, 2026
  // ("52 suggested" under a 12-activity plan read as "your plan is missing 52
  // things"); they live in Work the plan (TasksPanel's PhaseSuggestions).
  const startHereId = useMemo(() => pickStartHereTaskId(tasks), [tasks]);
  const shown = useMemo(
    () => (timeline ? narrowTimeline(timeline, new Set(plan.visible.map((task) => task.id))) : null),
    [timeline, plan.visible]
  );

  // What select mode can pick: open work showing on the timeline, never a
  // milestone (release day is a date to steer for, not a job to tick).
  const selectableIds = useMemo(() => {
    const placed = shown ?? timeline;
    if (!placed) return [] as string[];
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const ids: string[] = [];
    for (const phase of placed.phases) {
      for (const item of phase.items) {
        const task = byId.get(item.taskId);
        if (!item.isMilestone && task && isSelectableTask(task)) ids.push(item.taskId);
      }
    }
    return ids;
  }, [shown, timeline, tasks]);
  const pickedIds = selectableIds.filter((taskId) => selectedIds.has(taskId));
  const allPicked = selectableIds.length > 0 && pickedIds.length === selectableIds.length;
  const toggleSelected = useCallback((taskId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);
  const selection = useMemo<TimelineSelection | null>(
    () => (selecting ? { selected: selectedIds, selectable: new Set(selectableIds), toggle: toggleSelected } : null),
    [selecting, selectedIds, selectableIds, toggleSelected]
  );
  const markPickedDone = async () => {
    if (isMarkingDone || pickedIds.length === 0) return;
    setIsMarkingDone(true);
    try {
      await completeTasks(pickedIds);
      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
      exitSelecting();
    } finally {
      setIsMarkingDone(false);
    }
  };
  const selectControl = (bar: boolean) =>
    selectableIds.length > 0 || selecting ? (
      <SelectToggleButton
        selecting={selecting}
        bar={bar}
        onToggle={() => (selecting ? exitSelecting() : setSelecting(true))}
      />
    ) : null;

  const reschedule = useCallback(
    async (taskId: string, newStartDay: number) => {
      if (!release.releaseDate) return;
      const iso = isoForDayOffset(release.releaseDate, newStartDay);
      if (!iso) return;

      setOptimisticDays((current) => ({ ...current, [taskId]: newStartDay }));

      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ dueDate: iso }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || 'Could not move that activity.');
        }

        onRescheduled();
      } catch (error) {
        // Snap back. The spec asks for exactly this: the bar returns to where
        // it was and the failure is stated, rather than the row silently
        // sitting somewhere the server never agreed to.
        setOptimisticDays((current) => {
          const next = { ...current };
          delete next[taskId];
          return next;
        });
        onToast(
          error instanceof Error ? error.message : 'Could not move that activity.',
          'error'
        );
      }
    },
    [onRescheduled, onToast, release.releaseDate]
  );

  if (!release.releaseDate) {
    // Pre-production (URG-280): a rollout started before it has a date. Its
    // activities have no days to sit on, so list them in order instead of an
    // empty timeline; the week grid takes over once a date is set.
    const undated = tasks.filter((task) => task.phase === 'pre_production');
    if (undated.length > 0) {
      const visibleIds = new Set(plan.visible.map((task) => task.id));
      return (
        <UndatedPreProduction
          tasks={undated.filter((task) => task.status !== 'cancelled' || visibleIds.has(task.id))}
          allTasks={undated}
          onOpenTask={onOpenTask}
          footer={<PlanShowAllToggle plan={plan} cancelledOnly />}
        />
      );
    }
    if (suppressEmptyState) return null;
    return (
      <TimelineEmptyState
        title="Set a release date first"
        body="The timeline lays everything out against release day, so it needs one to anchor to. Add a date to this rollout and the whole plan appears here."
      />
    );
  }

  if (!timeline || (timeline.placedCount === 0 && timeline.unscheduled.length === 0)) {
    // Every activity is cancelled and hidden: the rollout is not empty, it is
    // finished with. Say so, and keep the dropped work one tap away.
    if (closed.allClear && tasks.length > 0) {
      return (
        <div className="tl-scene-container pb-16 mt-6">
          <TimelineAllClear line={closedSummaryLine(closed)} />
          <div className="mt-4">
            <PlanShowAllToggle plan={plan} />
          </div>
        </div>
      );
    }
    if (suppressEmptyState) return null;
    return (
      <TimelineEmptyState
        title="No activities yet"
        body="Generate a plan for this rollout and every activity in it lands on this timeline, laid out week by week."
      />
    );
  }

  const { weeks, todayDay } = timeline;
  const { phases, unscheduled } = shown ?? timeline;
  const todayPercent = todayDay === null ? null : dayPosition(todayDay, weeks);
  const releasePercent = dayPosition(0, weeks);

  /** Apply any local override so a dragged or in-flight item renders where the
   * user put it. */
  const withLocalMove = (item: TimelineItem): TimelineItem => {
    const dragged = dragging?.taskId === item.taskId ? dragging.days : 0;
    const pending = optimisticDays[item.taskId];
    const start = (pending ?? item.startDay) + dragged;
    if (start === item.startDay) return item;
    return { ...item, startDay: start, endDay: start + (item.endDay - item.startDay) };
  };

  const onDragEnd = (item: TimelineItem, days: number) => {
    setDragging(null);
    if (days === 0) return;
    const base = optimisticDays[item.taskId] ?? item.startDay;
    void reschedule(item.taskId, base + days);
  };

  return (
    <TimelineSelectContext.Provider value={selection}>
    <div className={`tl-scene-container pb-16 ${phone ? 'mt-0' : toolsInBar ? 'mt-3 lg:mt-1' : 'mt-6'}`}>
      {phone ? (
        // Phone (Oct 18, 2026): nothing above the list until the header's
        // search icon is tapped. Then the field, Filter and Done, and the
        // colour key that replaced the Info popover. Done clears the search
        // and filters, so a closed search never leaves the list narrowed.
        phoneSearchOpen ? (
          <div className="mb-4" data-timeline-phone-search>
            <PlanListControls
              plan={plan}
              autoFocusSearch
              onDone={() => {
                plan.setFilters(EMPTY_PLAN_FILTERS);
                setPhoneSearchOpen(false);
              }}
            />
            <TimelineColourKey timeline={timeline} />
          </div>
        ) : null
      ) : (
        <>
          {/* One toolbar row (2026-10-14 declutter): search, the Filter button,
              and at the end the legend behind a small button and Full screen as
              an icon. It was two rows of controls before the first bar. */}
          <div className={toolsInBar ? 'mb-3 lg:mb-0' : 'mb-4'}>
            <PlanListControls
              plan={plan}
              phoneSearchOnly={toolsInBar}
              inPageBar={toolsInBar}
              viewToggle={toolsInBar ? <PlanViewToggle releaseId={release.id} view="timeline" /> : undefined}
              trailing={
                <>
                  {selectControl(toolsInBar)}
                  <TimelineChrome />
                </>
              }
            />
          </div>

          {/* One line on a computer (2026-10-16): the three phases as compact
              chips, and the distribution check beside them when it is up. */}
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="min-w-0 lg:flex-1">
              <RolloutPhaseStrip phases={phaseSummaries} releaseDate={release.releaseDate ?? null} compact />
            </div>
            {statusSlot ? <div className="min-w-0 lg:max-w-[46%] lg:shrink-0 lg:has-[[aria-expanded=true]]:max-w-none lg:has-[[aria-expanded=true]]:basis-full">{statusSlot}</div> : null}
          </div>
        </>
      )}

      {closed.allClear && !plan.filtering ? (
        <div className={phone ? 'mb-2' : 'mb-4'}>
          <TimelineAllClear line={closedSummaryLine(closed)} />
        </div>
      ) : null}

      {/* ---- Wide: the week grid ---------------------------------------- */}
      <div className="tl-grid-view">
        <div className="flex items-stretch">
          {/* Activity labels. A fixed column rather than a grid cell so the
              axis beside it can be measured on its own for the drag maths. */}
          <div className="w-44 shrink-0 pr-3">
            <div className="h-7" aria-hidden="true" />
            {phases.map((phase) => (
              <PhaseLabels
                key={phase.phase}
                phase={phase}
                dates={phaseDates[phase.phase] ?? ''}
                isCollapsed={collapsed[phase.phase] ?? false}
                startHereId={startHereId}
                onToggle={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [phase.phase]: !(current[phase.phase] ?? true),
                  }))
                }
                onOpenTask={onOpenTask}
              />
            ))}
          </div>

          {/* The axis itself. */}
          <div ref={axisRef} className="relative min-w-0 flex-1">
            <div className="flex h-7 items-end">
              {weeks.map((week) => (
                <div
                  key={week.index}
                  title={week.longLabel}
                  className={`min-w-0 flex-1 border-l pb-1 pl-1 text-[10px] font-semibold uppercase tracking-wide ${
                    week.isReleaseWeek
                      ? 'border-brand text-brand'
                      : 'border-stroke-subtle text-content-tertiary'
                  }`}
                >
                  {week.label}
                </div>
              ))}
            </div>

            {/* Week gridlines, behind everything. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 top-7 flex" aria-hidden="true">
              {weeks.map((week) => (
                <div
                  key={week.index}
                  className={`min-w-0 flex-1 border-l ${
                    week.isReleaseWeek ? 'border-brand/40' : 'border-stroke-subtle'
                  }`}
                />
              ))}
            </div>

            {releasePercent !== null ? (
              <div
                className="pointer-events-none absolute bottom-0 top-7 w-px bg-brand/50"
                style={{ left: `${releasePercent}%` }}
                aria-hidden="true"
              />
            ) : null}

            {/* Today. The spec is blunt that without this the view is
                decorative, so it sits above the gridlines and the bars. */}
            {todayPercent !== null ? (
              <div
                className="pointer-events-none absolute bottom-0 top-4 z-10 w-px bg-content-primary"
                style={{ left: `${todayPercent}%` }}
              >
                <span className="absolute -top-0.5 left-0 -translate-x-1/2 rounded-full bg-content-primary px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-content-inverse">
                  Today
                </span>
              </div>
            ) : null}

            {phases.map((phase) => (
              <PhaseRows
                key={phase.phase}
                phase={phase}
                weeks={weeks}
                isCollapsed={collapsed[phase.phase] ?? false}
                axisRef={axisRef}
                draggingTaskId={dragging?.taskId ?? null}
                withLocalMove={withLocalMove}
                onDragMove={(taskId, days) => setDragging({ taskId, days })}
                onDragEnd={onDragEnd}
                onOpenTask={onOpenTask}
                releaseDate={release.releaseDate!}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ---- Narrow: the week-by-week list ------------------------------ */}
      <div className="tl-list-view">
        {phone && (selectableIds.length > 0 || selecting) ? (
          <div className="mb-1 flex justify-end">{selectControl(false)}</div>
        ) : null}
        <TimelineWeekList
          timeline={shown ?? timeline}
          filtering={plan.filtering}
          fold={phone && !plan.filtering}
          onOpenTask={onOpenTask}
          releaseDate={release.releaseDate}
          startHereId={startHereId}
        />
      </div>

      <PlanSuggestionToast />

      <div className="mt-4">
        <PlanShowAllToggle plan={plan} />
      </div>

      {/* One collapsed row (Oct 17, 2026 just-planned cuts): these are real
          jobs, so they stay one tap away, but eight rows plus an explainer
          pushed the page long. Same row on phone and computer. */}
      {unscheduled.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-stroke-subtle bg-bg-surface">
          <button
            type="button"
            onClick={() => setUndatedOpen((open) => !open)}
            aria-expanded={undatedOpen}
            aria-controls="timeline-no-date-yet"
            className="motion-focus flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-bg-hover"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${undatedOpen ? '' : '-rotate-90'}`}
              aria-hidden="true"
            />
            <span className="shrink-0 text-sm font-medium text-content-primary">No date yet</span>
            <span className="shrink-0 text-sm tabular-nums text-content-tertiary">· {unscheduled.length}</span>
            {undatedOpen ? null : (
              <span className="ml-auto min-w-0 truncate pl-3 text-xs text-content-tertiary">
                {unscheduled.map((item) => item.title).join(', ')}
              </span>
            )}
          </button>
          {undatedOpen ? (
            <div id="timeline-no-date-yet" className="border-t border-stroke-subtle px-2 pb-2 pt-2">
              <p className="px-2 pb-1 text-xs text-content-secondary">
                Not on the timeline. Give one a date and it takes its place.
              </p>
              <ul className="space-y-1">
                {unscheduled.map((item) => (
                  <li key={item.taskId}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(item.taskId)}
                      className="motion-focus w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-content-primary hover:bg-bg-hover"
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {selecting ? (
        <BulkSelectBar
          count={pickedIds.length}
          allPicked={allPicked}
          busy={isMarkingDone}
          onToggleAll={() => setSelectedIds(allPicked ? new Set() : new Set(selectableIds))}
          onMarkDone={markPickedDone}
        />
      ) : null}
    </div>
    </TimelineSelectContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Grid halves
// ---------------------------------------------------------------------------

/**
 * The label column's rows for one phase. Deliberately a mirror of PhaseRows
 * below rather than one component rendering both: the labels need to sit
 * outside the measured axis (so a long activity title cannot change the drag
 * arithmetic), and keeping the two in lockstep is a matter of both walking the
 * same `items` array at the same ROW_CLASS height.
 */
function PhaseLabels({
  phase,
  dates,
  isCollapsed,
  startHereId = null,
  onToggle,
  onOpenTask,
}: {
  phase: TimelinePhaseGroup;
  /** The phase's dates, "4 Sep – 12 Oct" (URG-292). */
  dates: string;
  isCollapsed: boolean;
  /** A smaller plan's first open task (URG-318). */
  startHereId?: string | null;
  onToggle: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const selection = useTimelineSelection();
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        title={dates ? `${phase.label}: ${dates}` : phase.label}
        className={`motion-focus flex ${ROW_CLASS} w-full items-center gap-1.5 rounded-md pr-1 text-left hover:bg-bg-hover`}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-content-tertiary transition-transform ${
            isCollapsed ? '-rotate-90' : ''
          }`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-content-primary">
          {phase.label}
        </span>
        {/* Only cancelled rows showing (toggle or search): no "0/0" (URG-389). */}
        {phase.liveCount > 0 ? (
          <span className="shrink-0 text-[10px] tabular-nums text-content-tertiary">
            {phase.doneCount}/{phase.liveCount}
          </span>
        ) : null}
        {phase.attentionCount > 0 ? (
          <span
            className="shrink-0 rounded-full bg-status-error/15 px-1 text-[10px] font-semibold tabular-nums text-status-error"
            title={`${phase.attentionCount} need attention`}
          >
            {phase.attentionCount}
          </span>
        ) : null}
      </button>

      {isCollapsed
        ? null
        : phase.items.map((item) => {
            const pickable = selection?.selectable.has(item.taskId) ?? false;
            const picked = selection?.selected.has(item.taskId) ?? false;
            return (
            <button
              key={item.taskId}
              type="button"
              onClick={() =>
                selection ? (pickable ? selection.toggle(item.taskId) : undefined) : onOpenTask(item.taskId)
              }
              aria-pressed={selection ? picked : undefined}
              aria-disabled={selection && !pickable ? true : undefined}
              title={item.title}
              className={`motion-focus flex ${ROW_CLASS} w-full items-center gap-1.5 rounded-md ${
                selection ? 'pl-1' : 'pl-5'
              } pr-1 text-left ${picked ? 'bg-brand/10' : 'hover:bg-bg-hover'}`}
            >
              {selection ? <SelectBox selected={picked} disabled={!pickable} /> : null}
              {item.isMilestone ? (
                <Flag className="h-3 w-3 shrink-0 text-brand" aria-hidden="true" />
              ) : null}
              <span
                className={`min-w-0 flex-1 truncate text-[11px] text-content-secondary ${
                  item.tone === 'cancelled' ? 'line-through opacity-55' : ''
                }`}
              >
                {item.title}
              </span>
              {item.tone === 'cancelled' ? (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-content-tertiary">
                  Cancelled
                </span>
              ) : item.taskId === startHereId ? (
                <span className="shrink-0 font-mono text-[10px] text-brand">Start here</span>
              ) : TONE_TAG_CLASS[item.tone] ? (
                <span className={`shrink-0 text-[11px] font-semibold ${TONE_TAG_CLASS[item.tone]}`}>
                  {TONE_LABEL[item.tone]}
                </span>
              ) : null}
            </button>
            );
          })}
    </div>
  );
}

function PhaseRows({
  phase,
  weeks,
  isCollapsed,
  axisRef,
  draggingTaskId,
  withLocalMove,
  onDragMove,
  onDragEnd,
  onOpenTask,
  releaseDate,
}: {
  phase: TimelinePhaseGroup;
  weeks: TimelineWeek[];
  isCollapsed: boolean;
  axisRef: React.RefObject<HTMLDivElement | null>;
  draggingTaskId: string | null;
  withLocalMove: (item: TimelineItem) => TimelineItem;
  onDragMove: (taskId: string, days: number) => void;
  onDragEnd: (item: TimelineItem, days: number) => void;
  onOpenTask: (taskId: string) => void;
  releaseDate: string;
}) {
  const summary = itemPosition({ startDay: phase.startDay, endDay: phase.endDay }, weeks);

  return (
    <div>
      {/* Collapsed summary: one bar spanning the phase, so a shut phase still
          says when it runs rather than going blank. */}
      <div className={`relative ${ROW_CLASS}`}>
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-stroke-strong"
          style={{ left: `${summary.leftPercent}%`, width: `${summary.widthPercent}%` }}
          title={`${phase.label}: ${phase.items.length} activities`}
        />
      </div>

      {isCollapsed
        ? null
        : phase.items.map((item) => {
            const moved = withLocalMove(item);
            return (
              <TimelineRow
                key={item.taskId}
                item={moved}
                original={item}
                weeks={weeks}
                axisRef={axisRef}
                isDragging={draggingTaskId === item.taskId}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onOpenTask={onOpenTask}
                releaseDate={releaseDate}
              />
            );
          })}
    </div>
  );
}

/**
 * One activity on the axis: a bar when the work genuinely spans days, a dot
 * when it does not.
 *
 * Pointer events rather than mouse events, so the same handler covers a stylus
 * and a trackpad; `setPointerCapture` keeps the drag alive when the pointer
 * leaves the row, which it will on any drag of more than a week.
 */
function TimelineRow({
  item,
  original,
  weeks,
  axisRef,
  isDragging,
  onDragMove,
  onDragEnd,
  onOpenTask,
  releaseDate,
}: {
  item: TimelineItem;
  original: TimelineItem;
  weeks: TimelineWeek[];
  axisRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  onDragMove: (taskId: string, days: number) => void;
  onDragEnd: (item: TimelineItem, days: number) => void;
  onOpenTask: (taskId: string) => void;
  releaseDate: string;
}) {
  const position = itemPosition(item, weeks);
  const startIso = isoForDayOffset(releaseDate, item.startDay);
  const movedRef = useRef(0);
  const selection = useTimelineSelection();
  const pickable = selection?.selectable.has(item.taskId) ?? false;
  const picked = selection?.selected.has(item.taskId) ?? false;

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    // Select mode: a tap picks, nothing drags.
    if (selection) return;
    // Let a plain click through to the detail panel; only a real drag moves
    // anything. `movedRef` is what distinguishes them at pointer-up.
    const startX = event.clientX;
    movedRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);

    const axisWidth = axisRef.current?.getBoundingClientRect().width ?? 0;

    const handleMove = (moveEvent: PointerEvent) => {
      const days = daysForDragDelta(moveEvent.clientX - startX, axisWidth, weeks.length);
      if (days !== movedRef.current) {
        movedRef.current = days;
        onDragMove(item.taskId, days);
      }
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      const days = movedRef.current;
      movedRef.current = 0;
      if (days === 0) {
        onOpenTask(item.taskId);
        onDragEnd(original, 0);
        return;
      }
      onDragEnd(original, days);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const label = `${item.title}: ${TONE_LABEL[item.tone]}${startIso ? `, ${startIso}` : ''}`;

  return (
    <div className={`relative ${ROW_CLASS} ${picked ? 'bg-brand/10' : ''}`}>
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onClick={selection ? () => (pickable ? selection.toggle(item.taskId) : undefined) : undefined}
        aria-pressed={selection ? picked : undefined}
        title={label}
        aria-label={label}
        className={`motion-focus absolute top-1/2 -translate-y-1/2 touch-none ${
          selection ? (pickable ? 'cursor-pointer' : 'cursor-default') : isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={
          item.isBar
            ? { left: `${position.leftPercent}%`, width: `${position.widthPercent}%` }
            : { left: `${position.leftPercent}%` }
        }
      >
        {item.isBar ? (
          <span
            className={`block h-2.5 w-full rounded-full ${TONE_BAR_CLASS[item.tone]} ${
              isDragging || picked ? 'opacity-80 ring-2 ring-brand' : item.tone === 'cancelled' ? 'opacity-55' : ''
            }`}
          />
        ) : (
          <span
            className={`block h-2.5 w-2.5 border ${
              item.isMilestone ? 'rotate-45' : 'rounded-full'
            } ${dotClass(item)} ${item.tone === 'cancelled' ? 'opacity-55' : ''} ${isDragging || picked ? 'ring-2 ring-brand ring-offset-1 ring-offset-bg-surface' : ''}`}
          />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Narrow view
// ---------------------------------------------------------------------------

/**
 * Vertical, week by week — the documented mobile behaviour, and read-only.
 *
 * Precision dragging on a 380px screen is a real source of accidental date
 * changes, so there is no gesture here at all: tapping a row opens the detail
 * panel, where the date field is an ordinary input.
 *
 * Decluttered Oct 18, 2026 (founder approved the mocks): weeks before this one
 * fold into one CATCH UP group of what is still open (first five, then "N
 * more"), what was finished in them moves to a "Done earlier" row at the end,
 * week headings are Space Mono caps with human dates ("Fri 23 Oct", never an
 * ISO date), Start here sits on the first actionable row as the one accent on
 * screen, and done work is a grey check with its title at ~55%. A search or
 * filter (`fold` off) lists every match in its real week instead.
 */
const CATCH_UP_PREVIEW = 5;

function TimelineWeekList({
  timeline,
  filtering = false,
  fold = false,
  onOpenTask,
  releaseDate,
  startHereId = null,
}: {
  timeline: ReleaseTimeline;
  /** A search or filter is on: an empty list is "no match", said elsewhere. */
  filtering?: boolean;
  /** Fold past weeks into Catch up and Done earlier (the phone, no search). */
  fold?: boolean;
  onOpenTask: (taskId: string) => void;
  releaseDate: string;
  /** A smaller plan's first open task (URG-318). */
  startHereId?: string | null;
}) {
  const [catchUpOpen, setCatchUpOpen] = useState(false);
  const [doneEarlierOpen, setDoneEarlierOpen] = useState(false);
  const folded = useMemo(
    () => (fold ? foldPastWeeks(timeline) : { catchUp: null, weeks: groupItemsByWeek(timeline), doneEarlier: [] }),
    [fold, timeline]
  );
  const { catchUp, weeks, doneEarlier } = folded;

  if (!catchUp && weeks.length === 0 && doneEarlier.length === 0) {
    if (filtering) return null;
    return (
      <p className="mt-4 text-sm text-content-secondary">
        Nothing is scheduled on this rollout yet.
      </p>
    );
  }

  const catchUpItems = catchUp ? hoistStartHere(catchUp.items, startHereId) : [];
  const catchUpShown = catchUpOpen ? catchUpItems : catchUpItems.slice(0, CATCH_UP_PREVIEW);
  const catchUpHidden = catchUpItems.length - catchUpShown.length;

  return (
    <div className="mt-2">
      <ol className="space-y-6">
        {catchUp ? (
          <li data-timeline-catch-up>
            <WeekHeading
              label={`Catch up · ${catchUp.items.length}`}
              tone="catch_up"
              dates={formatCatchUpRange(releaseDate, catchUp.startDay, catchUp.endDay)}
            />
            <ul className="mt-1">
              {catchUpShown.map((item) => (
                <WeekRow key={item.taskId} item={item} startHere={item.taskId === startHereId} onOpenTask={onOpenTask} />
              ))}
            </ul>
            {catchUpHidden > 0 ? (
              <button
                type="button"
                onClick={() => setCatchUpOpen(true)}
                aria-expanded={false}
                className="motion-focus ml-7 mt-1 inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-content-tertiary hover:text-content-primary"
              >
                {catchUpHidden} more
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </li>
        ) : null}

        {weeks.map((group) => {
          const heading = phoneWeekHeading(group.week, releaseDate);
          const items = hoistStartHere(group.items, startHereId);
          return (
            <li key={group.week.index}>
              <WeekHeading label={heading.label} tone={heading.accent ? 'accent' : 'plain'} dates={heading.dates} />
              <ul className="mt-1">
                {items.map((item) => (
                  <WeekRow key={item.taskId} item={item} startHere={item.taskId === startHereId} onOpenTask={onOpenTask} />
                ))}
              </ul>
            </li>
          );
        })}
      </ol>

      {doneEarlier.length > 0 ? (
        <div data-timeline-done-earlier className="mt-6 border-y border-stroke-subtle">
          <button
            type="button"
            onClick={() => setDoneEarlierOpen((open) => !open)}
            aria-expanded={doneEarlierOpen}
            className="motion-focus flex min-h-14 w-full items-center gap-3 text-left"
          >
            <span className="min-w-0 flex-1 text-base text-content-tertiary">Done earlier</span>
            <span className="shrink-0 font-mono text-sm tabular-nums text-content-tertiary">{doneEarlier.length}</span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${doneEarlierOpen ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>
          {doneEarlierOpen ? (
            <ul className="pb-2">
              {doneEarlier.map((item) => (
                <WeekRow key={item.taskId} item={item} startHere={false} onOpenTask={onOpenTask} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A week heading in Space Mono caps, with its human dates at the right. */
function WeekHeading({ label, tone, dates }: { label: string; tone: 'plain' | 'accent' | 'catch_up'; dates: string }) {
  const color =
    tone === 'accent' ? 'text-brand' : tone === 'catch_up' ? 'text-status-warning' : 'text-content-primary';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className={`font-mono text-xs font-bold uppercase tracking-[0.2em] ${color}`}>{label}</h3>
      {dates ? <span className="shrink-0 text-xs tabular-nums text-content-tertiary">{dates}</span> : null}
    </div>
  );
}

/** One activity row in the week list. */
function WeekRow({
  item,
  startHere,
  onOpenTask,
}: {
  item: TimelineItem;
  startHere: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const closed = isClosedTone(item.tone);
  const tag = !startHere && (item.tone === 'overdue' || item.tone === 'blocked') ? TONE_LABEL[item.tone] : null;
  const selection = useTimelineSelection();
  const pickable = selection?.selectable.has(item.taskId) ?? false;
  const picked = selection?.selected.has(item.taskId) ?? false;
  return (
    <li>
      <button
        type="button"
        onClick={() =>
          selection ? (pickable ? selection.toggle(item.taskId) : undefined) : onOpenTask(item.taskId)
        }
        aria-pressed={selection ? picked : undefined}
        aria-disabled={selection && !pickable ? true : undefined}
        className={`motion-focus -mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 text-left ${
          picked ? 'bg-brand/10' : 'hover:bg-bg-hover'
        }`}
      >
        <span className="grid h-4 w-4 shrink-0 place-items-center" aria-hidden="true">
          {selection ? (
            <SelectBox selected={picked} disabled={!pickable} />
          ) : item.tone === 'done' ? (
            <Check className="h-3.5 w-3.5 text-content-tertiary" />
          ) : startHere ? (
            <span className="h-2.5 w-2.5 rounded-full bg-brand" />
          ) : (
            <span
              className={`h-2.5 w-2.5 border ${item.isMilestone ? 'rotate-45' : 'rounded-full'} ${dotClass(item)} ${
                item.tone === 'cancelled' ? 'opacity-55' : ''
              }`}
            />
          )}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            startHere
              ? 'font-semibold text-content-primary'
              : closed
                ? `text-content-primary opacity-55 ${item.tone === 'cancelled' ? 'line-through' : ''}`
                : 'text-content-primary'
          }`}
        >
          {item.title}
        </span>
        {item.tone === 'done' ? <span className="sr-only">{TONE_LABEL[item.tone]}</span> : null}
        {item.tone === 'cancelled' ? (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-content-tertiary">Cancelled</span>
        ) : startHere ? (
          <span className="shrink-0 text-xs text-brand">Start here</span>
        ) : tag ? (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-status-error">{tag}</span>
        ) : item.tone === 'catch_up' ? (
          <span className="sr-only">Catch up</span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * The phone's colour key (Oct 18, 2026), under the search field. It replaces
 * the Info popover, which listed One day / Several days / Milestone / Overdue
 * and never explained amber or done. Lists only the states this rollout uses,
 * in the dots the list draws.
 */
function TimelineColourKey({ timeline }: { timeline: ReleaseTimeline }) {
  const items = timeline.phases.flatMap((phase) => phase.items);
  const has = (test: (item: TimelineItem) => boolean) => items.some(test);
  const entries: Array<{ key: string; label: string; mark: ReactNode }> = [];
  if (has((item) => item.tone === 'catch_up' || item.tone === 'blocked')) {
    entries.push({
      key: 'catch_up',
      label: has((item) => item.tone === 'blocked') ? 'Catch up / blocked' : 'Catch up',
      mark: <span className="h-2.5 w-2.5 rounded-full border border-status-warning bg-status-warning" />,
    });
  }
  if (has((item) => item.tone === 'overdue')) {
    entries.push({ key: 'overdue', label: 'Overdue', mark: <span className="h-2.5 w-2.5 rounded-full border border-status-error bg-status-error" /> });
  }
  if (has((item) => item.tone === 'in_progress')) {
    entries.push({ key: 'in_progress', label: 'In progress', mark: <span className="h-2.5 w-2.5 rounded-full border border-brand bg-brand" /> });
  }
  entries.push({ key: 'todo', label: 'To do', mark: <span className="h-2.5 w-2.5 rounded-full border border-stroke-control bg-bg-surface" /> });
  if (has((item) => item.tone === 'done')) {
    entries.push({ key: 'done', label: 'Done', mark: <Check className="h-3.5 w-3.5 text-content-tertiary" /> });
  }
  if (has((item) => item.tone === 'cancelled')) {
    entries.push({ key: 'cancelled', label: 'Cancelled', mark: <span className="h-2.5 w-2.5 rounded-full border border-stroke-strong bg-bg-surface opacity-55" /> });
  }
  if (has((item) => item.isMilestone)) {
    entries.push({ key: 'milestone', label: 'Milestone', mark: <span className="h-2.5 w-2.5 rotate-45 border border-brand bg-brand" /> });
  }
  return (
    <ul aria-label="Colour key" data-timeline-colour-key className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-b border-stroke-subtle pb-3 text-xs text-content-secondary">
      {entries.map((entry) => (
        <li key={entry.key} className="inline-flex items-center gap-1.5">
          <span className="grid h-3.5 w-3.5 place-items-center" aria-hidden="true">{entry.mark}</span>
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function TimelineChrome() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);
  useKeepInViewport(legendRef, open);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const iconButton =
    'motion-focus motion-press grid h-10 w-10 place-items-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary sm:h-9 sm:w-9';

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Legend"
          title="Legend"
          className={iconButton}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>
        {open ? (
          <div ref={legendRef} className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex w-52 flex-col gap-2.5 rounded-xl border border-stroke-default bg-bg-surface p-3 text-xs text-content-secondary shadow-lg">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full border border-stroke-control bg-bg-surface" />
              One day
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-6 rounded-full bg-stroke-control" />
              Runs several days
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rotate-45 border border-brand bg-brand" />
              Milestone
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full border border-status-error bg-status-error" />
              Overdue
            </span>
            <span className="tl-grid-view border-t border-stroke-subtle pt-2 text-content-tertiary">
              Drag to move · tap to open
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}

function TimelineEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8 rounded-xl border border-stroke-subtle bg-bg-surface px-5 py-8 text-center">
      <CalendarClock className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden="true" />
      <h3 className="mt-3 font-display text-sm font-semibold text-content-primary">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs text-content-secondary">{body}</p>
    </div>
  );
}

function UndatedPreProduction({
  tasks,
  allTasks,
  onOpenTask,
  footer,
}: {
  /** What to list: cancelled work only when it is showing (URG-389). */
  tasks: Task[];
  /** Every pre-production activity, for the count. */
  allTasks: Task[];
  onOpenTask: (taskId: string) => void;
  footer?: ReactNode;
}) {
  // Cancelled work is out of both numbers (URG-389).
  const live = allTasks.filter((task) => task.status !== 'cancelled');
  const done = live.filter((task) => task.status === 'done').length;
  return (
    <section aria-label="Pre-production" className="mt-6 pb-16">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-content-primary">Pre-production</h3>
        <span className="text-xs tabular-nums text-content-tertiary">
          {done}/{live.length} done
        </span>
      </div>
      <p className="mt-1 text-xs text-content-secondary">
        No release date yet. Set one and the whole rollout lays out here week by week.
      </p>
      {tasks.length > 0 ? (
      <ol className="mt-3 divide-y divide-stroke-subtle overflow-hidden rounded-xl border border-stroke-subtle bg-bg-surface">
        {tasks.map((task) => {
          const isDone = task.status === 'done';
          const isCancelled = task.status === 'cancelled';
          return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onOpenTask(task.id)}
              className="motion-focus flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-hover"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${isDone ? 'bg-brand' : 'border border-stroke-strong'} ${isCancelled ? 'opacity-55' : ''}`}
              />
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  isDone ? 'text-content-tertiary line-through' : isCancelled ? 'text-content-primary line-through opacity-55' : 'text-content-primary'
                }`}
              >
                {task.title}
              </span>
              {isDone ? <span className="sr-only">Done</span> : null}
              {isCancelled ? (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-content-tertiary">Cancelled</span>
              ) : null}
            </button>
          </li>
          );
        })}
      </ol>
      ) : null}
      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}

/**
 * Every activity on the rollout is done or cancelled (URG-389). One line, no
 * illustration and no button: there is nothing to do, so nothing to press.
 */
function TimelineAllClear({ line }: { line: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1" data-timeline-all-clear>
      <span className="font-display text-lg text-content-primary">All clear</span>
      {line ? <span className="font-mono text-xs tabular-nums text-content-tertiary">{line}</span> : null}
    </p>
  );
}
