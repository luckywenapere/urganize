import Link from 'next/link';
import { InfoTip } from '@/components/shared/HelpTip';
import type { DirectoryTile } from '@/lib/directory-growth';
import { formatCount, formatReplyRate, formatWeekCompare } from '@/lib/directory-growth-format';

// The Directory tile on the founder cockpit (2026-10-10, iteration 7). The
// number the directory is judged by is how many rollouts that started in it went
// live; the other three say whether the road to it is moving. Display only:
// numbers come worked out from GET /api/admin/cockpit (lib/directory-growth.ts),
// and every source that could not be read shows "Not tracked", never a zero.
// One column on a phone.

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

export function DirectoryTilePanel({ tile }: { tile: DirectoryTile }) {
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label
          text="Directory"
          info="Whether people in the directory turn into work. The big number is rollouts that started in the directory and went live this month, the one that matters. The rest are the road to it."
        />
        <Link
          href="/admin/directory"
          className="text-xs text-content-secondary underline underline-offset-2 hover:text-content-primary"
        >
          Weekly detail
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-4 sm:col-span-2 lg:col-span-1">
          <Label
            text="Live from the directory"
            info="Rollouts that a directory request named when it was accepted, and that went live this month (the release day arrived, or every activity was done). Counted once each. Not tracked until requests record which rollout they started."
          />
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-content-primary">
            {formatCount(tile.liveThisMonth)}
          </p>
          <p className="mt-1 text-xs leading-5 text-content-secondary">This month</p>
        </div>
        <Tile
          label="Profiles claimed"
          info="Profiles somebody claimed in the last 7 days: a person took over a profile a team made for them."
          value={tile.claimedThisWeek ? formatCount(tile.claimedThisWeek.current) : 'Not tracked'}
          fact={formatWeekCompare(tile.claimedThisWeek)}
        />
        <Tile
          label="Requests sent"
          info="Work requests sent from the directory in the last 7 days."
          value={tile.requestsThisWeek ? formatCount(tile.requestsThisWeek.current) : 'Not tracked'}
          fact={formatWeekCompare(tile.requestsThisWeek)}
        />
        <Tile
          label="Reply rate"
          info="Of requests with a known outcome in the last 8 weeks, the share that got an answer, yes or no. Requests still waiting are left out; a request nobody answers in 7 days counts as closed. The bar is about 40%."
          value={formatReplyRate(tile.replyRate)}
          fact="Last 8 weeks"
        />
      </div>
    </div>
  );
}
