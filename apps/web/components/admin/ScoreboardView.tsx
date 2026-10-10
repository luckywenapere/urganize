import type { Scoreboard, SecondReleaseSummary } from '@/lib/scoreboard';
import { formatNaira, formatRate } from '@/lib/scoreboard-format';
import type { ScoreboardSource } from '@/lib/scoreboard-server';

// The scoreboard's numbers, laid out. Display only: it fetches nothing and
// holds no state, so /admin/scoreboard owns the loading and the gate, and the
// layout can be looked at with made-up numbers.
const number = new Intl.NumberFormat('en');
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const STATE_LABELS: Record<string, string> = {
  paid: 'Paid',
  comped: 'Free (comped)',
  trial: 'On trial',
  grace: 'Trial just ended',
  read_only: 'Payment failed',
  walled: 'Trial ended',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const value = Date.parse(iso);
  return Number.isFinite(value) ? dateFormat.format(new Date(value)) : 'Never';
}

function secondReleaseDetail(summary: SecondReleaseSummary): string {
  const counted =
    summary.eligible > 0
      ? `${summary.started} of ${summary.eligible} teams started another release in time.`
      : 'No team has had a release live for 90 days yet.';
  const waiting =
    summary.waiting > 0
      ? ` ${summary.waiting} more ${summary.waiting === 1 ? 'team is' : 'teams are'} inside the 90 days.`
      : '';
  return counted + waiting;
}

/** A rate as a card's headline: a percentage, or a short capitalised phrase. */
function cardRate(rate: number | null): string {
  return rate === null ? 'No data yet' : formatRate(rate);
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-content-primary">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-content-secondary">{detail}</p> : null}
    </div>
  );
}

export function ScoreboardView({
  board,
  sources,
  ourTeamsLeftOut = 0,
}: {
  board: Scoreboard;
  sources: ScoreboardSource[];
  /** Teams owned by our own people, left out of every number (2026-10-10). */
  ourTeamsLeftOut?: number;
}) {
  const problems = sources.filter((source) => source.status !== 'ok' || source.truncated);
  const latestCohort = board.retention[0] ?? null;

  return (
    <>      <section aria-labelledby="north-star" className="mt-4 rounded-xl border border-brand/40 bg-brand/5 p-5">
        <h2 id="north-star" className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
          North Star: weekly active paying teams
        </h2>
        <p className="mt-1 font-display text-4xl font-semibold text-content-primary">
          {number.format(board.weeklyActivePayingTeams)}
        </p>
        <p className="mt-1 text-sm text-content-secondary">
          {number.format(board.payingTeams)} paying {board.payingTeams === 1 ? 'team' : 'teams'}{' '}
          on Manager or Label. A team counts when 2 or more of its members did something in the
          last 7 days. Counting teams that don&apos;t pay, {number.format(board.weeklyActiveTeams)}{' '}
          {board.weeklyActiveTeams === 1 ? 'team was' : 'teams were'} active this week.
        </p>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="MRR"
          value={formatNaira(board.mrrMinor)}
          detail="Subscriptions only, yearly plans divided by 12. Credits are not included."
        />
        <StatCard
          label="Second-release rate"
          value={cardRate(board.secondRelease.rate)}
          detail={`Paying teams. ${secondReleaseDetail(board.secondRelease)} The bar is 60%. Every team, paid or not: ${formatRate(board.secondReleaseAllTeams.rate)}.`}
        />
        <StatCard
          label="Week 4 retention"
          value={cardRate(latestCohort ? latestCohort.rate : null)}
          detail={
            latestCohort
              ? `Teams that started in the week of ${latestCohort.weekStart}: ${latestCohort.retained} of ${latestCohort.teams} were still active in their fourth week.`
              : 'No group of teams is 4 weeks old yet.'
          }
        />
        <StatCard
          label="Active teams, last 30 days"
          value={number.format(board.activeTeams30d)}
          detail={`Paid or not, out of ${number.format(board.teamCount)} teams.`}
        />
        <StatCard
          label="Trial to paid"
          value={cardRate(board.trialToPaid.rate)}
          detail={
            board.trialToPaid.ended > 0
              ? `${board.trialToPaid.paid} of ${board.trialToPaid.ended} trials that ended in the last 90 days paid, ${board.trialToPaid.paidBeforeEnd} before the trial ran out.`
              : 'No trial has ended in the last 90 days.'
          }
        />
        <StatCard
          label="Activation"
          value={cardRate(board.activation.rate)}
          detail={
            board.activation.signups > 0
              ? `${board.activation.activated} of ${board.activation.signups} sign-ups in the last 30 days made a release and invited a teammate within 3 days.`
              : 'No sign-up in the last 30 days has finished its first 3 days.'
          }
        />
        <StatCard
          label="Referred signups, last 30 days"
          value={
            board.referredSignups
              ? number.format(board.referredSignups.fromTeams.last30d + board.referredSignups.fromPartners.last30d)
              : 'Not tracked'
          }
          detail={
            board.referredSignups
              ? `${board.referredSignups.fromTeams.last30d} invited by a team, ${board.referredSignups.fromPartners.last30d} through a partner. All time: ${board.referredSignups.fromTeams.allTime + board.referredSignups.fromPartners.allTime}, of which ${board.referredSignups.fromTeams.payingNow + board.referredSignups.fromPartners.payingNow} pay today.`
              : 'The referral tables are not set up yet.'
          }
        />
      </div>

      {board.activityTruncated ? (
        <p role="alert" className="mt-4 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-content-primary">
          Activity hit its read limit, so the activity numbers above are lower than the truth.
        </p>
      ) : null}

      <section aria-labelledby="retention" className="mt-8">
        <h2 id="retention" className="font-display text-lg font-semibold text-content-primary">
          Week 4 retention by starting week
        </h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-stroke-default">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-stroke-default bg-bg-elevated text-xs text-content-tertiary">
                <th className="px-3 py-2 font-medium">Week starting</th>
                <th className="px-3 py-2 font-medium">Teams</th>
                <th className="px-3 py-2 font-medium">Active in week 4</th>
                <th className="px-3 py-2 font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {board.retention.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-content-tertiary">
                    No group of teams is 4 weeks old yet.
                  </td>
                </tr>
              ) : (
                board.retention.map((cohort) => (
                  <tr key={cohort.weekStart} className="border-b border-stroke-subtle last:border-0">
                    <td className="px-3 py-2 text-content-primary">{cohort.weekStart}</td>
                    <td className="px-3 py-2 text-content-primary">{number.format(cohort.teams)}</td>
                    <td className="px-3 py-2 text-content-primary">{number.format(cohort.retained)}</td>
                    <td className="px-3 py-2 text-content-secondary">{formatRate(cohort.rate)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="teams" className="mt-8">
        <h2 id="teams" className="font-display text-lg font-semibold text-content-primary">
          Every team
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-content-secondary">
          Most active first. A team that has stalled is the one to message.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-stroke-default">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-stroke-default bg-bg-elevated text-xs text-content-tertiary">
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Billing</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Members</th>
                <th className="px-3 py-2 font-medium">Active this week</th>
                <th className="px-3 py-2 font-medium">Last active</th>
                <th className="px-3 py-2 font-medium">Releases</th>
                <th className="px-3 py-2 font-medium">First live</th>
                <th className="px-3 py-2 font-medium">Second started</th>
              </tr>
            </thead>
            <tbody>
              {board.teams.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-content-tertiary">
                    No teams yet.
                  </td>
                </tr>
              ) : (
                board.teams.map((row) => (
                  <tr key={row.workspaceId} className="border-b border-stroke-subtle last:border-0">
                    <td className="px-3 py-2 text-content-primary">{row.name || row.workspaceId}</td>
                    <td className="px-3 py-2 text-content-secondary">
                      {row.paying ? 'Paying team' : STATE_LABELS[row.state] ?? row.state}
                    </td>
                    <td className="px-3 py-2 text-content-secondary">{row.plan ?? 'None'}</td>
                    <td className="px-3 py-2 text-content-primary">{number.format(row.members)}</td>
                    <td className="px-3 py-2 text-content-primary">{number.format(row.activeMembers7d)}</td>
                    <td className="px-3 py-2 text-content-secondary">{formatDate(row.lastActiveAt)}</td>
                    <td className="px-3 py-2 text-content-primary">{number.format(row.realReleases)}</td>
                    <td className="px-3 py-2 text-content-secondary">
                      {row.firstLiveAt ? formatDate(row.firstLiveAt) : 'Not yet'}
                    </td>
                    <td className="px-3 py-2 text-content-secondary">
                      {row.firstLiveAt ? (row.secondReleaseStarted ? 'Yes' : 'No') : 'Not yet'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="how" className="mt-8 max-w-3xl text-sm leading-6 text-content-secondary">
        <h2 id="how" className="font-display text-lg font-semibold text-content-primary">
          How these are counted
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            A paying team has a current Manager or Label subscription. Solo adds to MRR but is
            not a team. Free and allowlisted teams are left out.
          </li>
          <li>
            Something a member did: a task change, comment, file, release chat message, new
            release, note, UrgAns message or press kit edit. Task changes are only recorded
            from 2 October 2026, so activity before then is undercounted.
          </li>
          <li>
            A release goes live on its release date, or when its last activity is done if that
            comes first. Test releases are left out everywhere.
          </li>
          <li>
            A second release counts if it was started any time up to 90 days after the first
            went live, including before.
          </li>
          <li>
            An invited teammate&apos;s own empty team is left out, so it doesn&apos;t count as a
            dead team.
          </li>
          <li>
            Our own accounts (the admin list, plus any extra internal emails) are left out of every
            number, the same people /admin/metrics hides
            {ourTeamsLeftOut > 0
              ? `: ${number.format(ourTeamsLeftOut)} ${ourTeamsLeftOut === 1 ? 'team' : 'teams'} this time`
              : ''}
            .
          </li>
        </ul>
        {problems.length > 0 ? (
          <p className="mt-3 text-content-tertiary">
            Could not fully read:{' '}
            {problems
              .map((source) =>
                source.truncated
                  ? `${source.table} (stopped at ${number.format(source.rows)} rows)`
                  : `${source.table} (${source.status === 'missing' ? 'not set up on this database' : 'error'})`
              )
              .join(', ')}
            .
          </p>
        ) : null}
        <p className="mt-3 text-content-tertiary">
          Worked out {formatDate(board.generatedAt)}.
        </p>
      </section>
    </>
  );
}