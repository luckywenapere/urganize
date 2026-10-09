import Link from 'next/link';
import { AdminBarChart } from '@/components/admin/AdminBarChart';
import { FunnelStrip } from '@/components/admin/FunnelStrip';
import { UrgansPanel } from '@/components/admin/UrgansPanel';
import type { AdminFunnel } from '@/lib/admin-funnel';
import type { UrgansUsage } from '@/lib/admin-urgans-usage';
import { InfoTip } from '@/components/shared/HelpTip';
import type { AdminReadSource } from '@/lib/admin-read-server';
import type { AtRiskTeam, FounderCockpit } from '@/lib/founder-cockpit';
import {
  formatDays,
  formatSignedPercent,
  formatWeekChange,
  formatWeekEnd,
  growthVerdict,
} from '@/lib/founder-cockpit-format';
import { formatNaira, formatRate } from '@/lib/scoreboard-format';
import { firstName, messageMailto, stageLine } from '@/lib/admin-message-list';

// The founder cockpit at the top of /admin (2026-10-09). Display only: it
// fetches nothing and holds no state, so AdminHubClient owns the loading and
// the gate, and the layout can be looked at with made-up numbers.
//
// Order, most important first (iteration 4 review): the North Star and the
// number that moves before it, their 8-week trend, the stage numbers, who
// needs a message this week, then the funnel and the UrgAns panel.
//
// House rule (2026-10-05): no grey sentence stacked under a heading. What a
// number means sits behind its info icon; a line under a number is only ever a
// live fact ("2 of 5 sign-ups").

const number = new Intl.NumberFormat('en');
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

function plural(count: number, one: string, many: string): string {
  return `${number.format(count)} ${count === 1 ? one : many}`;
}

function rateOrNone(rate: number | null): string {
  return rate === null ? 'No data yet' : formatRate(rate);
}

function lastSeen(iso: string | null): string {
  if (!iso) return 'Never active';
  const value = Date.parse(iso);
  return Number.isFinite(value) ? `Last active ${dateFormat.format(new Date(value))}` : 'Never active';
}

function Label({ text, info }: { text: string; info: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">{text}</p>
      <InfoTip label={text} text={info} />
    </div>
  );
}

function Stat({ label, info, value, fact }: { label: string; info: string; value: string; fact?: string }) {
  return (
    <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <Label text={label} info={info} />
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-content-primary">{value}</p>
      {fact ? <p className="mt-1 text-xs leading-5 text-content-secondary">{fact}</p> : null}
    </div>
  );
}

function reasonLine(team: AtRiskTeam): string {
  if (team.reason === 'paying_quiet') {
    return `Pays, but ${team.activeMembers7d} of ${team.members} people did something this week`;
  }
  return 'Busy last week, quiet this week';
}

export function FounderCockpitView({
  cockpit,
  funnels = [],
  urgans = null,
  sources,
}: {
  cockpit: FounderCockpit;
  /** The sign-up funnel, one per window. Empty hides the strip. */
  funnels?: AdminFunnel[];
  /** UrgAns, credits and release outcomes. Null hides the panel. */
  urgans?: UrgansUsage | null;
  sources: AdminReadSource[];
}) {
  const problems = sources.filter((source) => source.status !== 'ok' || source.truncated);
  const { northStar, activeTeams, activation, firstRollout, retention } = cockpit;
  const bars = cockpit.weeks.map((week) => ({
    key: week.endsAt,
    tick: formatWeekEnd(week.endsAt),
    label: `7 days to ${formatWeekEnd(week.endsAt)}`,
    value: week.activeTeams,
  }));

  return (
    <section aria-labelledby="cockpit-heading" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 id="cockpit-heading" className="font-display text-lg font-semibold text-content-primary">
            This week
          </h2>
          <InfoTip
            label="This week"
            text="Every number here uses the Scoreboard's rules. A week is the last 7 days, so this week always matches the Scoreboard."
          />
        </div>
        <Link href="/admin/scoreboard" className="motion-focus text-sm font-medium text-brand hover:underline">
          Open the Scoreboard
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-5">
          <Label
            text="North Star: weekly active paying teams"
            info="Teams on Manager, Label or Group where 2 or more people did something in the last 7 days. This is the one number the company is run on."
          />
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-content-primary">
            {number.format(northStar.current)}
          </p>
          <p className="mt-1 text-sm text-content-secondary">
            {formatWeekChange(northStar)}
            {northStar.pct !== null ? ` (${formatSignedPercent(northStar.pct)})` : ''}
          </p>
        </div>

        <div className="rounded-xl border border-stroke-default bg-bg-surface p-5">
          <Label
            text="Weekly active teams, paid or not"
            info="Any team where 2 or more people did something in the last 7 days. It moves before anyone pays, so watch it while the North Star is small. Growth is worked out over 4 weeks and compounded, the way YC measures it: 5 to 7% a week is good, 10% is great."
          />
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-content-primary">
            {number.format(activeTeams.current)}
          </p>
          <p className="mt-1 text-sm text-content-secondary">
            {formatWeekChange(activeTeams)}
            {activeTeams.pct !== null ? ` (${formatSignedPercent(activeTeams.pct)})` : ''}
          </p>
          <p className="mt-1 text-sm text-content-secondary">
            {cockpit.activeTeamsWeeklyGrowth === null
              ? growthVerdict(null)
              : `${formatSignedPercent(cockpit.activeTeamsWeeklyGrowth)} a week over 4 weeks. ${growthVerdict(cockpit.activeTeamsWeeklyGrowth)}.`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Label
          text="Weekly active teams, last 8 weeks"
          info="Each bar is one 7-day stretch, newest on the right. Teams made after a stretch ended are left out of it."
        />
        <div className="mt-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
          <AdminBarChart
            title="Weekly active teams, last 8 weeks"
            bars={bars}
            formatValue={(value) => plural(value, 'active team', 'active teams')}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="MRR"
          info="Monthly recurring revenue from subscriptions. Yearly plans count as a twelfth of their price. Credits are not included."
          value={formatNaira(cockpit.mrrMinor)}
          fact={plural(cockpit.payingTeams, 'paying team', 'paying teams')}
        />
        <Stat
          label="Activation"
          info="Of the accounts that signed up in the last 30 days and have had their first 3 days, the share that made a rollout and invited a teammate within those 3 days."
          value={rateOrNone(activation.rate)}
          fact={
            activation.signups > 0
              ? `${activation.activated} of ${plural(activation.signups, 'sign-up', 'sign-ups')}`
              : 'No sign-up has had its 3 days yet'
          }
        />
        <Stat
          label="Time to first rollout"
          info="For teams that signed up in the last 90 days: the middle number of days from sign-up to their first real rollout. Test rollouts are left out."
          value={formatDays(firstRollout.medianDays)}
          fact={
            firstRollout.signups > 0
              ? `${firstRollout.withRollout} of ${plural(firstRollout.signups, 'sign-up', 'sign-ups')} made one`
              : 'No sign-ups in 90 days'
          }
        />
        <Stat
          label="Week 4 retention"
          info="Teams still active in their fourth week (days 21 to 27 after they were made). The newest 4 weekly groups whose fourth week is over are added together."
          value={rateOrNone(retention.pooled.rate)}
          fact={
            retention.pooled.teams > 0
              ? `${retention.pooled.retained} of ${plural(retention.pooled.teams, 'team', 'teams')}`
              : 'No team is 4 weeks old yet'
          }
        />
        <Stat
          label="Runway"
          info="Months of cash left at the current monthly spend. Cash and spend are not recorded in Urganize, so this is not worked out here. Check it at the monthly money review."
          value="Not tracked"
        />
      </div>

      <div className="mt-6">
        <Label
          text="Needs a message"
          info="Paying teams where fewer than 2 people did something this week, then teams that were active last week and are quiet this week. Paying teams first. Each shows the first stage of the customer lifecycle it has not finished and who owns that stage; the strategy doc says that person writes within 3 days. Email opens a draft in your own mail app. Nothing is sent from here."
        />
        {cockpit.atRisk.length === 0 ? (
          <p className="mt-3 text-sm text-content-secondary">No team has slipped this week.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stroke-subtle rounded-xl border border-stroke-default bg-bg-surface">
            {cockpit.atRisk.map((team) => {
              const mailto = messageMailto({
                email: team.ownerEmail,
                ownerName: team.ownerName,
                teamName: team.name,
                stage: team.stalledAt.stage,
              });
              return (
                <li
                  key={team.workspaceId}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-content-primary">
                      {team.name || 'Unnamed team'}
                      {team.paying ? (
                        <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                          Paying
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-content-secondary">
                      {team.ownerName || 'No name'}
                      {' · '}
                      {team.ownerEmail || 'No email on file'}
                    </p>
                    <p className="mt-1 text-xs text-content-secondary">{reasonLine(team)}</p>
                    <p className="text-xs text-content-secondary">
                      {stageLine(team.stalledAt.stage)}. {team.stalledAt.missing}.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <span className="text-xs tabular-nums text-content-secondary">{lastSeen(team.lastActiveAt)}</span>
                    {mailto ? (
                      <a
                        href={mailto}
                        className="motion-focus inline-flex h-8 items-center rounded-lg border border-stroke-default px-3 text-xs font-medium text-content-primary transition-colors hover:bg-bg-hover"
                      >
                        Email {firstName(team.ownerName) ?? 'owner'}
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {funnels.length > 0 ? <FunnelStrip funnels={funnels} /> : null}

      {urgans ? <UrgansPanel usage={urgans} /> : null}

      <p className="mt-4 text-xs leading-5 text-content-tertiary">
        Past weeks use today&apos;s paying status and today&apos;s team members, because neither is
        kept over time.
        {cockpit.activityTruncated ? ' Activity hit its read limit, so these counts are a floor.' : ''}
        {problems.length > 0
          ? ` Not fully read: ${problems.map((source) => source.table).join(', ')}.`
          : ''}
      </p>
    </section>
  );
}
