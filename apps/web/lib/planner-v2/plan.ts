/**
 * The plan UrgAns writes in one structured call (planner v2, proposal Part B.3),
 * its JSON schema for the gateway's structured output, and a lenient parser
 * that turns the model's text into the typed shape (or null). Parsing only
 * checks shape and clamps lengths; the rules live in ./validate.ts.
 */

import type { TaskRole } from '../release-templates/types';
import { TASK_CHANNELS, type TaskChannel } from './moves';

export const PLAN_PHASES = ['pre_release', 'release', 'post_release'] as const;
export type PlanV2Phase = (typeof PLAN_PHASES)[number];

export const OWNER_ROLES: readonly TaskRole[] = [
  'artist',
  'manager',
  'marketing_lead',
  'designer',
  'distributor_contact',
  'team',
];

export type PlanV2Task = {
  key: string;
  library_id: string | null;
  title: string;
  why: string;
  done_when: string;
  phase: PlanV2Phase;
  /** Days from release day. */
  offset_days: number;
  duration_days: number;
  owner_role: TaskRole;
  channel: TaskChannel;
  cost_naira: number;
  depends_on: string[];
  first_up: boolean;
  /** Prep that needs no release date (artwork, mastering, distributor
   *  upload, press kit, pitch list): fine to do now. */
  now: boolean;
};

export type PlanV2 = {
  built_for: {
    summary: string;
    win: string;
    target: string | null;
    constraints: string[];
    start_point: 'making' | 'finished' | 'out';
  };
  budget: {
    total_naira: number;
    lines: Array<{ item: string; naira: number; why: string }>;
  };
  tasks: PlanV2Task[];
  warnings: string[];
  assumptions: string[];
};

export const LIMITS = {
  summary: 140,
  win: 80,
  target: 80,
  constraint: 40,
  constraints: 5,
  budgetItem: 40,
  budgetWhy: 120,
  budgetLines: 8,
  title: 80,
  why: 140,
  doneWhen: 100,
  key: 12,
  maxTasks: 18,
  minTasks: 10,
  note: 160,
  notes: 5,
} as const;

const str = (max: number) => ({ type: 'string', maxLength: max });
const strict = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});

/** One task, as the gateway's strict schema wants it. */
export const PLAN_V2_TASK_SCHEMA = strict({
      key: str(LIMITS.key),
      library_id: { type: ['string', 'null'] },
      title: str(LIMITS.title),
      why: str(LIMITS.why),
      done_when: str(LIMITS.doneWhen),
      phase: { type: 'string', enum: [...PLAN_PHASES] },
      offset_days: { type: 'integer', minimum: -120, maximum: 120 },
      duration_days: { type: 'integer', minimum: 1, maximum: 14 },
      owner_role: { type: 'string', enum: [...OWNER_ROLES] },
      channel: { type: 'string', enum: [...TASK_CHANNELS] },
      cost_naira: { type: 'integer', minimum: 0 },
      depends_on: { type: 'array', items: str(LIMITS.key) },
      first_up: { type: 'boolean' },
      now: { type: 'boolean' },
    });

/** Strict JSON schema: every property required, nullables as type unions. */
export const PLAN_V2_JSON_SCHEMA = strict({
  built_for: strict({
    summary: str(LIMITS.summary),
    win: str(LIMITS.win),
    target: { type: ['string', 'null'], maxLength: LIMITS.target },
    constraints: { type: 'array', maxItems: LIMITS.constraints, items: str(LIMITS.constraint) },
    start_point: { type: 'string', enum: ['making', 'finished', 'out'] },
  }),
  budget: strict({
    total_naira: { type: 'integer', minimum: 0 },
    lines: {
      type: 'array',
      maxItems: LIMITS.budgetLines,
      items: strict({ item: str(LIMITS.budgetItem), naira: { type: 'integer', minimum: 0 }, why: str(LIMITS.budgetWhy) }),
    },
  }),
  tasks: {
    type: 'array',
    maxItems: LIMITS.maxTasks,
    items: PLAN_V2_TASK_SCHEMA,
  },
  warnings: { type: 'array', maxItems: LIMITS.notes, items: str(LIMITS.note) },
  assumptions: { type: 'array', maxItems: LIMITS.notes, items: str(LIMITS.note) },
});

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const int = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};
const texts = (value: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(value) ? value.map((item) => text(item, maxLen)).filter(Boolean).slice(0, maxItems) : [];

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced) return fenced[1];
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

/** Shape-check an object into a PlanV2, or null when it is not one. */
export function coercePlanV2(value: unknown): PlanV2 | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const bf = (r.built_for && typeof r.built_for === 'object' ? r.built_for : null) as Record<string, unknown> | null;
  const budget = (r.budget && typeof r.budget === 'object' ? r.budget : null) as Record<string, unknown> | null;
  if (!bf || !budget || !Array.isArray(r.tasks)) return null;

  const tasks: PlanV2Task[] = [];
  for (const item of r.tasks.slice(0, 30)) {
    if (!item || typeof item !== 'object') return null;
    const t = item as Record<string, unknown>;
    const key = text(t.key, LIMITS.key);
    const title = text(t.title, LIMITS.title);
    if (!key || !title) return null;
    const phase = (PLAN_PHASES as readonly string[]).includes(t.phase as string) ? (t.phase as PlanV2Phase) : null;
    const role = OWNER_ROLES.includes(t.owner_role as TaskRole) ? (t.owner_role as TaskRole) : 'team';
    const channel = (TASK_CHANNELS as readonly string[]).includes(t.channel as string)
      ? (t.channel as TaskChannel)
      : 'none';
    const offset = int(t.offset_days, Number.NaN);
    if (!Number.isFinite(offset)) return null;
    tasks.push({
      key,
      library_id: typeof t.library_id === 'string' && t.library_id.trim() ? t.library_id.trim().slice(0, 80) : null,
      title,
      why: text(t.why, LIMITS.why),
      done_when: text(t.done_when, LIMITS.doneWhen),
      phase: phase ?? (offset < 0 ? 'pre_release' : offset === 0 ? 'release' : 'post_release'),
      offset_days: offset,
      duration_days: Math.min(14, Math.max(1, int(t.duration_days, 1))),
      owner_role: role,
      channel,
      cost_naira: Math.max(0, int(t.cost_naira)),
      depends_on: texts(t.depends_on, 6, LIMITS.key),
      first_up: t.first_up === true,
      now: t.now === true,
    });
  }

  const startPoint = bf.start_point === 'making' || bf.start_point === 'out' ? bf.start_point : 'finished';
  const lines = Array.isArray(budget.lines)
    ? budget.lines
        .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === 'object')
        .map((line) => ({
          item: text(line.item, LIMITS.budgetItem),
          naira: Math.max(0, int(line.naira)),
          why: text(line.why, LIMITS.budgetWhy),
        }))
        .filter((line) => line.item)
        .slice(0, LIMITS.budgetLines)
    : [];

  return {
    built_for: {
      summary: text(bf.summary, LIMITS.summary),
      win: text(bf.win, LIMITS.win),
      target: text(bf.target, LIMITS.target) || null,
      constraints: texts(bf.constraints, LIMITS.constraints, LIMITS.constraint),
      start_point: startPoint,
    },
    budget: { total_naira: Math.max(0, int(budget.total_naira)), lines },
    tasks,
    warnings: texts(r.warnings, LIMITS.notes, LIMITS.note),
    assumptions: texts(r.assumptions, LIMITS.notes, LIMITS.note),
  };
}

/** The model's raw text to a PlanV2, or null. */
export function parsePlanV2(raw: string): PlanV2 | null {
  try {
    return coercePlanV2(JSON.parse(stripFences(raw)));
  } catch {
    return null;
  }
}
