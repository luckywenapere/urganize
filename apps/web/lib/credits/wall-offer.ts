import type { TeamAccessState } from '@/lib/team-billing';

/**
 * When the plan wall shows "Not ready for a plan? Try the assistant for ₦1,500"
 * (#1243, founder approved mocks docs/mocks/credits-on-wall).
 *
 * Only for someone who can buy a pack right then, because the card's button
 * goes straight to payment: the owner or an admin (the checkout refuses anyone
 * else), of a team with no plan (walled, or read only after a paid plan ended;
 * a paying team is refused packs and pays per credit instead), with buying
 * switched on, outside the iOS app (no payment links there). A team that
 * already has credits gets the wall's "Open AI" line instead, so the card hides
 * once the balance is known to be above zero. An unknown balance does not hold
 * the offer back.
 */
export type WallOfferInput = {
  purchasable: boolean;
  isIOSApp: boolean;
  isOwnerOrAdmin: boolean;
  isUpgradeIntent: boolean;
  teamState: TeamAccessState | null;
  balance: number | null;
};

const NO_PLAN_STATES: readonly TeamAccessState[] = ['walled', 'read_only'];

export function showWallCreditsOffer(input: WallOfferInput): boolean {
  if (!input.purchasable || input.isIOSApp) return false;
  if (!input.isOwnerOrAdmin || input.isUpgradeIntent) return false;
  if (!input.teamState || !NO_PLAN_STATES.includes(input.teamState)) return false;
  if (input.balance !== null && input.balance > 0) return false;
  return true;
}
