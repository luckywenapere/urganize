/**
 * The words UrgAns gets for planner v2: one system message with the rules, one
 * user message with the answers, the window, the pace and the menu of moves.
 * Three modes share it: a first plan, "Try another angle" (the last plan in
 * context, a different approach to the same win) and "Tweak" (the last plan and
 * the manager's words). The one retry after a failed check adds the error list.
 */

import type { AiMessage } from '../ai/provider';
import {
  TEAM_PACE,
  channelLabel,
  cityLabel,
  formatNaira,
  plannedBudget,
  readyTodayFor,
  stageLabel,
  teamLabel,
  winLabel,
} from './answers';
import { moveLine, type Move } from './moves';
import type { PlanV2 } from './plan';
import { planWindow, taskCountRange, todayOffsetFor, type PlanV2Context } from './validate';

export type PlanV2Mode =
  | { kind: 'generate' }
  | { kind: 'reroll'; previous: PlanV2 }
  | { kind: 'tweak'; previous: PlanV2; request: string };

export const MAX_TWEAK_LENGTH = 300;

const SYSTEM = `You are UrgAns, the release planner inside Urganize, for music teams in Nigeria.
Write ONE complete rollout plan as JSON that matches the schema. Plain words a 12-year-old understands. No hype.

Rules (code checks every one; a plan that breaks one is rejected):
- offset_days counts days from release day (0 = release day, negative = before). Never before today's offset. Stay inside the window you are given.
- now: true only for prep that needs no release date (mastering, artwork, distributor upload, press kit, pitch list). Everything else false.
- Unless the song is already out: include a task with channel "distribution" that sends the song to the distributor before release day, and (when there is a release date) a release-day task on day 0.
- When there is no release date yet: plan relative to release day. Lead with prep that can start now. Leave out editorial pitch deadlines, radio/OAP and DJ timing, and release-day or after-release pushes: UrgAns adds those when the date is set.
- If the song is already out: a push plan only, starting today. No pre-release work.
- depends_on lists keys of tasks in this plan that happen on the same day or earlier. No loops.
- cost_naira is a realistic Nigerian price. The sum of cost_naira must not exceed the budget. budget.lines must add up exactly to that sum, and total_naira must equal it. A ₦0 budget means every cost is 0 and no task mentions paying, ads, boosting or sponsoring.
- Use only the platform channels the manager picked. blogs, djs, shows, merch, distribution and none are always allowed.
- Respect the task count and the tasks-per-week limit you are given.
- Mark exactly 3 tasks first_up: the first things to do from today.
- You may use moves from the menu (set library_id to its id), merge them, reword them, or write new tasks that fit (library_id null). Turn the manager's notes into real tasks.
- Keys are short: t1, t2, ...
- built_for.summary: one line naming the win, the time, the money and who runs it (e.g. "Playlist adds for Midnight in 5 weeks, on ₦250k, run by you.").`;

export function buildPlanV2Messages(params: {
  ctx: PlanV2Context;
  title: string;
  menu: readonly Move[];
  mode: PlanV2Mode;
  /** One attempt that failed the checks, and what was wrong with it. */
  repair?: { plan: PlanV2 | null; issues: string };
  /** Changes how the plan is approached on each call, so two runs differ. */
  angleSeed?: number;
}): AiMessage[] {
  const { ctx, title, menu, mode, repair } = params;
  const { answers } = ctx;
  const window = planWindow(ctx);
  const range = taskCountRange(ctx);
  const budget = plannedBudget(answers);
  const today = todayOffsetFor(ctx);

  const facts = [
    `Release: "${title || 'Untitled'}" by ${answers.artist_name}, a ${answers.release_type}.`,
    `Where the music is: ${stageLabel(answers.stage)}.` +
      (answers.stage === 'finished' && answers.ready.length ? ` Ready: ${answers.ready.join(', ')}.` : '') +
      (answers.single_first === true ? ' Drop a single first.' : ''),
    answers.stage === 'out'
      ? `It came out on ${ctx.releaseDate}. Today is day ${today}.`
      : ctx.releaseDate
        ? `Release day is ${ctx.releaseDate}. Today is ${ctx.todayYmd} (day ${today}).`
        : `No release date yet. Today is ${ctx.todayYmd}. Offsets are relative to a release day still to be picked.`,
    `Already done (do not plan these again): ${readyTodayFor(answers).join(', ')}.`,
    `Win: ${answers.wins.map(winLabel).join(', ') || 'not picked'}.` + (answers.win_text ? ` In their words: "${answers.win_text}".` : ''),
    answers.cities.length ? `Cities: ${answers.cities.map(cityLabel).join(', ')}.` : '',
    `Budget: ${budget === 0 ? '₦0 (free moves only)' : `up to ₦${budget} (${formatNaira(budget)})`}.`,
    `Channels picked: ${answers.channels.map(channelLabel).join(', ')}.`,
    `Who does the work: ${teamLabel(answers.team)}. Tasks: ${range.min} to ${range.max}. At most ${TEAM_PACE[answers.team].perWeek} tasks start in any 7-day block (2 extra in release week).`,
    `Window: day ${window.min} to day ${window.max}.`,
    answers.notes ? `Notes from the manager: "${answers.notes}"` : '',
  ].filter(Boolean);

  const parts = [facts.join('\n'), `Menu of moves (id | title | channel | owner | usual day | rough cost):\n${menu.map(moveLine).join('\n')}`];

  if (mode.kind === 'reroll') {
    parts.push(
      `Their last plan is below. Take a clearly different approach to the same win: different lead moves, a different budget split.\nLast plan: ${compactPlan(mode.previous)}`
    );
  }
  if (mode.kind === 'tweak') {
    parts.push(
      `Change this plan as the manager asks, and keep everything else the same.\nAsk: "${mode.request.slice(0, MAX_TWEAK_LENGTH)}"\nPlan: ${compactPlan(mode.previous)}`
    );
  }
  if (typeof params.angleSeed === 'number' && mode.kind !== 'tweak') {
    parts.push(`Angle ${params.angleSeed % 7}: ${ANGLES[params.angleSeed % ANGLES.length]}`);
  }
  if (repair) {
    parts.push(
      `Your last answer broke these rules. Fix only these and return the whole plan again:\n${repair.issues}` +
        (repair.plan ? `\nYour last answer: ${compactPlan(repair.plan)}` : '')
    );
  }

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

const ANGLES = [
  'lead with the platform where these fans already are.',
  'lead with people: DJs, OAPs, curators and creators.',
  'lead with content the artist can make cheaply.',
  'lead with one big moment around release day.',
  'lead with the city and the streets.',
  'lead with steady weekly drops of content.',
  'lead with getting paid back: merch, shows, bookings.',
];

/** The plan as short JSON for the prompt: no whys, to save tokens. */
export function compactPlan(plan: PlanV2): string {
  return JSON.stringify({
    summary: plan.built_for.summary,
    budget: plan.budget,
    tasks: plan.tasks.map((task) => ({
      key: task.key,
      library_id: task.library_id,
      title: task.title,
      day: task.offset_days,
      owner: task.owner_role,
      channel: task.channel,
      cost: task.cost_naira,
      deps: task.depends_on,
      first_up: task.first_up,
      now: task.now,
    })),
  });
}
