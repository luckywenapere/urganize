import { getPlan, isBillingPlanId } from '@urganize/pricing';

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
  trialEndsAt: string | null;
  trialDaysLeft: number;
  expiresAt: string | null;
  trialUsed: boolean;
  allowlisted: boolean;
};

/** Which exit to offer. `null` means offer none. */
export type BillingCta = 'plans' | 'change' | 'contact';

export type BillingSummary = {
  title: string;
  /** Zero or more factual lines under the title, in render order. */
  details: string[];
  cta: BillingCta | null;
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
 * `plan` is a loose string server-side: the three billing ids, plus the legacy
 * flat `access` SKU, admin-provisioned `custom` rows, and `trial_claim` relics
 * from the retired card-on-file flow. Anything unrecognised returns null and the
 * caller falls back to a generic title rather than printing a raw enum.
 */
export function describePlanName(plan: string | null): string | null {
  if (!plan) return null;
  if (isBillingPlanId(plan)) return getPlan(plan).label;
  if (plan === 'access') return 'Access';
  if (plan === 'custom') return 'Custom';
  return null;
}

/** A sales-led tier has no self-serve checkout, so it must not be sent to the picker. */
export function isContactSalesPlan(plan: string | null): boolean {
  return Boolean(plan && isBillingPlanId(plan) && getPlan(plan).contactSales);
}

/**
 * Turn a snapshot into the title, supporting lines, and exit to render.
 *
 * Nothing here threatens the reader with losing access: the paywall gate is
 * currently OFF in code (`requireActiveAccount` early-returns — CLAUDE.md,
 * Resolved blocker #1), so "you will lose access" would not be true today.
 */
export function summarizeBilling(snapshot: BillingSnapshot): BillingSummary {
  // Allowlist first, and unconditionally: an allowlisted account reads back
  // from the API as paid with `plan: 'allowlist'`, so any status-first ordering
  // would show it a plan it does not have and a CTA to change it.
  if (snapshot.allowlisted) {
    return {
      title: 'Complimentary access',
      details: ['This account has the full app without a subscription.'],
      cta: null,
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
    return { title: 'Free trial', details, cta: 'plans' };
  }

  if (snapshot.accountStatus === 'paid') {
    const details: string[] = [];
    // "Active until", never "Renews": this timestamp is when access lapses, and
    // whether it renews depends on the Paystack subscription still being live —
    // which this snapshot does not tell us. The honest phrasing is the one that
    // stays true either way.
    if (expires) details.push(`Active until ${expires}.`);
    return {
      title: planName ? `${planName} plan` : 'Active plan',
      details,
      cta: salesLed ? 'contact' : 'change',
    };
  }

  if (snapshot.accountStatus === 'expired') {
    const details: string[] = [];
    if (expires) details.push(`Ended ${expires}.`);
    return {
      title: planName ? `${planName} plan ended` : 'Plan ended',
      details,
      cta: salesLed ? 'contact' : 'plans',
    };
  }

  return {
    title: 'No plan yet',
    details: [
      snapshot.trialUsed
        ? 'Your free trial has finished.'
        : 'You have a 28-day free trial available, no card needed.',
    ],
    cta: 'plans',
  };
}
