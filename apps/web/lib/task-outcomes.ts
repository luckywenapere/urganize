// Task outcomes ("Done. How did it go?") — pure helpers shared by the sheet,
// the API route, and the detail view, so the sides can never disagree about
// ratings, labels, length caps, or how a summary is built (the notes.ts /
// asset-constants.ts pattern). No I/O here.

import { TASK_OUTCOME_RATINGS, type TaskOutcome, type TaskOutcomeRating } from '@/types/tasks';

export { TASK_OUTCOME_RATINGS };
export type { TaskOutcome, TaskOutcomeRating };

/** Hard cap on the note and the follow-up answer, enforced on both sides. */
export const OUTCOME_NOTE_MAX_LENGTH = 2_000;

/** Hard cap on the stored summary line. */
export const OUTCOME_SUMMARY_MAX_LENGTH = 200;

/** Cap on an AI follow-up question; anything longer is dropped, not shown. */
export const OUTCOME_FOLLOWUP_QUESTION_MAX_LENGTH = 140;

/** How much of the note the template summary carries. */
const TEMPLATE_SUMMARY_NOTE_LENGTH = 140;

export function isTaskOutcomeRating(value: unknown): value is TaskOutcomeRating {
  return typeof value === 'string' && (TASK_OUTCOME_RATINGS as readonly string[]).includes(value);
}

/** Chip and detail-view labels. Copy rules: plain language, no em dashes. */
export const TASK_OUTCOME_LABELS: Record<TaskOutcomeRating, string> = {
  went_well: 'Went well',
  went_okay: 'Went okay',
  not_to_plan: "Didn't go to plan",
};

/** Collapse whitespace (voice-to-text notes arrive messy) onto one line. */
function collapseToOneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Replace em dashes so no stored copy ever carries one (brand copy rule). */
function stripEmDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ', ').replace(/,\s*$/, '').trim();
}

/**
 * Truncate at a word boundary with a trailing ellipsis character. Falls back
 * to a hard cut when the text has no space inside the window.
 */
function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const lastSpace = window.lastIndexOf(' ');
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window;
  return `${cut.trimEnd()}…`;
}

/**
 * The no-AI summary: the rating label as a sentence, plus the start of the
 * note when one exists. Used whenever the AI is unconfigured, slow, or wrong,
 * so it must always be a valid summary on its own.
 */
export function buildTemplateOutcomeSummary(outcome: TaskOutcomeRating, note: string | null): string {
  const base = `${TASK_OUTCOME_LABELS[outcome]}.`;
  const collapsed = note ? collapseToOneLine(note) : '';
  if (!collapsed) return base;
  return `${base} ${truncateAtWord(collapsed, TEMPLATE_SUMMARY_NOTE_LENGTH)}`;
}

export type OutcomeAiMessage = { role: 'system' | 'user'; content: string };

/**
 * One call produces both the summary and the optional follow-up question.
 * The model is addressed as UrgAns (never an internal model or provider
 * name) and the output contract is strict JSON for parseOutcomeAiResponse.
 */
export function buildOutcomeAiMessages(input: {
  taskTitle: string;
  outcome: TaskOutcomeRating;
  note: string;
}): OutcomeAiMessage[] {
  const system = [
    'You are UrgAns, the assistant inside Urganize, a release planning app for music teams.',
    'A user just finished a task and told you how it went. The note may be voice dictated and messy.',
    'Respond with JSON only, no prose: {"summary": string, "followupQuestion": string or null}.',
    'Rules for summary: one plain sentence under 140 characters that restates what happened in the user\'s own words, past tense. No advice, no praise, no emojis, no em dashes.',
    'Rules for followupQuestion: at most one short question under 120 characters. Ask only when the note mentions a concrete result you could pin down with a number, or a problem whose cause the user left unsaid. Ask for a specific fact, never for feelings. When nothing is worth asking, use null.',
  ].join('\n');

  const user = [
    `Task: ${input.taskTitle}`,
    `Outcome: ${TASK_OUTCOME_LABELS[input.outcome]}`,
    `Note: ${input.note}`,
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export type OutcomeAiResult = {
  summary: string;
  followupQuestion: string | null;
};

/**
 * Parse callback for generateStructuredAiOutput. Returns null (never throws)
 * on anything unusable — the provider surfaces that as a failure the route
 * swallows into the template path. A bad followupQuestion degrades to null
 * rather than failing the whole result: the summary is the part worth
 * keeping.
 */
export function parseOutcomeAiResponse(raw: string): OutcomeAiResult | null {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const summaryRaw = typeof record.summary === 'string' ? stripEmDashes(record.summary) : '';
  if (!summaryRaw) return null;
  const summary = truncateAtWord(collapseToOneLine(summaryRaw), OUTCOME_SUMMARY_MAX_LENGTH);

  let followupQuestion: string | null = null;
  if (typeof record.followupQuestion === 'string') {
    const question = stripEmDashes(collapseToOneLine(record.followupQuestion));
    if (question && question.length <= OUTCOME_FOLLOWUP_QUESTION_MAX_LENGTH) {
      followupQuestion = question;
    }
  }

  return { summary, followupQuestion };
}

/** snake_case DB row to the camelCase TaskOutcome. Null on anything off. */
export function mapTaskOutcomeRow(row: Record<string, unknown> | null): TaskOutcome | null {
  if (!row) return null;
  const outcome = row.outcome;
  if (!isTaskOutcomeRating(outcome)) return null;
  if (typeof row.id !== 'string' || typeof row.task_id !== 'string' || typeof row.release_id !== 'string') {
    return null;
  }
  return {
    id: row.id,
    taskId: row.task_id,
    releaseId: row.release_id,
    outcome,
    note: typeof row.note === 'string' ? row.note : null,
    summary: typeof row.summary === 'string' ? row.summary : buildTemplateOutcomeSummary(outcome, null),
    aiFollowupQuestion: typeof row.ai_followup_question === 'string' ? row.ai_followup_question : null,
    aiFollowupAnswer: typeof row.ai_followup_answer === 'string' ? row.ai_followup_answer : null,
    createdBy: typeof row.created_by === 'string' ? row.created_by : '',
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  };
}
