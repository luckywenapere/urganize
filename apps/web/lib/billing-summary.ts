import { getPlan, getTier, isBillingPlanId, isPricingTierId } from '@urganize/pricing';

// What to SAY about an account's plan (2026-08-13).
//
// Split out of components/settings/BillingSection.tsx so it can be tested:
// vitest.config.ts only collects `lib/**/*.test.ts`, and its own comment names
// billing and plan resolution as the highest-consequence paths in the app. The
// component renders whatever this returns and owns no copy of its own.
//
// Display-only and client-safe: no env reads, no DB, no Paystack. The server
// decides the ACCOUNT STATE (lib/subscription-access.ts); this decides the
// words.

export type BillingAccountStatus = 'unpaid' | 'trial' | 'paid' | 'expired';

/** The subset of `GET /api/subscription-status` this summary needs. */
export type BillingSnapshot = {
  accountStatus: BillingAccountStatus;
  plan: string | null;
  /** subscriptions.status verbatim (or the allowlist sentinel). 'trialing'
   * marks a card-backed trial — a delayed Paystack subscription exists and
   * will charge at trial end unless cancelled. */
  rawStatus: string | null;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  expiresAt: string | null;
  trialUsed: boolean;
  allowlisted: boolean;
  /** A plan the team has agreed to move to that has not started yet —
   *  subscriptions.pending_plan. Only ever set for a DOWNGRADE: an upgrade
   *  applies the moment its prorated charge clears, so it never waits here.
   *  Naming it out loud is the point, because a team that asked to move down and
   *  then sees their old plan name would reasonably think the request was lost. */
  pendingPlan?: string | null;
};

/** Which exit to offer. `null` means offer none.
 *
 * 'reactivate' exists separately from 'plans' because of where each one has to
 * LAND. A team with no access reaches the wall at a bare /locked; a READ-ONLY
 * team has access, so /locked's has-access effect would bounce them straight
 * back into the app. They need ?intent=reactivate. Same picker, different door. */
export type BillingCta = 'plans' | 'change' | 'contact' | 'reactivate';

export type BillingSummary = {
  title: string;
  /** Zero or more factual lines under the title, in render order. */
  details: string[];
  cta: BillingCta | null;
  /** A quieter second action beside the main CTA. 'cancelTrial' renders the
   * card-backed trial's cancel control (POST /api/billing/cancel-trial). */
  secondaryCta: 'cancelTrial' | null;
};

export type BillingSummaryOptions = {
  /** NEXT_PUBLIC_FEATURE_CARD_TRIAL, resolved by the caller — this module
   * stays pure/env-free so it can be tested without stubbing env. */
  cardTrialEnabled?: boolean;
  /** Team access, when NEXT_PUBLIC_FEATURE_HARD_PAYWALL is on. Present means
   * billing is a TEAM question: the copy then talks about the team's trial and,
   * for a member, says plainly that activating is not theirs to do. Absent
   * leaves every string below exactly as it was. */
  team?: {
    state: string;
    trialDaysLeft: number;
    trialEndsAt: string | null;
    isOwnerOrAdmin: boolean;
    teamName: string | null;
  };
};

/**
 * `formatReleaseDate` in lib/release-helpers.ts is not reusable here: it takes a
 * date-ONLY string and appends `T00:00:00`, while every date on this snapshot is
 * a full timestamptz. Same display shape, different input.
 */
export function formatBillingDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The human name of whatever sits on `subscriptions.plan`.
 *
 * Note what this deliberately does NOT return: a price. The amounts in
 * `@urganize/pricing` are today's LIST prices, not necessarily what this account
 * pays — CLAUDE.md records that the 2026-07-14 reprice moved only the display
 * constants while the live Paystack Plan objects kept billing the old rate, so a
 * grandfathered subscriber renews at a figure this package no longer contains.
 * Printing ₦150,000 to someone paying ₦15,000 would be a confident lie. The plan
 * NAME is safe; the number is not, which is why `/locked` — where you are about
 * to buy at the current price — is the only place a figure appears.
 *
 * `plan` is a loose string server-side: the pricing-v2 tier ids, the legacy
 * billing ids, plus the legacy flat `access` SKU, admin-provisioned `custom`
 * rows, and `trial_claim` relics from the retired card-on-file flow. Anything
 * unrecognised returns null and the caller falls back to a generic title rather
 * than printing a raw enum.
 *
 * TIERS ARE CHECKED FIRST, and 'label' is why it matters: that id exists in both
 * generations with different meanings — legacy Label was the sales-led ₦800,000
 * roster plan, tier Label is the self-serve flagship. For a STORED plan value the
 * ambiguity is already settled and needs no feature flag to resolve: 'label' was
 * never in subscriptions_plan_check until the tier migration added it, and
 * PAYSTACK_PLAN_LABEL_* has never been set, so checkout 500s before the
 * constraint could have been reached. No row anywhere carries the legacy meaning
 * (see 20260823100000_pricing_tiers.sql, which relies on the same fact). So a
 * stored 'label' is the tier, full stop.
 */
export function describePlanName(plan: string | null): string | null {
  if (!plan) return null;
  if (isPricingTierId(plan)) return getTier(plan).label;
  if (isBillingPlanId(plan)) return getPlan(plan).label;
  if (plan === 'access') return 'Access';
  if (plan === 'custom') return 'Custom';
  return null;
}

/**
 * A sales-led plan has no self-serve checkout, so it must not be sent to the
 * picker — the caller offers a "contact us" exit instead.
 *
 * Tier-first for the same reason as above, and the practical consequence is the
 * one that would have bitten a real customer: under pricing v2 the sales-led
 * plan is 'enterprise', while 'label' is buyable. Reading 'label' as the legacy
 * contactSales plan would have pointed a lapsed Label subscriber at a mailto
 * instead of the checkout they were trying to reach.
 */
export function isContactSalesPlan(plan: string | null): boolean {
  if (!plan) return false;
  if (isPricingTierId(plan)) return Boolean(getTier(plan).contactSales);
  if (isBillingPlanId(plan)) return Boolean(getPlan(plan).contactSales);
  return false;
}

/**
 * Turn a snapshot into the title, supporting lines, and exit to render.
 *
 * Nothing here threatens the reader with losing access: the paywall gate is
 * currently OFF in code (`requireActiveAccount` early-returns — CLAUDE.md,
 * Resolved blocker #1), so "you will lose access" would not be true today.
 */
export function summarizeBilling(
  snapshot: BillingSnapshot,
  options: BillingSummaryOptions = {}
): BillingSummary {
  // Allowlist first, and unconditionally: an allowlisted account reads back
  // from the API as paid with `plan: 'allowlist'`, so any status-first ordering
  // would show it a plan it does not have and a CTA to change it.
  if (snapshot.allowlisted) {
    return {
      title: 'Complimentary access',
      details: ['This account has the full app without a subscription.'],
      cta: null,
      secondaryCta: null,
    };
  }

  // Team trial (hard paywall). Takes precedence over the per-user trial copy
  // below, because under this flag the team's dates are what actually govern
  // access and the profile's may be unset entirely.
  const team = options.team;
  if (team && (team.state === 'trial' || team.state === 'grace')) {
    const teamTrialEnds = formatBillingDate(team.trialEndsAt);
    const details =
      team.state === 'grace'
        ? ['Your trial has just ended.']
        : [
            team.trialDaysLeft <= 0
              ? 'Ends today.'
              : `${team.trialDaysLeft} day${team.trialDaysLeft === 1 ? '' : 's'} left.`,
          ];
    if (teamTrialEnds && team.state === 'trial') details.push(`Ends ${teamTrialEnds}.`);
    details.push(
      team.isOwnerOrAdmin
        ? 'One plan covers everyone on your team.'
        : 'Your team admin activates the plan for everyone.'
    );
    return {
      title: 'Free trial',
      details,
      cta: team.isOwnerOrAdmin ? 'plans' : null,
      secondaryCta: null,
    };
  }

  if (team && team.state === 'comped') {
    return {
      title: 'Complimentary access',
      details: ['Your team has the full app without a subscription.'],
      cta: null,
      secondaryCta: null,
    };
  }

  // Read-only: they paid, the payment lapsed, and they keep every read forever.
  //
  // Guarded on the person's OWN status, the shape the 'paid' branch below uses.
  // The OWNER's snapshot reads 'expired' with a real plan on it, so they get the
  // richer per-user copy at the end of this function (plan name, the date it
  // ended) with a read-only line added there. This branch is for everyone ELSE
  // on the team: money rows are owner-keyed, so a member reads back 'unpaid',
  // and with /api/trial/start 404ing under this flag their trialUsed stays false
  // forever — which would drop them all the way through to "you have a 28-day
  // free trial available", the exact bug the 'paid' branch had to be added to
  // fix.
  if (team && team.state === 'read_only' && snapshot.accountStatus !== 'expired') {
    return {
      title: 'Plan ended',
      details: [
        'Your team can still see everything, and nothing has been removed.',
        team.isOwnerOrAdmin
          ? 'Update your payment to start making changes again.'
          : 'Your team admin can update the payment.',
      ],
      cta: team.isOwnerOrAdmin ? 'reactivate' : null,
      secondaryCta: null,
    };
  }

  if (team && team.state === 'walled') {
    return {
      title: 'No plan yet',
      details: [
        'Everything your team created is safe and waiting.',
        team.isOwnerOrAdmin
          ? 'Activate a plan to pick up where you left off.'
          : 'Your team admin activates the plan for everyone.',
      ],
      cta: team.isOwnerOrAdmin ? 'plans' : null,
      secondaryCta: null,
    };
  }

  // A member of a PAYING team. Money rows are owner-keyed by design, so this
  // person's own snapshot still reads 'unpaid', and with /api/trial/start
  // 404ing under this flag their trialUsed stays false forever — which dropped
  // them all the way through to the "you have a free trial available" fallback
  // at the end of this function and handed them a CTA to the wall, for a team
  // that already pays. Guarded on their OWN status rather than their role so a
  // paying owner still gets the richer paid copy below (plan name, active
  // until, cancel). 'paid' was the last unhandled TeamAccessState here.
  if (team && team.state === 'paid' && snapshot.accountStatus !== 'paid') {
    return {
      title: 'Active plan',
      details: ['Your team has an active plan.', 'There is nothing for you to pay.'],
      cta: null,
      secondaryCta: null,
    };
  }

  const planName = describePlanName(snapshot.plan);
  const trialEnds = formatBillingDate(snapshot.trialEndsAt);
  const expires = formatBillingDate(snapshot.expiresAt);
  const salesLed = isContactSalesPlan(snapshot.plan);

  if (snapshot.accountStatus === 'trial') {
    const details = [
      snapshot.trialDaysLeft <= 0
        ? 'Ends today.'
        : `${snapshot.trialDaysLeft} day${snapshot.trialDaysLeft === 1 ? '' : 's'} left.`,
    ];
    if (trialEnds) details.push(`Ends ${trialEnds}.`);
    // Card-backed trial (rawStatus 'trialing'): a delayed Paystack
    // subscription exists and will charge at trial end, so say which plan
    // starts and offer the cancel control. A plain no-card trial (rawStatus
    // null — the profile-only path) has nothing to cancel.
    const isCardBacked = snapshot.rawStatus === 'trialing';
    if (isCardBacked && planName) {
      details.push(`${planName} plan starts when your trial ends.`);
    }
    return {
      title: 'Free trial',
      details,
      cta: 'plans',
      secondaryCta: isCardBacked ? 'cancelTrial' : null,
    };
  }

  if (snapshot.accountStatus === 'paid') {
    const details: string[] = [];
    // "Active until", never "Renews": this timestamp is when access lapses, and
    // whether it renews depends on the Paystack subscription still being live —
    // which this snapshot does not tell us. The honest phrasing is the one that
    // stays true either way. A CANCELLED subscription is the one case we do
    // know: it will not renew, so say so instead of a bare "Active until"
    // (covers both a cancelled card-trial — which reads as paid via snapshot
    // path 1 — and an ordinarily cancelled subscriber running out the period
    // they paid for).
    if (expires) {
      details.push(
        snapshot.rawStatus === 'cancelled'
          ? `Cancelled — access until ${expires}.`
          : `Active until ${expires}.`
      );
    }
    // A pending move reads BEFORE the expiry line in importance, so it goes
    // first: "you are on Label until the 30th, then Manager" is one sentence
    // about the future, and burying it under "Active until" inverts it.
    const pendingName = describePlanName(snapshot.pendingPlan ?? null);
    if (pendingName && expires) {
      details.unshift(`Moving to ${pendingName} on ${expires}, as you asked.`);
    }
    return {
      title: planName ? `${planName} plan` : 'Active plan',
      details,
      cta: salesLed ? 'contact' : 'change',
      secondaryCta: null,
    };
  }

  if (snapshot.accountStatus === 'expired') {
    const isReadOnlyTeam = team?.state === 'read_only';
    const details: string[] = [];
    if (expires) details.push(`Ended ${expires}.`);
    // Under read-only mode an expired plan no longer means the wall, so say what
    // is actually true: they can see everything and nothing was removed.
    if (isReadOnlyTeam) {
      details.push('Your team can still see everything, and nothing has been removed.');
    }
    return {
      title: planName ? `${planName} plan ended` : 'Plan ended',
      details,
      // 'reactivate' rather than 'plans': a read-only team HAS access, so a bare
      // /locked bounces them back into the app. See BillingCta.
      cta: salesLed ? 'contact' : isReadOnlyTeam ? 'reactivate' : 'plans',
      secondaryCta: null,
    };
  }

  return {
    title: 'No plan yet',
    details: [
      snapshot.trialUsed
        ? 'Your free trial has finished.'
        : options.cardTrialEnabled
          ? 'You have a 28-day free trial available.'
          : 'You have a 28-day free trial available, no card needed.',
    ],
    cta: 'plans',
    secondaryCta: null,
  };
}
