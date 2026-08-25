'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { MCP_CONNECT_ENABLED, type McpConnection } from '@/lib/mcp-connections';

export type McpConnectionsState = {
  connections: McpConnection[];
  isLoading: boolean;
  error: string;
  /** The API answered but the table isn't migrated here yet. */
  degraded: boolean;
  revoke: (id: string) => Promise<boolean>;
  refetch: () => void;
};

const EMPTY: McpConnection[] = [];

/**
 * The apps this user has connected.
 *
 * Deliberately NOT cache-primed to localStorage the way useTeammates is — the
 * useTeamLogins reasoning, one step stronger. Painting a stale list could show
 * somebody a connection they revoked on another device and let them believe an
 * app still has access, or the reverse. A short spinner is the right trade for
 * always-true state about who can read your releases.
 */
export function useMcpConnections(enabled: boolean): McpConnectionsState {
  const [connections, setConnections] = useState<McpConnection[]>(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [degraded, setDegraded] = useState(false);

  const active = enabled && MCP_CONNECT_ENABLED;

  const load = useCallback(async () => {
    if (!active) return;
    setIsLoading(true);
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/mcp/connections', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        connections?: McpConnection[];
        degraded?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Could not load connected apps.');
      setConnections(Array.isArray(payload.connections) ? payload.connections : EMPTY);
      setDegraded(payload.degraded === true);
    } catch (err) {
      setError(errorMessage(err, 'Could not load connected apps.'));
    } finally {
      setIsLoading(false);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  const revoke = useCallback(async (id: string): Promise<boolean> => {
    setError('');
    // Optimistic, then rolled back on failure. Somebody disconnecting an app
    // they just thought better of should see it die on the spot — the
    // useTeamLogins pattern.
    let previous: McpConnection[] = EMPTY;
    setConnections((current) => {
      previous = current;
      return current.map((connection) =>
        connection.id === id ? { ...connection, state: 'revoked' as const } : connection
      );
    });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`/api/mcp/connections/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not disconnect that app.');
      return true;
    } catch (err) {
      setConnections(previous);
      setError(errorMessage(err, 'Could not disconnect that app.'));
      return false;
    }
  }, []);

  return { connections, isLoading, error, degraded, revoke, refetch: () => void load() };
}
