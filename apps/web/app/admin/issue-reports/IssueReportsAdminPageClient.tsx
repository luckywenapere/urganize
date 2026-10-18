'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';

// /admin/issue-reports — what users have told us is broken, and what Linear
// did or did not do with it.
//
// DELIBERATELY NOT FLAG-GATED (the /admin/teams precedent): access is
// ADMIN_EMAILS on the backing GET, and a report that failed to reach Linear
// has to stay visible whether or not the reporting feature is currently on.
//
// The Retry button is the whole reason the `failed` state is worth having: a
// report is saved before the Linear push is attempted, so a push that 502s
// costs nothing but a click here.

type ReportRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  status: string;
  context: Record<string, unknown> | null;
  linear_url: string | null;
  linear_identifier: string | null;
  sync_error: string | null;
  attempts: number;
  created_at: string | null;
};

type ReportsPayload = {
  reports: ReportRow[];
  counts: Record<string, number>;
  linearConfigured: boolean;
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Needs a retry' },
  { value: 'pending', label: 'Pending' },
  { value: 'synced', label: 'In Linear' },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

const STATUS_CLASS: Record<string, string> = {
  synced: 'border-brand/40 bg-brand/10 text-brand',
  pending: 'border-stroke-default bg-bg-elevated text-content-secondary',
  failed: 'border-status-error/40 bg-status-error/10 text-status-error',
};

const STATUS_LABEL: Record<string, string> = {
  synced: 'In Linear',
  pending: 'Pending',
  failed: 'Failed',
};

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
};

const contextLine = (context: Record<string, unknown> | null): string => {
  if (!context) return '—';
  const parts = [context.reporterName, context.reporterEmail, context.workspaceName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  return parts.length > 0 ? parts.join(' · ') : '—';
};

export default function IssueReportsAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<ReportsPayload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const load = useCallback(
    async (options: { asGate?: boolean } = {}) => {
      setError(null);
      try {
        const token = await getAccessToken();
        if (!token) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const response = await fetch('/api/admin/issue-reports', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as Partial<ReportsPayload> & {
          error?: string;
        };
        if (!response.ok) {
          setError(body.error || 'Could not load reports.');
          return;
        }
        setPayload({
          reports: body.reports || [],
          counts: body.counts || {},
          linearConfigured: Boolean(body.linearConfigured),
        });
        setChecked(true);
      } catch {
        setError('Could not load reports.');
      }
    },
    [getAccessToken, router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true });
  }, [authLoading, user, router, load]);

  const retry = useCallback(
    async (reportId: string) => {
      setBusyId(reportId);
      setError(null);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Session expired.');
        const response = await fetch('/api/admin/issue-reports', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: reportId }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
          status?: string;
        };
        if (!response.ok) throw new Error(result.error || 'That did not work.');
        if (result.status === 'failed') {
          setError(result.error || 'Linear refused it again.');
        }
        await load();
      } catch (retryError) {
        setError(retryError instanceof Error ? retryError.message : 'That did not work.');
      } finally {
        setBusyId(null);
      }
    },
    [getAccessToken, load]
  );

  const visible = useMemo(() => {
    const reports = payload?.reports || [];
    if (filter === 'all') return reports;
    return reports.filter((report) => report.status === filter);
  }, [filter, payload]);

  if (authLoading || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-32"
        statCards={{ count: 3, gridClassName: 'grid-cols-1 sm:grid-cols-3' }}
        tallyRows={[FILTERS.length]}
        table={{ columns: 6, rows: 6 }}
      />
    );
  }

  const counts = payload?.counts || {};
  const total = (payload?.reports || []).length;

  return (
    <div>
      <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Reports</h1>
      <p className="mt-2 max-w-2xl text-sm text-content-secondary">
        Bugs and requests filed from inside the app. Each one is saved here first, then pushed to
        Linear.
        {payload && !payload.linearConfigured
          ? ' Linear is not configured on this environment, so everything below is waiting.'
          : ''}
      </p>

      {error ? (
        <p role="alert" className="mt-4 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Reports', value: total },
          { label: 'In Linear', value: counts.synced || 0 },
          { label: 'Needs a retry', value: (counts.failed || 0) + (counts.pending || 0) },
        ].map((card) => (
          <div key={card.label} className="border border-stroke-default bg-bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
              {card.label}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-content-primary">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === option.value
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-stroke-default text-content-secondary hover:border-stroke-strong'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {visible.length === 0 ? (
          <p className="border border-stroke-default bg-bg-surface p-6 text-sm text-content-secondary">
            Nothing here yet.
          </p>
        ) : (
          visible.map((report) => (
            <article key={report.id} className="border border-stroke-default bg-bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        STATUS_CLASS[report.status] || STATUS_CLASS.pending
                      }`}
                    >
                      {STATUS_LABEL[report.status] || report.status}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
                      {report.kind}
                    </span>
                    <span className="text-xs text-content-tertiary">
                      {formatDate(report.created_at)}
                    </span>
                  </div>
                  <h2 className="mt-2 font-display text-base font-semibold text-content-primary">
                    {report.title}
                  </h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-content-secondary">
                    {report.body}
                  </p>
                  <p className="mt-2 text-xs text-content-tertiary">{contextLine(report.context)}</p>
                  {report.sync_error ? (
                    <p className="mt-2 text-xs text-status-error">
                      {report.sync_error}
                      {report.attempts > 0 ? ` · ${report.attempts} attempt(s)` : ''}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {report.linear_url ? (
                    <a
                      href={report.linear_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-stroke-default px-3 py-1.5 text-xs font-semibold text-content-primary hover:border-brand"
                    >
                      {report.linear_identifier || 'Open in Linear'}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void retry(report.id)}
                      disabled={busyId === report.id}
                      className="rounded-lg border border-stroke-default px-3 py-1.5 text-xs font-semibold text-content-primary hover:border-brand disabled:opacity-55"
                    >
                      {busyId === report.id ? 'Retrying...' : 'Retry'}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
