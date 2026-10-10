import { AdminBarChart } from '@/components/admin/AdminBarChart';
import { InfoTip } from '@/components/shared/HelpTip';
import type { UrgansUsage } from '@/lib/admin-urgans-usage';
import {
  formatAiCostFact,
  formatCredits,
  formatLastWeekShare,
  formatLiveChange,
  formatPercent,
  formatSecondReleaseFact,
  formatShareFact,
  formatTargetGap,
  formatUsd,
} from '@/lib/admin-urgans-usage-format';
import { formatWeekEnd } from '@/lib/founder-cockpit-format';

// The UrgAns panel on the founder cockpit (2026-10-09, iteration 3): the
// strategy doc's seed-round bar for UrgAns, what it costs, and the release
// outcomes it is meant to move. Display only: numbers come worked out from
// GET /api/admin/cockpit (lib/admin-urgans-usage.ts). One column on a phone.

const number = new Intl.NumberFormat('en');

function Label({ text, info }: { text: string; info: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">{text}</p>
      <InfoTip label={text} text={info} />
    </div>
  );
}

function Tile({ label, info, value, fact }: { label: string; info: string; value: string; fact?: string | null }) {
  return (
    <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <Label text={label} info={info} />
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-content-primary">{value}</p>
      {fact ? <p className="mt-1 text-xs leading-5 text-content-secondary">{fact}</p> : null}
    </div>
  );
}

export function UrgansPanel({ usage }: { usage: UrgansUsage }) {
  const share = usage.share;
  const gap = share ? formatTargetGap(share.current, usage.target) : null;
  const bars = (usage.creditWeeks ?? []).map((week) => ({
    key: week.endsAt,
    tick: formatWeekEnd(week.endsAt),
    label: `7 days to ${formatWeekEnd(week.endsAt)}`,
    value: week.credits,
  }));
  const creditsThisWeek = usage.creditWeeks ? usage.creditWeeks[usage.creditWeeks.length - 1].credits : null;

  return (
    <div className="mt-6">
      <Label
        text="UrgAns and releases"
        info="How much paying teams lean on UrgAns, what it costs us, and the release results it should move. Same 7 days as the North Star."
      />

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-5">
          <Label
            text="Paying teams using UrgAns in releases"
            info="Of this week's active paying teams (the North Star teams), the share where someone used UrgAns inside a rollout in the last 7 days: chat, a plan, a press kit, a pitch kit, a Spotify pitch, a status update or a task outcome reply tied to a release. Status updates and outcome replies charge no credits but each one is a real AI call we pay for, so they count. An outcome with no note makes no AI call and does not count. The seed-round target is half, every week."
          />
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-content-primary">
            {share ? formatPercent(share.current.rate) : 'Not tracked'}
          </p>
          {share ? (
            <>
              <p className="mt-1 text-sm text-content-secondary">
                {formatShareFact(share.current)}
                {gap ? `. ${gap}.` : ''}
              </p>
              <p className="mt-1 text-sm text-content-secondary">
                {formatLastWeekShare(share.previous)}
                {share.current.activePayingTeams > 0
                  ? `. ${number.format(share.current.usingAnywhere)} used UrgAns at all this week.`
                  : ''}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-content-secondary">The AI usage log could not be read.</p>
          )}
        </div>

        <div className="rounded-xl border border-stroke-default bg-bg-surface p-5">
          <Label
            text="Credits spent per week"
            info="UrgAns credits spent by every team, minus refunds, per 7 days. Grants, monthly allowances and top-ups are not spending. Newest on the right."
          />
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-content-primary">
            {creditsThisWeek === null ? 'Not tracked' : number.format(creditsThisWeek)}
          </p>
          <p className="mt-1 text-sm text-content-secondary">
            {!usage.creditWeeks
              ? 'The credit ledger could not be read.'
              : usage.creditsPerActiveTeam === null
                ? 'This week. No active team to divide by.'
                : `This week. ${formatCredits(usage.creditsPerActiveTeam)} per active team.`}
          </p>
          {bars.length > 0 ? (
            <div className="mt-3">
              <AdminBarChart
                title="Credits spent per week, last 8 weeks"
                bars={bars}
                formatValue={(value) => `${number.format(value)} ${value === 1 ? 'credit' : 'credits'}`}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          label="AI cost per active team"
          info="What the AI provider billed us in the last 7 days, divided by this week's active teams, paid or not. Read from the AI usage log, or the credit ledger when the log cannot be read. A failed call's cost is unknown and left out, so this is a floor."
          value={
            !usage.aiCost
              ? 'Not tracked'
              : usage.aiCost.perActiveTeamUsd === null
                ? 'No active team'
                : formatUsd(usage.aiCost.perActiveTeamUsd)
          }
          fact={formatAiCostFact(usage)}
        />
        <Tile
          label="Rollouts that went live"
          info="Real rollouts that went live in the last 7 days: the release date arrived, or every activity was done. The Scoreboard's own rule. Test rollouts are left out."
          value={number.format(usage.liveRollouts.current)}
          fact={formatLiveChange(usage.liveRollouts.current, usage.liveRollouts.previous)}
        />
        <Tile
          label="Second-release rate"
          info="Paying teams whose first rollout went live at least 90 days ago, and the share that started another rollout within those 90 days. The bar is 60%. Teams still inside their 90 days are waiting, not counted."
          value={formatPercent(usage.secondRelease.rate)}
          fact={formatSecondReleaseFact(usage.secondRelease)}
        />
      </div>
    </div>
  );
}
