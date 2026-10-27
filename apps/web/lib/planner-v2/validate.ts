/**
 * The fence around a plan UrgAns writes (planner v2). Code, every time:
 * the model may write any task, but a plan only reaches the manager when it
 * passes these rules. Non-determinism lives in the model; safety lives here.
 *
 *  - dates are offsets from release day, never before today, inside the window
 *  - release day and "send it to the distributor" are always there (not for a
 *    song that is already out, which gets a push plan from today instead)
 *  - dependencies point at real, earlier tasks, with no cycles
 *  - spend never goes over the budget; ₦0 means no paid task and no paid words
 *  - only the channels the manager picked
 *  - plan size and tasks per week fit the team (≈3 a week for "Just me")
 *
 * {@link validatePlanV2} lists what is wrong (the list is what the one retry
 * sends back to the model). {@link repairPlanV2} fixes what code can fix on its
 * own: it is how a nearly-right plan and the quick fallback plan are made to pass.
 */

import { isDuplicateTaskTitle } from '../release-planning';
import {
  TEAM_PACE,
  daysBetween,
  plannedBudget,
  type Channel,
  type PlannerV2Answers,
} from './answers';
import { DISTRIBUTOR_MOVE, PICKABLE_TASK_CHANNELS, RELEASE_DAY_MOVE, type Move, type TaskChannel } from './moves';
import { LIMITS, type PlanV2, type PlanV2Phase, type PlanV2Task } from './plan';

export const MIN_OFFSET = -120;
/** How far after release day (or after today, for a song already out) a plan runs. */
export const POST_WINDOW_DAYS = 42;

export type PlanV2Context = {
  answers: PlannerV2Answers;
  /** YYYY-MM-DD the offsets count from. For "already out", the day it came
   *  out. Null when the rollout has no date yet (2026-10-26): the plan is
   *  then relative to release day and dated once the date is set. */
  releaseDate: string | null;
  todayYmd: string;
  /** What the team saved about this artist (lib/artist-facts.ts), as one
   *  line for the prompt. Empty or absent when nothing is saved. */
  artistFacts?: string;
};

/** How far before release day an undated plan reaches (8 weeks). */
export const UNDATED_MIN_OFFSET = -56;
/** The fewest tasks an undated plan holds: the date-dependent ones come with the date. */
export const UNDATED_MIN_TASKS = 6;

export const isDated = (ctx: PlanV2Context): ctx is PlanV2Context & { releaseDate: string } => ctx.releaseDate !== null;

export type PlanV2Issue = { code: string; message: string; key?: string };

/** Days from release day to today (negative before release). Null when undated. */
export const todayOffsetFor = (ctx: PlanV2Context): number | null =>
  ctx.releaseDate === null ? null : daysBetween(ctx.releaseDate, ctx.todayYmd);

export function planWindow(ctx: PlanV2Context): { min: number; max: number } {
  const today = todayOffsetFor(ctx);
  if (today === null) return { min: UNDATED_MIN_OFFSET, max: POST_WINDOW_DAYS };
  const min = Math.max(MIN_OFFSET, today);
  const max = ctx.answers.stage === 'out' ? Math.max(today, 0) + POST_WINDOW_DAYS : POST_WINDOW_DAYS;
  return { min, max };
}

export const phaseForOffset = (offset: number): PlanV2Phase =>
  offset < 0 ? 'pre_release' : offset === 0 ? 'release' : 'post_release';

/** Which 7-day block a task starts in, counted from the window's start. */
const weekIndex = (offset: number, windowMin: number) => Math.floor((offset - windowMin) / 7);

/** The most tasks one week may hold; release week gets two extra for the day itself. */
export function weekCap(answers: Pick<PlannerV2Answers, 'team'>, isReleaseWeek: boolean): number {
  return TEAM_PACE[answers.team].perWeek + (isReleaseWeek ? 2 : 0);
}

/** The plan size range for this team, shrunk when the window cannot hold the minimum at the pace. */
export function taskCountRange(ctx: PlanV2Context): { min: number; max: number } {
  const pace = TEAM_PACE[ctx.answers.team];
  const { min, max } = planWindow(ctx);
  const weeks = Math.max(1, Math.ceil((max - min + 1) / 7));
  const capacity = weeks * pace.perWeek + 2;
  const floor = isDated(ctx) ? pace.min : Math.min(pace.min, UNDATED_MIN_TASKS);
  return { min: Math.min(floor, capacity), max: Math.min(pace.max, LIMITS.maxTasks) };
}

const PAID_WORDS = /\b(paid|ads?\b|advert|boost(ed|ing)?|sponsor(ed|ship)?|promoted posts?|influencers? fee|book (\d+ )?(tiktok )?creators)/i;

export const isReleaseDayTask = (task: Pick<PlanV2Task, 'offset_days' | 'library_id' | 'title'>) =>
  task.offset_days === 0 &&
  (task.library_id === RELEASE_DAY_MOVE.id ||
    (task.library_id ?? '').startsWith('release_day') ||
    /release day|out now|it'?s out|drop day/i.test(task.title));

export const isDistributorTask = (task: Pick<PlanV2Task, 'channel' | 'offset_days'>) =>
  task.channel === 'distribution' && task.offset_days <= 0;

const needsLaunchTasks = (ctx: PlanV2Context) => ctx.answers.stage !== 'out';
/** Release day is required only once there is a release day: an undated
 *  plan gets its release-day push when the date is set. */
const needsReleaseDay = (ctx: PlanV2Context) => needsLaunchTasks(ctx) && isDated(ctx);

function pickedSet(channels: readonly Channel[]): Set<TaskChannel> {
  return new Set<TaskChannel>(channels);
}

/** Everything wrong with a plan, as short lines the model can act on. Empty = valid. */
export function validatePlanV2(plan: PlanV2, ctx: PlanV2Context): PlanV2Issue[] {
  const issues: PlanV2Issue[] = [];
  const add = (code: string, message: string, key?: string) => issues.push({ code, message, key });
  const window = planWindow(ctx);
  const budget = plannedBudget(ctx.answers);
  const picked = pickedSet(ctx.answers.channels);
  const range = taskCountRange(ctx);

  if (!plan.built_for.summary) add('summary_missing', 'built_for.summary is empty.');

  if (plan.tasks.length < range.min || plan.tasks.length > range.max) {
    add('task_count', `Plan has ${plan.tasks.length} tasks; it must have ${range.min} to ${range.max}.`);
  }

  const byKey = new Map<string, PlanV2Task>();
  const titles: string[] = [];
  for (const task of plan.tasks) {
    if (byKey.has(task.key)) add('duplicate_key', `Task key ${task.key} is used twice.`, task.key);
    byKey.set(task.key, task);
    if (isDuplicateTaskTitle(task.title, titles)) add('duplicate_title', `"${task.title}" repeats another task.`, task.key);
    titles.push(task.title);

    if (task.offset_days < window.min) {
      add(
        isDated(ctx) ? 'before_today' : 'too_early',
        isDated(ctx)
          ? `${task.key} is on day ${task.offset_days}, before today (day ${window.min}).`
          : `${task.key} is on day ${task.offset_days}; an undated plan starts on day ${window.min}.`,
        task.key
      );
    }
    if (task.offset_days > window.max) {
      add('too_late', `${task.key} is on day ${task.offset_days}; the plan ends on day ${window.max}.`, task.key);
    }
    if (ctx.answers.stage === 'out' && task.phase === 'pre_release') {
      add('prerelease_when_out', `${task.key} is pre-release work, but the song is already out.`, task.key);
    }
    if ((PICKABLE_TASK_CHANNELS as readonly string[]).includes(task.channel) && !picked.has(task.channel)) {
      add('channel_not_picked', `${task.key} uses ${task.channel}, which the manager did not pick.`, task.key);
    }
    if (budget === 0 && task.cost_naira > 0) {
      add('paid_on_zero', `${task.key} costs ₦${task.cost_naira}, but the budget is ₦0.`, task.key);
    }
    if (budget === 0 && PAID_WORDS.test(`${task.title} ${task.why}`)) {
      add('paid_words_on_zero', `${task.key} reads as paid work, but the budget is ₦0.`, task.key);
    }
  }

  // Dependencies: real keys, earlier or same day, no cycles.
  for (const task of plan.tasks) {
    for (const dep of task.depends_on) {
      const target = byKey.get(dep);
      if (!target || dep === task.key) {
        add('bad_dependency', `${task.key} depends on ${dep}, which is not in the plan.`, task.key);
      } else if (target.offset_days > task.offset_days) {
        add('dependency_order', `${task.key} depends on ${dep}, which comes later.`, task.key);
      }
    }
  }
  if (hasCycle(plan.tasks)) add('dependency_cycle', 'Task dependencies form a loop.');

  if (needsLaunchTasks(ctx)) {
    if (needsReleaseDay(ctx) && !plan.tasks.some(isReleaseDayTask)) {
      add('missing_release_day', 'There is no release-day task on day 0.');
    }
    if (!plan.tasks.some(isDistributorTask)) {
      add('missing_distributor', 'There is no task (channel "distribution") sending the song to the distributor before release day.');
    }
  }

  const spent = plan.tasks.reduce((sum, task) => sum + task.cost_naira, 0);
  if (spent > budget) add('over_budget', `Tasks cost ₦${spent}; the budget is ₦${budget}.`);
  if (plan.budget.total_naira > budget) add('budget_total', `budget.total_naira is over the ₦${budget} budget.`);
  const linesSum = plan.budget.lines.reduce((sum, line) => sum + line.naira, 0);
  if (linesSum !== spent || plan.budget.total_naira !== spent) {
    add('budget_mismatch', `budget.lines (₦${linesSum}) and total_naira must both equal the tasks' total cost (₦${spent}).`);
  }

  // Pace: tasks starting in each week.
  const weeks = new Map<number, number>();
  for (const task of plan.tasks) {
    const week = weekIndex(task.offset_days, window.min);
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }
  const releaseWeek = weekIndex(0, window.min);
  for (const [week, count] of weeks) {
    const cap = weekCap(ctx.answers, week === releaseWeek);
    if (count > cap) {
      const from = window.min + week * 7;
      add('pace', `Days ${from} to ${from + 6} hold ${count} tasks; this team can take ${cap}.`);
    }
  }

  return issues;
}

function hasCycle(tasks: readonly PlanV2Task[]): boolean {
  const deps = new Map(tasks.map((task) => [task.key, task.depends_on]));
  const state = new Map<string, 1 | 2>();
  const visit = (key: string): boolean => {
    const s = state.get(key);
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(key, 1);
    for (const dep of deps.get(key) ?? []) if (deps.has(dep) && visit(dep)) return true;
    state.set(key, 2);
    return false;
  };
  return tasks.some((task) => visit(task.key));
}

const isRequired = (task: PlanV2Task, ctx: PlanV2Context) =>
  needsLaunchTasks(ctx) && ((needsReleaseDay(ctx) && isReleaseDayTask(task)) || isDistributorTask(task));

function moveToTask(move: Move, key: string, offset: number, cost: number): PlanV2Task {
  return {
    key,
    library_id: move.id,
    title: move.title.slice(0, LIMITS.title),
    why: move.what.slice(0, LIMITS.why),
    done_when: '',
    phase: phaseForOffset(offset),
    offset_days: offset,
    duration_days: 1,
    owner_role: move.role,
    channel: move.channel,
    cost_naira: cost,
    depends_on: [],
    first_up: false,
    now: isPrepMove(move),
  };
}

/** Prep that needs no date: production, artwork, distributor, press kit, pitch list. */
export function isPrepMove(move: Pick<Move, 'channel' | 'title' | 'id'>): boolean {
  return (
    move.channel === 'distribution' ||
    /\b(master|mix|artwork|cover art|press kit|pitch (list|sheet)|metadata|split|credits|bio|photos?)\b/i.test(move.title)
  );
}

function nextKey(tasks: readonly PlanV2Task[]): string {
  const used = new Set(tasks.map((task) => task.key));
  for (let i = tasks.length + 1; ; i += 1) if (!used.has(`t${i}`)) return `t${i}`;
}

/**
 * Fix what code can fix, deterministically. Never adds spend; may drop tasks,
 * move dates inside the window, insert the launch tasks and fill a short plan
 * from `menu` (free moves only). Validate the result: a plan this cannot save
 * is the fallback's job.
 */
export function repairPlanV2(input: PlanV2, ctx: PlanV2Context, menu: readonly Move[] = []): PlanV2 {
  const window = planWindow(ctx);
  const budget = plannedBudget(ctx.answers);
  const picked = pickedSet(ctx.answers.channels);
  const range = taskCountRange(ctx);
  const clamp = (offset: number) => Math.min(window.max, Math.max(window.min, offset));

  // 1. Clamp dates, drop unpicked channels, duplicate keys and titles.
  const seenKeys = new Set<string>();
  const titles: string[] = [];
  let tasks: PlanV2Task[] = [];
  for (const raw of input.tasks) {
    if (seenKeys.has(raw.key)) continue;
    if ((PICKABLE_TASK_CHANNELS as readonly string[]).includes(raw.channel) && !picked.has(raw.channel)) continue;
    if (isDuplicateTaskTitle(raw.title, titles)) continue;
    if (budget === 0 && PAID_WORDS.test(`${raw.title} ${raw.why}`)) continue;
    const offset = clamp(raw.offset_days);
    seenKeys.add(raw.key);
    titles.push(raw.title);
    tasks.push({
      ...raw,
      offset_days: offset,
      phase: phaseForOffset(offset),
      cost_naira: budget === 0 ? 0 : raw.cost_naira,
    });
  }

  // 2. Launch tasks.
  if (needsLaunchTasks(ctx)) {
    if (needsReleaseDay(ctx) && !tasks.some(isReleaseDayTask)) {
      tasks.push(moveToTask(RELEASE_DAY_MOVE, nextKey(tasks), clamp(0), 0));
    }
    if (!tasks.some(isDistributorTask)) {
      const offset = Math.min(0, clamp(DISTRIBUTOR_MOVE.offset_days));
      tasks.push(moveToTask(DISTRIBUTOR_MOVE, nextKey(tasks), offset, 0));
    }
  }

  // 3. Spend: drop the costliest optional paid task until it fits.
  const spent = () => tasks.reduce((sum, task) => sum + task.cost_naira, 0);
  while (spent() > budget) {
    const paid = tasks
      .filter((task) => task.cost_naira > 0 && !isRequired(task, ctx))
      .sort((a, b) => b.cost_naira - a.cost_naira)[0];
    if (!paid) {
      tasks = tasks.map((task) => ({ ...task, cost_naira: 0 }));
      break;
    }
    tasks = tasks.filter((task) => task !== paid);
  }

  // Only ONE release-day task and ONE distributor task are protected; a
  // playbook can hold several distribution tasks, and the rest obey the pace.
  const protectedKeys = new Set<string>();
  if (needsLaunchTasks(ctx)) {
    const day = needsReleaseDay(ctx) ? tasks.find(isReleaseDayTask) : undefined;
    const dist = tasks.find(isDistributorTask);
    if (day) protectedKeys.add(day.key);
    if (dist) protectedKeys.add(dist.key);
  }
  const isProtected = (task: PlanV2Task) => protectedKeys.has(task.key);

  // 4. Pace: move extra tasks to the next week with room, else drop them.
  const releaseWeek = weekIndex(0, window.min);
  const lastWeek = weekIndex(window.max, window.min);
  const counts = new Map<number, number>();
  const ordered = [...tasks].sort(
    (a, b) => Number(isProtected(b)) - Number(isProtected(a)) || a.offset_days - b.offset_days
  );
  const kept: PlanV2Task[] = [];
  for (const task of ordered) {
    let week = weekIndex(task.offset_days, window.min);
    let offset = task.offset_days;
    while (week <= lastWeek && (counts.get(week) ?? 0) >= weekCap(ctx.answers, week === releaseWeek)) {
      if (isProtected(task)) break;
      week += 1;
      offset = Math.max(offset, window.min + week * 7);
      // Never push pre-release work past release day.
      if (task.offset_days < 0 && offset >= 0) {
        week = lastWeek + 1;
      }
    }
    if (week > lastWeek || offset > window.max) continue;
    counts.set(week, (counts.get(week) ?? 0) + 1);
    kept.push({ ...task, offset_days: offset, phase: phaseForOffset(offset) });
  }
  tasks = kept;

  // 5. Size: trim optional tasks from the end, then fill from free menu moves.
  while (tasks.length > range.max) {
    const drop = [...tasks].reverse().find((task) => !isProtected(task) && !task.first_up) ??
      [...tasks].reverse().find((task) => !isProtected(task));
    if (!drop) break;
    tasks = tasks.filter((task) => task !== drop);
  }
  for (const move of menu) {
    if (tasks.length >= range.min) break;
    if (move.naira[1] > 0 || move.id === RELEASE_DAY_MOVE.id || move.id === DISTRIBUTOR_MOVE.id) continue;
    if ((PICKABLE_TASK_CHANNELS as readonly string[]).includes(move.channel) && !picked.has(move.channel)) continue;
    if (ctx.answers.stage === 'out' && !move.push) continue;
    if (tasks.some((task) => task.library_id === move.id)) continue;
    if (isDuplicateTaskTitle(move.title, tasks.map((task) => task.title))) continue;
    const want = ctx.answers.stage === 'out' ? window.min + 1 + tasks.length : move.offset_days;
    let offset = clamp(want);
    let week = weekIndex(offset, window.min);
    while (week <= lastWeek && (counts.get(week) ?? 0) >= weekCap(ctx.answers, week === releaseWeek)) {
      week += 1;
      offset = Math.max(offset, window.min + week * 7);
    }
    if (week > lastWeek || offset > window.max) continue;
    if (move.offset_days < 0 && offset >= 0 && ctx.answers.stage !== 'out') continue;
    counts.set(week, (counts.get(week) ?? 0) + 1);
    tasks.push(moveToTask(move, nextKey(tasks), offset, 0));
  }

  // 6. Dependencies: keep only real, earlier ones; drop edges that close a loop.
  const byKey = new Map(tasks.map((task) => [task.key, task]));
  tasks = tasks.map((task) => ({
    ...task,
    depends_on: task.depends_on.filter((dep) => {
      const target = byKey.get(dep);
      return Boolean(target) && dep !== task.key && (target as PlanV2Task).offset_days <= task.offset_days;
    }),
  }));
  if (hasCycle(tasks)) {
    tasks = tasks.map((task) => ({
      ...task,
      depends_on: task.depends_on.filter((dep) => (byKey.get(dep) as PlanV2Task).offset_days < task.offset_days),
    }));
  }

  // 7. Order by date, first up, budget lines from what is actually paid.
  tasks.sort((a, b) => a.offset_days - b.offset_days);
  tasks = markFirstUp(tasks);
  const total = tasks.reduce((sum, task) => sum + task.cost_naira, 0);
  const lines = budgetLinesFrom(tasks, input.budget.lines);

  return {
    ...input,
    built_for: {
      ...input.built_for,
      summary: input.built_for.summary || 'A plan built from your answers.',
      start_point: ctx.answers.stage,
    },
    budget: { total_naira: total, lines },
    tasks,
  };
}

/** Exactly three "first up" tasks: the model's picks in date order, then the earliest. */
export function markFirstUp(tasks: PlanV2Task[]): PlanV2Task[] {
  const chosen = new Set(tasks.filter((task) => task.first_up).slice(0, 3).map((task) => task.key));
  for (const task of tasks) {
    if (chosen.size >= 3) break;
    chosen.add(task.key);
  }
  return tasks.map((task) => ({ ...task, first_up: chosen.has(task.key) }));
}

/** Budget lines that add up to the paid tasks, keeping the model's wording where it matches. */
export function budgetLinesFrom(
  tasks: readonly PlanV2Task[],
  modelLines: PlanV2['budget']['lines']
): PlanV2['budget']['lines'] {
  const paid = tasks.filter((task) => task.cost_naira > 0);
  const linesSum = modelLines.reduce((sum, line) => sum + line.naira, 0);
  const total = paid.reduce((sum, task) => sum + task.cost_naira, 0);
  if (modelLines.length > 0 && linesSum === total) return modelLines;
  return paid
    .map((task) => ({ item: task.title.slice(0, LIMITS.budgetItem), naira: task.cost_naira, why: task.why.slice(0, LIMITS.budgetWhy) }))
    .sort((a, b) => b.naira - a.naira)
    .slice(0, LIMITS.budgetLines);
}

/** Short lines for the retry message. */
export function issuesForModel(issues: readonly PlanV2Issue[]): string {
  return issues.slice(0, 20).map((issue) => `- ${issue.message}`).join('\n');
}
