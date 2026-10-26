/**
 * Planner v2 without a release date (2026-10-26, Oyin): the plan never waits
 * for a date. Undated tasks carry an offset from a release day still to be
 * picked and read as "Now", "4 weeks before", "Release week" or "After
 * release". The "Set your release date" row (SetReleaseDateCard, v1.173.0) is
 * the anchor: picking a date
 *   1. turns every offset into a real due date, and
 *   2. asks UrgAns (a short gpt-5.4-mini call) for the date-dependent tasks:
 *      editorial pitch deadlines, radio/OAP and DJ timing, release-day and
 *      after-release pushes. Held to the same rules (./validate.ts), deduped
 *      against what is already on the board, with a code-built fallback.
 * Moving the date later only shifts due dates (lib/release-plan-dates-server).
 *
 * Pure: the model call is injected, so vitest holds every rule.
 */

import type { AiMessage } from '../ai/provider';
import { classifyAiFailure } from '../ai/gateway-error';
import { isDuplicateTaskTitle } from '../release-planning';
import { channelLabel, cityLabel, formatNaira, plannedBudget, winLabel, type PlannerV2Answers } from './answers';
import { DISTRIBUTOR_MOVE, NIGERIA_PACK, PICKABLE_TASK_CHANNELS, RELEASE_DAY_MOVE, type Move } from './moves';
import { LIMITS, PLAN_V2_TASK_SCHEMA, coercePlanV2, type PlanV2Task } from './plan';
import { POST_WINDOW_DAYS, isReleaseDayTask, phaseForOffset, todayOffsetFor, weekCap, type PlanV2Context } from './validate';

export const MAX_DATE_ADDS = 8;
/** Editorial teams want the song about 4 weeks out. */
export const EDITORIAL_LEAD_DAYS = 28;

export { relativeWhenLabel, readUndatedTaskMeta, type UndatedTaskMeta } from './when';

const MS_DAY = 86_400_000;
export const dueDateFor = (releaseYmd: string, offset: number): string =>
  new Date(Date.parse(`${releaseYmd}T00:00:00Z`) + offset * MS_DAY).toISOString();

// ── the date-dependent tasks ────────────────────────────────────────────────

export type DateAddsInput = {
  ctx: PlanV2Context & { releaseDate: string };
  /** Titles and offsets of everything already on the board for this rollout. */
  existing: Array<{ title: string; offset_days: number | null }>;
  /** Naira already planned. */
  spent: number;
};

const PAID_WORDS = /\b(paid|ads?\b|advert|boost(ed|ing)?|sponsor(ed|ship)?|promoted posts?)/i;

export const DATE_ADDS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { tasks: { type: 'array', maxItems: MAX_DATE_ADDS, items: PLAN_V2_TASK_SCHEMA } },
  required: ['tasks'],
};

export function parseDateAdds(raw: unknown): PlanV2Task[] | null {
  const value = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>).tasks)) return null;
  const plan = coercePlanV2({ built_for: {}, budget: {}, tasks: (value as Record<string, unknown>).tasks });
  return plan ? plan.tasks : null;
}
function safeJson(raw: string): unknown {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  } catch {
    return null;
  }
}

export function buildDateAddsMessages(input: DateAddsInput): AiMessage[] {
  const { ctx, existing } = input;
  const { answers } = ctx;
  const today = todayOffsetFor(ctx) ?? 0;
  const budgetLeft = Math.max(0, plannedBudget(answers) - input.spent);
  const system = `You are UrgAns, the release planner inside Urganize, for music teams in Nigeria.
The release date was just set. Add ONLY the tasks that depend on it, as JSON matching the schema. Plain words. No hype.
- Editorial pitch deadlines about ${EDITORIAL_LEAD_DAYS} days before release for the picked platforms, radio/OAP and DJ timing, a release-day push on day 0, and one or two after-release pushes.
- offset_days counts from release day (0 = release day). Never before today (day ${today}). At most day ${POST_WINDOW_DAYS}.
- Do not repeat anything already on the board. 2 to ${MAX_DATE_ADDS} tasks.
- Only the platform channels the manager picked (blogs, djs, shows, merch, none always allowed).
- cost_naira total at most ₦${budgetLeft}. ${budgetLeft === 0 ? 'Every cost is 0 and nothing mentions paying, ads or boosting.' : ''}
- now is false. depends_on is empty. Keys d1, d2, ...`;
  const user = [
    `Release: a ${answers.release_type} by ${answers.artist_name}. Release day ${ctx.releaseDate}; today ${ctx.todayYmd} (day ${today}).`,
    `Win: ${answers.wins.map(winLabel).join(', ') || answers.win_text || 'more fans'}.`,
    `Channels: ${answers.channels.map(channelLabel).join(', ')}.`,
    answers.cities.length ? `Cities: ${answers.cities.map(cityLabel).join(', ')}.` : '',
    `Budget left: ${formatNaira(budgetLeft)}.`,
    `Already on the board:\n${existing.map((task) => `- ${task.title}`).join('\n') || '- nothing'}`,
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Hold the adds to the plan rules and drop what breaks them: never before
 * today, inside the window, picked channels only, no repeat of the board or of
 * each other, spend within what is left (₦0 = free), and the team's weekly pace
 * counted together with the dated tasks already there.
 */
export function cleanDateAdds(tasks: readonly PlanV2Task[], input: DateAddsInput): PlanV2Task[] {
  const { ctx, existing } = input;
  const today = todayOffsetFor(ctx) ?? 0;
  const picked = new Set<string>(ctx.answers.channels);
  const budgetLeft = Math.max(0, plannedBudget(ctx.answers) - input.spent);
  const titles = existing.map((task) => task.title);
  const weeks = new Map<number, number>();
  const week = (offset: number) => Math.floor((offset - today) / 7);
  for (const task of existing) {
    if (task.offset_days === null || task.offset_days < today) continue;
    weeks.set(week(task.offset_days), (weeks.get(week(task.offset_days)) ?? 0) + 1);
  }
  const releaseWeek = week(0);
  let spent = 0;
  const kept: PlanV2Task[] = [];
  const hasReleaseDay = existing.some((task) => task.offset_days === 0 && /release day|out now|drop day/i.test(task.title));
  for (const raw of tasks) {
    if (kept.length >= MAX_DATE_ADDS) break;
    const offset = raw.offset_days;
    if (offset < today || offset > POST_WINDOW_DAYS) continue;
    if ((PICKABLE_TASK_CHANNELS as readonly string[]).includes(raw.channel) && !picked.has(raw.channel)) continue;
    if (isDuplicateTaskTitle(raw.title, titles)) continue;
    if (hasReleaseDay && isReleaseDayTask(raw)) continue;
    const cost = budgetLeft === 0 ? 0 : raw.cost_naira;
    if (budgetLeft === 0 && PAID_WORDS.test(`${raw.title} ${raw.why}`)) continue;
    if (spent + cost > budgetLeft) continue;
    const w = week(offset);
    // Release day itself may always land; the rest obey the pace.
    if (!(offset === 0 && isReleaseDayTask(raw)) && (weeks.get(w) ?? 0) >= weekCap(ctx.answers, w === releaseWeek)) continue;
    weeks.set(w, (weeks.get(w) ?? 0) + 1);
    spent += cost;
    titles.push(raw.title);
    kept.push({
      ...raw,
      key: `d${kept.length + 1}`,
      cost_naira: cost,
      phase: phaseForOffset(offset),
      depends_on: [],
      first_up: false,
      now: false,
    });
  }
  return kept;
}

/** The adds code builds when UrgAns cannot: free moves only. */
export function fallbackDateAdds(input: DateAddsInput): PlanV2Task[] {
  const { answers } = input.ctx;
  const today = todayOffsetFor(input.ctx) ?? 0;
  const wantsRadio = answers.channels.includes('radio') || answers.wins.includes('radio_djs');
  const ids = [
    'ng_spotify_editorial',
    'ng_apple_pitch',
    'ng_audiomack_editorial',
    'ng_boomplay_editorial',
    ...(wantsRadio ? ['ng_oap_pitch', 'ng_dj_pack'] : []),
  ];
  const moves: Array<{ move: Move; offset: number }> = [];
  for (const id of ids) {
    const move = NIGERIA_PACK.find((m) => m.id === id);
    if (!move) continue;
    const offset = id.endsWith('editorial') || id === 'ng_apple_pitch' ? -EDITORIAL_LEAD_DAYS : move.offset_days;
    moves.push({ move, offset: Math.max(today, offset) });
  }
  moves.push({ move: RELEASE_DAY_MOVE, offset: Math.max(today, 0) });
  const street = NIGERIA_PACK.find((m) => m.id === 'ng_street_team');
  if (street) moves.push({ move: { ...street, title: 'Get friends to share the link on release day' }, offset: Math.max(today, 0) });
  moves.push({
    move: {
      ...DISTRIBUTOR_MOVE,
      id: 'first_week_check',
      title: 'Check first-week numbers and thank who helped',
      what: 'Look at streams on each platform and thank every playlist, DJ and OAP that played it.',
      channel: 'none',
      role: 'manager',
      offset_days: 7,
    },
    offset: Math.max(today, 7),
  });
  const tasks: PlanV2Task[] = moves.map(({ move, offset }, index) => ({
    key: `d${index + 1}`,
    library_id: move.id,
    title: move.title.slice(0, LIMITS.title),
    why: move.what.slice(0, LIMITS.why),
    done_when: '',
    phase: phaseForOffset(offset),
    offset_days: offset,
    duration_days: 1,
    owner_role: move.role,
    channel: move.channel,
    cost_naira: 0,
    depends_on: [],
    first_up: false,
    now: false,
  }));
  return cleanDateAdds(tasks, input);
}

export type DateAddsResult = { tasks: PlanV2Task[]; source: 'ai' | 'fallback'; walletEmpty: boolean };

/** Ask UrgAns once, keep what passes; nothing passing (or the gateway down) → the code-built adds. */
export async function writeDateAdds(
  input: DateAddsInput,
  options: { configured: boolean; call: (messages: AiMessage[]) => Promise<PlanV2Task[]> }
): Promise<DateAddsResult> {
  if (!options.configured) return { tasks: fallbackDateAdds(input), source: 'fallback', walletEmpty: false };
  try {
    const raw = await options.call(buildDateAddsMessages(input));
    const kept = cleanDateAdds(raw, input);
    if (kept.length > 0) return { tasks: kept, source: 'ai', walletEmpty: false };
    return { tasks: fallbackDateAdds(input), source: 'fallback', walletEmpty: false };
  } catch (error) {
    const walletEmpty = classifyAiFailure(error).kind === 'insufficient_balance';
    return { tasks: fallbackDateAdds(input), source: 'fallback', walletEmpty };
  }
}
