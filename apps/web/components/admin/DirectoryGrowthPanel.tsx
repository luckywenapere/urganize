import { InfoTip } from '@/components/shared/HelpTip';
import type { DirectoryGrowth } from '@/lib/directory-growth';
import { formatCount, formatMonth, formatReplyRate } from '@/lib/directory-growth-format';
import { formatWeekEnd } from '@/lib/founder-cockpit-format';

// The directory's weekly numbers on /admin/directory (2026-10-10): the last 8
// rolling weeks, newest first, then rollouts live from the directory by month.
// Display only (lib/directory-growth.ts works the numbers out). A column that
// could not be read shows "Not tracked" in every row, never a zero.

type WeekKey = Exclude<keyof DirectoryGrowth['weeks'][number], 'endsAt'>;

const HEADINGS: Array<{ key: WeekKey; label: string; info: string }> = [
  { key: 'seeded', label: 'Seeded', info: 'Profiles a team made for somebody, by the week they were made.' },
  { key: 'invitesSent', label: 'Invites', info: 'Claim invites sent, by the week they were sent.' },
  { key: 'claimed', label: 'Claimed', info: 'Profiles somebody took over, by the week they claimed them.' },
  {
    key: 'startedRollout',
    label: 'Started a rollout',
    info: 'Claimed people who made their first real rollout after claiming, by the week of that rollout. Once per person.',
  },
  {
    key: 'searches',
    label: 'Searches by role',
    info: 'Directory searches that filtered by a role. Searches with no role, and profile views, are in PostHog, which this page cannot read.',
  },
  { key: 'requestsSent', label: 'Requests', info: 'Work requests sent.' },
  { key: 'accepted', label: 'Said yes', info: 'Requests answered yes.' },
  { key: 'passed', label: 'Said no', info: 'Requests answered no.' },
];

export function DirectoryGrowthPanel({ growth }: { growth: DirectoryGrowth }) {
  const weeks = growth.weeks.slice().reverse();
  const months = growth.live.months ? growth.live.months.slice().reverse() : null;

  return (
    <section className="mt-8">
      <div className="flex items-center gap-1.5">
        <h2 className="text-base font-semibold text-content-primary">Week by week</h2>
        <InfoTip
          label="Week by week"
          text="The last 8 rolling weeks of 7 days, ending now, newest first. Same weeks as the cockpit. Our own accounts are left out."
        />
      </div>
      <p className="mt-1 text-sm text-content-secondary">
        Reply rate over these weeks: {formatReplyRate(growth.totals.replyRate)}
      </p>

      <div className="mt-3 overflow-x-auto rounded-xl border border-stroke-default">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-bg-surface text-xs text-content-tertiary">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Week ending
              </th>
              {HEADINGS.map((heading) => (
                <th
                  key={heading.key}
                  scope="col"
                  className="px-3 py-2 text-right font-medium"
                  title={heading.info}
                >
                  {heading.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.endsAt} className="border-t border-stroke-default">
                <th scope="row" className="px-3 py-2 font-normal text-content-secondary">
                  {formatWeekEnd(week.endsAt)}
                </th>
                {HEADINGS.map((heading) => (
                  <td key={heading.key} className="px-3 py-2 text-right tabular-nums text-content-primary">
                    {formatCount(week[heading.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex items-center gap-1.5">
        <h2 className="text-base font-semibold text-content-primary">Live from the directory</h2>
        <InfoTip
          label="Live from the directory"
          text="Rollouts that a directory request named when it was accepted. Started is by the month the request was made; Live is by the month the rollout went live. Each rollout counts once."
        />
      </div>
      {months ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-stroke-default">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <thead className="bg-bg-surface text-xs text-content-tertiary">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Month
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Started
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Live
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month} className="border-t border-stroke-default">
                  <th scope="row" className="px-3 py-2 font-normal text-content-secondary">
                    {formatMonth(month.month)}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums text-content-primary">
                    {formatCount(month.started)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-content-primary">
                    {formatCount(month.live)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-content-secondary">
          Not tracked yet. Requests do not record which rollout they started.
        </p>
      )}
    </section>
  );
}
