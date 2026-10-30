/**
 * The Distribute card on Home (2026-10-27, founder approved). An extra way into
 * distribution: the Distribute step inside each rollout is unchanged.
 *
 * Teams on Manager, Label or Group get a button to the Distribute tab. Every
 * other team (Solo, a trial, credits only) is offered the Manager plan, which is
 * where distribution comes with the plan. Pure so the decision can be tested.
 *
 * Why the access STATE is read and not the tier alone: the server resolves a
 * trial, a grace period, a comp and a walled or read-only team to the flagship
 * tier on purpose (resolveTeamTier in lib/entitlements.ts), so `tier: 'label'`
 * on a trial does not mean the team bought Label.
 */

import type { PricingTierId } from '@urganize/pricing';
import type { TeamAccessState } from '../team-billing';

export type DistributeCardView = 'hidden' | 'upgrade' | 'distribute';

export const HOME_DISTRIBUTE_COPY = {
  label: 'Distribute',
  title: 'Get your music to Spotify, Apple Music, Audiomack and more',
  upgradeLine: 'Comes with the Manager plan.',
  upgradeAction: 'Upgrade to Manager',
  // The offer can be put away for a month (founder, Oct 31, 2026, #919).
  notNow: 'Not now',
  distributeAction: 'Distribute',
} as const;

export const HOME_DISTRIBUTE_HREF = '/dashboard/distribute';

/** The tiers distribution comes with. Group is tier id `enterprise`. */
const DISTRIBUTION_TIERS: ReadonlySet<PricingTierId> = new Set<PricingTierId>(['manager', 'label', 'enterprise']);

/**
 * What the card shows. `access` is the team's access answer from
 * /api/subscription-status (lib/team-billing-client.ts); null or undefined
 * means it has not arrived or could not be read, and the card waits rather than
 * flash the wrong button.
 */
export function decideDistributeCard(
  access: { state: TeamAccessState; tier?: PricingTierId } | null | undefined
): DistributeCardView {
  if (!access) return 'hidden';
  switch (access.state) {
    case 'trial':
    case 'grace':
    case 'credits_only':
      return 'upgrade';
    case 'paid':
      if (!access.tier) return 'hidden';
      return DISTRIBUTION_TIERS.has(access.tier) ? 'distribute' : 'upgrade';
    case 'comped':
      // Admin-granted free access, treated as the flagship everywhere else.
      return 'distribute';
    case 'read_only':
    case 'walled':
    default:
      // Read only: the server sends no real tier for a lapsed team, and the
      // read-only strip already asks for payment. Walled: Home is not shown.
      return 'hidden';
  }
}
