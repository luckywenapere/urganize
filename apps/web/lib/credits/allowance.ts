/**
 * The credits a team is given each billing window, by plan.
 *
 * Founder numbers, 2026-10-01: sized so a team's WHOLE allowance costs about 15%
 * of what it pays, at a 3x markup (see pricing.ts), assuming about 1,500 naira to
 * the dollar. If the real rate is worse the share grows and these should shrink.
 *
 *   solo      150  (5,000 naira a month)
 *   manager   660  (22,000)
 *   label     1,500 (50,000)
 *
 * A team that is not PAYING (a trial, a comped team, a grace period, a team that
 * lapsed) gets the Solo amount. That is the one number here the founder did not
 * set, taken as the smallest paid allowance so nobody evaluating the product
 * gets more than the cheapest customer; change TRIAL_ALLOWANCE_CREDITS if wrong.
 *
 * Read from `state` AND `tier`, never `tier` alone, for the reason the router's
 * ceiling gives (lib/ai/model-router.ts resolveCeiling): resolveTeamTier reports
 * the uncapped `label` for a trial so that seat and release limits never bite
 * during an evaluation, and reading that as a plan would give every three-day
 * trial the biggest allowance.
 */
export const ALLOWANCE_CREDITS = { solo: 150, manager: 660, label: 1500 } as const;
export const TRIAL_ALLOWANCE_CREDITS = ALLOWANCE_CREDITS.solo;

export type TeamForAllowance = { state?: string | null; tier?: string | null };

export function monthlyAllowanceCredits(team: TeamForAllowance | undefined): number {
  if (!team || team.state !== 'paid') return TRIAL_ALLOWANCE_CREDITS;
  switch (team.tier) {
    case 'solo':
      return ALLOWANCE_CREDITS.solo;
    case 'manager':
      return ALLOWANCE_CREDITS.manager;
    case 'label':
      return ALLOWANCE_CREDITS.label;
    default:
      return TRIAL_ALLOWANCE_CREDITS;
  }
}

/**
 * How a turn's charge is paid: the allowance first (it expires, so it should be
 * spent before the top-up that does not), then the top-up pool. Pure so the split
 * is tested. Either pool can go negative on the last turn, and only the second
 * takes the rest, so the overshoot lands in one place.
 */
export function splitSpend(
  credits: number,
  balances: { allowance: number; topup: number }
): { fromAllowance: number; fromTopup: number } {
  const wanted = Math.max(0, Math.floor(credits));
  const fromAllowance = Math.min(wanted, Math.max(0, balances.allowance));
  return { fromAllowance, fromTopup: wanted - fromAllowance };
}
