'use client';

import { useState } from 'react';
import { Loader2, Plug } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { panelClass } from '@/components/settings/panelClass';
import {
  MCP_CONNECT_ENABLED,
  describeMcpConnection,
  isMcpConnectionRevocable,
  type McpConnection,
} from '@/lib/mcp-connections';
import { useMcpConnections } from './useMcpConnections';

/**
 * Connected apps — the outside AI tools that can read and update this account's
 * releases (2026-08-25).
 *
 * Sits in Settings → Account rather than Team, and that placement is a real
 * decision: an MCP connection is approved by one person, resolves to one
 * account, and is not shared with a team the way an invite link is. Somebody
 * else on the roster connecting claude.ai has nothing to do with you.
 *
 * There is no "connect" button here, and there cannot be one: a connection can
 * only ever begin at the app doing the connecting, which sends the user to the
 * consent screen. So this section is exactly one thing — the list, and the way
 * out. Which is the half the founder key never had; .env.example used to say
 * "there is no revocation UI".
 */
export function McpConnectionsSection() {
  const user = useAuthStore((state) => state.user);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

  // Hooks above every early return — the section self-gates like its siblings,
  // but a conditional hook call would break the rules of hooks.
  const { connections, isLoading, error, degraded, revoke } = useMcpConnections(Boolean(user));

  if (!MCP_CONNECT_ENABLED) return null;
  if (!user) return null;

  const handleRevoke = async (id: string) => {
    setPendingRevokeId(id);
    await revoke(id);
    setPendingRevokeId(null);
  };

  const live = connections.filter((connection) => connection.state !== 'revoked');
  const past = connections.filter((connection) => connection.state === 'revoked');

  return (
    <section id="connected-apps" className={`${panelClass} scroll-mt-24`}>
      <h2 className="mb-1 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        <Plug className="h-3.5 w-3.5" aria-hidden="true" />
        Connected apps
      </h2>
      <p className="mb-5 max-w-prose text-sm leading-6 text-content-secondary">
        AI apps you have let into your releases. They can see your releases, your activities
        and your notes, and add or change them — they cannot delete anything. Connect one from
        the app itself, and disconnect it here any time.
      </p>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error"
        >
          {error}
        </p>
      ) : null}

      {degraded ? (
        <p className="mb-4 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          Connecting apps is not set up in this environment yet.
        </p>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-[72px] animate-pulse rounded-lg bg-bg-elevated" />
          <div className="h-[72px] animate-pulse rounded-lg bg-bg-elevated" />
        </div>
      ) : connections.length === 0 ? (
        <p className="text-sm text-content-tertiary">
          Nothing connected yet. In Claude or ChatGPT, add Urganize as a connector and it will
          bring you here to say yes.
        </p>
      ) : (
        <div className="space-y-4">
          {live.length ? (
            <div className="space-y-2">
              {live.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  isRevoking={pendingRevokeId === connection.id}
                  onRevoke={() => void handleRevoke(connection.id)}
                />
              ))}
            </div>
          ) : null}

          {past.length ? (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
                Disconnected
              </h3>
              {past.map((connection) => (
                <ConnectionRow key={connection.id} connection={connection} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ConnectionRow({
  connection,
  isRevoking,
  onRevoke,
}: {
  connection: McpConnection;
  isRevoking?: boolean;
  /** Absent for a connection that is already disconnected — nothing left to do. */
  onRevoke?: () => void;
}) {
  const revocable = isMcpConnectionRevocable(connection.state) && Boolean(onRevoke);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-content-primary">
          {connection.clientName}
        </p>
        <p className="mt-0.5 text-xs text-content-tertiary">
          {describeMcpConnection(connection)}
        </p>
      </div>
      {/* A disconnected row keeps its place — so somebody can see they turned it
          off rather than wondering where it went — and loses the control, because
          the one thing that must not happen is a button that quietly does
          nothing. The TeamLoginsSection treatment. */}
      {revocable ? (
        <button
          type="button"
          onClick={onRevoke}
          disabled={isRevoking}
          className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-status-error disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRevoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Disconnect
        </button>
      ) : null}
    </div>
  );
}
