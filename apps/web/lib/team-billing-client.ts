// Team access, client side. One fetch shared by every surface that needs it.
//
// Three things ask this question on the same navigation — the in-session gate
// (HardPaywallGate), the trial indicator (TeamTrialStrip) and the wall itself
// (TeamWall) — so without a shared read they would each hit
// /api/subscription-status separately on every page change. The module-level
// cache collapses those into one request per user per short window.
//
// Deliberately NOT a Zustand store: this is a cache of a server answer, not
// app state anyone mutates, and the consumers live in different trees
// (AppShell bridges, chrome, a standalone page). A plain module keyed by user
// id is the smaller thing that works — the CardTrialGate precedent.

import { supabase } from './supabase/client';
import type { TeamAccessReason, TeamAccessState } from './team-billing';

export type TeamAccessClientSnapshot = {
  hasAccess: boolean;
  state: TeamAccessState;
  reason: TeamAccessReason;
  primaryWorkspaceId: string | null;
  teamName: string | null;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  inGrace: boolean;
  isOwnerOrAdmin: boolean;
  ownerUserId: string | null;
  ownerName: string | null;
};

/** How long a fetched answer is reused. Short in both directions: the wall must
 * appear promptly when a trial lapses and disappear promptly once a team pays.
 * The server's own 30s positive-only cache is the real rate limit. */
const CACHE_TTL_MS = 20 * 1000;

type CacheEntry = {
  userId: string;
  snapshot: TeamAccessClientSnapshot | null;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
let inFlight: { userId: string; promise: Promise<TeamAccessClientSnapshot | null> } | null = null;

/** Drop the cached answer. Called after a mutation that should change it (a
 * completed checkout returning to the app). */
export function invalidateTeamAccessClientCache(): void {
  cache = null;
  inFlight = null;
}

// The endpoint identifies the user from the bearer token, so this takes no
// user id; the caller keys the CACHE by user id, which is what matters.
async function fetchTeamAccess(): Promise<TeamAccessClientSnapshot | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    const response = await fetch('/api/subscription-status', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const payload = (await response.json().catch(() => ({}))) as {
      teamAccess?: Partial<TeamAccessClientSnapshot> | null;
    };
    const team = payload.teamAccess;
    // No teamAccess object means the flag is off server-side. Null, not a
    // fabricated "walled" — the caller must not act on an absent answer.
    if (!team || typeof team.hasAccess !== 'boolean') return null;

    return {
      hasAccess: team.hasAccess,
      state: (team.state as TeamAccessState) ?? 'trial',
      reason: (team.reason as TeamAccessReason) ?? 'no_trial_stamp',
      primaryWorkspaceId: team.primaryWorkspaceId ?? null,
      teamName: team.teamName ?? null,
      trialEndsAt: team.trialEndsAt ?? null,
      trialDaysLeft: Number(team.trialDaysLeft) || 0,
      inGrace: Boolean(team.inGrace),
      isOwnerOrAdmin: Boolean(team.isOwnerOrAdmin),
      ownerUserId: team.ownerUserId ?? null,
      ownerName: team.ownerName ?? null,
    };
  } catch {
    // Fail open: null means "we do not know", and every consumer treats that
    // as "do nothing".
    return null;
  }
}

/**
 * The team's access answer, cached per user for CACHE_TTL_MS. Concurrent
 * callers on the same navigation share one request.
 *
 * Returns null when we could not tell (flag off server-side, no session, a
 * failed or unparseable response). Consumers must treat null as "no opinion"
 * and never as "walled".
 */
export async function getTeamAccessClient(
  userId: string,
  options: { force?: boolean } = {}
): Promise<TeamAccessClientSnapshot | null> {
  if (!userId) return null;

  if (!options.force && cache && cache.userId === userId) {
    if (Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.snapshot;
  }

  if (inFlight && inFlight.userId === userId && !options.force) {
    return inFlight.promise;
  }

  const promise = fetchTeamAccess().then((snapshot) => {
    cache = { userId, snapshot, fetchedAt: Date.now() };
    inFlight = null;
    return snapshot;
  });

  inFlight = { userId, promise };
  return promise;
}

/** The cached answer without triggering a fetch, for a first synchronous paint. */
export function peekTeamAccessClient(userId: string): TeamAccessClientSnapshot | null {
  if (!cache || cache.userId !== userId) return null;
  if (Date.now() - cache.fetchedAt >= CACHE_TTL_MS) return null;
  return cache.snapshot;
}
