'use client';

import { useCallback, useEffect, useState } from 'react';

import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import type { WorkspaceMember } from '@/types/auth';
import {
  SETTINGS_CACHE_VERSION,
  TEAMMATES_CACHE_KEY,
  isTeammatesCache,
  type TeammatesCache,
} from './settings-cache';

export type TeammatesState = {
  teammates: WorkspaceMember[];
  /** Already false when the per-user cache primed the list, so the section
   * renders real rows instead of its skeleton on a repeat visit. */
  isLoadingTeammates: boolean;
  /** Accepts a list the section mutated locally (invite, remove) and persists
   * it, so the cache can't fall behind the rendered state. */
  setTeammates: (next: WorkspaceMember[]) => void;
  /** Seat ceiling for this team, or null when it has none. Never read from the
   * cache: a ceiling changes when a plan changes, and painting a stale one
   * would tell a manager who just upgraded that they are still capped. */
  seatLimit: number | null;
  refetch: () => void;
};

/**
 * The teammates list, lifted out of SettingsPageClient (2026-08-13) when
 * Settings became tabbed and the page component was cut from 612 lines to a
 * shell. Pure mechanical move: same fetch, same cache keys, same guards.
 *
 * Still called unconditionally at page level, NOT inside the Team tab — the
 * fetch keeps firing on page mount exactly as it did before tabs, so switching
 * to Team is instant rather than paying a round trip on first open.
 *
 * Loads for EVERY account (founder decision, 2026-07-23): teammates see their
 * team read-only; TeammatesSection gates invite/remove internally.
 */
export function useTeammates(userId: string, accessToken: string): TeammatesState {
  const [teammates, setTeammatesState] = useState<WorkspaceMember[]>([]);
  const [isLoadingTeammates, setIsLoadingTeammates] = useState(false);
  // "Primed" = hydrated from the per-user cache; the section then renders real
  // content immediately and never shows its skeleton for this visit.
  const [primed, setPrimed] = useState(false);

  // Cache-first hydration: paint the last-known teammates for THIS user before
  // any fetch resolves. The loader below still runs and replaces them silently.
  useEffect(() => {
    if (!userId) return;
    const cache = readPersistedState<TeammatesCache>(
      TEAMMATES_CACHE_KEY,
      SETTINGS_CACHE_VERSION,
      isTeammatesCache
    );
    if (cache && cache.userId === userId) {
      setTeammatesState(cache.members);
      setPrimed(true);
    }
  }, [userId]);

  const setTeammates = useCallback(
    (next: WorkspaceMember[]) => {
      setTeammatesState(next);
      if (userId) {
        writePersistedState<TeammatesCache>(TEAMMATES_CACHE_KEY, SETTINGS_CACHE_VERSION, {
          userId,
          members: next,
        });
      }
    },
    [userId]
  );

  const [seatLimit, setSeatLimit] = useState<number | null>(null);

  const loadTeammates = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingTeammates(true);
    try {
      const response = await fetch('/api/workspace/members', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        members?: WorkspaceMember[];
        seatLimit?: number | null;
        error?: string;
      };
      if (response.ok && Array.isArray(payload.members)) {
        setTeammatesState(payload.members);
        // Deliberately NOT cached alongside members: a seat ceiling changes
        // when a plan changes, and painting a stale one would tell a manager
        // who just upgraded that they are still capped.
        setSeatLimit(typeof payload.seatLimit === 'number' ? payload.seatLimit : null);
        if (userId) {
          writePersistedState<TeammatesCache>(TEAMMATES_CACHE_KEY, SETTINGS_CACHE_VERSION, {
            userId,
            members: payload.members,
          });
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingTeammates(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    if (!userId || !accessToken) return;
    void loadTeammates();
  }, [userId, accessToken, loadTeammates]);

  // Stable identity so memoised consumers (TeammatesSection) don't re-render
  // every time the Settings shell does.
  const refetch = useCallback(() => {
    void loadTeammates();
  }, [loadTeammates]);

  return {
    teammates,
    isLoadingTeammates: isLoadingTeammates && !primed,
    setTeammates,
    seatLimit,
    refetch,
  };
}
