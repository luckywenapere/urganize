import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';

/**
 * What a manager was looking for, and whether the directory had it.
 *
 * WHY THIS IS A DURABLE ROW AND NOT ONLY AN ANALYTICS EVENT. The directory's
 * one real risk is a cold start: managers arrive, find nobody who does the job
 * they need, and stop coming. The question that has to be answerable every week
 * is "which roles are people asking for that nobody has delivered", because
 * that is the recruiting list. PostHog can answer it, but only when it is not
 * blocked and only if somebody writes the query — and this app has already lost
 * months of events to a content blocker once. So the one signal that drives a
 * decision is written server-side, the way `limit_hit` is: a row in
 * billing_events, read back by /admin/directory.
 *
 * THE PRIVACY RULE, and the reason parseDirectoryDemand is an allowlist of
 * three fields rather than a validator over whatever arrives: the search box
 * takes a person's NAME, and somebody typing a name is making a private search.
 * No query text, no city, no result identity ever reaches a durable row. A role
 * from a fixed vocabulary and a yes/no is the whole payload.
 */

/** Typed by hand into the filter, or followed from the role gaps panel on a
 *  release. Worth keeping apart: the second is demand the rollout plan created,
 *  which is the retention mechanic actually working. */
export const DIRECTORY_DEMAND_SOURCES = ['search', 'role_gap'] as const;
export type DirectoryDemandSource = (typeof DIRECTORY_DEMAND_SOURCES)[number];

export type DirectoryDemand = {
  role: DirectoryRole;
  /** Did anybody come back? `false` is the row that matters. */
  matched: boolean;
  source: DirectoryDemandSource;
};

const isRole = (value: unknown): value is DirectoryRole =>
  typeof value === 'string' && (DIRECTORY_ROLES as readonly string[]).includes(value);

const isSource = (value: unknown): value is DirectoryDemandSource =>
  typeof value === 'string' && (DIRECTORY_DEMAND_SOURCES as readonly string[]).includes(value);

/** Everything the client is allowed to say. Anything else it sends is dropped
 *  here rather than filtered later, so a future caller cannot widen the row by
 *  adding a field. */
export function parseDirectoryDemand(body: unknown): DirectoryDemand | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;

  if (!isRole(raw.role)) return null;
  if (typeof raw.matched !== 'boolean') return null;
  if (!isSource(raw.source)) return null;

  return { role: raw.role, matched: raw.matched, source: raw.source };
}

/**
 * One row per team per role per UTC day.
 *
 * A manager comparing two designers will run the same filter a dozen times in a
 * sitting, and a dozen rows say nothing a single row does not. UTC because the
 * server has no reliable team timezone and these are read in aggregate — the
 * same call `isSameUtcDay` already makes for wall return visits.
 *
 * Anything unreadable answers "not today", which biases toward recording. A
 * duplicate row costs nothing; a lost first row loses the signal.
 */
export function isSameUtcDayAs(previousIso: string | null | undefined, now: Date): boolean {
  if (!previousIso) return false;
  const previous = new Date(previousIso);
  if (Number.isNaN(previous.getTime())) return false;
  return (
    previous.getUTCFullYear() === now.getUTCFullYear() &&
    previous.getUTCMonth() === now.getUTCMonth() &&
    previous.getUTCDate() === now.getUTCDate()
  );
}

/** Result counts go to analytics bucketed, never raw. Zero is kept exact
 *  because zero is the whole signal; above that the difference between seven
 *  and nine answers nothing and a raw count is one more way to fingerprint a
 *  small team. */
export function bucketResultCount(count: number): '0' | '1-4' | '5-19' | '20+' {
  if (count <= 0) return '0';
  if (count < 5) return '1-4';
  if (count < 20) return '5-19';
  return '20+';
}
