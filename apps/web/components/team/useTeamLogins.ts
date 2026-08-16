'use client';

import { useCallback, useEffect, useState } from 'react';
import { TEAM_LOGINS_ENABLED, type TeamLogin } from '@/lib/team-logins';
import { errorMessage } from '@/lib/errors';
import { getAccessToken } from '@/components/settings/getAccessToken';

export type TeamLoginsState = {
  logins: TeamLogin[];
  isLoading: boolean;
  error: string;
  /** True when the API answered but the table/columns aren't migrated yet, so
   * the section can say "not available in this environment" rather than
   * silently pretending the manager has never made a link. */
  degraded: boolean;
  /** Mints a link and refetches. Resolves once the list reflects it; the new
   * row is read from `logins`, not returned, because the POST hands back a URL
   * without the row id that revoke needs. */
  generate: (input: { label?: string }) => Promise<void>;
  revoke: (id: string) => Promise<boolean>;
  refetch: () => void;
};

const EMPTY: TeamLogin[] = [];

/**
 * The workspace's sign-in links. Deliberately NOT a Zustand store and NOT
 * cache-primed the way useTeammates is: a login link is a live credential-ish
 * object, and painting a stale one from localStorage could show a manager a
 * link they revoked on another device and have them paste it into WhatsApp.
 * A short spinner is the right trade for always-true state here — the same
 * reasoning that keeps the capture scene's leads out of persisted storage.
 *
 * Fetches its own access token per call, matching the click handlers in
 * TeammatesSection alongside it.
 */
export function useTeamLogins(enabled: boolean): TeamLoginsState {
  const [logins, setLogins] = useState<TeamLogin[]>(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [degraded, setDegraded] = useState(false);

  const active = enabled && TEAM_LOGINS_ENABLED;

  const load = useCallback(async () => {
    if (!active) return;
    setIsLoading(true);
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/workspace/invite-link', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        logins?: TeamLogin[];
        degraded?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Could not load team logins.');
      setLogins(Array.isArray(payload.logins) ? payload.logins : EMPTY);
      setDegraded(payload.degraded === true);
    } catch (err) {
      setError(errorMessage(err, 'Could not load team logins.'));
    } finally {
      setIsLoading(false);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  const generate = useCallback(
    async (input: { label?: string }): Promise<void> => {
      setError('');
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Session expired. Please sign in again.');
        const response = await fetch('/api/workspace/invite-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ label: input.label || undefined }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          inviteUrl?: string;
          error?: string;
        };
        if (!response.ok || !payload.inviteUrl) {
          throw new Error(payload.error || 'Could not create a login.');
        }
        // Refetch rather than splicing the response in: the POST returns the
        // URL but not the row id, and the id is what revoke needs.
        await load();
      } catch (err) {
        setError(errorMessage(err, 'Could not create a login.'));
      }
    },
    [load]
  );

  const revoke = useCallback(async (id: string): Promise<boolean> => {
    setError('');
    // Optimistic: flip the row to revoked immediately so a manager who just
    // realised they sent a link to the wrong person sees it die on the spot.
    // Rolled back below if the request fails.
    let previous: TeamLogin[] = EMPTY;
    setLogins((current) => {
      previous = current;
      return current.map((login) =>
        login.id === id ? { ...login, state: 'revoked' as const } : login
      );
    });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`/api/workspace/invite-link/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not revoke that login.');
      return true;
    } catch (err) {
      setLogins(previous);
      setError(errorMessage(err, 'Could not revoke that login.'));
      return false;
    }
  }, []);

  return {
    logins,
    isLoading,
    error,
    degraded,
    generate,
    revoke,
    refetch: () => void load(),
  };
}
