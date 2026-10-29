// The two tags on each Distribute row (Oct 29, 2026, #850): where the rollout
// is with stores, and its smart link. Pure: no IO, safe in the browser. The
// read that feeds it is app/api/distribute/summary.
//
// No partner is named (there will be more than one), and the link is always
// the "smart link", never the "pre-save link" (Oyin, same day).

import { readStats, smartLinkPhase } from './altlink/rules';

export type DistributeChip = { label: string; tone: 'live' | 'done' | 'error' | 'quiet' };

export type DistributeRow = { stores: DistributeChip | null; link: DistributeChip | null };

/** A distribution_submissions status as a partner-free tag. Nothing sent yet: no tag. */
export function storesChip(status: string | null | undefined): DistributeChip | null {
  switch (status) {
    case 'submitted':
    case 'validating':
    case 'accepted':
    case 'processing':
      return { label: 'Sent to stores', tone: 'live' };
    case 'published':
      return { label: 'In stores', tone: 'done' };
    case 'rejected':
    case 'needs_account':
      return { label: 'Needs a fix', tone: 'error' };
    case 'takedown_requested':
    case 'taken_down':
      return { label: 'Taken down', tone: 'quiet' };
    default:
      return null;
  }
}

export type SmartLinkRowFacts = {
  status: string;
  url: string | null;
  presave_signups: number | null;
  stats: unknown;
};

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** The smart link tag, from the stored row and its cached numbers (never a live Altlink call). */
export function linkChip(row: SmartLinkRowFacts | null, releaseDate: string | null, nowMs: number): DistributeChip {
  const phase = smartLinkPhase(row, releaseDate, nowMs);
  if (phase === 'none') return { label: 'No smart link yet', tone: 'quiet' };
  if (phase === 'creating') return { label: 'Making smart link', tone: 'quiet' };
  if (phase === 'failed') return { label: 'Smart link not made', tone: 'error' };
  const stats = readStats(row?.stats);
  if (phase === 'presave') {
    const presaves = Math.max(stats?.presaves ?? 0, row?.presave_signups ?? 0);
    return { label: presaves > 0 ? count(presaves, 'pre-save', 'pre-saves') : 'Smart link live', tone: 'live' };
  }
  const clicks = stats?.clicks ?? 0;
  return { label: clicks > 0 ? count(clicks, 'click', 'clicks') : 'Smart link live', tone: 'live' };
}
