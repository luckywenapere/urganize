/**
 * Post-release review by UrgAns (URG-253, founder-approved 2026-10-16).
 *
 * After a release, close the loop: a few numbers from the rollout's own data,
 * what worked, what slipped, three optional questions, and one line from
 * UrgAns. Then the one next step: start the next song (URG-280).
 *
 * Decisions (Oyin, 2026-10-16):
 *  - It opens 28 days after release day, or as soon as every activity is done.
 *    Nothing shows before that, and never for an undated rollout with work
 *    still open.
 *  - Thin tracking (no activities, or under 20% marked done) gets no numbers
 *    and no grade: most finished rollouts in production have 0 to 5 of 64
 *    ticked because the work happened outside the app, so grading them would
 *    be wrong. UrgAns asks first and writes the review from the answers.
 *  - Stored in releases.metadata.review (no migration). The verdict always has
 *    a template version, so the review works with AI off.
 *
 * Pure: no I/O. The route, the rollout card and the Home card share it.
 */

import type { TaskOutcomeRating } from '@/types/tasks';

export const REVIEW_OPENS_AFTER_DAYS = 28;
export const REVIEW_THIN_TRACKING_RATIO = 0.2;
export const REVIEW_LIST_MAX = 3;
export const REVIEW_ANSWER_MAX_LENGTH = 280;
export const REVIEW_VERDICT_MAX_LENGTH = 320;

const MS_PER_DAY = 86_400_000;

export const REVIEW_QUESTION_KEYS = ['offPlan', 'missed', 'change'] as const;
export type ReviewQuestionKey = (typeof REVIEW_QUESTION_KEYS)[number];

export const REVIEW_QUESTIONS: Record<ReviewQuestionKey, string> = {
  offPlan: "Anything you did that isn't in the plan?",
  missed: "What didn't happen, and why?",
  change: 'One thing to change next time?',
};

/** Which questions each state asks. A well-tracked rollout already shows what
 * slipped, so it skips "what didn't happen". */
export function reviewQuestionsFor(thin: boolean): ReviewQuestionKey[] {
  return thin ? ['offPlan', 'missed', 'change'] : ['offPlan', 'change'];
}

export type ReviewAnswers = Partial<Record<ReviewQuestionKey, string>>;

export type StoredReview = {
  answers: ReviewAnswers;
  verdict: string | null;
  verdictAt: string | null;
  answeredAt: string | null;
  dismissedAt: string | null;
};

export type ReviewTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  planKey?: boolean | null;
  phase?: string | null;
};

export type ReviewOutcome = { taskId: string; outcome: TaskOutcomeRating };

export type ReviewListItem = { taskId: string; title: string; note: string };

export type ReviewNumbers = { total: number; done: number; onTime: number; late: number };

export type ReleaseReviewView = {
  releaseId: string;
  title: string;
  artistName: string;
  releaseDate: string | null;
  /** Whole days since release day, or null with no date. */
  daysSince: number | null;
  thin: boolean;
  numbers: ReviewNumbers;
  worked: ReviewListItem[];
  slipped: ReviewListItem[];
  questions: ReviewQuestionKey[];
  answers: ReviewAnswers;
  verdict: string;
  dismissed: boolean;
};

// ---------------------------------------------------------------------------
// Dates (UTC calendar days, the frame lib/rollout-phases.ts uses)
// ---------------------------------------------------------------------------

function utcDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const epoch = Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  return Number.isNaN(epoch) ? null : epoch;
}

function todayUtc(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Whole days from release day to today; negative before release. */
export function daysSinceRelease(releaseDate: string | null | undefined, now: Date = new Date()): number | null {
  const release = utcDay(releaseDate);
  if (release === null) return null;
  return Math.round((todayUtc(now) - release) / MS_PER_DAY);
}

function liveTasks<T extends { status: string }>(tasks: readonly T[]): T[] {
  return tasks.filter((task) => task.status !== 'cancelled');
}

/** When the review opens: 28 days after release day, or every activity done. */
export function isReviewDue(
  release: { releaseDate: string | null; archivedAt?: string | null },
  tasks: readonly ReviewTask[],
  now: Date = new Date()
): boolean {
  const live = liveTasks(tasks);
  if (live.length > 0 && live.every((task) => task.status === 'done')) return true;
  const days = daysSinceRelease(release.releaseDate, now);
  return days !== null && days >= REVIEW_OPENS_AFTER_DAYS;
}

// ---------------------------------------------------------------------------
// Numbers and lists
// ---------------------------------------------------------------------------

function daysLate(task: ReviewTask, now: Date): number | null {
  const due = utcDay(task.dueDate);
  if (due === null) return null;
  const end = task.status === 'done' ? utcDay(task.completedAt) : todayUtc(now);
  if (end === null) return null;
  const late = Math.round((end - due) / MS_PER_DAY);
  return late > 0 ? late : null;
}

export function reviewNumbers(tasks: readonly ReviewTask[], now: Date = new Date()): ReviewNumbers {
  const live = liveTasks(tasks);
  let done = 0;
  let onTime = 0;
  let late = 0;
  for (const task of live) {
    const lateBy = daysLate(task, now);
    if (task.status === 'done') {
      done += 1;
      if (lateBy === null) onTime += 1;
      else late += 1;
    } else if (lateBy !== null) {
      late += 1;
    }
  }
  return { total: live.length, done, onTime, late };
}

export function isThinTracking(numbers: ReviewNumbers): boolean {
  return numbers.total === 0 || numbers.done / numbers.total < REVIEW_THIN_TRACKING_RATIO;
}

const OUTCOME_NOTES: Record<TaskOutcomeRating, string> = {
  went_well: 'Went well',
  went_okay: 'Went okay',
  not_to_plan: "Didn't go to plan",
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** What worked and what slipped, at most three each. Outcomes the team gave
 * come first; then key activities done on time, or late. */
export function reviewLists(
  tasks: readonly ReviewTask[],
  outcomes: readonly ReviewOutcome[],
  now: Date = new Date()
): { worked: ReviewListItem[]; slipped: ReviewListItem[] } {
  const live = liveTasks(tasks);
  const byId = new Map(live.map((task) => [task.id, task]));
  const worked: ReviewListItem[] = [];
  const slipped: ReviewListItem[] = [];
  const used = new Set<string>();

  for (const outcome of outcomes) {
    const task = byId.get(outcome.taskId);
    if (!task || used.has(task.id)) continue;
    if (outcome.outcome === 'went_well' && worked.length < REVIEW_LIST_MAX) {
      worked.push({ taskId: task.id, title: task.title, note: OUTCOME_NOTES.went_well });
      used.add(task.id);
    } else if (outcome.outcome === 'not_to_plan' && slipped.length < REVIEW_LIST_MAX) {
      slipped.push({ taskId: task.id, title: task.title, note: OUTCOME_NOTES.not_to_plan });
      used.add(task.id);
    }
  }

  const keyTasks = live.some((task) => task.planKey === true) ? live.filter((task) => task.planKey === true) : live;
  const dated = [...keyTasks].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  for (const task of dated) {
    if (used.has(task.id)) continue;
    const lateBy = daysLate(task, now);
    if (task.status === 'done' && lateBy === null && worked.length < REVIEW_LIST_MAX) {
      worked.push({ taskId: task.id, title: task.title, note: 'On time' });
      used.add(task.id);
    } else if (lateBy !== null && slipped.length < REVIEW_LIST_MAX) {
      slipped.push({
        taskId: task.id,
        title: task.title,
        note: task.status === 'done' ? `${plural(lateBy, 'day')} late` : 'Not done',
      });
      used.add(task.id);
    }
  }
  return { worked, slipped };
}

// ---------------------------------------------------------------------------
// Stored review (releases.metadata.review)
// ---------------------------------------------------------------------------

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').replace(/\s*—\s*/g, ', ').trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}

export function readStoredReview(metadata: unknown): StoredReview {
  const empty: StoredReview = { answers: {}, verdict: null, verdictAt: null, answeredAt: null, dismissedAt: null };
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return empty;
  const raw = (metadata as { review?: unknown }).review;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const review = raw as Record<string, unknown>;
  const answers: ReviewAnswers = {};
  const rawAnswers = review.answers && typeof review.answers === 'object' ? (review.answers as Record<string, unknown>) : {};
  for (const key of REVIEW_QUESTION_KEYS) {
    const answer = cleanText(rawAnswers[key], REVIEW_ANSWER_MAX_LENGTH);
    if (answer) answers[key] = answer;
  }
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  return {
    answers,
    verdict: cleanText(review.verdict, REVIEW_VERDICT_MAX_LENGTH),
    verdictAt: text(review.verdictAt),
    answeredAt: text(review.answeredAt),
    dismissedAt: text(review.dismissedAt),
  };
}

export function withStoredReview(metadata: unknown, review: StoredReview): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  return { ...base, review };
}

/** Validate a POST body's answers. Unknown keys are ignored; empty clears. */
export function parseReviewAnswers(body: unknown): { error: string } | { answers: ReviewAnswers } {
  if (!body || typeof body !== 'object') return { error: 'Request body must be a JSON object.' };
  const raw = (body as { answers?: unknown }).answers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Answers are required.' };
  const answers: ReviewAnswers = {};
  for (const key of REVIEW_QUESTION_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return { error: 'Answers must be text.' };
    if (value.trim().length > REVIEW_ANSWER_MAX_LENGTH) return { error: 'An answer is too long.' };
    const answer = cleanText(value, REVIEW_ANSWER_MAX_LENGTH);
    if (answer) answers[key] = answer;
  }
  return { answers };
}

export function hasAnswers(answers: ReviewAnswers): boolean {
  return REVIEW_QUESTION_KEYS.some((key) => Boolean(answers[key]));
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export const THIN_TRACKING_PROMPT = "You didn't track much of this one here. Tell me what happened and I'll write the review.";

function sentence(text: string): string {
  const trimmed = text.trim().replace(/[.!?]+$/, '');
  return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.` : '';
}

/** The no-AI verdict. Always a valid review line on its own. */
export function buildTemplateVerdict(input: {
  thin: boolean;
  numbers: ReviewNumbers;
  slipped: ReviewListItem[];
  answers: ReviewAnswers;
}): string {
  const { thin, numbers, slipped, answers } = input;
  const change = answers.change ? ` Next time: ${sentence(answers.change)}` : '';
  if (thin) {
    if (!hasAnswers(answers)) return THIN_TRACKING_PROMPT;
    const parts: string[] = [];
    if (answers.offPlan) parts.push(`You also did this outside the plan: ${sentence(answers.offPlan)}`);
    if (answers.missed) parts.push(`What didn't happen: ${sentence(answers.missed)}`);
    return `${parts.join(' ')}${change}`.trim() || 'Thanks. Noted for the next one.';
  }
  if (numbers.late === 0 && slipped.length === 0) {
    return `This rollout went to plan: ${numbers.done} of ${numbers.total} done, none late.${change}`;
  }
  const first = slipped[0];
  const slip = first ? ` ${first.title} slipped (${first.note.toLowerCase()}).` : '';
  return `${numbers.onTime} of ${numbers.total} done on time, ${numbers.late} late.${slip}${change}`;
}

export function buildReviewAiMessages(input: {
  title: string;
  artistName: string;
  numbers: ReviewNumbers;
  worked: ReviewListItem[];
  slipped: ReviewListItem[];
  answers: ReviewAnswers;
  thin: boolean;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const system = [
    'You are the AI in Urganize, a planning and coordination app for music teams.',
    "A release came out. Write the team's post-release review in one or two short plain sentences, under 280 characters.",
    'Either say plainly that the rollout went to plan, or give at most two concrete changes for next time, grounded only in the data and answers given.',
    'Use the team\'s own words where you can. No praise words, no emojis, no em dashes, no invented numbers.',
    'Respond with JSON only: {"verdict": string}.',
  ].join('\n');
  const list = (items: ReviewListItem[]) => (items.length ? items.map((item) => `${item.title} (${item.note})`).join('; ') : 'none');
  const user = [
    `Release: ${input.title} by ${input.artistName}`,
    input.thin
      ? 'Tracking: the team marked little of the plan done in the app, so do not judge the plan numbers.'
      : `Activities: ${input.numbers.done} of ${input.numbers.total} done, ${input.numbers.onTime} on time, ${input.numbers.late} late`,
    `What worked: ${list(input.worked)}`,
    `What slipped: ${list(input.slipped)}`,
    `Done outside the plan: ${input.answers.offPlan ?? 'not answered'}`,
    `Did not happen: ${input.answers.missed ?? 'not answered'}`,
    `Change next time: ${input.answers.change ?? 'not answered'}`,
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseReviewAiResponse(raw: string): { verdict: string } | null {
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(unfenced) as { verdict?: unknown };
    const verdict = cleanText(parsed.verdict, REVIEW_VERDICT_MAX_LENGTH);
    return verdict ? { verdict } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The whole view
// ---------------------------------------------------------------------------

export function buildReleaseReviewView(input: {
  release: { id: string; title: string; artistName: string; releaseDate: string | null; metadata: unknown };
  tasks: readonly ReviewTask[];
  outcomes: readonly ReviewOutcome[];
  now?: Date;
}): ReleaseReviewView {
  const now = input.now ?? new Date();
  const numbers = reviewNumbers(input.tasks, now);
  const thin = isThinTracking(numbers);
  const { worked, slipped } = thin ? { worked: [], slipped: [] } : reviewLists(input.tasks, input.outcomes, now);
  const stored = readStoredReview(input.release.metadata);
  const verdict =
    thin && !hasAnswers(stored.answers)
      ? THIN_TRACKING_PROMPT
      : stored.verdict ?? buildTemplateVerdict({ thin, numbers, slipped, answers: stored.answers });
  return {
    releaseId: input.release.id,
    title: input.release.title,
    artistName: input.release.artistName,
    releaseDate: input.release.releaseDate,
    daysSince: daysSinceRelease(input.release.releaseDate, now),
    thin,
    numbers,
    worked,
    slipped,
    questions: reviewQuestionsFor(thin),
    answers: stored.answers,
    verdict,
    dismissed: Boolean(stored.dismissedAt),
  };
}

// ---------------------------------------------------------------------------
// Between releases: what Home shows (useBetweenReleases reads this)
// ---------------------------------------------------------------------------

export type BetweenReleasesRelease = {
  id: string;
  title: string;
  artistName: string;
  releaseDate: string | null;
  metadata: unknown;
  archivedAt?: string | null;
};

export type BetweenReleasesState = {
  /** The newest rollout whose review is open and not dismissed. */
  reviewDue: { releaseId: string; title: string; numbers: ReviewNumbers; thin: boolean } | null;
  /** The newest rollout still in pre-production (no plan built yet). */
  inPreProduction: { releaseId: string; title: string; artistName: string; done: number; total: number } | null;
  /** True when no rollout has open work ahead of its release: Home's
   * between-releases state, where "Start the next one" belongs. */
  between: boolean;
};

export function pickBetweenReleases(
  releases: readonly BetweenReleasesRelease[],
  tasks: readonly (ReviewTask & { releaseId: string | null })[],
  now: Date = new Date()
): BetweenReleasesState {
  const byRelease = new Map<string, ReviewTask[]>();
  for (const task of tasks) {
    if (!task.releaseId) continue;
    const list = byRelease.get(task.releaseId);
    if (list) list.push(task);
    else byRelease.set(task.releaseId, [task]);
  }

  let reviewDue: BetweenReleasesState['reviewDue'] = null;
  let reviewDueDate = '';
  let inPreProduction: BetweenReleasesState['inPreProduction'] = null;
  let between = true;

  for (const release of releases) {
    if (release.archivedAt) continue;
    const releaseTasks = byRelease.get(release.id) ?? [];
    const live = liveTasks(releaseTasks);
    const preProductionOnly = live.length > 0 && live.every((task) => task.phase === 'pre_production');
    if (preProductionOnly) {
      between = false;
      if (!inPreProduction) {
        inPreProduction = {
          releaseId: release.id,
          title: release.title,
          artistName: release.artistName,
          done: live.filter((task) => task.status === 'done').length,
          total: live.length,
        };
      }
      continue;
    }
    const days = daysSinceRelease(release.releaseDate, now);
    if (days === null || days < 0) {
      if (live.some((task) => task.status !== 'done')) between = false;
    }
    if (!isReviewDue(release, releaseTasks, now)) continue;
    if (readStoredReview(release.metadata).dismissedAt) continue;
    const key = release.releaseDate ?? '';
    if (!reviewDue || key > reviewDueDate) {
      const numbers = reviewNumbers(releaseTasks, now);
      reviewDue = { releaseId: release.id, title: release.title, numbers, thin: isThinTracking(numbers) };
      reviewDueDate = key;
    }
  }
  return { reviewDue, inPreProduction, between };
}
