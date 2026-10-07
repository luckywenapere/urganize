import type { ReactNode } from 'react';
import { AdminBarChart } from '@/components/admin/AdminBarChart';
import { InfoTip } from '@/components/shared/HelpTip';
import type { AdminReadSource } from '@/lib/admin-read-server';
import { PRESENCE_SURFACES, SURFACE_LABEL } from '@/lib/presence';
import type { PlanSplit, QuietPerson, UsageMetrics } from '@/lib/usage-metrics';
import { formatDate, formatShare, formatUsd, people, timeAgo } from '@/lib/usage-metrics-format';

// The usage dashboard's numbers, laid out (2026-10-07). Display only: it
// fetches nothing and holds no state, so /admin/metrics owns the loading, the
// refresh and the gate, and the layout can be looked at with made-up numbers.
//
// House rule (2026-10-05): no grey sentence stacked under a heading. What a
// section means sits behind its info icon; a line under a number is only ever a
// live fact ("plus 3 test rollouts").

const number = new Intl.NumberFormat('en');

const PLAN_LABELS: Record<keyof PlanSplit, string> = {
  urgans: 'Planned by UrgAns',
  playbook: 'Playbook plan, no AI changes',
  own: 'Their own plan',
  none: 'No plan yet',
};

function Section({
  id,
  title,
  info,
  children,
}: {
  id: string;
  title: string;
  info: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <div className="flex items-center gap-1.5">
        <h2 id={id} className="font-display text-lg font-semibold text-content-primary">
          {title}
        </h2>
        <InfoTip label={title} text={info} />
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value, fact }: { label: string; value: string; fact?: string }) {
  return (
    <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-content-primary">{value}</p>
      {fact ? <p className="mt-1 text-xs leading-5 text-content-secondary">{fact}</p> : null}
    </div>
  );
}

/** A labelled list of single-colour bars: one hue, length carries the number,
 *  and every value is written out, so nothing depends on colour. */
function BarList({ rows, label }: { rows: Array<{ key: string; label: string; value: number }>; label: string }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <ul aria-label={label} className="space-y-2.5">
      {rows.map((row) => {
        const width = max > 0 ? (row.value / max) * 100 : 0;
        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-content-primary">{row.label}</span>
              <span className="shrink-0 tabular-nums text-content-secondary">
                {number.format(row.value)}
                {total > 0 ? ` · ${formatShare(row.value / total)}` : ''}
              </span>
            </div>
            <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-stroke-strong">
              {row.value > 0 ? (
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `max(4px, ${width}%)` }} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PersonList({ rows, now, empty }: { rows: QuietPerson[]; now: Date; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-content-secondary">{empty}</p>;
  return (
    <ul className="divide-y divide-stroke-subtle rounded-xl border border-stroke-default bg-bg-surface">
      {rows.map((person) => (
        <li key={person.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-content-primary">{person.name}</p>
            <p className="truncate text-xs text-content-secondary">
              {[person.team, person.email].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-content-secondary">
            {timeAgo(person.lastSeenAt, now)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MetricsView({
  metrics,
  sources,
  now,
}: {
  metrics: UsageMetrics;
  sources: AdminReadSource[];
  now: Date;
}) {
  const problems = sources.filter((source) => source.status !== 'ok' || source.truncated);
  const { active, rollouts, accounts, work } = metrics;
  const pingRecording = metrics.presenceSince !== null;

  return (
    <>
      <Section
        id="metrics-now"
        title="Right now"
        info="Online now means the app was open and on screen in the last five minutes. The app checks in every two minutes while it is visible."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="rounded-xl border border-brand/40 bg-brand/5 p-5">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
              <span aria-hidden="true" className="relative flex h-2 w-2">
                {metrics.online.length > 0 ? (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
                ) : null}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    metrics.online.length > 0 ? 'bg-brand' : 'bg-content-tertiary'
                  }`}
                />
              </span>
              Online now
            </p>
            <p className="mt-1 font-display text-5xl font-semibold tabular-nums text-content-primary">
              {pingRecording ? number.format(metrics.online.length) : 'Not yet'}
            </p>
            <p className="mt-1 text-sm text-content-secondary">
              {pingRecording
                ? `${people(active.today)} active today.`
                : 'Waiting for the first check-in from the app.'}
            </p>
          </div>
          <div className="rounded-xl border border-stroke-default bg-bg-surface">
            {metrics.online.length === 0 ? (
              <p className="px-4 py-4 text-sm text-content-secondary">
                {pingRecording ? 'Nobody has the app open right now.' : 'This list fills in once the app starts checking in.'}
              </p>
            ) : (
              <ul className="divide-y divide-stroke-subtle">
                {metrics.online.map((person) => (
                  <li key={person.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-content-primary">{person.name}</p>
                      <p className="truncate text-xs text-content-secondary">
                        {[person.team, SURFACE_LABEL[person.surface]].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-content-secondary">
                      {timeAgo(person.lastSeenAt, now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section
        id="metrics-active"
        title="Active people"
        info="A person counts on a day if the app was open on their screen, they did something (an activity, a rollout, UrgAns, a note and so on), they opened the app, or they signed in. Days are Lagos days. The check-in that sees people who only look around started on the day this page went live, so earlier days only count people who did something or opened the app."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Today" value={number.format(active.today)} />
          <Stat label="Last 7 days" value={number.format(active.last7d)} fact={`${number.format(active.newPeople7d)} of them joined this week`} />
          <Stat label="Last 30 days" value={number.format(active.last30d)} />
          <Stat label="Today ÷ 30 days" value={formatShare(active.stickiness)} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
            <AdminBarChart
              title="Active people each day, last 30 days"
              bars={active.daily}
              formatValue={(value) => `${people(value)} active`}
            />
          </div>
          <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
              Where, last 7 days
            </p>
            <div className="mt-3">
              {pingRecording ? (
                <BarList
                  label="Where people used Urganize in the last 7 days"
                  rows={PRESENCE_SURFACES.map((surface) => ({
                    key: surface,
                    label: SURFACE_LABEL[surface],
                    value: active.surfaces7d[surface],
                  }))}
                />
              ) : (
                <p className="text-sm text-content-secondary">Fills in once the app starts checking in.</p>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="metrics-rollouts"
        title="Rollouts"
        info="Every rollout ever made, test rollouts left out. Going out means a release date in the next 30 days; out means a date in the last 30. How plans were made: Planned by UrgAns is a plan UrgAns tailored; Playbook plan is the playbook with no AI changes; Their own plan has only activities people added by hand; No plan yet has no activities, or is still waiting for a plan or a date."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat
            label="Made, all time"
            value={number.format(rollouts.total)}
            fact={rollouts.tests > 0 ? `plus ${number.format(rollouts.tests)} test rollouts` : undefined}
          />
          <Stat label="Last 7 days" value={number.format(rollouts.last7d)} />
          <Stat label="Last 30 days" value={number.format(rollouts.last30d)} />
          <Stat label="Going out, next 30 days" value={number.format(rollouts.goingOutNext30d)} />
          <Stat label="Out, last 30 days" value={number.format(rollouts.outLast30d)} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
            <AdminBarChart
              title="Rollouts made each week, last 12 weeks"
              bars={rollouts.weekly}
              formatValue={(value) => `${number.format(value)} ${value === 1 ? 'rollout' : 'rollouts'} made`}
            />
          </div>
          <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
              How plans were made
            </p>
            <div className="mt-3">
              <BarList
                label="How rollout plans were made"
                rows={(Object.keys(PLAN_LABELS) as Array<keyof PlanSplit>).map((key) => ({
                  key,
                  label: PLAN_LABELS[key],
                  value: rollouts.plans[key],
                }))}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="metrics-accounts"
        title="Accounts"
        info="Every account that has signed up to the app, playlist owners included. Finished setup counts accounts that completed the setup questions, playlist owners left out. The waitlist is the marketing site's list."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat
            label="Accounts"
            value={number.format(accounts.total)}
            fact={
              accounts.curators === 1
                ? '1 is a playlist owner'
                : accounts.curators > 1
                  ? `${number.format(accounts.curators)} are playlist owners`
                  : undefined
            }
          />
          <Stat label="New, last 7 days" value={number.format(accounts.new7d)} />
          <Stat label="New, last 30 days" value={number.format(accounts.new30d)} />
          <Stat label="Finished setup" value={formatShare(accounts.onboardingRate)} />
          <Stat
            label="Waitlist"
            value={accounts.waitlist === null ? 'Not connected' : number.format(accounts.waitlist)}
          />
        </div>
        <div className="mt-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
          <AdminBarChart
            title="New accounts each week, last 12 weeks"
            bars={accounts.weekly}
            formatValue={(value) => `${number.format(value)} new ${value === 1 ? 'account' : 'accounts'}`}
          />
        </div>
      </Section>

      <Section
        id="metrics-work"
        title="Work done"
        info="Activities marked done, activities people added by hand rather than from a plan, conversations with UrgAns (one per message sent), and what the AI provider charged us in the last 30 days."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Activities done, 7 days"
            value={number.format(work.activitiesDone7d)}
            fact={`${number.format(work.activitiesDone30d)} in the last 30 days`}
          />
          <Stat label="Added by hand, 7 days" value={number.format(work.addedByHand7d)} />
          <Stat
            label="UrgAns messages, 7 days"
            value={number.format(work.urgansTurns7d)}
            fact={`from ${people(work.urgansPeople7d)}`}
          />
          <Stat
            label="AI cost, 30 days"
            value={formatUsd(work.aiCostUsd30d)}
            fact={work.aiCostSource ? `from the ${work.aiCostSource}` : undefined}
          />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
        <Section
          id="metrics-between"
          title={`Between releases (${number.format(metrics.betweenReleasesCount)})`}
          info="People active in the last 30 days whose teams have no rollout coming up: no release date ahead, and nothing undated still being worked on. This is the moment people stop coming back, so these are the people to talk to."
        >
          <PersonList rows={metrics.betweenReleases} now={now} empty="Everyone active has a rollout on the go." />
        </Section>
        <Section
          id="metrics-quiet"
          title={`Gone quiet (${number.format(metrics.goneQuietCount)})`}
          info="People last seen between 31 and 90 days ago."
        >
          <PersonList rows={metrics.goneQuiet} now={now} empty="Nobody has gone quiet." />
        </Section>
      </div>

      <Section
        id="metrics-recent"
        title="Recently active"
        info="The 30 people seen most recently, newest first. Last thing is the most recent of: what they did, the app being open, opening the app, or signing in. Actions count only things they did."
      >
        <div className="overflow-x-auto rounded-xl border border-stroke-default bg-bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-stroke-default text-content-tertiary">
                <th scope="col" className="px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.14em]">Person</th>
                <th scope="col" className="px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.14em]">Team</th>
                <th scope="col" className="px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.14em]">Last seen</th>
                <th scope="col" className="px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.14em]">Last thing</th>
                <th scope="col" className="px-4 py-2.5 text-right font-mono text-[11px] font-normal uppercase tracking-[0.14em]">7 days</th>
                <th scope="col" className="px-4 py-2.5 text-right font-mono text-[11px] font-normal uppercase tracking-[0.14em]">30 days</th>
                <th scope="col" className="px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.14em]">Where</th>
                <th scope="col" className="px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.14em]">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-subtle">
              {metrics.recent.map((person) => (
                <tr key={person.userId}>
                  <td className="px-4 py-2.5">
                    <p className="flex items-center gap-1.5 font-medium text-content-primary">
                      {person.online ? (
                        <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                      ) : null}
                      {person.name}
                      {person.online ? <span className="sr-only">(online now)</span> : null}
                    </p>
                    {person.email ? <p className="text-xs text-content-secondary">{person.email}</p> : null}
                  </td>
                  <td className="px-4 py-2.5 text-content-secondary">{person.team ?? 'No team'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-content-primary">
                    {person.online ? 'Online now' : timeAgo(person.lastSeenAt, now)}
                  </td>
                  <td className="px-4 py-2.5 text-content-secondary">{person.lastThing}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-content-primary">{number.format(person.actions7d)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-content-primary">{number.format(person.actions30d)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-content-secondary">
                    {person.surface ? SURFACE_LABEL[person.surface] : 'No check-in yet'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-content-secondary">{formatDate(person.joinedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {problems.length > 0 ? (
        <section aria-labelledby="metrics-sources" className="mt-8">
          <div className="flex items-center gap-1.5">
            <h2 id="metrics-sources" className="font-display text-lg font-semibold text-content-primary">
              Not fully read ({number.format(problems.length)})
            </h2>
            <InfoTip
              label="Not fully read"
              text="Tables that are missing from this database, could not be read, or hit their row limit. A missing table only blanks the number it feeds; everything else is still counted."
            />
          </div>
          <ul className="mt-3 space-y-1 text-sm text-content-secondary">
            {problems.map((source) => (
              <li key={source.table}>
                <span className="font-mono text-content-primary">{source.table}</span>:{' '}
                {source.status === 'missing'
                  ? 'not on this database yet'
                  : source.status === 'error'
                    ? `could not be read${source.message ? ` (${source.message})` : ''}`
                    : `stopped at ${number.format(source.rows)} rows`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
