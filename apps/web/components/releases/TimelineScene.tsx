'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, Flag, Info, Maximize2 } from '@/components/icons';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';
import {
  buildReleaseTimeline,
  dayPosition,
  daysForDragDelta,
  groupItemsByWeek,
  isoForDayOffset,
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
import {
  PlanListControls,
  PlanShowAllToggle,
  usePlanList,
} from '@/components/workspace/PlanListControls';

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
  /** Shows a "Full screen" button beside the legend. Left out inside the
   *  full-screen overlay itself, which has its own close control. */
  onFullScreen?: () => void;
};

export function TimelineScene({
  release,
  tasks,
  onOpenTask,
  onToast,
  onRescheduled,
  suppressEmptyState = false,
  onFullScreen,
}: TimelineSceneProps) {
  // Phases default OPEN (`?? false` at the two call sites below). They shipped
  // collapsed in 2026-08, which was defensible while this was a scene you chose
  // to open — and is exactly wrong now that it is what a release lands on: the
  // whole reason the buckets were retired as the main view is that they ship
  // collapsed, so a release with 63 activities opened onto five closed drawers
  // and five counts. Replacing that with four closed drawers would answer
  // nothing. The narrow week list has always rendered everything expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Day offsets applied locally while a reschedule is in flight, so the bar
  // stays where the user dropped it instead of snapping back for a round trip
  // and then jumping forward again when the refetch lands.
  const [optimisticDays, setOptimisticDays] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState<{ taskId: string; days: number } | null>(null);
  const axisRef = useRef<HTMLDivElement | null>(null);

  const timeline = useMemo(
    () => buildReleaseTimeline({ tasks, releaseDate: release.releaseDate ?? null }),
    [tasks, release.releaseDate]
  );

  // The plan opens on its key activities (URG-258); search, filters and
  // "Show all" decide the rest. The axis is built from every activity so a
  // bar sits in the same week whichever list is showing.
  const plan = usePlanList(tasks, release.id);
  const shown = useMemo(
    () => (timeline ? narrowTimeline(timeline, new Set(plan.visible.map((task) => task.id))) : null),
    [timeline, plan.visible]
  );

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
    if (suppressEmptyState) return null;
    return (
      <TimelineEmptyState
        title="Set a release date first"
        body="The timeline lays everything out against release day, so it needs one to anchor to. Add a date to this rollout and the whole plan appears here."
      />
    );
  }

  if (!timeline || (timeline.placedCount === 0 && timeline.unscheduled.length === 0)) {
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
    <div className="tl-scene-container mt-6 pb-16">
      {/* One toolbar row (2026-10-14 declutter): search, the Filter button,
          and at the end the legend behind a small button and Full screen as
          an icon. It was two rows of controls before the first bar. */}
      <div className="mb-4">
        <PlanListControls plan={plan} trailing={<TimelineChrome onFullScreen={onFullScreen} />} />
      </div>

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
                isCollapsed={collapsed[phase.phase] ?? false}
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
        <TimelineWeekList
          timeline={shown ?? timeline}
          filtering={plan.filtering}
          onOpenTask={onOpenTask}
          releaseDate={release.releaseDate}
        />
      </div>

      <div className="mt-4">
        <PlanShowAllToggle plan={plan} />
      </div>

      {unscheduled.length > 0 ? (
        <div className="mt-8 border-t border-stroke-subtle pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
            No date yet · {unscheduled.length}
          </h3>
          <p className="mt-1 text-xs text-content-secondary">
            These are not on the timeline. Give one a date and it takes its place.
          </p>
          <ul className="mt-2 space-y-1">
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
  isCollapsed,
  onToggle,
  onOpenTask,
}: {
  phase: TimelinePhaseGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
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
        <span className="shrink-0 text-[10px] tabular-nums text-content-tertiary">
          {phase.doneCount}/{phase.items.length}
        </span>
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
        : phase.items.map((item) => (
            <button
              key={item.taskId}
              type="button"
              onClick={() => onOpenTask(item.taskId)}
              title={item.title}
              className={`motion-focus flex ${ROW_CLASS} w-full items-center gap-1.5 rounded-md pl-5 pr-1 text-left hover:bg-bg-hover`}
            >
              {item.isMilestone ? (
                <Flag className="h-3 w-3 shrink-0 text-brand" aria-hidden="true" />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[11px] text-content-secondary">
                {item.title}
              </span>
              {TONE_TAG_CLASS[item.tone] ? (
                <span className={`shrink-0 text-[11px] font-semibold ${TONE_TAG_CLASS[item.tone]}`}>
                  {TONE_LABEL[item.tone]}
                </span>
              ) : null}
            </button>
          ))}
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

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
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
    <div className={`relative ${ROW_CLASS}`}>
      <button
        type="button"
        onPointerDown={handlePointerDown}
        title={label}
        aria-label={label}
        className={`motion-focus absolute top-1/2 -translate-y-1/2 touch-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
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
              isDragging ? 'opacity-80 ring-2 ring-brand' : ''
            }`}
          />
        ) : (
          <span
            className={`block h-2.5 w-2.5 border ${
              item.isMilestone ? 'rotate-45' : 'rounded-full'
            } ${dotClass(item)} ${isDragging ? 'ring-2 ring-brand' : ''}`}
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
 */
function TimelineWeekList({
  timeline,
  filtering = false,
  onOpenTask,
  releaseDate,
}: {
  timeline: ReleaseTimeline;
  /** A search or filter is on: an empty list is "no match", said elsewhere. */
  filtering?: boolean;
  onOpenTask: (taskId: string) => void;
  releaseDate: string;
}) {
  const groups = useMemo(() => groupItemsByWeek(timeline), [timeline]);

  if (groups.length === 0) {
    if (filtering) return null;
    return (
      <p className="mt-4 text-sm text-content-secondary">
        Nothing is scheduled on this rollout yet.
      </p>
    );
  }

  return (
    <ol className="mt-4 space-y-5">
      {groups.map((group) => (
        <li key={group.week.index}>
          <div className="flex items-baseline justify-between gap-2">
            <h3
              className={`text-xs font-semibold uppercase tracking-wide ${
                group.week.isReleaseWeek ? 'text-brand' : 'text-content-primary'
              }`}
            >
              {group.week.longLabel}
            </h3>
            {group.week.isCurrentWeek ? (
              <span className="rounded-full bg-content-primary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-content-inverse">
                This week
              </span>
            ) : (
              <span className="text-[10px] tabular-nums text-content-tertiary">
                {isoForDayOffset(releaseDate, group.week.startDay)}
              </span>
            )}
          </div>

          <ul className="mt-2 space-y-1">
            {group.items.map((item) => (
              <li key={item.taskId}>
                <button
                  type="button"
                  onClick={() => onOpenTask(item.taskId)}
                  className="motion-focus flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-bg-hover"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 border ${
                      item.isMilestone ? 'rotate-45' : 'rounded-full'
                    } ${dotClass(item)}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-content-primary">
                    {item.title}
                  </span>
                  {item.tone === 'overdue' || item.tone === 'blocked' ? (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-status-error">
                      {TONE_LABEL[item.tone]}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function TimelineChrome({ onFullScreen }: { onFullScreen?: () => void }) {
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
      {/* Only where the week grid shows (`tl-grid-view`): the narrow list is
          already the whole width of a phone, so there is nothing to enlarge. */}
      {onFullScreen ? (
        <span className="tl-grid-view">
          <button type="button" onClick={onFullScreen} aria-label="Full screen" title="Full screen" className={iconButton}>
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      ) : null}
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
