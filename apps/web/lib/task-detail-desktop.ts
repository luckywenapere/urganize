import { daysUntilDue, dueCalendarDay, isClosedStatus } from './tasks';
import { isDependencySatisfied } from './execution-types';

/**
 * The task pop-up on a computer (#1251): the "what to do about this now"
 * banner, "Waiting on this", "Move to this week" and the line that says where
 * the task came from. Pure, so the pop-up and the tests share one answer.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Fixed names: en-GB writes September as "Sept", which the house style does not.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number) => String(value).padStart(2, '0');
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * "Move to this week": Friday of this week on a weekday (Friday itself on a
 * Friday), and the next workday, Monday, at the weekend. Returned as a plain
 * day (YYYY-MM-DD), the same value the pop-up's date field saves.
 */
export function moveToThisWeekDate(now: Date = new Date()): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = day.getDay(); // 0 Sunday ... 6 Saturday
  const add = weekday === 6 ? 2 : weekday === 0 ? 1 : 5 - weekday;
  day.setDate(day.getDate() + add);
  return ymd(day);
}

/** "Wed 16 Sep", with the year only when it is not this year. Plan dates are
 *  stored at UTC midnight and read as that calendar day, never shifted. */
export function formatDayInWords(value: string | null | undefined, now: Date = new Date()): string {
  const day = dueCalendarDay(value);
  if (!day) return '';
  const weekday = WEEKDAYS[day.getDay()];
  const month = MONTHS[day.getMonth()];
  const year = day.getFullYear() === now.getFullYear() ? '' : ` ${day.getFullYear()}`;
  return `${weekday} ${day.getDate()} ${month}${year}`;
}

/** "12 Nov": a moment (an edit), in the viewer's own day. */
function formatShortDay(value: string, now: Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${month}${year}`;
}

export function recordNoun(releaseType: string | null | undefined): string {
  if (releaseType === 'ep') return 'EP';
  if (releaseType === 'single' || releaseType === 'album') return releaseType;
  return 'record';
}

export type BannerCopy = { title: string; body: string };

/**
 * The red banner on a late task: "58 days late" and "It was due Wed 16 Sep.
 * The album is out Wed 6 Jan." Nothing for closed work, an undated task, one
 * due today or later, or a catch-up activity the plan made already in the past
 * (those are never painted red, the same rule as getRelativeDueLabel).
 */
export function buildLateBanner(input: {
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  compressedRunway: boolean;
  releaseDate: string | null;
  releaseType: string | null;
  now?: Date;
}): BannerCopy | null {
  const now = input.now ?? new Date();
  if (isClosedStatus(input.status) || input.completedAt) return null;
  if (input.compressedRunway) return null;
  const days = daysUntilDue(input.dueDate, now);
  if (days === null || days >= 0) return null;
  const late = -days;
  const sentences = [`It was due ${formatDayInWords(input.dueDate, now)}.`];
  const releaseDay = formatDayInWords(input.releaseDate, now);
  if (releaseDay) {
    const untilRelease = daysUntilDue(input.releaseDate, now) ?? 0;
    const noun = recordNoun(input.releaseType);
    sentences.push(untilRelease >= 0 ? `The ${noun} is out ${releaseDay}.` : `The ${noun} came out ${releaseDay}.`);
  }
  return { title: `${late} ${late === 1 ? 'day' : 'days'} late`, body: sentences.join(' ') };
}

/** The tasks that cannot start until this one is done, soonest first and
 *  undated last. From the dependencies the plan already holds. */
export function findDependents<T extends { id: string; dependencies: string[]; dueDate: string | null }>(
  taskId: string,
  tasks: readonly T[]
): T[] {
  const time = (task: T) => dueCalendarDay(task.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  return tasks
    .filter((task) => task.id !== taskId && task.dependencies.includes(taskId))
    .sort((a, b) => time(a) - time(b));
}

/** The first prerequisite, in declared order, that still holds this task up. */
export function firstUnmetDependency<T extends { id: string; status: string }>(
  dependencyIds: readonly string[],
  prerequisites: readonly T[]
): T | null {
  const byId = new Map(prerequisites.map((task) => [task.id, task]));
  for (const id of dependencyIds) {
    const task = byId.get(id);
    if (task && !isDependencySatisfied(task.status)) return task;
  }
  return null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name.trim();

/** "Waiting on Maya" and what she still has to finish. */
export function buildBlockedBanner(
  dependency: { title: string; dueDate: string | null; assigneeName: string | null; assigneeUserId: string | null },
  viewerUserId: string | null,
  now: Date = new Date()
): BannerCopy {
  const who =
    dependency.assigneeUserId && viewerUserId && dependency.assigneeUserId === viewerUserId
      ? 'you'
      : dependency.assigneeName?.trim()
        ? firstName(dependency.assigneeName)
        : 'an earlier activity';
  const sentences = [`"${dependency.title}" is not done yet.`];
  const due = formatDayInWords(dependency.dueDate, now);
  if (due) {
    const days = daysUntilDue(dependency.dueDate, now) ?? 0;
    sentences.push(days < 0 ? `It was due ${due}.` : `It is due ${due}.`);
  }
  return { title: `Waiting on ${who}`, body: sentences.join(' ') };
}

/** "From the album plan. Last changed by Oyin on 12 Nov." Only what is known. */
export function buildProvenanceLine(input: {
  fromPlan: boolean;
  releaseType: string | null;
  lastChange: { actorName: string; createdAt: string } | null;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const parts: string[] = [];
  if (input.fromPlan) {
    parts.push(input.releaseType ? `From the ${recordNoun(input.releaseType)} plan.` : 'From the plan.');
  }
  if (input.lastChange?.actorName.trim()) {
    const day = formatShortDay(input.lastChange.createdAt, now);
    if (day) parts.push(`Last changed by ${firstName(input.lastChange.actorName)} on ${day}.`);
  }
  return parts.join(' ');
}
