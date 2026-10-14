/**
 * Pure layout for the release Timeline view. No React, no I/O, no env — the
 * scene component owns rendering and the drag gesture; this module owns where
 * everything sits on the axis and what it is called.
 *
 * Internally this is the Gantt view. In product it is called Timeline, and the
 * user-facing strings here say Timeline.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS MOSTLY DOTS, NOT BARS
 * ---------------------------------------------------------------------------
 * A Gantt chart needs a start and an end. The `tasks` table stores only a
 * `due_date`, which is what made a timeline look like it needed a schema
 * change. It does not, because the playbooks already carry duration and
 * instantiation already persists it at `metadata.template.duration_days`
 * (surfaced as `Task.durationDays`).
 *
 * What that number turns out to say is the important part. Across all three
 * playbooks every activity is either 1 day or 7 days, and nothing else:
 *
 *   single — 57 x 1-day,  7 x 7-day   (64)
 *   EP     — 76 x 1-day, 14 x 7-day   (90)
 *   album  — 95 x 1-day, 18 x 7-day  (113)
 *
 * So ~89% of a release is single-day work. Rendering that as a bar chart would
 * mean 57 one-cell stubs pretending to have span. They are milestones, and this
 * module classifies them as such: an item is a BAR only when it genuinely runs
 * longer than a day, and a MARKER otherwise. That is not a fallback, it is the
 * shape of the data.
 *
 * ---------------------------------------------------------------------------
 * `dueDate` IS THE START OF THE RUN, NOT THE DEADLINE
 * ---------------------------------------------------------------------------
 * Counter-intuitive given the column name, and getting it backwards mirrors
 * every bar to the wrong side of its week. The playbooks put multi-day work at
 * the offset where it BEGINS — every 7-day activity is phrased that way:
 *
 *   { id: 'w6_curator_outreach', offset_days: -42, duration_days: 7,
 *     title: 'Begin curator/playlist outreach with private link',
 *     description: '...Ongoing across the week.' }
 *
 * Week 6 of the playbook is offset -42, and the work runs forward through that
 * week. So a span is [dueDate, dueDate + durationDays - 1] inclusive. For the
 * single-day majority start and end coincide and the question does not arise.
 *
 * ---------------------------------------------------------------------------
 * DATE FRAME: UTC CALENDAR DAYS
 * ---------------------------------------------------------------------------
 * `releases.release_date` is a date-only string with no timezone, and
 * instantiation computes due dates as `Date.UTC(release) + offset * 86400000`.
 * Reading them back with UTC components is therefore exact: a template task at
 * offset -42 lands on day -42 here, always, in every reader's timezone. Doing
 * the arithmetic in local time would shift roughly half the world by a day.
 * Same reasoning as lib/recap-*.ts, which is UTC on purpose.
 *
 * The one place that is deliberately NOT UTC is TONE, which comes from
 * `getTaskSectionKey` (local midnight, because "is this overdue" is a question
 * about the user's day). Position and tone can therefore disagree for a few
 * hours around midnight. That is the correct trade: a bar must not jump a
 * column because someone flew to Lagos, and "overdue" must mean overdue where
 * the user is standing.
 */

import { derivePlanPhase, PLAN_PHASE_LABELS, PLAN_PHASE_ORDER, type PlanPhase } from './release-planning';
import { getTaskSectionKey } from './tasks';
import type { Task, TaskSectionKey } from '@/types/tasks';

const MS_PER_DAY = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

/** How far past release day the axis always runs, per the spec. Release week
 * plus two, so the post-release phase has somewhere to live even before any
 * post-release work is scheduled. */
export const TIMELINE_TRAILING_DAYS = 14;

/**
 * How far the axis will stretch to bring today into view.
 *
 * The spec asks for two things that can conflict: an axis running "from the
 * earliest activity to release day, plus two weeks after", and a today marker
 * without which "the whole view is decorative". They disagree whenever today
 * falls outside the scheduled span — which is not an edge case but the normal
 * state of a release planned well ahead, where the playbook does not start for
 * another month.
 *
 * So the axis stretches to include today, bounded. Inside the bound a manager
 * sees an empty run of weeks before the work begins, which is exactly the
 * honest answer to "are we on track". Beyond it — a release that ended two
 * years ago — stretching would mean a hundred empty columns to reach a line
 * nobody needs, so today simply sits off the axis and no marker is drawn.
 */
export const TIMELINE_MAX_TODAY_GAP_DAYS = 84;

// ---------------------------------------------------------------------------
// Tone
// ---------------------------------------------------------------------------

/**
 * The visual states a timeline item can carry.
 *
 * Derived from `getTaskSectionKey` rather than recomputed, so the timeline and
 * the activity list can never disagree about what is overdue. That helper
 * already encodes two rules worth inheriting for free: status beats due date
 * (a blocked activity reads as blocked, not as overdue), and a compressed
 * runway is "catch up" rather than slippage — a release created inside its own
 * lead time starts with dozens of past-due activities, and painting those red
 * would make the timeline scream on day one about nothing.
 */
export type TimelineTone =
  | 'done'
  | 'cancelled'
  | 'overdue'
  | 'catch_up'
  | 'blocked'
  | 'in_progress'
  | 'scheduled';

const TONE_BY_SECTION: Partial<Record<TaskSectionKey, TimelineTone>> = {
  done: 'done',
  cancelled: 'cancelled',
  overdue: 'overdue',
  catch_up: 'catch_up',
  blocked: 'blocked',
  locked: 'blocked',
  in_progress: 'in_progress',
  in_review: 'in_progress',
};

export function toneForSection(section: TaskSectionKey): TimelineTone {
  return TONE_BY_SECTION[section] ?? 'scheduled';
}

/** Ordering for the "what needs attention" summary. Lower sorts first. */
const TONE_SEVERITY: Record<TimelineTone, number> = {
  overdue: 0,
  blocked: 1,
  catch_up: 2,
  in_progress: 3,
  scheduled: 4,
  done: 5,
  cancelled: 6,
};

// ---------------------------------------------------------------------------
// Day + week arithmetic
// ---------------------------------------------------------------------------

/** UTC midnight epoch for a `YYYY-MM-DD` prefix, or null if unparseable. */
export function utcMidnight(value: string | null | undefined): number | null {
  if (!value || !ISO_DATE_PATTERN.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const epoch = Date.UTC(year, month - 1, day);
  return Number.isNaN(epoch) ? null : epoch;
}

/**
 * Whole days from release day to `value`. Negative is before release day.
 * Exactly inverts the instantiation math, so a template task round-trips to
 * its own `offset_days`.
 */
export function dayOffsetFromRelease(
  value: string | null | undefined,
  releaseDate: string
): number | null {
  const releaseEpoch = utcMidnight(releaseDate);
  const valueEpoch = utcMidnight(value);
  if (releaseEpoch === null || valueEpoch === null) return null;
  return Math.round((valueEpoch - releaseEpoch) / MS_PER_DAY);
}

/** The ISO date `dayOffset` days from release day. */
export function isoForDayOffset(releaseDate: string, dayOffset: number): string | null {
  const releaseEpoch = utcMidnight(releaseDate);
  if (releaseEpoch === null) return null;
  return new Date(releaseEpoch + dayOffset * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Which week column a day sits in. Week 0 is release week: release day plus
 * the six days after it.
 *
 * `Math.floor` rather than truncation is load-bearing for negatives — day -1
 * belongs to week -1, not week 0.
 */
export function weekIndexForDay(dayOffset: number): number {
  return Math.floor(dayOffset / 7);
}

/**
 * Column heading for a week.
 *
 * Negative weeks read as the playbook's own numbering, which is not a
 * coincidence worth losing: the single playbook's "Week 6" banner sits at
 * offset -42, which is week index -6. So a manager reading "W6" here is
 * looking at the week their playbook calls Week 6.
 */
export function weekLabel(index: number): string {
  if (index === 0) return 'Release';
  if (index < 0) return `W${-index}`;
  return `+${index}`;
}

/** Long form, for tooltips and the mobile list where there is room. */
export function weekLongLabel(index: number): string {
  if (index === 0) return 'Release week';
  if (index === -1) return '1 week out';
  if (index < 0) return `${-index} weeks out`;
  if (index === 1) return '1 week after';
  return `${index} weeks after`;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type TimelineItem = {
  taskId: string;
  title: string;
  /** Day offset where the work starts. */
  startDay: number;
  /** Inclusive last day. Equal to `startDay` for single-day work. */
  endDay: number;
  /** True only when the work genuinely spans more than one day. */
  isBar: boolean;
  /** A dated point from the playbook (release day, listening party). */
  isMilestone: boolean;
  tone: TimelineTone;
  section: TaskSectionKey;
  /** Null when the playbooks did not generate this activity. */
  durationDays: number | null;
};

export type TimelinePhaseGroup = {
  phase: PlanPhase;
  label: string;
  items: TimelineItem[];
  /** Span across every item in the phase, for the collapsed summary bar. */
  startDay: number;
  endDay: number;
  doneCount: number;
  /** Overdue plus blocked — what the collapsed row needs to shout about. */
  attentionCount: number;
};

export type TimelineWeek = {
  index: number;
  label: string;
  longLabel: string;
  /** Day offset of the week's first day. */
  startDay: number;
  isReleaseWeek: boolean;
  /** True for the week containing today, when today is on the axis. */
  isCurrentWeek: boolean;
};

export type ReleaseTimeline = {
  weeks: TimelineWeek[];
  phases: TimelinePhaseGroup[];
  /** Activities with no date. They cannot be placed, and are listed rather
   * than dropped — a manager-added activity often has no date yet. */
  unscheduled: Array<{ taskId: string; title: string; tone: TimelineTone }>;
  /** Today's day offset, or null when today is off the axis entirely. */
  todayDay: number | null;
  /** Total placed on the axis, for the empty-state check. */
  placedCount: number;
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Lay a release's activities out on a week axis.
 *
 * Returns null when there is no usable release date: every position here is
 * relative to release day, so without one there is no axis to draw and the
 * scene shows its own empty state rather than a misleading grid.
 */
export function buildReleaseTimeline(params: {
  tasks: Task[];
  releaseDate: string | null;
  now?: Date;
}): ReleaseTimeline | null {
  const { tasks, releaseDate, now = new Date() } = params;
  if (!releaseDate || utcMidnight(releaseDate) === null) return null;

  const items: TimelineItem[] = [];
  const unscheduled: ReleaseTimeline['unscheduled'] = [];

  for (const task of tasks) {
    const section = getTaskSectionKey(task, now);
    const tone = toneForSection(section);
    const startDay = dayOffsetFromRelease(task.dueDate, releaseDate);

    if (startDay === null) {
      unscheduled.push({ taskId: task.id, title: task.title, tone });
      continue;
    }

    // A duration we do not have is not a duration of zero and not a guess of
    // several days — it is a single point. See Task.durationDays.
    const span = task.durationDays && task.durationDays > 1 ? Math.floor(task.durationDays) : 1;

    items.push({
      taskId: task.id,
      title: task.title,
      startDay,
      endDay: startDay + span - 1,
      isBar: span > 1,
      isMilestone: task.taskType === 'event_milestone',
      tone,
      section,
      durationDays: task.durationDays,
    });
  }

  // ---- Axis -----------------------------------------------------------------
  // Always covers release day and two weeks past it, so the post-release phase
  // has a home even on a release with nothing scheduled after the drop.
  let firstDay = 0;
  let lastDay = TIMELINE_TRAILING_DAYS;
  for (const item of items) {
    if (item.startDay < firstDay) firstDay = item.startDay;
    if (item.endDay > lastDay) lastDay = item.endDay;
  }

  const todayDay = dayOffsetFromRelease(toUtcDateString(now), releaseDate);

  // Stretch to bring today onto the axis, within the bound — see
  // TIMELINE_MAX_TODAY_GAP_DAYS. Clamping rather than skipping means a release
  // whose plan starts next month still shows the marker at the far left, which
  // is the whole "are we on track" read.
  if (todayDay !== null) {
    if (todayDay < firstDay && firstDay - todayDay <= TIMELINE_MAX_TODAY_GAP_DAYS) {
      firstDay = todayDay;
    } else if (todayDay > lastDay && todayDay - lastDay <= TIMELINE_MAX_TODAY_GAP_DAYS) {
      lastDay = todayDay;
    }
  }

  const firstWeek = weekIndexForDay(firstDay);
  const lastWeek = weekIndexForDay(lastDay);
  const currentWeek = todayDay === null ? null : weekIndexForDay(todayDay);

  const weeks: TimelineWeek[] = [];
  for (let index = firstWeek; index <= lastWeek; index += 1) {
    weeks.push({
      index,
      label: weekLabel(index),
      longLabel: weekLongLabel(index),
      startDay: index * 7,
      isReleaseWeek: index === 0,
      isCurrentWeek: index === currentWeek,
    });
  }

  // ---- Phases ---------------------------------------------------------------
  // derivePlanPhase is the single definition of these boundaries (setup /
  // pre-release / release week / post-release) and is already what the plan
  // review scene groups by, so the two surfaces cannot disagree about which
  // phase an activity belongs to. Keyed on the START of the work: a 7-day run
  // belongs to the phase it opens in.
  const byPhase = new Map<PlanPhase, TimelineItem[]>();
  for (const item of items) {
    const phase = derivePlanPhase(item.startDay);
    const bucket = byPhase.get(phase);
    if (bucket) bucket.push(item);
    else byPhase.set(phase, [item]);
  }

  const phases: TimelinePhaseGroup[] = [];
  for (const phase of PLAN_PHASE_ORDER) {
    const phaseItems = byPhase.get(phase);
    if (!phaseItems || phaseItems.length === 0) continue;

    phaseItems.sort(compareItems);

    let phaseStart = phaseItems[0].startDay;
    let phaseEnd = phaseItems[0].endDay;
    let doneCount = 0;
    let attentionCount = 0;
    for (const item of phaseItems) {
      if (item.startDay < phaseStart) phaseStart = item.startDay;
      if (item.endDay > phaseEnd) phaseEnd = item.endDay;
      if (item.tone === 'done') doneCount += 1;
      if (item.tone === 'overdue' || item.tone === 'blocked') attentionCount += 1;
    }

    phases.push({
      phase,
      label: PLAN_PHASE_LABELS[phase],
      items: phaseItems,
      startDay: phaseStart,
      endDay: phaseEnd,
      doneCount,
      attentionCount,
    });
  }

  unscheduled.sort((left, right) => left.title.localeCompare(right.title));

  return { weeks, phases, unscheduled, todayDay, placedCount: items.length };
}

/**
 * The same timeline showing only some activities (URG-258: the plan's key
 * tasks, or a search). The week axis is kept whole, so a bar sits in the same
 * place whether the list is short or full; phases left empty drop out, and
 * each phase's counts and span describe what is still shown.
 */
export function narrowTimeline(timeline: ReleaseTimeline, keep: ReadonlySet<string>): ReleaseTimeline {
  const phases: TimelinePhaseGroup[] = [];
  let placedCount = 0;
  for (const phase of timeline.phases) {
    const items = phase.items.filter((item) => keep.has(item.taskId));
    if (items.length === 0) continue;
    placedCount += items.length;
    phases.push({
      ...phase,
      items,
      startDay: Math.min(...items.map((item) => item.startDay)),
      endDay: Math.max(...items.map((item) => item.endDay)),
      doneCount: items.filter((item) => item.tone === 'done').length,
      attentionCount: items.filter((item) => item.tone === 'overdue' || item.tone === 'blocked').length,
    });
  }
  return {
    ...timeline,
    phases,
    unscheduled: timeline.unscheduled.filter((item) => keep.has(item.taskId)),
    placedCount,
  };
}

/** Chronological, then by severity so the week's problems lead, then stable
 * by title so two activities on one day never swap places between renders. */
function compareItems(left: TimelineItem, right: TimelineItem): number {
  if (left.startDay !== right.startDay) return left.startDay - right.startDay;
  const severity = TONE_SEVERITY[left.tone] - TONE_SEVERITY[right.tone];
  if (severity !== 0) return severity;
  return left.title.localeCompare(right.title);
}

/** `now` as a UTC `YYYY-MM-DD`, so it lands on the same frame as the axis. */
function toUtcDateString(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

/**
 * Where an item sits on the axis, as percentages of the full width.
 *
 * A marker gets a zero-width `left` to be centred on; a bar gets both. The
 * axis is measured in DAYS rather than weeks so a bar can start mid-week —
 * which it does whenever a manager drags one off a playbook boundary.
 */
export function itemPosition(
  item: Pick<TimelineItem, 'startDay' | 'endDay'>,
  weeks: TimelineWeek[]
): { leftPercent: number; widthPercent: number } {
  const axisStartDay = weeks.length > 0 ? weeks[0].startDay : 0;
  const totalDays = Math.max(weeks.length * 7, 1);
  const left = ((item.startDay - axisStartDay) / totalDays) * 100;
  // +1 because endDay is inclusive: a single-day item occupies one day of width.
  const width = ((item.endDay - item.startDay + 1) / totalDays) * 100;
  return { leftPercent: clampPercent(left), widthPercent: clampPercent(width) };
}

/** Fractional position of a single day on the axis, for the today marker. */
export function dayPosition(dayOffset: number, weeks: TimelineWeek[]): number | null {
  if (weeks.length === 0) return null;
  const axisStartDay = weeks[0].startDay;
  const totalDays = weeks.length * 7;
  if (dayOffset < axisStartDay || dayOffset > axisStartDay + totalDays) return null;
  return clampPercent(((dayOffset - axisStartDay) / totalDays) * 100);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Turn a horizontal drag into a whole number of days.
 *
 * Snapping to days rather than pixels is what makes the gesture usable: the
 * axis is ~11 weeks wide in a few hundred pixels, so a free drag would land on
 * arbitrary timestamps and a manager aiming for "next Tuesday" would miss.
 */
export function daysForDragDelta(
  deltaPx: number,
  axisWidthPx: number,
  weekCount: number
): number {
  if (axisWidthPx <= 0 || weekCount <= 0) return 0;
  const pxPerDay = axisWidthPx / (weekCount * 7);
  if (pxPerDay <= 0) return 0;
  return Math.round(deltaPx / pxPerDay);
}

// ---------------------------------------------------------------------------
// Mobile
// ---------------------------------------------------------------------------

export type TimelineWeekGroup = {
  week: TimelineWeek;
  items: TimelineItem[];
};

/**
 * The same items grouped by week rather than by phase, for the mobile list.
 *
 * An item is listed under every week it touches, so a 7-day run straddling a
 * boundary appears in both — on a vertical week-by-week list, work that is
 * genuinely in flight this week has to show up in this week.
 *
 * Empty weeks are dropped: scrolling past eleven "nothing here" headings to
 * reach the work is worse than a shorter list.
 */
export function groupItemsByWeek(timeline: ReleaseTimeline): TimelineWeekGroup[] {
  const groups: TimelineWeekGroup[] = [];
  const allItems = timeline.phases.flatMap((phase) => phase.items);

  for (const week of timeline.weeks) {
    const weekStart = week.startDay;
    const weekEnd = weekStart + 6;
    const items = allItems
      .filter((item) => item.startDay <= weekEnd && item.endDay >= weekStart)
      .sort(compareItems);
    if (items.length > 0) groups.push({ week, items });
  }

  return groups;
}
