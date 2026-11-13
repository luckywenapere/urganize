'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import type { EmailAdminSummary, EmailLogRow } from '@/lib/email/admin-summary';
import { EMAIL_PROBLEM_STATUSES, emailKindLine, emailStatusLabel, emailTemplateLabel } from '@/lib/email/kind-labels';
import { cn } from '@/lib/utils';

// /admin/emails — everything Urganize has emailed, what happened to it, and who
// is suppressed.
//
// DELIBERATELY NOT FLAG-GATED (the /admin/teams precedent): access is
// ADMIN_EMAILS on the backing GET. Read only; see the route for why lifting a
// suppression is not offered.
//
// Since 2026-11-12 (#1241, approved mock): one line per email in a table
// (When, Subject, To, Kind, Status), plain names for each kind and what set it
// off (lib/email/kind-labels.ts), and Problems as a filter with its count. The
// four counter tiles went; the delivered rate and the suppressed count moved
// into the line under the heading and the section below.

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


const STATUS_CLASS: Record<string, string> = {
  delivered: 'bg-brand/10 text-brand',
  sent: 'bg-bg-hover text-content-secondary',
  delayed: 'bg-status-warning/10 text-status-warning',
  failed: 'bg-status-error/10 text-status-error',
  bounced: 'bg-status-error/10 text-status-error',
  complained: 'bg-status-error/10 text-status-error',
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
      if (filter === 'problems') return EMAIL_PROBLEM_STATUSES.has(row.status);
      return row.status === filter;
    });
  }, [filter, template, payload]);

  if (authLoading || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-32"
        tallyRows={[FILTERS.length]}
        table={{ columns: 5, rows: 8 }}
      />
    );
  }

  const summary = payload?.summary;
  const suppressions = payload?.suppressions || [];
  const filterCount = (value: FilterValue): number => {
    const rows = payload?.log || [];
    if (value === 'all') return rows.length;
    if (value === 'problems') return rows.filter((row) => EMAIL_PROBLEM_STATUSES.has(row.status)).length;
    return rows.filter((row) => row.status === value).length;
  };
  const problems = filterCount('problems');

  return (
    <div>
      <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-content-primary">Emails</h1>
          <p className="mt-2 max-w-2xl text-sm text-content-secondary">
            Everything Urganize sent, newest first, and what happened to it after Resend took it.
            {summary ? (
              <>
                {' '}
                {problems === 0
                  ? 'None bounced or went to spam.'
                  : `${problems} ${problems === 1 ? 'had a problem' : 'had problems'}.`}
                {summary.deliveredRate !== null ? ` ${Math.round(summary.deliveredRate * 100)}% delivered.` : ''}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/admin/emails/sequence"
            className="motion-focus inline-flex h-10 items-center rounded-full border border-stroke-strong px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover"
          >
            Onboarding emails
          </Link>
          <Link
            href="/admin/emails/new"
            className="motion-focus motion-press inline-flex h-10 items-center rounded-full bg-content-primary px-4 text-sm font-semibold text-bg-base hover:opacity-90"
          >
            Write an email
          </Link>
        </div>
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
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {FILTERS.map((option) => {
              const count = filterCount(option.value);
              const on = filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  aria-pressed={on}
                  className={cn(
                    'motion-focus inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                    on
                      ? 'border-content-primary bg-content-primary font-semibold text-bg-base'
                      : 'border-stroke-default text-content-secondary hover:border-stroke-strong hover:text-content-primary'
                  )}
                >
                  {option.label}
                  {option.value === 'problems' && count > 0 ? (
                    <span className={cn('font-semibold tabular-nums', !on && 'text-status-error')}>{count}</span>
                  ) : null}
                </button>
              );
            })}
            <select
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              aria-label="Filter by kind of email"
              className="h-8 rounded-full border border-stroke-control bg-bg-surface px-3 text-sm text-content-secondary lg:ml-auto"
            >
              <option value="all">Every kind</option>
              {summary.byTemplate.map((entry) => (
                <option key={entry.template} value={entry.template}>
                  {emailTemplateLabel(entry.template)} ({entry.count})
                </option>
              ))}
            </select>
          </div>

          {visible.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-stroke-default bg-bg-surface p-6 text-sm text-content-secondary">
              {summary.total === 0
                ? 'No emails yet. The next one Urganize sends will show up here.'
                : 'Nothing matches that filter.'}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-stroke-default bg-bg-surface">
              <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[120px]" />
                  <col />
                  <col className="w-[24%]" />
                  <col className="w-[180px]" />
                  <col className="w-[120px]" />
                </colgroup>
                <thead className="border-b border-stroke-default">
                  <tr>
                    {['When', 'Subject', 'To', 'Kind', 'Status'].map((label) => (
                      <th key={label} scope="col" className="px-4 py-2.5 text-xs font-semibold text-content-tertiary">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const kind = emailKindLine(row);
                    return (
                      <tr key={row.id} className="border-t border-stroke-subtle align-top first:border-t-0">
                        <td className="whitespace-nowrap px-4 py-2.5 text-content-secondary">{formatDate(row.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <p className="truncate font-semibold text-content-primary" title={row.subject}>
                            {row.subject}
                          </p>
                          {row.error ? (
                            <p className="mt-0.5 break-words text-xs text-status-error">{row.error}</p>
                          ) : null}
                        </td>
                        <td className="truncate px-4 py-2.5 text-content-secondary" title={row.recipient}>
                          {row.recipient}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="truncate text-content-secondary">{kind.kind}</p>
                          {kind.trigger ? <p className="truncate text-xs text-content-tertiary">{kind.trigger}</p> : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                              STATUS_CLASS[row.status] || 'bg-bg-hover text-content-secondary'
                            )}
                          >
                            {emailStatusLabel(row.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {payload?.truncated ? (
            <p className="mt-2 text-xs text-content-tertiary">
              Showing the newest {summary.total}. Older emails are in the database.
            </p>
          ) : null}
        </>
      ) : null}

      <h2 className="mt-10 font-display text-lg font-semibold text-content-primary">
        Suppressed addresses{suppressions.length ? <span className="ml-2 text-content-tertiary tabular-nums">{suppressions.length}</span> : null}
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
