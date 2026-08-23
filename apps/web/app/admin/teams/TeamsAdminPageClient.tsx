'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';

// /admin/teams — the founder's billing console.
//
// This list is also the migration summary: one row per team, what state it is
// in, and when it walls. Reviewing it is step 2 of the activation checklist,
// before the flag is ever flipped.
//
// Follows the waitlist admin page's patterns: gate on the backing GET, stat
// cards, filter chips, per-row busy state, and a refetch after each action.
// Unlike waitlist this refetches rather than splicing, because one action can
// change several derived fields at once (state, wall date, plan, notes) and a
// stale row here is a row the founder might act on twice.

type TeamRow = {
  workspaceId: string;
  teamName: string | null;
  createdAt: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  state: string;
  reason: string;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  wallDate: string | null;
  comped: boolean;
  billingPlan: string | null;
  billingLockedAmount: number | null;
  billingNotes: string | null;
  subscriptionPlan: string | null;
  /** A Paystack swap this team is owed. See the API route's comment. */
  pendingPlan?: string | null;
  pendingChangeRequestedAt?: string | null;
  subscriptionStatus: string | null;
  allowlisted: boolean;
  grandfathered: boolean;
};

type TeamsPayload = {
  hardPaywallEnabled: boolean;
  stats: { total: number; counts: Record<string, number> };
  teams: TeamRow[];
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'trial', label: 'On trial' },
  { value: 'walled', label: 'Walled' },
  { value: 'read_only', label: 'Read only' },
  { value: 'paid', label: 'Paying' },
  { value: 'comped', label: 'Comped' },
  { value: 'deal', label: 'Founding / custom' },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

const STATE_LABEL: Record<string, string> = {
  paid: 'Paying',
  comped: 'Comped',
  trial: 'On trial',
  grace: 'Just lapsed',
  read_only: 'Read only',
  walled: 'Walled',
};

const STATE_CLASS: Record<string, string> = {
  paid: 'border-brand/40 bg-brand/10 text-brand',
  comped: 'border-status-info/40 bg-status-info/10 text-status-info',
  trial: 'border-stroke-default bg-bg-elevated text-content-secondary',
  grace: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
  read_only: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
  walled: 'border-status-error/40 bg-status-error/10 text-status-error',
};

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(ms)
  );
};

/** Amounts are stored in kobo. Shown in naira, because that is how the founder
 * talks about a deal. */
const formatKobo = (value: number | null): string => {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value / 100);
};

export default function TeamsAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<TeamsPayload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [query, setQuery] = useState('');
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
        const response = await fetch('/api/admin/teams', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as Partial<TeamsPayload> & {
          error?: string;
        };
        if (!response.ok) {
          setError(body.error || 'Could not load teams.');
          return;
        }
        setPayload({
          hardPaywallEnabled: Boolean(body.hardPaywallEnabled),
          stats: body.stats || { total: 0, counts: {} },
          teams: body.teams || [],
        });
        setChecked(true);
      } catch {
        setError('Could not load teams.');
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

  const runAction = useCallback(
    async (workspaceId: string, body: Record<string, unknown>) => {
      setBusyId(workspaceId);
      setError(null);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Session expired.');
        const response = await fetch('/api/admin/teams', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, ...body }),
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(result.error || 'That did not work.');
        await load();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'That did not work.');
      } finally {
        setBusyId(null);
      }
    },
    [getAccessToken, load]
  );

  const extendTrial = useCallback(
    (team: TeamRow) => {
      const raw = window.prompt(`Extend ${team.teamName || 'this team'} by how many days?`, '14');
      if (!raw) return;
      const days = Number(raw.trim());
      if (!Number.isInteger(days) || days < 1) {
        setError('Enter a whole number of days.');
        return;
      }
      void runAction(team.workspaceId, { action: 'extend_trial', days });
    },
    [runAction]
  );

  const setDeal = useCallback(
    (team: TeamRow, action: 'assign_founding' | 'set_custom_price') => {
      const label = action === 'assign_founding' ? 'Founding Member' : 'custom';
      const raw = window.prompt(
        `${label} rate for ${team.teamName || 'this team'}, in naira per period:`,
        team.billingLockedAmount ? String(team.billingLockedAmount / 100) : ''
      );
      if (!raw) return;
      const naira = Number(raw.trim());
      if (!Number.isFinite(naira) || naira <= 0) {
        setError('Enter an amount in naira.');
        return;
      }
      const note = window.prompt('Note for the record (optional):', team.billingNotes || '') || '';
      void runAction(team.workspaceId, {
        action,
        amountMinorUnit: Math.round(naira * 100),
        note,
      });
    },
    [runAction]
  );

  const markPaid = useCallback(
    (team: TeamRow) => {
      const plan =
        window.prompt(
          'Plan (monthly, annual, founding, custom):',
          team.billingPlan || 'annual'
        )?.trim() || '';
      if (!plan) return;
      const defaultNaira = team.billingLockedAmount ? String(team.billingLockedAmount / 100) : '';
      const rawAmount = window.prompt('Amount paid, in naira:', defaultNaira);
      if (!rawAmount) return;
      const naira = Number(rawAmount.trim());
      if (!Number.isFinite(naira) || naira <= 0) {
        setError('Enter an amount in naira.');
        return;
      }
      const rawDate = window.prompt('Access runs until (YYYY-MM-DD):', '');
      if (!rawDate) return;
      const note = window.prompt('Invoice reference or note:', '') || '';
      void runAction(team.workspaceId, {
        action: 'mark_paid',
        plan,
        amountMinorUnit: Math.round(naira * 100),
        expiresAt: new Date(`${rawDate.trim()}T00:00:00.000Z`).toISOString(),
        note,
      });
    },
    [runAction]
  );

  const teams = useMemo(() => {
    const all = payload?.teams || [];
    const needle = query.trim().toLowerCase();
    return all.filter((team) => {
      if (filter === 'deal' && !team.billingPlan) return false;
      if (filter === 'comped' && !team.comped) return false;
      if (
        filter !== 'all' &&
        filter !== 'deal' &&
        filter !== 'comped' &&
        team.state !== filter
      ) {
        return false;
      }
      if (!needle) return true;
      return (
        (team.teamName || '').toLowerCase().includes(needle) ||
        (team.ownerName || '').toLowerCase().includes(needle) ||
        (team.ownerEmail || '').toLowerCase().includes(needle)
      );
    });
  }, [payload?.teams, filter, query]);

  if (authLoading || !user || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-28"
        statCards={{ count: 3, gridClassName: 'grid-cols-1 sm:grid-cols-3' }}
        tallyRows={[FILTERS.length]}
        table={{ columns: 8, rows: 6 }}
      />
    );
  }

  const counts = payload?.stats.counts || {};

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-content-primary">Teams</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Every team, what it is on, and when it walls. Extend a trial, comp a team, record a
        Founding Member rate, or mark a deal paid when it settles by invoice.
      </p>

      {payload && !payload.hardPaywallEnabled ? (
        <p className="mt-4 rounded-lg border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-secondary">
          The wall is switched off right now, so nothing here is enforced yet. Trials and deals
          you set now take effect the moment it is switched on.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Teams', value: payload?.stats.total ?? 0 },
          { label: 'On trial', value: counts.trial ?? 0 },
          { label: 'Walled', value: counts.walled ?? 0 },
          // A lapsed PAYER, not a lapsed trialist. The most recoverable churn
          // in this list, which is why it gets its own number.
          { label: 'Read only', value: counts.read_only ?? 0 },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-stroke-default bg-bg-surface p-5"
          >
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-content-tertiary">
              {card.label}
            </p>
            <p className="mt-1 font-display text-3xl font-semibold text-content-primary">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const isActive = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                isActive
                  ? 'border-brand bg-brand/8 text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:border-stroke-strong hover:text-content-primary'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search team, owner or email"
          className="h-10 w-full max-w-sm rounded-lg border border-stroke-default bg-bg-elevated px-3 text-sm text-content-primary placeholder:text-content-tertiary outline-none focus:border-brand"
        />
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-stroke-default">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-bg-elevated text-content-tertiary">
            <tr>
              {['Team', 'Owner', 'State', 'Walls', 'Deal', 'Notes', 'Actions'].map((heading) => (
                <th key={heading} className="px-3 py-2 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.workspaceId} className="border-t border-stroke-subtle align-top">
                <td className="px-3 py-3">
                  <p className="font-medium text-content-primary">{team.teamName || 'Unnamed'}</p>
                  <p className="text-xs text-content-tertiary">
                    Created {formatDate(team.createdAt)}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="text-content-secondary">{team.ownerName || 'Unknown'}</p>
                  <p className="text-xs text-content-tertiary">{team.ownerEmail || '—'}</p>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                      STATE_CLASS[team.state] || STATE_CLASS.trial
                    }`}
                  >
                    {STATE_LABEL[team.state] || team.state}
                  </span>
                  {team.allowlisted ? (
                    <p className="mt-1 text-xs text-content-tertiary">Allowlisted</p>
                  ) : null}
                  {team.grandfathered ? (
                    <p className="mt-1 text-xs text-content-tertiary">Grandfathered</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-content-secondary">
                  {team.comped ? (
                    <span className="text-content-tertiary">Never</span>
                  ) : team.state === 'read_only' ? (
                    // Read-only is permanent: there is no later wall to count
                    // down to, so a date here would be a fiction.
                    <>
                      <span className="text-content-tertiary">No wall</span>
                      <p className="text-xs text-content-tertiary">Paid before, lapsed since</p>
                    </>
                  ) : (
                    <>
                      <p>{formatDate(team.wallDate)}</p>
                      {team.state === 'trial' ? (
                        <p className="text-xs text-content-tertiary">
                          {team.trialDaysLeft} day{team.trialDaysLeft === 1 ? '' : 's'} left
                        </p>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="px-3 py-3 text-content-secondary">
                  {team.billingPlan ? (
                    <>
                      <p className="capitalize">{team.billingPlan}</p>
                      <p className="text-xs text-content-tertiary">
                        {formatKobo(team.billingLockedAmount)}
                      </p>
                    </>
                  ) : (
                    <span className="text-content-tertiary">—</span>
                  )}
                  {team.subscriptionPlan ? (
                    <p className="mt-1 text-xs text-content-tertiary">
                      Sub: {team.subscriptionPlan} ({team.subscriptionStatus})
                    </p>
                  ) : null}
                  {/* Loud on purpose. This is the one row state that needs an
                      action taken in the Paystack dashboard before a date, and
                      missing it charges a real customer the wrong amount. */}
                  {team.pendingPlan ? (
                    <p className="mt-1 text-xs font-semibold text-status-warning">
                      SWAP OWED: move to {team.pendingPlan}
                      {team.wallDate
                        ? ` before ${new Date(team.wallDate).toLocaleDateString()}`
                        : ''}
                    </p>
                  ) : null}
                </td>
                <td className="max-w-[16rem] px-3 py-3 text-xs text-content-tertiary">
                  {team.billingNotes || '—'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {busyId === team.workspaceId ? (
                      <Loader2 className="size-4 animate-spin text-content-tertiary" />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => extendTrial(team)}
                          className="rounded border border-stroke-default px-2 py-1 text-xs text-content-secondary hover:border-stroke-strong hover:text-content-primary"
                        >
                          Extend
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(team.workspaceId, {
                              action: team.comped ? 'uncomp' : 'comp',
                            })
                          }
                          className="rounded border border-stroke-default px-2 py-1 text-xs text-content-secondary hover:border-stroke-strong hover:text-content-primary"
                        >
                          {team.comped ? 'Uncomp' : 'Comp'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeal(team, 'assign_founding')}
                          className="rounded border border-stroke-default px-2 py-1 text-xs text-content-secondary hover:border-stroke-strong hover:text-content-primary"
                        >
                          Founding
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeal(team, 'set_custom_price')}
                          className="rounded border border-stroke-default px-2 py-1 text-xs text-content-secondary hover:border-stroke-strong hover:text-content-primary"
                        >
                          Custom price
                        </button>
                        <button
                          type="button"
                          onClick={() => markPaid(team)}
                          className="rounded border border-brand/40 bg-brand/8 px-2 py-1 text-xs text-brand hover:bg-brand/12"
                        >
                          Mark paid
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {teams.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-content-tertiary">
                  No teams match that.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
