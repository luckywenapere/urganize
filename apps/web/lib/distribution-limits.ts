import {
  DISTRIBUTION_ALLOWANCE,
  EXTRA_RELEASE_PRICE_NAIRA,
  TRM_PER_RELEASE_NAIRA,
  type PricingTierId,
  type TeamDistributionPlan,
} from '@urganize/pricing';

// What a plan's "Distribution included" covers, and what a send beyond it costs
// (founder, 2026-10-26; mocks docs/mocks/distribution-limits). Pure and
// client-safe: lib/distribution-limits-server.ts reads the rows, this decides.
//
// THE RULES
//   Artists   The plan's artists are the first ones the team sends under the
//             plan (Pro 1, Label 5), for as long as the team is on it.
//   Releases  Each release sent under the plan counts once in the Lagos month
//             it was first sent (Pro 7, Label 10) on a monthly-paying team;
//             a team paying yearly is on TRM's yearly plan, which has no
//             monthly cap (2026-11-07, #1112). The count starts again
//             on the 1st.
//   Beyond    A send for another artist, or past the month's count, is one paid
//             single (₦2,000, of which we owe TRM 80%: ₦1,600; TRM confirmed
//             2026-11-07 that pay per release is for singles only), paid before
//             it goes.
//   Resends   A release that already counted, or was paid for, never counts or
//             costs again (a resubmit after a rejection is free).
//
// Only a team whose plan includes distribution has limits. Solo, trials and
// lapsed plans send with the artist's own TRM plan, which is not ours to count.

export const EXTRA_RELEASE_PRICE_KOBO = EXTRA_RELEASE_PRICE_NAIRA * 100;
/** What we owe TRM for that release. */
export const TRM_PER_RELEASE_KOBO = TRM_PER_RELEASE_NAIRA * 100;
export const EXTRA_RELEASE_REFERENCE_PREFIX = 'urgextra-';
export const EXTRA_RELEASE_SOURCE = 'distribution_extra';

export function isExtraReleaseReference(reference: unknown): reference is string {
  return typeof reference === 'string' && reference.startsWith(EXTRA_RELEASE_REFERENCE_PREFIX);
}

/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** The Lagos month a moment falls in, "2026-10", and when the next one starts. */
export function lagosMonth(at: Date): { key: string; nextStartsAt: Date } {
  const local = new Date(at.getTime() + LAGOS_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  const nextStartsAt = new Date(Date.UTC(year, month + 1, 1) - LAGOS_OFFSET_MS);
  return { key, nextStartsAt };
}

/** Who a release is for. The artist row when there is one, else the name. */
export function artistKeyFor(artistId: string | null, artistName: string | null): string | null {
  if (artistId) return `id:${artistId}`;
  const name = (artistName ?? '').trim().toLowerCase();
  return name ? `name:${name}` : null;
}

export type DistributionUseRow = {
  releaseId: string;
  artistKey: string;
  artistName: string | null;
  kind: 'plan' | 'extra';
  /** Lagos month the send counted in, "2026-10". */
  month: string;
  status: 'pending' | 'paid' | 'used';
  createdAt: string;
};

export type DistributionVerdict =
  /** Inside the plan: send it, it counts. */
  | 'ok'
  /** This release already counted under the plan: a resend is free. */
  | 'already_counted'
  /** Paid for as an extra release: send it, it does not count. */
  | 'paid_extra'
  /** Another artist than the plan's: pay for this release or move up. */
  | 'artist'
  /** The month's releases are used: pay for this release or wait. */
  | 'releases';

export type DistributionLimitView = {
  tier: PricingTierId;
  artistsLimit: number;
  /** Releases a month the plan covers, or null on TRM's yearly plan (no cap). */
  releasesLimit: number | null;
  /** Releases counted under the plan this Lagos month. */
  used: number;
  /** When the count starts again (the 1st, 00:00 Lagos), ISO. */
  resetsAt: string;
  /** The plan's artists, by name, in the order they were first sent. */
  planArtists: string[];
  verdict: DistributionVerdict;
  extraPriceKobo: number;
};

export function needsPayment(verdict: DistributionVerdict): boolean {
  return verdict === 'artist' || verdict === 'releases';
}

export function decideDistributionLimit(input: {
  tier: PricingTierId;
  rows: readonly DistributionUseRow[];
  releaseId: string;
  artistKey: string | null;
  now: Date;
  /** The team's TRM plan from how it pays us. 'yearly' lifts the monthly
   *  release count; anything else keeps it. Defaults to monthly. */
  teamPlan?: TeamDistributionPlan;
}): DistributionLimitView | null {
  const allowance = DISTRIBUTION_ALLOWANCE[input.tier];
  if (!allowance) return null;
  const { key: month, nextStartsAt } = lagosMonth(input.now);

  const planRows = [...input.rows]
    .filter((row) => row.kind === 'plan')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const artistOrder: string[] = [];
  const artistNames = new Map<string, string>();
  for (const row of planRows) {
    if (artistOrder.includes(row.artistKey)) continue;
    artistOrder.push(row.artistKey);
    artistNames.set(row.artistKey, row.artistName?.trim() || 'An artist');
  }
  const planArtistKeys = artistOrder.slice(0, allowance.artists);
  const used = new Set(planRows.filter((row) => row.month === month).map((row) => row.releaseId)).size;

  let verdict: DistributionVerdict = 'ok';
  const paidExtra = input.rows.some(
    (row) => row.kind === 'extra' && row.releaseId === input.releaseId && (row.status === 'paid' || row.status === 'used')
  );
  if (planRows.some((row) => row.releaseId === input.releaseId)) verdict = 'already_counted';
  else if (paidExtra) verdict = 'paid_extra';
  else if (
    input.artistKey &&
    !planArtistKeys.includes(input.artistKey) &&
    planArtistKeys.length >= allowance.artists
  ) {
    verdict = 'artist';
  } else if (input.teamPlan !== 'yearly' && used >= allowance.releasesPerMonth) verdict = 'releases';

  return {
    tier: input.tier,
    artistsLimit: allowance.artists,
    releasesLimit: input.teamPlan === 'yearly' ? null : allowance.releasesPerMonth,
    used,
    resetsAt: nextStartsAt.toISOString(),
    planArtists: planArtistKeys.map((key) => artistNames.get(key) ?? 'An artist'),
    verdict,
    extraPriceKobo: EXTRA_RELEASE_PRICE_KOBO,
  };
}

/** What Paystack reports for an extra-release checkout, reduced to what settling reads. */
export type VerifiedExtraRelease = {
  status: string;
  currency: string;
  amountKobo: number;
  metadata: Record<string, unknown> | null;
};

/** Whether a Paystack transaction really paid for one extra release. The
 *  webhook body and the callback are claims; this checks Paystack's own record
 *  against the fixed price, to the kobo. */
export function checkExtraReleasePayment(
  verified: VerifiedExtraRelease
): { ok: true; releaseId: string; workspaceId: string } | { ok: false; reason: 'not_paid' | 'mismatch' } {
  if (verified.status !== 'success') return { ok: false, reason: 'not_paid' };
  const meta = verified.metadata ?? {};
  if (meta.source !== EXTRA_RELEASE_SOURCE) return { ok: false, reason: 'mismatch' };
  const releaseId = typeof meta.release_id === 'string' ? meta.release_id : '';
  const workspaceId = typeof meta.workspace_id === 'string' ? meta.workspace_id : '';
  if (!releaseId || !workspaceId) return { ok: false, reason: 'mismatch' };
  if (verified.currency !== 'NGN' || verified.amountKobo !== EXTRA_RELEASE_PRICE_KOBO) return { ok: false, reason: 'mismatch' };
  return { ok: true, releaseId, workspaceId };
}
