'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import type { EmailAdminSummary, EmailLogRow } from '@/lib/email/admin-summary';

// /admin/emails — everything Urganize has emailed, what happened to it, and who
// is suppressed.
//
// DELIBERATELY NOT FLAG-GATED (the /admin/teams precedent): access is
// ADMIN_EMAILS on the backing GET. Read only; see the route for why lifting a
// suppression is not offered.

type SuppressionRow = {
  id: string;
  email: string;
  scope: string;
  reason: string;
  created_at: string | null;
};

type EmailsPayload = {
  log: EmailLogRow[] | null;
  logError: string | null;
  summary: EmailAdminSummary | null;
  truncated: boolean;
  suppressions: SuppressionRow[] | null;
  suppressionsError: string | null;
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'problems', label: 'Problems' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'sent', label: 'Sent' },
  { value: 'skipped', label: 'Skipped' },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

const PROBLEM_STATUSES = new Set(['failed', 'bounced', 'complained']);

const STATUS_CLASS: Record<string, string> = {
  delivered: 'border-brand/40 bg-brand/10 text-brand',
  sent: 'border-stroke-default bg-bg-elevated text-content-secondary',
  delayed: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
  failed: 'border-status-error/40 bg-status-error/10 text-status-error',
  bounced: 'border-status-error/40 bg-status-error/10 text-status-error',
  complained: 'border-status-error/40 bg-status-error/10 text-status-error',
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

const percent = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

export default function EmailsAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<EmailsPayload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [template, setTemplate] = useState('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.replace('/dashboard');
        return;
      }
      const response = await fetch('/api/admin/emails', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.status === 401 || response.status === 403) {
        router.replace('/dashboard');
        return;
      }
      const body = (await response.json().catch(() => ({}))) as Partial<EmailsPayload> & {
        error?: string;
      };
      if (!response.ok) {
        setError(body.error || 'Could not load emails.');
        return;
      }
      setPayload({
        log: body.log ?? null,
        logError: body.logError ?? null,
        summary: body.summary ?? null,
        truncated: Boolean(body.truncated),
        suppressions: body.suppressions ?? null,
        suppressionsError: body.suppressionsError ?? null,
      });
      setChecked(true);
    } catch {
      setError('Could not load emails.');
    }
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load();
  }, [authLoading, user, router, load]);

  const visible = useMemo(() => {
    const rows = payload?.log || [];
    return rows.filter((row) => {
      if (template !== 'all' && row.template !== template) return false;
      if (filter === 'all') return true;
      if (filter === 'problems') return PROBLEM_STATUSES.has(row.status);
      return row.status === filter;
    });
  }, [filter, template, payload]);

  if (authLoading || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-32"
        statCards={{ count: 4, gridClassName: 'grid-cols-2 sm:grid-cols-4' }}
        tallyRows={[FILTERS.length]}
        table={{ columns: 5, rows: 8 }}
      />
    );
  }

  const summary = payload?.summary;
  const suppressions = payload?.suppressions || [];

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Emails</h1>
      <p className="mt-2 max-w-2xl text-sm text-content-secondary">
        Every email Urganize sends, newest first, and what happened to it after Resend took it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/emails/new"
          className="motion-focus motion-press inline-flex items-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
        >
          Write an email
        </Link>
        <Link
          href="/admin/emails/sequence"
          className="motion-focus inline-flex items-center rounded-full border border-stroke-default px-4 py-2 text-sm font-medium text-content-primary hover:border-stroke-strong"
        >
          Onboarding emails
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mt-4 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {payload?.logError ? (
        <p role="alert" className="mt-4 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          Could not read the send log: {payload.logError}
        </p>
      ) : null}

      {summary ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Recent emails', value: String(summary.total) },
              { label: 'Delivered', value: percent(summary.deliveredRate) },
              { label: 'Bounced or spam', value: String(summary.problems) },
              { label: 'Suppressed addresses', value: String(suppressions.length) },
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
          {payload?.truncated ? (
            <p className="mt-2 text-xs text-content-tertiary">
              Showing the newest {summary.total}. Older emails are in the database.
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-2">
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
            <select
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              aria-label="Filter by email type"
              className="rounded-full border border-stroke-control bg-bg-surface px-3 py-1.5 text-xs font-semibold text-content-secondary"
            >
              <option value="all">All types</option>
              {summary.byTemplate.map((entry) => (
                <option key={entry.template} value={entry.template}>
                  {entry.template} ({entry.count})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-2">
            {visible.length === 0 ? (
              <p className="border border-stroke-default bg-bg-surface p-6 text-sm text-content-secondary">
                {summary.total === 0
                  ? 'No emails yet. The next one Urganize sends will show up here.'
                  : 'Nothing matches that filter.'}
              </p>
            ) : (
              visible.map((row) => (
                <article
                  key={row.id}
                  className="border border-stroke-default bg-bg-surface p-3 sm:p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        STATUS_CLASS[row.status] ||
                        'border-stroke-default bg-bg-elevated text-content-secondary'
                      }`}
                    >
                      {row.status}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
                      {row.template}
                    </span>
                    <span className="text-xs text-content-tertiary">
                      {formatDate(row.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-content-primary">{row.subject}</p>
                  <p className="mt-0.5 break-all text-xs text-content-secondary">
                    To {row.recipient} · {row.trigger}
                  </p>
                  {row.error ? (
                    <p className="mt-1 break-words text-xs text-status-error">{row.error}</p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </>
      ) : null}

      <h2 className="mt-10 font-display text-lg font-semibold text-content-primary">
        Suppressed addresses
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-content-secondary">
        People who unsubscribed, and addresses that bounced or marked a message as spam. Optional
        email is never sent to these. Emails about someone&rsquo;s account or team still are.
      </p>
      {payload?.suppressionsError ? (
        <p role="alert" className="mt-3 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          Could not read suppressions: {payload.suppressionsError}
        </p>
      ) : suppressions.length === 0 ? (
        <p className="mt-3 border border-stroke-default bg-bg-surface p-6 text-sm text-content-secondary">
          Nobody yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {suppressions.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-stroke-default bg-bg-surface p-3 text-sm"
            >
              <span className="break-all text-content-primary">{row.email}</span>
              <span className="text-xs text-content-secondary">
                {row.reason} · {row.scope === 'all' ? 'all optional email' : row.scope}
              </span>
              <span className="text-xs text-content-tertiary">{formatDate(row.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
