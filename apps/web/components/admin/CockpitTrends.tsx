import { AdminBarChart } from '@/components/admin/AdminBarChart';
import { ChurnPanel } from '@/components/admin/ChurnPanel';
import type { ChurnSummary } from '@/lib/admin-churn';
import { InfoTip } from '@/components/shared/HelpTip';
import type { AdminReadSource } from '@/lib/admin-read-server';
import type { FounderCockpit } from '@/lib/founder-cockpit';
import { formatDays, formatSignedPercent, formatWeekChange, formatWeekEnd, growthVerdict } from '@/lib/founder-cockpit-format';
import { formatRate } from '@/lib/scoreboard-format';

// The weekly-review half of the old founder cockpit (2026-10-09), moved from
// the Overview to the Scoreboard on 2026-10-18 (URG-369, founder approved the
// slimmed Overview): weekly active teams with its 4-week growth %, the 8-week
// chart, activation, time to first rollout, week 4 retention and churn. These
// are tiny cohorts read on Monday and Friday, not every morning. Display only;
// the Scoreboard page loads the data through CockpitSlot.
//
// House rule (2026-10-05): no grey sentence stacked under a heading. What a
// number means sits behind its info icon; the old footer caveats sit behind
// the section's info icon too.

const number = new Intl.NumberFormat('en');

function plural(count: number, one: string, many: string): string {
  return `${number.format(count)} ${count === 1 ? one : many}`;
}

function rateOrNone(rate: number | null): string {
  return rate === null ? 'No data yet' : formatRate(rate);
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

export function CockpitTrends({
  cockpit,
  churn = null,
  ourTeamsLeftOut = 0,
  sources,
}: {
  cockpit: FounderCockpit;
  churn?: ChurnSummary | null;
  ourTeamsLeftOut?: number;
  sources: AdminReadSource[];
}) {
  const problems = sources.filter((source) => source.status !== 'ok' || source.truncated);
  const { activeTeams, activation, firstRollout, retention } = cockpit;
  const bars = cockpit.weeks.map((week) => ({
    key: week.endsAt,
    tick: formatWeekEnd(week.endsAt),
    label: `7 days to ${formatWeekEnd(week.endsAt)}`,
    value: week.activeTeams,
  }));
  const caveats = [
    "Past weeks use today's paying status and today's team members, because neither is kept over time.",
    ourTeamsLeftOut > 0 ? `Our own ${plural(ourTeamsLeftOut, 'team is', 'teams are')} left out.` : '',
    cockpit.activityTruncated ? 'Activity hit its read limit, so these counts are a floor.' : '',
    problems.length > 0 ? `Not fully read: ${problems.map((source) => source.table).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section aria-labelledby="trends-heading" className="mt-10">
      <div className="flex items-center gap-1.5">
        <h2 id="trends-heading" className="font-display text-lg font-semibold text-content-primary">
          Trends
        </h2>
        <InfoTip label="Trends" text={`Moved here from the Overview. A week is the last 7 days. ${caveats}`} />
      </div>

      <div className="mt-3 rounded-xl border border-stroke-default bg-bg-surface p-5">
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

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
      </div>

      {churn ? <ChurnPanel churn={churn} /> : null}
    </section>
  );
}
