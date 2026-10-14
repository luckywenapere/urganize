import type { TaskStatus } from '@/types/tasks';

// "Mark the cover shoot as done", "move pitch to in progress", "radio edit is
// blocked". UrgAns changes an activity's status itself, by rule, in the app
// (founder, 2026-10-14: "it has to be deterministic and not use credits since
// it's in the same app"). A message this module recognises never reaches the
// model, so it is never charged. Anything it does not recognise goes to the
// model exactly as before.

/** `explicit`: "mark/set/move X to <status>", unmistakably a status change, so
 *  UrgAns answers it itself even when no activity matches. `loose`: "X is done",
 *  "start X", phrasing ordinary conversation also uses, so it only acts when an
 *  activity really matches and otherwise goes to the model as before. */
export type TaskStatusCommand = { query: string; status: TaskStatus; strength: 'explicit' | 'loose' };

// Longest phrases first so "not started" wins over "started".
const STATUS_PHRASES: Array<[RegExp, TaskStatus]> = [
  [/^(?:not started|to ?do|to-do|open|reopened|undone|not done)$/, 'todo'],
  [/^(?:in progress|in-progress|started|ongoing|doing|underway|under way|working on it|active)$/, 'in_progress'],
  [/^(?:in review|in-review|review|for review|ready for review|under review)$/, 'in_review'],
  [/^(?:blocked|stuck|on hold)$/, 'blocked'],
  [/^(?:cancell?ed|canceled|dropped|scrapped)$/, 'cancelled'],
  [/^(?:backlog|the backlog|later)$/, 'backlog'],
  [/^(?:done|complete|completed|finished|sorted|handled)$/, 'done'],
];

function statusFromPhrase(phrase: string): TaskStatus | null {
  const clean = phrase.trim().toLowerCase().replace(/[.!]+$/, '').replace(/^(?:the\s+)?status\s+(?:of\s+)?/, '').trim();
  for (const [pattern, status] of STATUS_PHRASES) {
    if (pattern.test(clean)) return status;
  }
  return null;
}

const NOUN = String.raw`(?:(?:the|my|our)\s+)?(?:(?:task|activity|to-?do)\s+)?`;

function cleanQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .replace(/\s+(?:task|activity)$/i, '')
    .trim();
}

/**
 * Reads a status change out of a typed message, or returns null. Anchored
 * patterns only: a question ("is the cover shoot done?") or a longer request
 * is not a command and goes to the model.
 */
export function parseTaskStatusCommand(raw: string): TaskStatusCommand | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text || text.length > 200 || text.endsWith('?')) return null;

  const result = (
    query: string,
    status: TaskStatus | null,
    strength: TaskStatusCommand['strength']
  ): TaskStatusCommand | null => {
    const cleaned = cleanQuery(query);
    if (!status || cleaned.length < 2 || cleaned.length > 140) return null;
    return { query: cleaned, status, strength };
  };

  // mark/set/move/change/put/update X as|to|in|into <status>
  const verbed = new RegExp(
    String.raw`^(?:please\s+)?(?:mark|set|move|change|put|update|switch|flip)\s+${NOUN}(.+?)\s+(?:as|to|in|into)\s+(.+?)[.!]*$`,
    'i'
  ).exec(text);
  if (verbed) return result(verbed[1], statusFromPhrase(verbed[2]), 'explicit');

  // mark X done / mark X complete (no "as")
  const markBare = new RegExp(String.raw`^(?:please\s+)?mark\s+${NOUN}(.+?)\s+(done|complete|completed|finished)[.!]*$`, 'i').exec(text);
  if (markBare) return result(markBare[1], 'done', 'explicit');

  // X is (now) <status>
  const stated = new RegExp(String.raw`^${NOUN}(.+?)\s+is\s+(?:now\s+)?(.+?)[.!]*$`, 'i').exec(text);
  if (stated) {
    const status = statusFromPhrase(stated[2]);
    if (status) return result(stated[1], status, 'loose');
  }

  // complete/finish/cancel/start/block/reopen X
  const imperative = new RegExp(
    String.raw`^(?:please\s+)?(complete|finish|cancel|start|block|reopen|unblock)\s+${NOUN}(.+?)[.!]*$`,
    'i'
  ).exec(text);
  if (imperative) {
    const verb = imperative[1].toLowerCase();
    const status: TaskStatus =
      verb === 'complete' || verb === 'finish'
        ? 'done'
        : verb === 'cancel'
          ? 'cancelled'
          : verb === 'start'
            ? 'in_progress'
            : verb === 'block'
              ? 'blocked'
              : 'todo';
    return result(imperative[2], status, 'loose');
  }

  return null;
}

export type MatchableTask = { id: string; title: string; releaseId: string | null; status: TaskStatus };

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The activities a query names, best tier first: the exact title, then titles
 * that contain the query, then titles holding every word of it. Within a tier,
 * the rollout UrgAns is scoped to wins when it has any. Archived-looking
 * statuses are not filtered: a cancelled activity can be reopened by name.
 */
export function matchTasksByTitle<T extends MatchableTask>(
  query: string,
  tasks: T[],
  scopedReleaseId?: string | null
): T[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(' ');
  const tiers: Array<(title: string) => boolean> = [
    (title) => title === q,
    (title) => title.includes(q),
    (title) => words.every((word) => title.split(' ').includes(word)),
  ];
  for (const test of tiers) {
    const hits = tasks.filter((task) => test(normalize(task.title)));
    if (hits.length === 0) continue;
    if (scopedReleaseId) {
      const scoped = hits.filter((task) => task.releaseId === scopedReleaseId);
      if (scoped.length > 0) return scoped;
    }
    return hits;
  }
  return [];
}
