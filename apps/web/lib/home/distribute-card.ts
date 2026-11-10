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

/** `ask_admin`: the upgrade offer, seen by a teammate who is not an owner or
 *  admin. They cannot pay for the team (team checkout refuses them, and the
 *  self-serve checkout would charge their own account), so they nudge the
 *  owner instead (founder, Oct 31, 2026). */
export type DistributeCardView = 'hidden' | 'upgrade' | 'ask_admin' | 'distribute';

export const HOME_DISTRIBUTE_COPY = {
  label: 'Distribute',
  title: 'Get your music to Spotify, Apple Music, Audiomack and more',
  // "Pro Plus" since pricing v4 (2026-11-08): the checkout is still plan id 'pro'.
  upgradeLine: 'Comes with the Pro Plus plan.',
  upgradeAction: 'Upgrade to Pro Plus',
  // The offer can be put away for a month (founder, Oct 31, 2026, #919).
  notNow: 'Not now',
  askAdminLine: 'Comes with the Pro Plus plan. Your admin can upgrade the team.',
  askAdminAction: 'Ask your admin to upgrade',
  askAdminSent: 'Your admin has been asked',
  askAdminFailed: 'Could not reach your admin. Try again.',
  distributeAction: 'Distribute',
} as const;

export const HOME_DISTRIBUTE_HREF = '/dashboard/distribute';

/** The tiers distribution comes with. Group is tier id `enterprise`. */
const DISTRIBUTION_TIERS: ReadonlySet<PricingTierId> = new Set<PricingTierId>(['solo_plus', 'pro', 'label', 'enterprise']);

/**
 * What the card shows. `access` is the team's access answer from
 * /api/subscription-status (lib/team-billing-client.ts); null or undefined
 * means it has not arrived or could not be read, and the card waits rather than
 * flash the wrong button.
 */
export function decideDistributeCard(
  access:
    | { state: TeamAccessState; tier?: PricingTierId; isOwnerOrAdmin?: boolean }
    | null
    | undefined
): DistributeCardView {
  const view = decideDistributeOffer(access);
  // Only an owner or admin can pay for the team. Unknown counts as a member,
  // so nobody is ever sent to a checkout that would charge the wrong account.
  if (view === 'upgrade' && access?.isOwnerOrAdmin !== true) return 'ask_admin';
  return view;
}

function decideDistributeOffer(
  access: { state: TeamAccessState; tier?: PricingTierId } | null | undefined
): 'hidden' | 'upgrade' | 'distribute' {
  if (!access) return 'hidden';
  switch (access.state) {
    case 'trial':
    case 'grace':
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
