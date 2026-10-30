// The team-facing rollout brief (2026-10-26). Pure and client-safe.
//
// The Ideas card used to show the owner's note word for word, which reads like a
// note to self. The brief is what a whole team can read: a reworded goal and the
// main moves (the AI writes these, from the idea and the plan), plus Next up and
// Missing, which are worked out from the live plan in code, so they are never
// invented and are always current.
//
// Only the goal and the moves are saved (release_briefs). They are rewritten when
// the notes or the plan's tasks change (the fingerprint), not when a task is done.

import type { AiMessage } from './ai/provider';
import { isTaskClosed } from '@/types/tasks';

export type RolloutBrief = {
  goal: string;
  moves: string[];
};

export const MAX_BRIEF_GOAL_LENGTH = 180;
export const MAX_BRIEF_MOVE_LENGTH = 90;
export const MAX_BRIEF_MOVES = 3;
export const NEXT_UP_COUNT = 3;
/** Most task titles the model is shown. The plan has up to ~110. */
const MAX_PROMPT_TASKS = 60;

export type BriefTask = {
  title: string;
  status: string;
  dueDate: string | null;
  position: number;
  assignedTo: string | null;
  taskType?: 'task' | 'event_milestone';
};

export type NextUpItem = { title: string; owner: string | null };


/** The next open tasks: earliest due first, undated ones in plan order after them. */
export function nextUp(tasks: ReadonlyArray<BriefTask>, count = NEXT_UP_COUNT): NextUpItem[] {
  const time = (task: BriefTask): number => {
    const parsed = task.dueDate ? new Date(task.dueDate).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
  };
  return tasks
    .filter((task) => !isTaskClosed(task.status) && task.taskType !== 'event_milestone')
    .slice()
    .sort((a, b) => time(a) - time(b) || a.position - b.position)
    .slice(0, count)
    .map((task) => ({ title: task.title.trim() || 'Untitled task', owner: task.assignedTo?.trim() || null }));
}

/** What is stopping the plan from moving, worked out from facts only. */
export function missingItems(input: { hasReleaseDate: boolean; next: ReadonlyArray<NextUpItem> }): string[] {
  const out: string[] = [];
  if (!input.hasReleaseDate) out.push('A release date (it sets the timeline)');
  const unassigned = input.next.filter((item) => !item.owner);
  if (unassigned.length === 1) out.push(`An owner for "${unassigned[0].title}"`);
  else if (unassigned.length > 1) out.push(`Owners for ${unassigned.length} of the next tasks`);
  return out;
}

/** A short stable hash (djb2) of what the brief was written from. */
export function briefFingerprint(input: { notes: ReadonlyArray<string>; taskTitles: ReadonlyArray<string> }): string {
  const text = `${input.notes.map((note) => note.trim()).join('\n')}\u0001${input.taskTitles
    .map((title) => title.trim())
    .sort()
    .join('\n')}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${(hash >>> 0).toString(36)}-${text.length.toString(36)}`;
}

export function buildBriefMessages(input: {
  title: string;
  artistName: string;
  releaseType: string;
  notes: ReadonlyArray<{ author: string; content: string }>;
  taskTitles: ReadonlyArray<string>;
}): AiMessage[] {
  const tasks = input.taskTitles.slice(0, MAX_PROMPT_TASKS).map((title) => `- ${title}`);
  const system = [
    'You write the short team brief at the top of a music rollout, for the whole team to read.',
    'The owner wrote their idea in their own words. Reword it so a teammate who has never heard it understands the goal and the approach.',
    'Use only what the idea and the plan say. Do not invent dates, budgets, results or names.',
    'Plain, short words. No hype, no em dashes, no emoji. Say "deliver", not "ship".',
    `Return JSON only: {"goal": string, "moves": string[]}.`,
    `"goal": one sentence, at most ${MAX_BRIEF_GOAL_LENGTH} characters, in the third person or neutral voice.`,
    `"moves": 2 to ${MAX_BRIEF_MOVES} main moves, each a short phrase of at most ${MAX_BRIEF_MOVE_LENGTH} characters, taken from the plan's real work.`,
  ].join('\n');
  const user = [
    `Rollout: ${input.title}`,
    input.artistName ? `Artist: ${input.artistName}` : '',
    `Type: ${input.releaseType}`,
    '',
    'The idea:',
    ...input.notes.map((note) => `${note.author}: ${note.content}`),
    '',
    tasks.length ? `The plan's tasks:\n${tasks.join('\n')}` : 'The plan has no tasks yet.',
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

const clean = (value: unknown, max: number): string => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/—/g, ',')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
};

/** Reads the model's answer. Null when it cannot be used, so the caller keeps the plain idea. */
export function parseBrief(raw: string): RolloutBrief | null {
  const body = String(raw || '')
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, '')
    .replace(/\n?```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as { goal?: unknown; moves?: unknown };
  const goal = clean(record.goal, MAX_BRIEF_GOAL_LENGTH);
  if (!goal) return null;
  const moves = (Array.isArray(record.moves) ? record.moves : [])
    .map((move) => clean(move, MAX_BRIEF_MOVE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_BRIEF_MOVES);
  return { goal, moves };
}

/** The saved shape, checked on the way back out of the database. */
export function readStoredBrief(value: unknown): RolloutBrief | null {
  if (!value || typeof value !== 'object') return null;
  return parseBrief(JSON.stringify(value));
}
