'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { Copy, RefreshCw } from '@/components/icons';
import { ScoreboardView } from '@/components/admin/ScoreboardView';
import { formatScoreboardForTeamGroup } from '@/lib/scoreboard-format';
import type { Scoreboard } from '@/lib/scoreboard';
import type { ScoreboardSource } from '@/lib/scoreboard-server';

// /admin/scoreboard — the scoreboard from the strategy doc
// (docs/strategy/company-strategy.md, sections 2 and 7), worked out from the
// database each time it loads. Read-only. Follows the /admin/urgans gate:
// authLoading -> no user -> /auth; the backing GET's 401/403 is the real gate.

type Payload = { scoreboard: Scoreboard; sources: ScoreboardSource[]; ourTeamsLeftOut?: number };

export default function ScoreboardAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<Payload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (options: { asGate?: boolean } = {}) => {
      setError(null);
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        // The first load may reuse a read the cockpit made a moment ago (one
        // read for both pages); Refresh always reads again.
        const response = await fetch(options.asGate ? '/api/admin/scoreboard' : '/api/admin/scoreboard?fresh=1', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as Partial<Payload> & {
          error?: string;
        };
        if (!response.ok || !body.scoreboard) {
          setError(body.error || 'Could not load the scoreboard.');
          setChecked(true);
          return;
        }
        setPayload({ scoreboard: body.scoreboard, sources: body.sources || [], ourTeamsLeftOut: body.ourTeamsLeftOut ?? 0 });
        setChecked(true);
      } catch {
        setError('Could not load the scoreboard.');
        setChecked(true);
      } finally {
        setLoading(false);
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
  }, [authLoading, user, router, load]);

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    []
  );

  const announce = (message: string) => {
    setStatus(message);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), 4000);
  };

  const copyForTeamGroup = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(formatScoreboardForTeamGroup(payload.scoreboard));
      announce('Copied. Paste it into the team group.');
    } catch {
      announce('Could not copy. Select the numbers and copy them by hand.');
    }
  };

  if (authLoading || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-48"
        descriptionLines={2}
        statCards={{ count: 6, gridClassName: 'sm:grid-cols-3' }}
        table={{ columns: 9, rows: 6 }}
      />
    );
  }

  const board = payload?.scoreboard;

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-content-tertiary">Admin</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-content-primary">Scoreboard</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="motion-focus inline-flex h-9 items-center gap-2 rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm text-content-secondary transition-colors hover:bg-bg-hover disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? 'Loading' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => void copyForTeamGroup()}
            disabled={!board}
            className="motion-focus inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-sm font-medium text-content-inverse transition-colors hover:bg-brand/90 disabled:opacity-60"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy for the team group
          </button>
        </div>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        The numbers from the strategy doc, worked out from the database each time this page
        loads. KB posts them every Friday and the Monday review starts here.
      </p>

      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-content-secondary">
        {status}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error"
        >
          {error}
        </p>
      ) : null}

      {board ? <ScoreboardView board={board} sources={payload?.sources ?? []} ourTeamsLeftOut={payload?.ourTeamsLeftOut ?? 0} /> : null}
    </div>
  );
}
