/**
 * The smaller plan (URG-318, 2026-10-16).
 *
 * Outside teams finished about 11% of the tasks the planner wrote: a typical
 * plan held ~64 of them, and the work that got done was always the same core
 * (lock the master, the date, the distributor, the cover art, the upload, the
 * pitches, release day, the week-one wrap-up). So a new plan is now made of
 * 12 to 15 CORE tasks across the three phases, and only those become
 * activities. Everything else the playbook and UrgAns kept stays in the plan
 * record (`release_plan_drafts.doc`) and is offered as a suggestion the manager
 * adds with one tap.
 *
 * Pure: no database, no clock, no React. The planner (createReleasePlan) marks
 * the core before it saves the plan; the suggestions route lists the rest.
 */

import { DATED_ROLLOUT_PHASES, rolloutPhaseForOffset, type RolloutPhase } from './rollout-phases';
import type { DraftTask, ReleasePlanDraftDoc } from './release-planning';

/** The fewest core tasks a plan opens with (when the playbook has that many). */
export const CORE_MIN_TASKS = 12;
/** The most: UrgAns may pick up to this many; the code never fills past {@link CORE_MIN_TASKS}. */
export const CORE_MAX_TASKS = 15;

/** Every phase gets some core work, so the plan reads Pre / Release / Post. */
export const CORE_PHASE_MIN: Record<RolloutPhase, number> = {
  // A plan is dated work; Pre-production (URG-280) is never planner output.
  pre_production: 0,
  pre_release: 6,
  release: 2,
  post_release: 2,
};

/**
 * The playbook's own core, most important first, by template id. Hand-picked
 * from what outside teams actually finished (production, Oct 2026): this is
 * what a plan falls back to when UrgAns is not reachable or picked too few,
 * and what fills a phase UrgAns left short. Pinned against the real templates
 * in plan-core.test.ts, so a renamed template task fails the build.
 */
export const CORE_PLAYBOOK_TASK_IDS: Record<string, string[]> = {
  'single_v0.3': [
    'w8_lock_master',
    'w8_confirm_release_date',
    'w8_choose_distributor',
    'w7_brief_designer',
    'w5_cover_art_final_approved',
    'w6_upload_to_distributor',
    'editorial_pitch',
    'w6_curator_outreach',
    'release_day_announcement',
    'release_day_monitor_distributor',
    'w0_compile_first_week_stats',
    'post_w3_decide_next_release',
    'post_w1_engage_with_fans',
    'w7_write_song_metadata',
    'w2_prepare_release_day_posts',
  ],
  'ep_v0.1': [
    'w13_lock_all_masters',
    'w13_confirm_release_date',
    'w13_choose_distributor',
    'w11_brief_designer_ep_art',
    'w9_ep_art_approved',
    'w12_upload_lead_single',
    'w6_lead_single_drop',
    'w5_upload_ep_to_distributor',
    'editorial_pitch',
    'release_day_announcement',
    'release_day_monitor_distributor',
    'w0_compile_first_week_stats',
    'post_w3_next_cycle',
    'post_w1_fan_engagement',
    'w12_write_ep_metadata',
  ],
  'album_v0.1': [
    'w17_lock_all_masters',
    'w17_confirm_release_date',
    'w17_choose_distributor',
    'w16_brief_designer_album_art',
    'w13_album_art_approved',
    'w15_upload_single_1',
    'w12_single_1_drop',
    'w7_upload_album_to_distributor',
    'editorial_pitch',
    'release_day_announcement',
    'release_day_monitor_distributor',
    'w0_compile_first_week_stats',
    'post_w4_next_cycle',
    'post_w1_fan_engagement',
    'w16_write_album_metadata',
  ],
};

export function draftTaskRolloutPhase(task: Pick<DraftTask, 'offset_days'>): RolloutPhase {
  return rolloutPhaseForOffset(task.offset_days);
}

/**
 * Which of a plan's live tasks are its core. Order of preference: UrgAns's
 * focus tasks, then its `key` list, then the playbook core above, then any
 * other required task by date, then optional ones by date.
 *
 *   1. each phase gets its minimum ({@link CORE_PHASE_MIN}) from that order;
 *   2. the plan fills to {@link CORE_MIN_TASKS} from the same order;
 *   3. tasks UrgAns itself marked keep coming in up to {@link CORE_MAX_TASKS}.
 *
 * A task already done (a "ready today" answer) is never core: it has nothing
 * left to do, so it neither takes a slot nor shows as a suggestion.
 */
export function selectCoreTasks(
  tasks: DraftTask[],
  templateId: string,
  isDone: (task: DraftTask) => boolean = () => false
): Set<string> {
  const live = tasks.filter((task) => !task.removed && !isDone(task));
  const byId = new Map(live.map((task) => [task.id, task]));
  const playbook = CORE_PLAYBOOK_TASK_IDS[templateId] ?? [];

  const ranked: DraftTask[] = [];
  const ranks = new Set<string>();
  const rank = (task: DraftTask | undefined) => {
    if (!task || ranks.has(task.id)) return;
    ranks.add(task.id);
    ranked.push(task);
  };
  for (const task of live) if (task.focus) rank(task);
  for (const task of live) if (task.key) rank(task);
  const aiMarked = new Set(ranks);
  for (const id of playbook) rank(byId.get(id));
  const byDate = live
    .map((task, index) => ({ task, index }))
    .sort((a, b) => a.task.offset_days - b.task.offset_days || a.index - b.index)
    .map((entry) => entry.task);
  for (const task of byDate) if (!task.optional) rank(task);
  for (const task of byDate) rank(task);

  const core = new Set<string>();
  // 1. Phase minimums.
  for (const phase of DATED_ROLLOUT_PHASES) {
    let count = 0;
    for (const task of ranked) {
      if (count >= CORE_PHASE_MIN[phase]) break;
      if (draftTaskRolloutPhase(task) !== phase) continue;
      core.add(task.id);
      count += 1;
    }
  }
  // 2. Fill to the minimum.
  for (const task of ranked) {
    if (core.size >= CORE_MIN_TASKS) break;
    core.add(task.id);
  }
  // 3. UrgAns's own extra picks, up to the cap.
  for (const task of ranked) {
    if (core.size >= CORE_MAX_TASKS) break;
    if (aiMarked.has(task.id)) core.add(task.id);
  }
  return core;
}

/**
 * The plan document with its core decided: every live task carries `key`
 * true (core, becomes an activity) or false (a suggestion), and the document
 * says it was built this way. Older documents have no `core_only`, which is
 * how everything downstream leaves plans built before URG-318 as they are.
 */
export function markCoreTasks(
  doc: ReleasePlanDraftDoc,
  isDone: (task: DraftTask) => boolean = () => false
): ReleasePlanDraftDoc {
  const core = selectCoreTasks(doc.tasks, doc.template_id, isDone);
  return {
    ...doc,
    core_only: true,
    tasks: doc.tasks.map((task) => (task.removed ? task : { ...task, key: core.has(task.id) })),
  };
}

export type PlanSuggestion = {
  /** The draft task id; what the add call sends back. */
  id: string;
  title: string;
  why: string;
  phase: RolloutPhase;
  offsetDays: number;
  assigneeUserId: string | null;
};

/**
 * What a core-only plan offers to add: its live non-core tasks that are not
 * done and not already on the board (`onBoard` holds the draft task ids the
 * rollout's activities came from). Date order. Empty for older plans.
 */
export function listPlanSuggestions(
  doc: ReleasePlanDraftDoc,
  onBoard: ReadonlySet<string>,
  isDone: (task: DraftTask) => boolean = () => false
): PlanSuggestion[] {
  if (!doc.core_only) return [];
  return doc.tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => !task.removed && task.key !== true && !onBoard.has(task.id) && !isDone(task))
    .sort((a, b) => a.task.offset_days - b.task.offset_days || a.index - b.index)
    .map(({ task }) => ({
      id: task.id,
      title: task.title,
      why: task.why,
      phase: draftTaskRolloutPhase(task),
      offsetDays: task.offset_days,
      assigneeUserId: task.assignee_user_id,
    }));
}

/**
 * The one task a smaller plan says "Start here" on: its earliest open
 * activity (soonest due date; a task without one comes last). Null for plans
 * built before URG-318, so an older plan looks exactly as it did.
 */
export function pickStartHereTaskId(
  tasks: ReadonlyArray<{ id: string; status: string; dueDate: string | null; planCore?: boolean }>
): string | null {
  if (!tasks.some((task) => task.planCore)) return null;
  let best: { id: string; due: number } | null = null;
  for (const task of tasks) {
    if (task.status === 'done' || task.status === 'cancelled') continue;
    const due = task.dueDate ? Date.parse(task.dueDate) : Number.POSITIVE_INFINITY;
    const value = Number.isNaN(due) ? Number.POSITIVE_INFINITY : due;
    if (!best || value < best.due) best = { id: task.id, due: value };
  }
  return best?.id ?? null;
}
