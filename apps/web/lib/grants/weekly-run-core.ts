// The weekly grant run's steps, written against a small store so they can be
// tested without a database. weekly-run-server.ts gives it the real one.

import { grantProfileFromRow, isGrantProfileReady, toTeamGrantProfile, type GrantProfileRow } from './grant-profile';
import { pickSuggestions, teamWeekdaySlot, type GrantProgramme } from './programmes';
import { GRANT_RUN_MAX_TEAMS, isGrantFeedEligible, lagosDay, suggestedRecently } from './weekly-run';

export type GrantRunStore = {
  /** Active, open programmes, with their database ids. */
  loadProgrammes(): Promise<Array<{ id: string; programme: GrantProgramme }>>;
  /** Every team that saved a grant profile with a country. */
  loadProfiles(): Promise<Array<{ workspaceId: string; row: GrantProfileRow }>>;
  /** What the team was already shown (any state), and when it was last given any. */
  loadHistory(workspaceId: string): Promise<{ programmeIds: Set<string>; lastSuggestedAt: string | null }>;
  /** Access state of the team's owner, or null when it cannot be told. */
  resolveAccessState(workspaceId: string): Promise<string | null>;
  /** Writes new suggestions. Returns how many rows went in. */
  insertSuggestions(rows: Array<{ workspaceId: string; programmeId: string; why: string }>): Promise<number>;
  /** Queues the weekly phone push for the team's people. Returns how many were queued. */
  queueTeamPush(workspaceId: string, count: number): Promise<number>;
};

export type GrantRunResult = {
  today: string;
  teamsDue: number;
  teamsSuggested: number;
  suggestions: number;
  pushesQueued: number;
  skipped: { notPaying: number; recent: number; noMatch: number; failed: number; outOfTime: number };
};

export async function runGrantSuggestionsWith(
  store: GrantRunStore,
  opts: { now: Date; timeBudgetMs: number; maxTeams?: number; clock?: () => number }
): Promise<GrantRunResult> {
  const clock = opts.clock ?? Date.now;
  const started = clock();
  const { today, weekday } = lagosDay(opts.now);
  const result: GrantRunResult = {
    today,
    teamsDue: 0,
    teamsSuggested: 0,
    suggestions: 0,
    pushesQueued: 0,
    skipped: { notPaying: 0, recent: 0, noMatch: 0, failed: 0, outOfTime: 0 },
  };

  const profiles = await store.loadProfiles();
  const due = profiles
    .filter((entry) => teamWeekdaySlot(entry.workspaceId) === weekday)
    .slice(0, opts.maxTeams ?? GRANT_RUN_MAX_TEAMS);
  result.teamsDue = due.length;
  if (due.length === 0) return result;

  const programmes = await store.loadProgrammes();
  const idBySlug = new Map(programmes.map((entry) => [entry.programme.slug, entry.id]));
  const slugById = new Map(programmes.map((entry) => [entry.id, entry.programme.slug]));
  const list = programmes.map((entry) => entry.programme);

  for (let i = 0; i < due.length; i += 1) {
    if (clock() - started > opts.timeBudgetMs) {
      result.skipped.outOfTime = due.length - i;
      break;
    }
    const { workspaceId, row } = due[i];
    const profile = grantProfileFromRow(row);
    if (!isGrantProfileReady(profile)) continue;

    try {
      if (!isGrantFeedEligible(await store.resolveAccessState(workspaceId))) {
        result.skipped.notPaying += 1;
        continue;
      }
      const history = await store.loadHistory(workspaceId);
      if (suggestedRecently(history.lastSuggestedAt, opts.now)) {
        result.skipped.recent += 1;
        continue;
      }
      const alreadySuggested = new Set(
        [...history.programmeIds].map((id) => slugById.get(id)).filter((slug): slug is string => Boolean(slug))
      );
      const picks = pickSuggestions(list, toTeamGrantProfile(profile), { today, alreadySuggested });
      if (picks.length === 0) {
        result.skipped.noMatch += 1;
        continue;
      }
      const inserted = await store.insertSuggestions(
        picks.map((pick) => ({ workspaceId, programmeId: idBySlug.get(pick.programme.slug) as string, why: pick.why }))
      );
      if (inserted > 0) {
        result.teamsSuggested += 1;
        result.suggestions += inserted;
        // The suggestions are in either way; a push that fails is only a missed nudge.
        try {
          result.pushesQueued += await store.queueTeamPush(workspaceId, inserted);
        } catch {
          // Counted nowhere on purpose: the strip still shows them.
        }
      }
    } catch {
      // One team's failure never stops the others, and never fails the cron.
      result.skipped.failed += 1;
    }
  }
  return result;
}
