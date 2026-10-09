import type { SupabaseClient } from '@supabase/supabase-js';
import { loadScoreboardInput } from './scoreboard-server';

// Read the Scoreboard's rows once for both admin pages (iteration 5,
// 2026-10-10).
//
// The founder cockpit (GET /api/admin/cockpit) and the Scoreboard
// (GET /api/admin/scoreboard) used to run loadScoreboardInput each, which is
// every team, member, subscription, release and task plus 120 days of activity
// across eighteen tables. Opening /admin and then the Scoreboard read it all
// twice. Now both routes ask this cache: a read made in the last
// SCOREBOARD_READ_TTL_MS is reused, and two requests that arrive while a read
// is running share that one read.
//
// Same rows in, same numbers out: nothing is computed here, the cached value
// is exactly what loadScoreboardInput returned, and every builder that reads it
// (buildScoreboard, buildFounderCockpit, buildFunnels, buildUrgansUsage,
// churnSummary) is pure and does not change its input. A test holds both.
//
// Limits, stated plainly. The cache lives in one server instance's memory, so
// it only helps when both requests reach the same warm instance (Vercel
// usually serves admin routes with the same settings from one function, but
// does not promise it). It is never shared between people: only admins reach
// either route, after verifyAdmin. A failed read is never kept. The Scoreboard's
// Refresh button asks for a fresh read (`?fresh=1`).

export const SCOREBOARD_READ_TTL_MS = 60_000;

type Loaded = Awaited<ReturnType<typeof loadScoreboardInput>>;
type Loader = (client: SupabaseClient, now: Date) => Promise<Loaded>;

export type ScoreboardReadCache = {
  /** The cached read, or a new one when it is older than the TTL or `fresh`. */
  get: (client: SupabaseClient, options?: { fresh?: boolean }) => Promise<Loaded>;
  /** Forget the cached read. */
  clear: () => void;
};

export function createScoreboardReadCache(
  load: Loader,
  ttlMs: number = SCOREBOARD_READ_TTL_MS,
  clock: () => number = Date.now
): ScoreboardReadCache {
  let entry: { at: number; value: Promise<Loaded> } | null = null;

  return {
    get(client, options = {}) {
      const at = clock();
      if (!options.fresh && entry && at - entry.at < ttlMs) return entry.value;
      const value = load(client, new Date(at));
      const current = { at, value };
      entry = current;
      // A failed read is dropped so the next request tries again.
      value.catch(() => {
        if (entry === current) entry = null;
      });
      return value;
    },
    clear() {
      entry = null;
    },
  };
}

/** The one cache both admin routes share. */
export const scoreboardReadCache = createScoreboardReadCache(loadScoreboardInput);
