import type { Task } from '@/types/tasks';

// Search over a release's activities, for the mobile search surface in
// TasksPanel (2026-08-31, founder request: the phone's hamburger menu carried
// a search box that only ever filtered the menu's own eight labels, so
// "search" could not find an activity — the thing a release actually has
// sixty of).
//
// Pure and in lib/ deliberately: vitest.config.ts collects lib/**/*.test.ts
// and there are no component tests in this repo, so the ranking rules are only
// testable if they live here rather than inline in the panel.

/**
 * How many activity matches the surface shows at once. A playbook release
 * carries 64-113 activities, so a one-letter query can match most of them —
 * an uncapped list would turn a bottom-of-screen panel into a second task
 * list. The surface says how many it is holding back rather than pretending
 * the limit was the whole answer.
 */
export const TASK_SEARCH_RESULT_LIMIT = 8;

export type TaskSearchResult = {
  task: Task;
  /**
   * Which field carried the match. The surface shows the description snippet
   * ONLY for a description match — otherwise a row would explain itself with
   * text that has nothing to do with why it is there.
   */
  matchedIn: 'title' | 'description';
};

export type TaskSearchOutcome = {
  results: TaskSearchResult[];
  /**
   * Matches past the limit. Drives "keep typing" copy, so a capped list never
   * silently reads as a complete one.
   */
  hiddenCount: number;
};

/**
 * Split a raw query into the terms every match must satisfy. Whitespace-
 * separated and order-independent, so "art cover" finds "Cover art final
 * approved" — the playbook's titles are long phrases and remembering their
 * word order is not something to require.
 *
 * An empty result means "not a search": callers must show a hint rather than
 * treating it as "match everything".
 */
export function parseSearchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** Every term present, in any order. Shared with the release-tool half of the
 *  surface so both sides of one query behave identically. */
export function matchesSearchTerms(text: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const haystack = text.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/**
 * Tier for one activity, or null when it does not match at all. Lower ranks
 * first:
 *
 *   0  the title starts with what was typed — the "I know its name" case
 *   1  every term is somewhere in the title
 *   2  every term is somewhere in title + description combined
 *
 * Tier 2 exists because the playbooks put the useful words in the
 * "why this matters" body ("Begin curator outreach", "split sheet"), so a
 * title-only search misses activities the manager remembers by their content.
 * It ranks last so a body mention never outranks a name.
 */
function rankTask(task: Task, terms: string[], joined: string): 0 | 1 | 2 | null {
  const title = task.title.toLowerCase();
  if (title.startsWith(joined)) return 0;
  if (terms.every((term) => title.includes(term))) return 1;
  const description = (task.description ?? '').toLowerCase();
  if (terms.every((term) => `${title} ${description}`.includes(term))) return 2;
  return null;
}

/**
 * Ranked activity matches for `query`.
 *
 * Completed activities sort after live ones within a tier: a search in a
 * release being worked almost always means live work, and a playbook release
 * accumulates dozens of done rows that would otherwise crowd them out.
 * Everything else preserves the incoming order — Array.prototype.sort is
 * stable per spec (ES2019), so a 0 from the comparator means "leave these as
 * the store had them" rather than "arbitrary".
 */
export function searchTasks(
  tasks: Task[],
  query: string,
  limit: number = TASK_SEARCH_RESULT_LIMIT
): TaskSearchOutcome {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) return { results: [], hiddenCount: 0 };

  const joined = terms.join(' ');
  const scored: { result: TaskSearchResult; tier: number; done: number }[] = [];

  tasks.forEach((task) => {
    const tier = rankTask(task, terms, joined);
    if (tier === null) return;
    scored.push({
      result: { task, matchedIn: tier === 2 ? 'description' : 'title' },
      tier,
      done: task.status === 'done' ? 1 : 0,
    });
  });

  scored.sort((a, b) => a.tier - b.tier || a.done - b.done);

  const capped = limit > 0 ? scored.slice(0, limit) : [];
  return {
    results: capped.map((entry) => entry.result),
    hiddenCount: scored.length - capped.length,
  };
}
