// New ideas that update a plan that already exists (2026-10-26). Pure and
// client-safe: the prompt, the model's answer, the rules that decide what may
// be suggested, and the small types the card and the routes share.
//
// The owner adds an idea on a planned rollout; UrgAns suggests what to ADD to
// the plan and which open tasks to MOVE. Nothing is saved until the owner taps
// Apply, nothing is ever deleted, and a finished task is never touched. The
// model only sees short keys (t1, t2 ...) for the existing tasks, so it can
// never name a task that is not on the board.

import type { AiMessage } from './ai/provider';
import { isDuplicateTaskTitle } from './release-planning';
import { daysBetween } from './planner-v2/answers';
import { LIMITS } from './planner-v2/plan';
import { MIN_OFFSET, POST_WINDOW_DAYS, UNDATED_MIN_OFFSET } from './planner-v2/validate';
import { relativeWhenLabel } from './planner-v2/when';
import { isTaskClosed } from '@/types/tasks';

export const MAX_IDEA_ADDS = 5;
export const MAX_IDEA_MOVES = 3;
/** Most existing tasks the model is shown. */
const MAX_PROMPT_TASKS = 80;

export type ChangeTask = {
  id: string;
  title: string;
  status: string;
  /** Days from release day. Null when the task has no timing at all. */
  offsetDays: number | null;
};

export type ChangeContext = {
  /** YYYY-MM-DD, or null while the rollout has no date. */
  releaseDate: string | null;
  todayYmd: string;
};

export type IdeaAdd = { title: string; why: string; offsetDays: number; now: boolean };
export type IdeaMove = { taskId: string; offsetDays: number };
export type IdeaChanges = { adds: IdeaAdd[]; moves: IdeaMove[] };

/** What the card shows for one suggested change (the server writes the `when` words). */
export type IdeaChangeView = {
  adds: Array<IdeaAdd & { when: string }>;
  moves: Array<IdeaMove & { title: string; fromWhen: string; when: string }>;
};

export const isOpenStatus = (status: string): boolean => !isTaskClosed(status);

/** The offsets a new or moved task may land on. */
export function changeWindow(ctx: ChangeContext): { min: number; max: number } {
  if (ctx.releaseDate === null) return { min: UNDATED_MIN_OFFSET, max: POST_WINDOW_DAYS };
  const today = daysBetween(ctx.releaseDate, ctx.todayYmd);
  return { min: Math.max(MIN_OFFSET, today), max: Math.max(POST_WINDOW_DAYS, today + POST_WINDOW_DAYS) };
}

const MS_DAY = 86_400_000;

/** "Nov 4" for a dated rollout, "4 weeks before" for one with no date yet. */
export function whenWords(ctx: ChangeContext, offsetDays: number | null, now = false): string {
  if (offsetDays === null) return 'No date';
  if (ctx.releaseDate === null) return relativeWhenLabel(offsetDays, now);
  const day = new Date(Date.parse(`${ctx.releaseDate}T00:00:00Z`) + offsetDays * MS_DAY);
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(day);
}

// ── the model's call ─────────────────────────────────────────────────────────

export const IDEA_CHANGES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    adds: {
      type: 'array',
      maxItems: MAX_IDEA_ADDS,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', maxLength: LIMITS.title },
          why: { type: 'string', maxLength: LIMITS.why },
          offset_days: { type: 'integer' },
          now: { type: 'boolean' },
        },
        required: ['title', 'why', 'offset_days', 'now'],
      },
    },
    moves: {
      type: 'array',
      maxItems: MAX_IDEA_MOVES,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { task: { type: 'string' }, offset_days: { type: 'integer' } },
        required: ['task', 'offset_days'],
      },
    },
  },
  required: ['adds', 'moves'],
};

export type IdeaChangesPromptInput = {
  title: string;
  artistName: string;
  releaseType: string;
  idea: string;
  tasks: ReadonlyArray<ChangeTask>;
  ctx: ChangeContext;
};

/** The keys the model sees, mapped back to task ids. Same order the prompt lists them in. */
export function promptTasks(tasks: ReadonlyArray<ChangeTask>): Array<{ key: string; task: ChangeTask }> {
  return tasks.slice(0, MAX_PROMPT_TASKS).map((task, index) => ({ key: `t${index + 1}`, task }));
}

export function buildIdeaChangesMessages(input: IdeaChangesPromptInput): AiMessage[] {
  const { ctx } = input;
  const window = changeWindow(ctx);
  const today = ctx.releaseDate === null ? null : daysBetween(ctx.releaseDate, ctx.todayYmd);
  const system = [
    'You are the release planner inside Urganize, for music teams in Nigeria.',
    'A plan already exists. The team just added a new idea. Suggest how the plan should change, as JSON matching the schema. Plain words. No hype, no em dashes.',
    `- "adds": 0 to ${MAX_IDEA_ADDS} NEW tasks that carry out the idea. Do not repeat a task already on the board. Each title is a short action. "why" says how it serves the idea.`,
    `- "moves": 0 to ${MAX_IDEA_MOVES} existing open tasks whose timing should change because of the idea. "task" is the key (t1, t2 ...). Only move a task if the idea clearly needs it.`,
    '- Never remove or rewrite a task. Never touch a finished task.',
    `- offset_days counts from release day (0 = release day, negative = before). Allowed range ${window.min} to ${window.max}.${
      today === null ? ' The release has no date yet, so these are relative.' : ` Today is day ${today}; nothing may land before today.`
    }`,
    '- now is true only for work that can start right away.',
    '- If the idea needs no change to the plan, return empty lists.',
  ].join('\n');
  const listed = promptTasks(input.tasks)
    .map(({ key, task }) => `- ${key}: ${task.title} [${task.status}] ${whenWords(ctx, task.offsetDays)}`)
    .join('\n');
  const user = [
    `Rollout: ${input.title}`,
    input.artistName ? `Artist: ${input.artistName}` : '',
    `Type: ${input.releaseType}`,
    ctx.releaseDate ? `Release day ${ctx.releaseDate}; today ${ctx.todayYmd}.` : 'No release date yet.',
    '',
    `The new idea:\n${input.idea}`,
    '',
    `The plan today:\n${listed || '- nothing'}`,
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

type RawChanges = {
  adds: Array<{ title: string; why: string; offsetDays: number; now: boolean }>;
  moves: Array<{ key: string; offsetDays: number }>;
};

function safeJson(raw: string): unknown {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  } catch {
    return null;
  }
}

const clean = (value: unknown, max: number): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/—/g, ',')
    .trim()
    .slice(0, max);

/** Reads the model's answer (shape only; the rules are in cleanIdeaChanges). Null when unusable. */
export function parseIdeaChanges(raw: unknown): RawChanges | null {
  const value = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!value || typeof value !== 'object') return null;
  const record = value as { adds?: unknown; moves?: unknown };
  if (!Array.isArray(record.adds) && !Array.isArray(record.moves)) return null;
  const adds: RawChanges['adds'] = [];
  for (const item of Array.isArray(record.adds) ? record.adds : []) {
    if (!item || typeof item !== 'object') continue;
    const add = item as Record<string, unknown>;
    const title = clean(add.title, LIMITS.title);
    const offset = Number(add.offset_days);
    if (!title || !Number.isFinite(offset)) continue;
    adds.push({ title, why: clean(add.why, LIMITS.why), offsetDays: Math.round(offset), now: add.now === true });
  }
  const moves: RawChanges['moves'] = [];
  for (const item of Array.isArray(record.moves) ? record.moves : []) {
    if (!item || typeof item !== 'object') continue;
    const move = item as Record<string, unknown>;
    const key = clean(move.task, 12);
    const offset = Number(move.offset_days);
    if (!key || !Number.isFinite(offset)) continue;
    moves.push({ key, offsetDays: Math.round(offset) });
  }
  return { adds, moves };
}

/** Turns the model's keys into task ids; a key that is not on the list is dropped. */
export function resolveMoveKeys(raw: RawChanges, tasks: ReadonlyArray<ChangeTask>): {
  adds: IdeaAdd[];
  moves: IdeaMove[];
} {
  const byKey = new Map(promptTasks(tasks).map(({ key, task }) => [key, task.id]));
  const moves: IdeaMove[] = [];
  for (const move of raw.moves) {
    const taskId = byKey.get(move.key);
    if (taskId) moves.push({ taskId, offsetDays: move.offsetDays });
  }
  return { adds: raw.adds, moves };
}

// ── the rules ────────────────────────────────────────────────────────────────

/**
 * Holds a set of changes to the rules, for the model's suggestion AND for what
 * the browser sends back to Apply (so a hand-made request cannot get past them):
 * timing inside the window (clamped, never before today), no repeat of a task
 * on the board or of each other, only open tasks move and only to a different
 * time, at most MAX_IDEA_ADDS and MAX_IDEA_MOVES.
 */
export function cleanIdeaChanges(
  changes: { adds: ReadonlyArray<IdeaAdd>; moves: ReadonlyArray<IdeaMove> },
  ctx: ChangeContext,
  tasks: ReadonlyArray<ChangeTask>
): IdeaChanges {
  const window = changeWindow(ctx);
  const clamp = (offset: number) => Math.min(window.max, Math.max(window.min, Math.round(offset)));
  const titles = tasks.map((task) => task.title);
  const adds: IdeaAdd[] = [];
  for (const add of changes.adds) {
    if (adds.length >= MAX_IDEA_ADDS) break;
    const title = clean(add.title, LIMITS.title);
    if (!title || isDuplicateTaskTitle(title, titles)) continue;
    titles.push(title);
    adds.push({ title, why: clean(add.why, LIMITS.why), offsetDays: clamp(add.offsetDays), now: add.now === true });
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const moved = new Set<string>();
  const moves: IdeaMove[] = [];
  for (const move of changes.moves) {
    if (moves.length >= MAX_IDEA_MOVES) break;
    const task = byId.get(move.taskId);
    if (!task || moved.has(task.id) || !isOpenStatus(task.status)) continue;
    const offsetDays = clamp(move.offsetDays);
    if (task.offsetDays === offsetDays) continue;
    moved.add(task.id);
    moves.push({ taskId: task.id, offsetDays });
  }
  return { adds, moves };
}

/** The suggestion the model gave, ready for the owner to review. Null when the answer is unusable. */
export function readIdeaChanges(raw: unknown, ctx: ChangeContext, tasks: ReadonlyArray<ChangeTask>): IdeaChanges | null {
  const parsed = parseIdeaChanges(raw);
  if (!parsed) return null;
  return cleanIdeaChanges(resolveMoveKeys(parsed, tasks), ctx, tasks);
}

/** What the card needs to draw a suggestion: the words for each timing, and the title a move acts on. */
export function viewIdeaChanges(
  changes: IdeaChanges,
  ctx: ChangeContext,
  tasks: ReadonlyArray<ChangeTask>
): IdeaChangeView {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return {
    adds: changes.adds.map((add) => ({ ...add, when: whenWords(ctx, add.offsetDays, add.now) })),
    moves: changes.moves.flatMap((move) => {
      const task = byId.get(move.taskId);
      if (!task) return [];
      return [
        {
          ...move,
          title: task.title,
          fromWhen: whenWords(ctx, task.offsetDays),
          when: whenWords(ctx, move.offsetDays),
        },
      ];
    }),
  };
}

export const isEmptyChanges = (changes: { adds: ReadonlyArray<unknown>; moves: ReadonlyArray<unknown> }): boolean =>
  changes.adds.length === 0 && changes.moves.length === 0;

export const MAX_APPLY_BODY_ITEMS = MAX_IDEA_ADDS + MAX_IDEA_MOVES;

/** Reads what the browser sent to Apply into the typed shape; garbage becomes empty lists. */
export function readApplyBody(body: unknown): { adds: IdeaAdd[]; moves: IdeaMove[] } {
  const record = (body && typeof body === 'object' ? body : {}) as { adds?: unknown; moves?: unknown };
  const adds: IdeaAdd[] = [];
  for (const item of (Array.isArray(record.adds) ? record.adds : []).slice(0, MAX_APPLY_BODY_ITEMS)) {
    if (!item || typeof item !== 'object') continue;
    const add = item as Record<string, unknown>;
    const offset = Number(add.offsetDays);
    if (!Number.isFinite(offset)) continue;
    adds.push({ title: String(add.title ?? ''), why: String(add.why ?? ''), offsetDays: Math.round(offset), now: add.now === true });
  }
  const moves: IdeaMove[] = [];
  for (const item of (Array.isArray(record.moves) ? record.moves : []).slice(0, MAX_APPLY_BODY_ITEMS)) {
    if (!item || typeof item !== 'object') continue;
    const move = item as Record<string, unknown>;
    const offset = Number(move.offsetDays);
    if (typeof move.taskId !== 'string' || !Number.isFinite(offset)) continue;
    moves.push({ taskId: move.taskId, offsetDays: Math.round(offset) });
  }
  return { adds, moves };
}

export const IDEA_CHANGES_COPY = {
  heading: 'Suggested changes to the plan',
  unsaved: 'Not saved yet',
  apply: 'Apply changes',
  notNow: 'Not now',
  none: 'Your plan already covers this idea. No changes suggested.',
  thinking: 'Reading your plan',
  addIdea: 'Add idea',
  applied: (added: number, moved: number) => {
    const parts: string[] = [];
    if (added) parts.push(`${added} added`);
    if (moved) parts.push(`${moved} moved`);
    return `Plan updated: ${parts.join(', ') || 'no changes'}.`;
  },
} as const;
