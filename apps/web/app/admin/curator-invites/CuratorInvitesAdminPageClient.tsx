'use client';

// Minting and tracking playlist owner invite links. Curator access is
// invite-only, so this page is the only door into that side of the product.
//
// The gate is the page's own GET (verifyAdmin / ADMIN_EMAILS): a 401 or 403
// bounces to /dashboard, the same shape as every other admin page client.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Plus, Slash } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import type { CuratorInvite, CuratorInviteState } from '@/types/pitching';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

const STATE_LABELS: Record<CuratorInviteState, string> = {
  active: 'Open',
  used: 'Used',
  revoked: 'Turned off',
  expired: 'Expired',
};

const stateClass = (state: CuratorInviteState): string => {
  const base =
    'inline-flex h-6 items-center rounded-full px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]';
  if (state === 'active') return `${base} bg-brand/15 text-brand`;
  if (state === 'used') return `${base} bg-status-info/15 text-status-info`;
  return `${base} bg-bg-elevated text-content-secondary`;
};

// 'Never' rather than a dash: expires_at is nullable and null genuinely means
// the link has no expiry, which a placeholder character would not say.
const formatDate = (value: string | null): string => {
  if (!value) return 'Never';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return 'Unknown';
  }
};

export default function CuratorInvitesAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [invites, setInvites] = useState<CuratorInvite[]>([]);
  const [ttlDays, setTtlDays] = useState(14);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [isMinting, setIsMinting] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(
    async (opts?: { asGate?: boolean }) => {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/admin/curator-invites', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          if (opts?.asGate && (response.status === 401 || response.status === 403)) {
            router.replace('/dashboard');
            return;
          }
          // A 404 here means the pitching flag is off, which is a real answer
          // rather than an error: say so plainly.
          if (response.status === 404) {
            setError('Playlist pitching is switched off, so there is nothing to invite anyone to.');
            setChecked(true);
            return;
          }
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || 'Could not load the invites.');
          setChecked(true);
          return;
        }
        const payload = (await response.json().catch(() => null)) as {
          invites?: CuratorInvite[];
          ttlDays?: number;
        } | null;
        if (payload?.invites) {
          setInvites(payload.invites);
          if (typeof payload.ttlDays === 'number') setTtlDays(payload.ttlDays);
          setError('');
        }
        setChecked(true);
      } catch (loadError) {
        if (opts?.asGate) {
          router.replace('/dashboard');
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Could not load the invites.');
        setChecked(true);
      }
    },
    [router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true });
  }, [authLoading, load, router, user]);

  const handleMint = async () => {
    setError('');
    setIsMinting(true);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/curator-invites', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => null)) as {
        invite?: CuratorInvite;
        error?: string;
      } | null;
      if (!response.ok || !payload?.invite) {
        setError(payload?.error || 'Could not create the invite.');
        return;
      }
      setInvites((current) => [payload.invite as CuratorInvite, ...current]);
      await copyLink(payload.invite);
    } finally {
      setIsMinting(false);
    }
  };

  const copyLink = async (invite: CuratorInvite) => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopiedId(invite.id);
      window.setTimeout(() => setCopiedId(''), 2000);
    } catch {
      // Clipboard can be blocked. The link is on screen either way.
      setError('Could not copy. Select the link and copy it by hand.');
    }
  };

  const handleRevoke = async (invite: CuratorInvite) => {
    setError('');
    setBusyId(invite.id);
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/admin/curator-invites/${encodeURIComponent(invite.id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || 'Could not turn off the link.');
        return;
      }
      await load();
    } finally {
      setBusyId('');
    }
  };

  if (authLoading || !checked) {
    return (
      <AdminPageSkeleton titleWidth="w-56" descriptionLines={2} table={{ columns: 5, rows: 4 }} />
    );
  }

  const openCount = invites.filter((invite) => invite.state === 'active').length;
  const usedCount = invites.filter((invite) => invite.state === 'used').length;

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Playlist owners</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Playlist owners can only join through a link you create here. Each link works once
        then closes. Links expire after {ttlDays} days. Send them yourself: nothing is emailed
        from the app.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleMint()}
          disabled={isMinting}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {isMinting ? 'Creating…' : 'Create a link'}
        </button>
        <span className="font-mono text-xs text-content-tertiary">
          {openCount} open · {usedCount} used
        </span>
      </div>

      {invites.length === 0 ? (
        <p className="mt-6 rounded-lg border border-stroke-default bg-bg-surface px-4 py-6 text-center text-sm text-content-secondary">
          No links yet. Create one then send it to a playlist owner.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-stroke-default">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="bg-bg-surface font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
              <tr>
                <th className="px-4 py-3 font-semibold">Link</th>
                <th className="px-4 py-3 font-semibold">State</th>
                <th className="px-4 py-3 font-semibold">Used by</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Expires</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-subtle">
              {invites.map((invite) => (
                <tr key={invite.id}>
                  <td className="px-4 py-3">
                    <code className="font-mono text-xs text-content-primary">{invite.code}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span className={stateClass(invite.state)}>{STATE_LABELS[invite.state]}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">
                    {invite.usedByName || 'Nobody yet'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">
                    {formatDate(invite.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">
                    {formatDate(invite.expiresAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void copyLink(invite)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default px-2.5 text-xs font-semibold text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary"
                      >
                        {copiedId === invite.id ? (
                          <Check className="h-3.5 w-3.5 text-brand" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedId === invite.id ? 'Copied' : 'Copy link'}
                      </button>
                      {invite.state === 'active' ? (
                        <button
                          type="button"
                          disabled={busyId === invite.id}
                          onClick={() => void handleRevoke(invite)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default px-2.5 text-xs font-semibold text-content-secondary transition-colors hover:border-status-error/40 hover:text-status-error disabled:opacity-50"
                        >
                          <Slash className="h-3.5 w-3.5" />
                          Turn off
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
