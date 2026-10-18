'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { InfoTip } from '@/components/shared/HelpTip';
import type { ClaimsQueue } from '@/lib/claim-admin-server';
import type { SweepReport } from '@/lib/claim-sweep-server';

// /admin/claims: the claim flow's queue (Profiles and Directory spec, Lane A).
//
//   - Removal requests, with how long each has left of its three days.
//   - Unclaimed profiles, with where each claim link stands.
//   - The daily profile creation: read a preview first, run it once if it
//     looks right, then switch the daily run on.
//
// Same gate and load pattern as /admin/directory: the backing route's 401 or
// 403 is the real gate, and everything here is act-on-it, not read-only, so
// each action asks the route again.

const URGENCY_LABEL = { overdue: 'Overdue', due_soon: 'Due soon', on_track: 'On track' } as const;
const URGENCY_CLASS = {
  overdue: 'border-status-error/40 text-status-error',
  due_soon: 'border-status-warning/40 text-status-warning',
  on_track: 'border-stroke-control text-content-secondary',
} as const;

const dateFormat = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const INVITE_LABEL: Record<string, string> = {
  open: 'Link made',
  used: 'Claimed',
  revoked: 'Link turned off',
  expired: 'Link ran out',
  locked: 'Link locked',
};

export default function ClaimsAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [queue, setQueue] = useState<ClaimsQueue | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SweepReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;
    return fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
      cache: 'no-store',
    });
  }, []);

  const load = useCallback(
    async (options: { asGate?: boolean } = {}) => {
      setError(null);
      try {
        const response = await authed('/api/admin/claims');
        if (!response || response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        if (!response.ok) {
          setError('Could not load the claims queue.');
          return;
        }
        setQueue((await response.json()) as ClaimsQueue);
        setChecked(true);
      } catch {
        setError('Could not load the claims queue.');
      }
    },
    [authed, router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true });
  }, [authLoading, user, router, load]);

  async function act(key: string, path: string, init: RequestInit): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const response = await authed(path, init);
      if (!response || !response.ok) {
        const body = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
        setError(body?.error || 'That did not work. Try again.');
        return false;
      }
      return true;
    } catch {
      setError('Could not reach the server.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function sweep(mode: 'dry' | 'run') {
    setBusy(mode);
    setError(null);
    try {
      const response = await authed('/api/admin/claims', { method: 'POST', body: JSON.stringify({ mode }) });
      if (!response || !response.ok) {
        setError('Could not run it. Try again.');
        return;
      }
      setReport((await response.json()) as SweepReport);
      if (mode === 'run') void load();
    } finally {
      setBusy(null);
    }
  }

  if (authLoading || !checked || !queue) {
    return (
      <AdminPageSkeleton titleWidth="w-32" descriptionLines={1} statCards={{ count: 3, gridClassName: 'sm:grid-cols-3' }} table={{ columns: 5, rows: 6 }} />
    );
  }

  return (
    <div>
      <div className="mt-2 flex items-center gap-2">
        <h1 className="font-display text-2xl font-semibold text-content-primary">Claims</h1>
        <InfoTip
          label="About claims"
          text="Credited people get a page they can claim. Answer removal requests within 3 days and watch who claims."
        />
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      {queue.unreadable.length > 0 ? (
        <p className="mt-4 text-sm text-status-warning">Not fully read: {queue.unreadable.join(', ')}.</p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Unclaimed" value={queue.unclaimed.length} />
        <Stat label="Removal requests" value={queue.removals.length} />
        <Stat label="Claimed, last 30 days" value={queue.claimedLast30Days} />
      </div>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Removal requests</h2>
        {queue.removals.length === 0 ? (
          <p className="mt-2 text-sm text-content-secondary">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {queue.removals.map((request) => (
              <li key={request.requestId} className="rounded-xl border border-stroke-default bg-bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-content-primary">{request.name}</p>
                  <span className={`rounded-full border px-3 py-1 text-xs ${URGENCY_CLASS[request.urgency]}`}>
                    {URGENCY_LABEL[request.urgency]}, due {dateFormat(request.dueAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-content-secondary">{request.contact}</p>
                {request.note ? <p className="mt-1 text-sm text-content-secondary">{request.note}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === request.requestId}
                    onClick={async () => {
                      if (await act(request.requestId, '/api/admin/claims', { method: 'PATCH', body: JSON.stringify({ action: 'remove', requestId: request.requestId }) })) void load();
                    }}
                    className="min-h-11 rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary disabled:opacity-60"
                  >
                    Remove for good
                  </button>
                  <button
                    type="button"
                    disabled={busy === request.requestId}
                    onClick={async () => {
                      if (await act(request.requestId, '/api/admin/claims', { method: 'PATCH', body: JSON.stringify({ action: 'dismiss', requestId: request.requestId }) })) void load();
                    }}
                    className="min-h-11 rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary disabled:opacity-60"
                  >
                    Not them. Show the page again
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-content-primary">Making profiles from credits</h2>
          <InfoTip
            label="About making profiles"
            text="Preview first. Nothing is written until you press Create. Switch the daily run on once the preview looks right."
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void sweep('dry')}
            className="min-h-11 rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary disabled:opacity-60"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy !== null || !report || !report.dryRun || report.wouldCreate + report.wouldLink === 0}
            onClick={() => {
              if (window.confirm(`Create ${report?.wouldCreate ?? 0} profiles now?`)) void sweep('run');
            }}
            className="min-h-11 rounded-full border border-stroke-control px-4 text-sm hover:border-content-secondary disabled:opacity-60"
          >
            Create these now
          </button>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={queue.sweepEnabled}
              onChange={async (event) => {
                if (await act('sweep', '/api/admin/claims', { method: 'PATCH', body: JSON.stringify({ action: 'sweep', enabled: event.target.checked }) })) void load();
              }}
              className="h-5 w-5"
            />
            Run every day
          </label>
        </div>
        {report ? (
          <div role="status" className="mt-3 rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
            <p className="font-medium text-content-primary">{report.dryRun ? 'Preview, nothing was written' : 'Done'}</p>
            <p className="mt-1">
              Credits looked at: {report.scanned}. {report.dryRun ? 'Would make' : 'Made'}{' '}
              {report.dryRun ? report.wouldCreate : report.created} profiles and link{' '}
              {report.dryRun ? report.wouldLink : report.linked} credits to profiles that already exist.
            </p>
            <p className="mt-1">
              Skipped: not out yet {report.skipped.not_delivered}, already have an account {report.skipped.has_account}, no usable contact{' '}
              {report.skipped.no_contact}.
              {report.truncated ? ' More credits are waiting past the limit of this run.' : ''}
              {report.deferred > 0 ? ` ${report.deferred} left for tomorrow.` : ''}
              {report.failed > 0 ? ` ${report.failed} could not be made.` : ''}
            </p>
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Unclaimed profiles</h2>
        {queue.unclaimed.length === 0 ? (
          <p className="mt-2 text-sm text-content-secondary">None yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-stroke-default">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-bg-surface text-xs uppercase tracking-wide text-content-tertiary">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Team</th>
                  <th className="px-4 py-2 font-medium">Credits</th>
                  <th className="px-4 py-2 font-medium">Claim link</th>
                  <th className="px-4 py-2 font-medium">Made</th>
                </tr>
              </thead>
              <tbody>
                {queue.unclaimed.map((row) => (
                  <tr key={row.personId} className="border-t border-stroke-default">
                    <td className="px-4 py-2 text-content-primary">
                      {row.slug && !row.removalRequested ? (
                        <Link href={`/p/${row.slug}`} className="underline underline-offset-4">
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                      {row.removalRequested ? <span className="ml-2 text-xs text-status-warning">Removal asked</span> : null}
                    </td>
                    <td className="px-4 py-2 text-content-secondary">{row.teamName}</td>
                    <td className="px-4 py-2 text-content-secondary">{row.credits}</td>
                    <td className="px-4 py-2 text-content-secondary">
                      {row.invite
                        ? `${INVITE_LABEL[row.invite.state] ?? row.invite.state}${row.invite.channel === 'email' && row.invite.sentAt ? `, emailed ${dateFormat(row.invite.sentAt)}` : ''}`
                        : 'Not sent'}
                    </td>
                    <td className="px-4 py-2 text-content-secondary">{dateFormat(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
      <p className="mt-1 font-display text-2xl text-content-primary">{value}</p>
    </div>
  );
}
