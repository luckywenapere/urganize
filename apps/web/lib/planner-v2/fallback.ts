/**
 * The quick plan (planner v2): what the manager gets when UrgAns cannot write
 * one (gateway down, wallet empty, or two invalid answers in a row). Built from
 * the existing playbook's core, by code, dated from the answers, then held to
 * the same validator. Never spends a Naira: the budget split is UrgAns's job.
 */

import { buildDraftFromTemplate } from '../release-planning';
import { markCoreTasks } from '../plan-core';
import { isTaskPreCompletedByReady } from '../release-planning';
import type { Template } from '../release-templates/types';
import { formatNaira, plannedBudget, toLegacyIntake, winLabel } from './answers';
import { buildMoveMenu, channelForTemplateTask, NIGERIA_PACK, type Move } from './moves';
import type { PlanV2, PlanV2Task } from './plan';
import { isDated, isPrepMove, phaseForOffset, planWindow, repairPlanV2, type PlanV2Context } from './validate';

export const QUICK_PLAN_NOTICE = 'Quick plan. UrgAns will tailor it when it’s back.';

export function buildFallbackPlanV2(template: Template, ctx: PlanV2Context): PlanV2 {
  const { answers } = ctx;
  const menu = buildMoveMenu(template, answers.channels);
  const window = planWindow(ctx);
  const tasks: PlanV2Task[] = [];

  if (answers.stage === 'out') {
    // A push plan from today: the free moves that work after release.
    const push = menu.filter((move) => move.push && move.naira[1] === 0);
    push.forEach((move, index) => tasks.push(fromMove(move, `t${index + 1}`, window.min + 1 + index)));
  } else {
    const intake = toLegacyIntake(answers, ctx.releaseDate);
    const doc = markCoreTasks(
      buildDraftFromTemplate({ template, intake, ownerUserId: 'fallback', generatedAt: new Date(0).toISOString() }),
      (task) => isTaskPreCompletedByReady(task, intake.ready_today, template.id)
    );
    const core = doc.tasks.filter((task) => task.key && !task.removed);
    const coreIds = new Set(core.map((task) => task.id));
    const done = (id: string) => {
      const task = doc.tasks.find((t) => t.id === id);
      return task ? isTaskPreCompletedByReady(task, intake.ready_today, template.id) : false;
    };
    // The Nigerian editorial pitches the playbook never had, first.
    // Pitch deadlines need the date: an undated quick plan gets them with it.
    const extras = NIGERIA_PACK.filter(
      (move) =>
        isDated(ctx) &&
        (move.id === 'ng_audiomack_editorial' || move.id === 'ng_boomplay_editorial') &&
        answers.channels.includes(move.channel as 'audiomack' | 'boomplay')
    );
    extras.forEach((move) => tasks.push(fromMove(move, `n${tasks.length + 1}`, move.offset_days)));
    const live = core.filter((task) => !done(task.id));
    const keyOf = new Map(live.map((task, index) => [task.id, `p${index + 1}`]));
    for (const task of live) {
      const source = template.tasks.find((t) => t.id === task.template_task_id);
      tasks.push({
        key: keyOf.get(task.id) as string,
        library_id: task.id,
        title: task.title.slice(0, 80),
        why: task.why.slice(0, 140),
        done_when: '',
        phase: phaseForOffset(task.offset_days),
        offset_days: task.offset_days,
        duration_days: Math.min(14, Math.max(1, task.duration_days)),
        owner_role: task.role ?? 'team',
        channel: source ? channelForTemplateTask(source) : 'none',
        cost_naira: 0,
        depends_on: task.depends_on.filter((dep) => coreIds.has(dep) && keyOf.has(dep)).map((dep) => keyOf.get(dep) as string),
        first_up: false,
        now: isPrepMove({ channel: source ? channelForTemplateTask(source) : 'none', title: task.title, id: task.id }),
      });
    }
  }

  const wins = answers.wins.map(winLabel);
  const plan: PlanV2 = {
    built_for: {
      summary: summaryLine(ctx),
      win: wins[0] ?? (answers.win_text || 'A strong release'),
      target: answers.win_text || null,
      constraints: [],
      start_point: answers.stage,
    },
    budget: { total_naira: 0, lines: [] },
    tasks: uniqueKeys(tasks),
    warnings: [QUICK_PLAN_NOTICE],
    assumptions: [],
  };
  return repairPlanV2(plan, ctx, menu);
}

function fromMove(move: Move, key: string, offset: number): PlanV2Task {
  return {
    key,
    library_id: move.id,
    title: move.title,
    why: move.what.slice(0, 140),
    done_when: '',
    phase: phaseForOffset(offset),
    offset_days: offset,
    duration_days: 1,
    owner_role: move.role,
    channel: move.channel,
    cost_naira: 0,
    depends_on: [],
    first_up: false,
    now: isPrepMove(move),
  };
}

function uniqueKeys(tasks: PlanV2Task[]): PlanV2Task[] {
  const seen = new Set<string>();
  return tasks.map((task, index) => {
    let key = task.key;
    if (seen.has(key)) key = `x${index}`.slice(0, 12);
    seen.add(key);
    return { ...task, key };
  });
}

function summaryLine(ctx: PlanV2Context): string {
  const { answers } = ctx;
  const budget = plannedBudget(answers);
  const who = answers.team === 'solo' ? 'run by you' : 'for your team';
  const money = budget === 0 ? 'with no spend' : `budget ${formatNaira(budget)}`;
  const start = answers.stage === 'out' ? 'A push plan from today' : 'Your rollout';
  return `${start}, ${money}, ${who}.`.slice(0, 140);
}
