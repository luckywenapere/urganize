import { InfoTip } from '@/components/shared/HelpTip';
import type { ChurnMonth, ChurnSummary } from '@/lib/admin-churn';
import { formatMonth, logoChurnVerdict, NOT_TRACKED_NET } from '@/lib/admin-churn-format';
import { formatNaira, formatRate } from '@/lib/scoreboard-format';

// Churn and revenue kept, on the founder cockpit (iteration 5, 2026-10-10).
// Display only. The rules and what is not stored: lib/admin-churn.ts.
//
// House rule (2026-10-05): no grey sentence under a heading; what a number
// means sits behind its info icon, and a line under a number is a live fact.

const number = new Intl.NumberFormat('en');

function Label({ text, info }: { text: string; info: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">{text}</p>
      <InfoTip label={text} text={info} />
    </div>
  );
}

function Tile({ label, info, value, facts }: { label: string; info: string; value: string; facts: string[] }) {
  return (
    <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <Label text={label} info={info} />
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-content-primary">{value}</p>
      {facts.map((fact) => (
        <p key={fact} className="mt-1 text-xs leading-5 text-content-secondary">
          {fact}
        </p>
      ))}
    </div>
  );
}

function rate(value: number | null): string {
  return value === null ? 'No data yet' : formatRate(value);
}

function monthName(month: ChurnMonth): string {
  return month.complete ? formatMonth(month.month) : `${formatMonth(month.month)} so far`;
}

export function ChurnPanel({ churn }: { churn: ChurnSummary }) {
  const complete = churn.months.filter((month) => month.complete);
  const last = complete[complete.length - 1] ?? null;

  return (
    <div className="mt-6">
      <Label
        text="Churn and revenue kept"
        info="Monthly, by calendar month (UTC). A paying team is lost in the month its last paid day passed without a renewal. Lost counts are at least these: a team that stopped and later paid again is not stored as having stopped. Start-of-month MRR uses each subscription's price today. Benchmarks for small-business software (Lenny's Newsletter): monthly logo churn of 2.5 to 5% is good and under 1.5% is great; net revenue retention of about 90% is good and 110% is great."
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          label="Paying teams lost"
          info="Logo churn: paying teams (Manager, Label or Group, not comped) lost in the last full month, out of the paying teams at its start."
          value={last ? rate(last.logoChurn) : 'No data yet'}
          facts={
            last
              ? [
                  `${number.format(last.teamsLost)} of ${number.format(last.payingTeamsAtStart)} in ${formatMonth(last.month)}`,
                  logoChurnVerdict(last.logoChurn),
                ]
              : []
          }
        />
        <Tile
          label="MRR lost"
          info="Gross MRR churn: the monthly revenue of subscriptions that stopped in the last full month, out of MRR at its start. Solo is included, as in MRR. Yearly plans count as a twelfth."
          value={last ? rate(last.grossMrrChurn) : 'No data yet'}
          facts={
            last && last.mrrAtStartMinor > 0
              ? [`${formatNaira(last.mrrLostMinor)} of ${formatNaira(last.mrrAtStartMinor)} in ${formatMonth(last.month)}`]
              : []
          }
        />
        <Tile
          label="Net revenue retention"
          info={`Revenue kept from last month's payers after upgrades, downgrades and losses; 100% minus this is net MRR churn. ${NOT_TRACKED_NET} About 90% is good and 110% great for small-business software.`}
          value="Not tracked"
          facts={['Upgrades and downgrades are not stored']}
        />
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-stroke-default bg-bg-surface">
        <table className="w-full min-w-[20rem] text-left text-xs">
          <caption className="sr-only">Churn by month</caption>
          <thead>
            <tr className="text-content-tertiary">
              <th scope="col" className="px-3 py-2 font-medium">Month</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Teams lost</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Logo churn</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">MRR lost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke-subtle">
            {churn.months.map((month) => (
              <tr key={month.month} className="text-content-secondary">
                <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium text-content-primary">
                  {monthName(month)}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {number.format(month.teamsLost)} of {number.format(month.payingTeamsAtStart)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{rate(month.logoChurn)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {month.mrrAtStartMinor > 0 ? rate(month.grossMrrChurn) : 'No data yet'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {churn.undated > 0 ? (
        <p className="mt-2 text-xs leading-5 text-content-tertiary">
          {number.format(churn.undated)} paid {churn.undated === 1 ? 'subscription is' : 'subscriptions are'} left
          out: when {churn.undated === 1 ? 'it' : 'they'} started or stopped is not stored.
        </p>
      ) : null}
    </div>
  );
}
