'use client';

// The Growth page's two sections, kept presentational: each takes its loaded
// state as a prop and fetches nothing, so the page client owns the admin gate
// and both sections can be checked against fixture data without a sign-in.
//
// New accounts come first because they are the real sign-up number now: the
// marketing site's "Try Urganize" button leads to account creation, and the
// waitlist is a secondary path.

import { AdminBarChart, type AdminBar } from '@/components/admin/AdminBarChart';
import type { AccountMonthsSummary } from '@/lib/account-months';
import { pluralize } from '@/lib/recap-copy';

export type WaitlistWeek = { weekLabel: string; totalUsers: number };
export type WaitlistSummary = { total: number; weeks: WaitlistWeek[] };

export type SectionState<T> = { kind: 'ok'; data: T } | { kind: 'error'; message: string };

const numberFormat = new Intl.NumberFormat('en');

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-content-primary">{value}</p>
      {hint ? <p className="mt-1 text-xs text-content-tertiary">{hint}</p> : null}
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
      {message}
    </p>
  );
}

function EmptyNote({ children }: { children: string }) {
  return (
    <div className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-8 text-center text-sm text-content-tertiary">
      {children}
    </div>
  );
}

function SectionHeading({ id, title, children }: { id: string; title: string; children: string }) {
  return (
    <>
      <h2 id={id} className="text-base font-semibold text-content-primary">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-content-secondary">{children}</p>
    </>
  );
}

const TABLE_WRAP = 'mt-6 overflow-x-auto rounded-lg border border-stroke-default';
const TABLE_HEAD = 'bg-bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary';

export function AccountsSection({ state }: { state: SectionState<AccountMonthsSummary> }) {
  return (
    <section aria-labelledby="growth-accounts-heading" className="mt-8">
      <SectionHeading id="growth-accounts-heading" title="New accounts">
        Everyone who made an Urganize account, by the month they joined. Invited teammates and
        playlist owners count too.
      </SectionHeading>
      {state.kind === 'error' ? <SectionError message={state.message} /> : <AccountsBody data={state.data} />}
    </section>
  );
}

function AccountsBody({ data }: { data: AccountMonthsSummary }) {
  const { months, total } = data;
  const current = months.length > 0 ? months[months.length - 1] : null;
  const previous = months.length > 1 ? months[months.length - 2] : null;

  const bars: AdminBar[] = months.map((month) => ({
    key: month.monthKey,
    tick: month.tick,
    label: month.isCurrent ? `${month.label}, so far` : month.label,
    value: month.newAccounts,
  }));

  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total accounts" value={numberFormat.format(total)} />
        <StatCard
          label="Last month"
          value={numberFormat.format(previous?.newAccounts ?? 0)}
          hint={previous?.label}
        />
        <StatCard
          label="This month so far"
          value={numberFormat.format(current?.newAccounts ?? 0)}
          hint={current?.label}
        />
      </div>

      {total === 0 || months.length === 0 ? (
        <EmptyNote>No accounts yet.</EmptyNote>
      ) : (
        <>
          <AdminBarChart
            title="New accounts per month"
            bars={bars}
            formatValue={(value) =>
              `${numberFormat.format(value)} ${pluralize(value, 'new account', 'new accounts')}`
            }
          />

          <div className={TABLE_WRAP}>
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className="px-4 py-3 font-bold">Month</th>
                  <th className="px-4 py-3 font-bold">New accounts</th>
                  <th className="px-4 py-3 font-bold">Total accounts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-subtle bg-bg-surface">
                {months.map((month) => (
                  <tr key={month.monthKey}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-content-secondary">
                      {month.label}
                      {month.isCurrent ? ' (so far)' : ''}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-content-primary">
                      {numberFormat.format(month.newAccounts)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-content-secondary">
                      {numberFormat.format(month.totalAtMonthEnd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export function WaitlistSection({ state }: { state: SectionState<WaitlistSummary> }) {
  return (
    <section aria-labelledby="growth-waitlist-heading" className="mt-12">
      <SectionHeading id="growth-waitlist-heading" title="Waitlist">
        Cumulative waitlist signups per week (ISO weeks, last 12), from the marketing site&rsquo;s
        Neon database.
      </SectionHeading>
      {state.kind === 'error' ? <SectionError message={state.message} /> : <WaitlistBody data={state.data} />}
    </section>
  );
}

function WaitlistBody({ data }: { data: WaitlistSummary }) {
  const { weeks, total } = data;
  // Unchanged from before the page gained its accounts section. Note it spans
  // 11 weeks of growth, not 12: each point is the running total at the END of
  // its week, so the first week's own sign-ups are not in the difference.
  const growthThisWindow = weeks.length >= 2 ? weeks[weeks.length - 1].totalUsers - weeks[0].totalUsers : 0;

  const bars: AdminBar[] = weeks.map((week) => ({
    key: week.weekLabel,
    tick: week.weekLabel.split('-')[1] || week.weekLabel,
    label: week.weekLabel,
    value: week.totalUsers,
  }));

  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total signups" value={numberFormat.format(total)} />
        <StatCard
          label="Last 12 weeks"
          value={growthThisWindow >= 0 ? `+${numberFormat.format(growthThisWindow)}` : numberFormat.format(growthThisWindow)}
        />
      </div>

      {weeks.length === 0 ? (
        <EmptyNote>No signups yet.</EmptyNote>
      ) : (
        <>
          <AdminBarChart
            title="Waitlist size by week"
            bars={bars}
            formatValue={(value) => `${numberFormat.format(value)} on the waitlist`}
          />

          <div className={TABLE_WRAP}>
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className="px-4 py-3 font-bold">Week</th>
                  <th className="px-4 py-3 font-bold">Total users</th>
                  <th className="px-4 py-3 font-bold">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-subtle bg-bg-surface">
                {weeks.map((week, index) => {
                  const previous = index > 0 ? weeks[index - 1].totalUsers : week.totalUsers;
                  const change = week.totalUsers - previous;
                  return (
                    <tr key={week.weekLabel}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-content-secondary">
                        {week.weekLabel}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-content-primary">
                        {numberFormat.format(week.totalUsers)}
                      </td>
                      <td
                        className={`px-4 py-3 tabular-nums ${change > 0 ? 'text-status-success' : 'text-content-tertiary'}`}
                      >
                        {change > 0 ? `+${change}` : change === 0 ? '—' : change}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
