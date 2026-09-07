'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { ALL_ACTIONS_BUCKET, type TeamMonthSummary } from '@/lib/urgans-actions/admin-summary';

// /admin/urgans — read-only console for embedded UrgAns actions ("UrgAns in
// every function"; today release.draft_plan and presskit.draft_section).
// One row per team, per month, per action type, PER DOOR: how many drafts were
// made, applied, discarded or failed, what they cost in tokens, and how often
// the entitlement gate refused a Solo team (the guard trips and upgrade
// signals land on a separate "(all actions)" row, since none of the three
// billing signals names a specific action — see admin-summary.ts).
//
// "Door" is the button inside the product surface versus the same job asked
// of UrgAns in chat. They are counted separately because only one of them is
// entitlement-gated, so a single number would answer neither "is anyone using
// the buttons" nor "is the chat carrying this instead".
//
// Follows the /admin/teams gate/load pattern exactly (authLoading -> !user ->
// redirect; the backing GET's 401/403 is the real gate); no write actions
// here, so there is no busy-row state or action runner to carry over.

type TeamRow = TeamMonthSummary & { teamName: string | null };

type UrgansPayload = {
  lookbackDays: number;
  rows: TeamRow[];
};

const numberFormat = new Intl.NumberFormat('en');

/** Plain words for the two doors. An unrecognised value renders verbatim
 *  rather than being mapped to a guess. */
const DOOR_LABELS: Record<string, string> = {
  button: 'Button',
  chat: 'Chat',
};

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function UrgansAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<UrgansPayload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  const load = useCallback(
    async (options: { asGate?: boolean } = {}) => {
      setError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const response = await fetch('/api/admin/urgans', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as Partial<UrgansPayload> & {
          error?: string;
        };
        if (!response.ok) {
          setError(body.error || 'Could not load UrgAns actions.');
          return;
        }
        const rows = body.rows || [];
        setPayload({ lookbackDays: body.lookbackDays ?? 90, rows });
        // Default to the most recent month with real data, so a founder
        // opening this the day after a quiet weekend does not land on an
        // empty current-month table with nothing explaining why.
        setMonth((current) => current ?? rows[0]?.month ?? currentMonthKey());
        setChecked(true);
      } catch {
        setError('Could not load UrgAns actions.');
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

  const availableMonths = useMemo(() => {
    const months = new Set((payload?.rows || []).map((row) => row.month));
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [payload]);

  const rowsForMonth = useMemo(
    () => (payload?.rows || []).filter((row) => row.month === month),
    [payload, month]
  );

  const totals = useMemo(() => {
    return rowsForMonth.reduce(
      (acc, row) => ({
        drafted: acc.drafted + row.drafted,
        applied: acc.applied + row.applied,
        discarded: acc.discarded + row.discarded,
        failed: acc.failed + row.failed,
        tokensIn: acc.tokensIn + row.tokensIn,
        tokensOut: acc.tokensOut + row.tokensOut,
        guardTrips: acc.guardTrips + row.guardTrips,
        upgradePromptsShown: acc.upgradePromptsShown + row.upgradePromptsShown,
        upgradeClicks: acc.upgradeClicks + row.upgradeClicks,
      }),
      {
        drafted: 0,
        applied: 0,
        discarded: 0,
        failed: 0,
        tokensIn: 0,
        tokensOut: 0,
        guardTrips: 0,
        upgradePromptsShown: 0,
        upgradeClicks: 0,
      }
    );
  }, [rowsForMonth]);

  if (authLoading || !checked) {
    return (
      <AdminPageSkeleton
        titleWidth="w-56"
        descriptionLines={2}
        statCards={{ count: 4, gridClassName: 'sm:grid-cols-4' }}
        table={{ columns: 9, rows: 5 }}
      />
    );
  }

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">
        UrgAns actions
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Every UrgAns action, drafted / applied / discarded / failed, by team and month and
        by which door it came through &mdash; the button inside the release, or the same job
        asked for in chat. Only the button is plan-gated, so the split is what says whether
        the chat is carrying this instead. Guard trips and upgrade signals land on their own
        &ldquo;{ALL_ACTIONS_BUCKET}&rdquo; row, since none of the three names one specific
        action. Last {payload?.lookbackDays ?? 90} days.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {availableMonths.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {availableMonths.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMonth(value)}
              aria-pressed={month === value}
              className={`motion-focus inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                month === value
                  ? 'border-brand/40 bg-brand/10 text-brand'
                  : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Drafted', value: totals.drafted },
          { label: 'Applied', value: totals.applied },
          { label: 'Discarded', value: totals.discarded },
          { label: 'Failed', value: totals.failed },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-stroke-default bg-bg-surface p-4"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
              {stat.label}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-content-primary">
              {numberFormat.format(stat.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-content-secondary">
        <span>Tokens in: {numberFormat.format(totals.tokensIn)}</span>
        <span>Tokens out: {numberFormat.format(totals.tokensOut)}</span>
        <span>Guard trips: {numberFormat.format(totals.guardTrips)}</span>
        <span>Upgrade prompts shown: {numberFormat.format(totals.upgradePromptsShown)}</span>
        <span>Upgrade clicks: {numberFormat.format(totals.upgradeClicks)}</span>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-stroke-default">
        {/* Widened with the Door column so the table scrolls inside its own
            container rather than squeezing nine numeric columns. */}
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-stroke-default bg-bg-elevated text-xs text-content-tertiary">
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Door</th>
              <th className="px-3 py-2 font-medium">Drafted</th>
              <th className="px-3 py-2 font-medium">Applied</th>
              <th className="px-3 py-2 font-medium">Discarded</th>
              <th className="px-3 py-2 font-medium">Failed</th>
              <th className="px-3 py-2 font-medium">Tokens (in/out)</th>
              <th className="px-3 py-2 font-medium">Guard trips</th>
              <th className="px-3 py-2 font-medium">Upgrade (shown/clicked)</th>
            </tr>
          </thead>
          <tbody>
            {rowsForMonth.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-content-tertiary">
                  Nothing this month.
                </td>
              </tr>
            ) : (
              rowsForMonth.map((row) => (
                <tr
                  key={`${row.workspaceId}:${row.actionType}:${row.source}`}
                  className="border-b border-stroke-subtle last:border-0"
                >
                  <td className="px-3 py-2 text-content-primary">
                    {row.teamName || row.workspaceId}
                  </td>
                  <td className="px-3 py-2 text-content-secondary">{row.actionType}</td>
                  <td className="px-3 py-2 text-content-secondary">{DOOR_LABELS[row.source] ?? row.source}</td>
                  <td className="px-3 py-2 text-content-primary">
                    {numberFormat.format(row.drafted)}
                  </td>
                  <td className="px-3 py-2 text-content-primary">
                    {numberFormat.format(row.applied)}
                  </td>
                  <td className="px-3 py-2 text-content-primary">
                    {numberFormat.format(row.discarded)}
                  </td>
                  <td className="px-3 py-2 text-content-primary">
                    {numberFormat.format(row.failed)}
                  </td>
                  <td className="px-3 py-2 text-content-secondary">
                    {numberFormat.format(row.tokensIn)} / {numberFormat.format(row.tokensOut)}
                  </td>
                  <td className="px-3 py-2 text-content-primary">
                    {numberFormat.format(row.guardTrips)}
                  </td>
                  <td className="px-3 py-2 text-content-secondary">
                    {numberFormat.format(row.upgradePromptsShown)} /{' '}
                    {numberFormat.format(row.upgradeClicks)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
