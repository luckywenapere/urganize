import { NAIRA_PER_CREDIT_CREDITS_ONLY, NAIRA_PER_CREDIT_SUBSCRIBER } from './pricing';

/**
 * Where a team's credits come from, and what each plan grants.
 *
 * THE RULES (founder, 2026-10-01):
 *   - Credits never expire. A team has one balance; unused monthly credits roll
 *     over and nothing ever resets it.
 *   - Every credit is tagged with its SOURCE, one of three: `trial`, `allowance`
 *     (the plan's monthly grant) or `topup` (bought, or granted by hand). The tag
 *     is what lets leftover trial credits be taken back without touching anything
 *     else.
 *   - A trial gets TRIAL_CREDITS, once. If it ends with no plan bought and no
 *     top-up bought, what is left is removed; if either happened, it stays.
 *   - A subscription gets its monthly allowance each billing window. When the
 *     subscription ends the whole balance stays, and the account carries on as a
 *     credits-only account (Solo features, dearer top-ups) until it subscribes.
 *
 * Plan allowances are sized so a team's whole allowance costs about 15% of what it
 * pays, at the 3x markup (pricing.ts), assuming 1,500 naira to the dollar:
 *
 *   solo      150  (7,500 naira a month since 2026-10-17; sized at 5,000)
 *   manager   660  (25,000 since 2026-10-17; sized at 22,000)
 *   label     1,500 (60,000 since 2026-10-17; sized at 50,000)
 *   (The 2026-10-17 reprice left every allowance unchanged: each still costs
 *   at most ~15% of the new price.)
 *   enterprise 1,500 (Group: custom price; Label's amount by default, founder
 *              call 2026-10-02, topped up by hand per deal)
 *
 * Read from `state` AND `tier`, never `tier` alone, for the reason the router's
 * ceiling gives (lib/ai/model-router.ts resolveCeiling): resolveTeamTier reports
 * the uncapped `label` for a trial so that seat and release limits never bite
 * during an evaluation, and reading that as a plan would hand every three-day
 * trial the biggest allowance.
 */
// The pricing cards print these same numbers from @urganize/pricing
// (urgansMonthlyCredits, 2026-10-15). This file may import only its siblings
// (credits-guard.test.ts), so allowance.test.ts holds the two equal.
export const ALLOWANCE_CREDITS = { solo: 150, manager: 660, label: 1500, enterprise: 1500 } as const;

/** What a trial is given, once. */
export const TRIAL_CREDITS = 50;

export const CREDIT_SOURCES = ['trial', 'allowance', 'topup'] as const;
export type CreditSource = (typeof CREDIT_SOURCES)[number];

/** The order a turn draws on them: trial first, so what is left of it is exactly what a removal takes. */
export const SPEND_ORDER: readonly CreditSource[] = CREDIT_SOURCES;

export type TeamForAllowance = { state?: string | null; tier?: string | null };

/**
 * What kind of account this is, which decides what it is granted and what its
 * top-ups cost:
 *   trial         in its trial (or the short grace after it): the one-off grant.
 *   subscriber    paying, or comped (a team the founders gave access to).
 *   credits_only  anything else: a trial that ended, a lapsed or cancelled plan.
 */
export type CreditAccount = 'trial' | 'subscriber' | 'credits_only';

export function creditAccount(team: TeamForAllowance | undefined): CreditAccount {
  switch (team?.state) {
    case 'trial':
    case 'grace':
      return 'trial';
    case 'paid':
    case 'comped':
      return 'subscriber';
    default:
      return 'credits_only';
  }
}

/**
 * The credits granted each billing window. Zero for an account that is not a
 * subscriber: a trial has its one-off grant instead, and a lapsed account is
 * credits-only by definition.
 *
 * A comped team is given the Solo amount, the smallest paid allowance. The founder
 * did not set a number for it; change it here if wrong. A paid team on a plan
 * this does not recognise gets the same, so an unfamiliar plan is never a free
 * Label allowance.
 */
export function monthlyAllowanceCredits(team: TeamForAllowance | undefined): number {
  if (creditAccount(team) !== 'subscriber') return 0;
  if (team?.state !== 'paid') return ALLOWANCE_CREDITS.solo;
  switch (team.tier) {
    case 'manager':
      return ALLOWANCE_CREDITS.manager;
    case 'label':
      return ALLOWANCE_CREDITS.label;
    case 'enterprise':
      return ALLOWANCE_CREDITS.enterprise;
    default:
      return ALLOWANCE_CREDITS.solo;
  }
}

/** Naira per credit for a top-up. Priced here, sold nowhere yet. */
export function topupNairaPerCredit(account: CreditAccount): number {
  return account === 'subscriber' ? NAIRA_PER_CREDIT_SUBSCRIBER : NAIRA_PER_CREDIT_CREDITS_ONLY;
}

export type SourceBalances = { trial: number; allowance: number; topup: number };
export type SourceSplit = Record<CreditSource, number>;

/**
 * How a turn's charge is paid: trial credits first, then the allowance, then the
 * top-up pool. Pure so the split is tested. A source that is empty or negative
 * gives nothing; the last source takes whatever is left, so an overshoot lands in
 * one place (the top-up pool, where it can be seen and repaid) and the parts
 * always add up to the charge.
 */
export function splitSpend(credits: number, balances: SourceBalances): SourceSplit {
  let remaining = Math.max(0, Math.floor(credits));
  const split: SourceSplit = { trial: 0, allowance: 0, topup: 0 };
  for (const source of SPEND_ORDER.slice(0, -1)) {
    const take = Math.min(remaining, Math.max(0, balances[source]));
    split[source] = take;
    remaining -= take;
  }
  split[SPEND_ORDER[SPEND_ORDER.length - 1]] = remaining;
  return split;
}
