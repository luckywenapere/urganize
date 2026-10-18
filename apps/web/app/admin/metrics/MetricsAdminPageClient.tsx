'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { RefreshCw } from '@/components/icons';
import { InfoTip } from '@/components/shared/HelpTip';
import { MetricsView } from '@/components/admin/MetricsView';
import { CockpitSlot } from '@/components/admin/CockpitSlot';
import { FunnelStrip } from '@/components/admin/FunnelStrip';
import { GrowthPanels } from '@/components/admin/GrowthPanels';
import type { AdminReadSource } from '@/lib/admin-read-server';
import type { UsageMetrics } from '@/lib/usage-metrics';
import { formatClock, timeAgo } from '@/lib/usage-metrics-format';

// /admin/metrics — who is using Urganize and how (2026-10-07). Worked out from
// the database on every load and refreshed every minute while the tab is on
// screen. Follows the scoreboard's gate: authLoading -> no user -> /auth; the
// backing GET's 401/403 is the real gate.

type Payload = {
  metrics: UsageMetrics;
  sources: AdminReadSource[];
  hiddenEmails: string[];
  includeTeam: boolean;
};

/** How often the page reloads its numbers while visible. */
const REFRESH_MS = 60 * 1000;
/** How often the "updated ... ago" words and relative times move. */
const TICK_MS = 15 * 1000;

export default function MetricsAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<Payload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [includeTeam, setIncludeTeam] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const loadedAt = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(
    async (options: { asGate?: boolean; team: boolean }) => {
      if (inFlight.current) return;
      inFlight.current = true;
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
        const response = await fetch(`/api/admin/metrics${options.team ? '?team=1' : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as Partial<Payload> & { error?: string };
        if (!response.ok || !body.metrics) {
          setError(body.error || 'Could not load the numbers.');
          setChecked(true);
          return;
        }
        setPayload({
          metrics: body.metrics,
          sources: body.sources ?? [],
          hiddenEmails: body.hiddenEmails ?? [],
          includeTeam: body.includeTeam === true,
        });
        setError(null);
        loadedAt.current = Date.now();
        setUpdatedAt(new Date(loadedAt.current).toISOString());
        setNow(new Date());
        setChecked(true);
      } catch {
        setError('Could not load the numbers.');
        setChecked(true);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [router]
  );

  // First load, which is also the gate.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true, team: false });
  }, [authLoading, user, router, load]);

  // Reload every minute while the page is on screen, and straight away on
  // coming back to it if the numbers are older than a minute.
  useEffect(() => {
    if (!checked) return;
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - loadedAt.current < REFRESH_MS - 1000) return;
      void load({ team: includeTeam });
    };
    const timer = window.setInterval(refreshIfStale, REFRESH_MS);
    const ticker = window.setInterval(() => setNow(new Date()), TICK_MS);
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(ticker);
      document.removeEventListener('visibilitychange', refreshIfStale);
    };
  }, [checked, includeTeam, load]);

  const toggleTeam = () => {
    const next = !includeTeam;
    setIncludeTeam(next);
    void load({ team: next });
  };

  if (authLoading || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-40"
        descriptionLines={1}
        statCards={{ count: 4, gridClassName: 'grid-cols-2 lg:grid-cols-4' }}
        chart
        table={{ columns: 8, rows: 6 }}
      />
    );
  }

  const metrics = payload?.metrics;
  const updated = payload ? updatedAt : null;
  const hidden = payload && !payload.includeTeam ? payload.hiddenEmails : [];

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-content-tertiary">Admin</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-2xl font-semibold text-content-primary">Metrics</h1>
          <InfoTip
            label="Metrics"
            text="Who is using Urganize right now and how, worked out from the database. It updates by itself every minute while this page is open. Our own team is left out unless you show it."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleTeam}
            aria-pressed={includeTeam}
            disabled={loading}
            className={`motion-focus inline-flex h-9 items-center rounded-lg border px-3 text-sm transition-colors disabled:opacity-60 ${
              includeTeam
                ? 'border-brand/50 bg-brand/10 text-content-primary'
                : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
            }`}
          >
            {includeTeam ? 'Showing our team' : 'Show our team'}
          </button>
          <button
            type="button"
            onClick={() => void load({ team: includeTeam })}
            disabled={loading}
            className="motion-focus inline-flex h-9 items-center gap-2 rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm text-content-secondary transition-colors hover:bg-bg-hover disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? 'Updating' : 'Refresh'}
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-content-secondary">
        {updated ? `Updated ${timeAgo(updated, now)} (${formatClock(updated)} Lagos time).` : null}
        {hidden.length > 0 ? ` Leaving out ${hidden.join(', ')}.` : ''}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error"
        >
          {payload ? `Could not update. Showing the numbers from ${formatClock(updated ?? '')}.` : error}
        </p>
      ) : null}

      {metrics ? <MetricsView metrics={metrics} sources={payload?.sources ?? []} now={now} /> : null}

      {/* Moved from the Overview (URG-369): the sign-up funnel. */}
      <CockpitSlot label="the sign-up funnel" skeletonClassName="h-32">
        {(cockpit) => (cockpit.funnels.length > 0 ? <FunnelStrip funnels={cockpit.funnels} /> : null)}
      </CockpitSlot>

      {/* Merged in from the old Growth page (URG-369): accounts per month and
          the waitlist per week. /admin/growth redirects here. */}
      <GrowthPanels />
    </div>
  );
}
