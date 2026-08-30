import { describe, expect, it } from 'vitest';
import {
  BILLING_PLANS,
  BILLING_PLAN_ORDER,
  PRICING_TIERS,
  PRICING_TIER_ORDER,
  annualSavingCopy,
  getTierPrice,
  tierHighlights,
} from '@urganize/pricing';
import { ADMIN_ASSIGNABLE_PLANS } from './admin-teams';
import { resolveCheckoutPurchase } from './billing-plans';
import type { PricingTierId } from '@urganize/pricing';
import {
  ENTITLEMENTS,
  LEGACY_FOUNDING_TIER,
  TRIAL_TIER,
  UNLIMITED,
  getEntitlement,
  isUnlimited,
  isWithinLimit,
  remainingAllowance,
  resolveEntitlements,
  LIMIT_WARNING_RATIO,
  checkLimit,
  isApproachingLimit,
  resolveTeamTier,
} from './entitlements';

const TIERS = PRICING_TIER_ORDER;

// THE ONE THAT MUST NEVER GO GREEN BY BEING DELETED.
//
// data_export is a trust feature, not a revenue feature: a buyer who cannot get
// their catalogue back out has been trapped rather than sold to. The spec says
// "do not gate it, do not gate it later", and a comment cannot enforce "later".
// This can. If a future change needs export gated, THIS FAILING is the
// conversation to have, not an obstacle to route around.
describe('data_export is ungated on every tier, forever', () => {
  it('is true for every tier', () => {
    for (const tier of TIERS) {
      expect(resolveEntitlements(tier).data_export, `${tier} must export`).toBe(true);
    }
  });

  it('is true for the tier a trial resolves to', () => {
    expect(resolveEntitlements(TRIAL_TIER).data_export).toBe(true);
  });

  it('is true for the tier a grandfathered account resolves to', () => {
    expect(resolveEntitlements(LEGACY_FOUNDING_TIER).data_export).toBe(true);
  });

  it('is not a limit, so it can never be silently reduced to zero', () => {
    for (const tier of TIERS) {
      expect(typeof resolveEntitlements(tier).data_export).toBe('boolean');
    }
  });
});

describe('the tier table matches what is published', () => {
  it('caps Manager at exactly 4 seats, 3 active releases and 150 assistant actions', () => {
    const manager = resolveEntitlements('manager');
    expect(manager.seats).toBe(4);
    expect(manager.active_releases).toBe(3);
    expect(manager.urgans_monthly_actions).toBe(150);
  });

  it('caps Solo at exactly 1 artist, 2 seats, 1 active release and 40 assistant actions', () => {
    const solo = resolveEntitlements('solo');
    expect(solo.artists).toBe(1);
    expect(solo.seats).toBe(2);
    expect(solo.active_releases).toBe(1);
    expect(solo.urgans_monthly_actions).toBe(40);
  });

  // The ladder is the reason Solo exists: one artist, then a roster, then no
  // ceiling. If two rungs ever read the same, the middle card stops earning its
  // place on the page.
  it('widens every ceiling as the ladder goes up', () => {
    for (const key of ['artists', 'seats', 'active_releases', 'urgans_monthly_actions'] as const) {
      const solo = resolveEntitlements('solo')[key];
      const manager = resolveEntitlements('manager')[key];
      expect(typeof solo, `solo ${key}`).toBe('number');
      expect(typeof manager, `manager ${key}`).toBe('number');
      expect(solo as number, `${key} solo < manager`).toBeLessThan(manager as number);
      expect(resolveEntitlements('label')[key], `label ${key}`).toBeNull();
    }
  });

  // Seats are never capped above the entry tier. A seat wall pushes half the
  // release back into WhatsApp and churns the account, which is the opposite of
  // what a coordination product is for.
  it('never caps seats or releases on label or enterprise', () => {
    for (const tier of ['label', 'enterprise'] as const) {
      expect(isUnlimited(resolveEntitlements(tier).seats), `${tier} seats`).toBe(true);
      expect(isUnlimited(resolveEntitlements(tier).active_releases), `${tier} releases`).toBe(true);
      expect(isUnlimited(resolveEntitlements(tier).urgans_monthly_actions)).toBe(true);
    }
  });

  it('gives every tier the hand-written rollout template and file attachments', () => {
    for (const tier of TIERS) {
      expect(resolveEntitlements(tier).rollout_template_default).toBe(true);
      expect(resolveEntitlements(tier).file_attachments).toBe(true);
    }
  });

  it('escalates support and reserves priority and enterprise features', () => {
    expect(getEntitlement('manager', 'support_channel')).toBe('email');
    expect(getEntitlement('label', 'support_channel')).toBe('whatsapp_24h');
    expect(getEntitlement('enterprise', 'support_channel')).toBe('sla');

    // Priority routing and the two enterprise features are enterprise-only.
    for (const key of ['urgans_priority', 'sso', 'sub_teams'] as const) {
      expect(getEntitlement('manager', key), `manager ${key}`).toBe(false);
      expect(getEntitlement('label', key), `label ${key}`).toBe(false);
      expect(getEntitlement('enterprise', key), `enterprise ${key}`).toBe(true);
    }
  });

  it('gates concierge onboarding, which is real founder hours', () => {
    expect(getEntitlement('manager', 'concierge_onboarding')).toBe(false);
    expect(getEntitlement('label', 'concierge_onboarding')).toBe(true);
    expect(getEntitlement('enterprise', 'concierge_onboarding')).toBe(true);
  });

  it('declares an entitlement for every tier, with no gaps', () => {
    const keys = Object.keys(ENTITLEMENTS.manager).sort();
    for (const tier of TIERS) {
      expect(Object.keys(ENTITLEMENTS[tier]).sort(), `${tier} keys`).toEqual(keys);
    }
  });
});

// The migration story depends on these two prices being the same number. Label
// reuses the Paystack Plan objects that today's monthly/annual point at, so if
// one moves and the other does not, checkout advertises one figure and charges
// another — the gap this repo has shipped four times.
describe('Label is priced identically to the live plans it inherits', () => {
  it('matches monthly', () => {
    expect(getTierPrice('label', 'monthly')?.amount).toBe(BILLING_PLANS.monthly.prices.NGN.amount);
    expect(getTierPrice('label', 'monthly')?.minorUnit).toBe(
      BILLING_PLANS.monthly.prices.NGN.minorUnit
    );
  });

  it('matches annual', () => {
    expect(getTierPrice('label', 'annual')?.amount).toBe(BILLING_PLANS.annual.prices.NGN.amount);
    expect(getTierPrice('label', 'annual')?.minorUnit).toBe(
      BILLING_PLANS.annual.prices.NGN.minorUnit
    );
  });

  // Regression guard: the LIVE paywall renders BILLING_PLANS, so this PR must
  // not have moved it. If this fails, a real checkout's advertised price moved.
  it('leaves the live plan amounts untouched at NGN 80,000 / 800,000', () => {
    expect(BILLING_PLANS.monthly.prices.NGN.amount).toBe(80_000);
    expect(BILLING_PLANS.annual.prices.NGN.amount).toBe(800_000);
  });
});

describe('tier prices and the sales-led tier', () => {
  // The ladder has to read as a ladder. A card priced above the one to its
  // right is the kind of inversion this repo has shipped before (Annual once
  // exceeded Label in Naira), and it makes the whole table look unconsidered.
  it('prices the tiers in ascending order, left to right', () => {
    for (const interval of ['monthly', 'annual'] as const) {
      const solo = getTierPrice('solo', interval)?.amount ?? 0;
      const manager = getTierPrice('manager', interval)?.amount ?? 0;
      const label = getTierPrice('label', interval)?.amount ?? 0;
      expect(solo, `solo/${interval}`).toBeGreaterThan(0);
      expect(solo, `solo/${interval}`).toBeLessThan(manager);
      expect(manager, `manager/${interval}`).toBeLessThan(label);
    }
  });

  it('holds the 2-months-free ratio on every priced tier', () => {
    for (const tier of ['solo', 'manager', 'label'] as const) {
      const monthly = getTierPrice(tier, 'monthly')?.amount ?? 0;
      const annual = getTierPrice(tier, 'annual')?.amount ?? 0;
      expect(annual, `${tier} annual`).toBe(monthly * 10);
    }
  });

  // Never render a price for a tier we quote by hand. Returning null forces the
  // caller into the "Let's talk" branch instead of formatting a zero.
  it('has no price at all for enterprise', () => {
    expect(PRICING_TIERS.enterprise.contactSales).toBe(true);
    expect(PRICING_TIERS.enterprise.prices).toBeUndefined();
    expect(getTierPrice('enterprise', 'monthly')).toBeNull();
    expect(getTierPrice('enterprise', 'annual')).toBeNull();
  });

  // The stored id and the customer-facing name deliberately differ for the
  // sales-led tier: it is called "Group" on every surface a customer reads
  // (founder call, 2026-08-24 — "Enterprise" is B2B jargon that means nothing
  // to a label head, and a distributor is not a label either), while the id
  // stays `enterprise` because it is written into subscriptions.plan and
  // allowed by subscriptions_plan_check. Renaming the id needs a migration and
  // a backfill; this test is what turns "tidying" it into a failure here
  // rather than a silently re-graded row in production.
  it('calls the sales-led tier Group while keeping the enterprise id', () => {
    expect(PRICING_TIERS.enterprise.id).toBe('enterprise');
    expect(PRICING_TIERS.enterprise.label).toBe('Group');
    // No tier displays the old name anywhere.
    for (const tier of TIERS) {
      expect(PRICING_TIERS[tier].label).not.toMatch(/enterprise/i);
    }
  });

  it('recommends exactly one tier, and it is the one we sell', () => {
    const recommended = TIERS.filter((tier) => PRICING_TIERS[tier].recommended);
    expect(recommended).toEqual(['label']);
  });

  it('orders the cards cheapest first, ending at the sales-led tier', () => {
    expect(PRICING_TIER_ORDER).toEqual(['solo', 'manager', 'label', 'enterprise']);
  });

  it('carries a price for every interval on every self-serve tier', () => {
    for (const tier of TIERS) {
      if (PRICING_TIERS[tier].contactSales) continue;
      for (const interval of ['monthly', 'annual'] as const) {
        const price = getTierPrice(tier, interval);
        expect(price, `${tier}/${interval}`).not.toBeNull();
        expect(price?.minorUnit).toBe((price?.amount ?? 0) * 100);
      }
    }
  });
});

describe('limit helpers', () => {
  it('lets anything through an unlimited ceiling', () => {
    expect(isWithinLimit(0, UNLIMITED)).toBe(true);
    expect(isWithinLimit(10_000, UNLIMITED)).toBe(true);
    expect(remainingAllowance(10_000, UNLIMITED)).toBeNull();
  });

  // The boundary is the whole point: at 3 of 3 the next one is refused.
  it('refuses the item that would exceed the ceiling, not the one that reaches it', () => {
    expect(isWithinLimit(2, 3)).toBe(true);
    expect(isWithinLimit(3, 3)).toBe(false);
    expect(isWithinLimit(4, 3)).toBe(false);
  });

  it('reports headroom, and never a negative one', () => {
    expect(remainingAllowance(0, 4)).toBe(4);
    expect(remainingAllowance(3, 4)).toBe(1);
    expect(remainingAllowance(4, 4)).toBe(0);
    // A team that downgraded below its seat count: the rule is block new
    // invites and deactivate nobody, so this must read 0 rather than -6.
    expect(remainingAllowance(10, 4)).toBe(0);
  });

  it('identifies the unlimited sentinel', () => {
    expect(isUnlimited(UNLIMITED)).toBe(true);
    expect(isUnlimited(0)).toBe(false);
    expect(isUnlimited(4)).toBe(false);
  });
});

describe('trial and legacy accounts get the flagship, not the entry tier', () => {
  it('resolves a trial to full access', () => {
    expect(TRIAL_TIER).toBe('label');
    expect(isUnlimited(resolveEntitlements(TRIAL_TIER).seats)).toBe(true);
  });

  it('resolves a grandfathered account to label entitlements in full', () => {
    expect(resolveEntitlements(LEGACY_FOUNDING_TIER)).toEqual(ENTITLEMENTS.label);
  });
});

describe('every tier in the pricing package has entitlements', () => {
  it('has no tier without a row, and no row without a tier', () => {
    const tierIds = Object.keys(PRICING_TIERS).sort() as PricingTierId[];
    expect(Object.keys(ENTITLEMENTS).sort()).toEqual(tierIds);
  });
});

// ── Tier resolution ─────────────────────────────────────────────────────────
//
// THE PROPERTY THAT MAKES ENFORCEMENT SAFE TO MERGE: everything that is not
// confidently a paying Manager resolves to `label`, which is uncapped. A read
// failure, an unknown plan, a legacy plan, a trial, a comped team and a
// grandfathered deal all land there. Inverting any of these into `manager`
// would cap real teams by accident.
describe('resolveTeamTier fails open', () => {
  it('never caps a team on an unknown, empty or absent plan', () => {
    for (const ownerPlan of [null, undefined, '', '   ', 'mystery', 'trial_card']) {
      expect(resolveTeamTier({ state: 'paid', ownerPlan }), String(ownerPlan)).toBe('label');
    }
  });

  it('maps every legacy plan id onto label, which inherits their price', () => {
    for (const plan of ['monthly', 'annual', 'yearly', 'access', 'custom', 'founding']) {
      expect(resolveTeamTier({ state: 'paid', ownerPlan: plan }), plan).toBe('label');
    }
  });

  it('reads a tier id straight through', () => {
    expect(resolveTeamTier({ state: 'paid', ownerPlan: 'manager' })).toBe('manager');
    expect(resolveTeamTier({ state: 'paid', ownerPlan: 'label' })).toBe('label');
    expect(resolveTeamTier({ state: 'paid', ownerPlan: 'enterprise' })).toBe('enterprise');
  });

  it('trims whitespace rather than treating it as unknown', () => {
    expect(resolveTeamTier({ state: 'paid', ownerPlan: ' manager ' })).toBe('manager');
  });

  // A trial is full access by definition. Capping seats mid-evaluation teaches
  // the buyer the wrong thing about what they are evaluating.
  it('never caps a trial, a grace window or a comped team', () => {
    for (const state of ['trial', 'grace', 'comped'] as const) {
      expect(resolveTeamTier({ state, ownerPlan: 'manager' }), state).toBe('label');
    }
  });

  it('gives a grandfathered deal label entitlements, whatever the subscription says', () => {
    expect(resolveTeamTier({ state: 'paid', ownerPlan: 'manager', billingPlan: 'founding' })).toBe(
      'label'
    );
  });

  it('does not treat a custom-price marker as a grandfathered deal', () => {
    // billing_plan = 'custom' records a negotiated rate; only 'founding' is the
    // lifetime lock the grandfathering rule talks about.
    expect(resolveTeamTier({ state: 'paid', ownerPlan: 'manager', billingPlan: 'custom' })).toBe(
      'manager'
    );
  });

  it('errs permissive for a walled team, where entitlements are moot anyway', () => {
    expect(resolveTeamTier({ state: 'walled', ownerPlan: 'manager' })).toBe('label');
    // Read-only likewise: a team that cannot write cannot reach a ceiling, so
    // entitlements are moot and the permissive answer is the safe one.
    expect(resolveTeamTier({ state: 'read_only', ownerPlan: 'manager' })).toBe('label');
  });
});

describe('checkLimit', () => {
  it('lets an uncapped tier through at any count', () => {
    const verdict = checkLimit({ tier: 'label', key: 'seats', current: 500 });
    expect(verdict.allowed).toBe(true);
    if (verdict.allowed) expect(verdict.remaining).toBeNull();
  });

  // The boundary: 3 of 4 may add one more, 4 of 4 may not.
  it('blocks the addition that would exceed the ceiling, not the one that reaches it', () => {
    expect(checkLimit({ tier: 'manager', key: 'seats', current: 3 }).allowed).toBe(true);
    expect(checkLimit({ tier: 'manager', key: 'seats', current: 4 }).allowed).toBe(false);
  });

  it('reports headroom while allowed', () => {
    const verdict = checkLimit({ tier: 'manager', key: 'active_releases', current: 1 });
    expect(verdict.allowed).toBe(true);
    if (verdict.allowed) expect(verdict.remaining).toBe(2);
  });

  it('carries the key, the numbers and an upgrade target when blocked', () => {
    const verdict = checkLimit({ tier: 'manager', key: 'active_releases', current: 3 });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.key).toBe('active_releases');
      expect(verdict.limit).toBe(3);
      expect(verdict.current).toBe(3);
      expect(verdict.upgradeTo).toBe('label');
    }
  });

  // A team that downgraded below its seat count is over the limit, and the rule
  // is block new invites while deactivating nobody. So it must read as blocked
  // rather than throwing or going negative.
  it('blocks cleanly when a team is already past its ceiling', () => {
    const verdict = checkLimit({ tier: 'manager', key: 'seats', current: 11 });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.current).toBe(11);
  });
});

describe('limit copy obeys the house rules', () => {
  const blockedMessages = (['seats', 'active_releases', 'urgans_monthly_actions'] as const).map(
    (key) => {
      const verdict = checkLimit({ tier: 'manager', key, current: 9_999 });
      if (verdict.allowed) throw new Error(`${key} should be blocked at 9999`);
      return verdict.message;
    }
  );

  it('never says workspace and never uses an em dash', () => {
    for (const message of blockedMessages) {
      expect(message.toLowerCase()).not.toContain('workspace');
      expect(message).not.toContain('—');
    }
  });

  it('never threatens loss of access or guilts the reader', () => {
    for (const message of blockedMessages) {
      expect(message).not.toMatch(/lose access|locked out|you failed|too many/i);
    }
  });

  // The number is interpolated from the limit, so re-cutting a tier cannot
  // leave the copy quoting the old figure.
  it('quotes the real ceiling, not a hardcoded one', () => {
    const seats = checkLimit({ tier: 'manager', key: 'seats', current: 99 });
    if (seats.allowed) throw new Error('expected blocked');
    expect(seats.message).toContain(String(ENTITLEMENTS.manager.seats));
  });

  it('names the tier that lifts the limit', () => {
    for (const message of blockedMessages) expect(message).toContain('Label');
  });

  // The assistant ceiling is the one that must reassure: the spec says all
  // other product functions keep working.
  it('reassures on the assistant ceiling rather than sounding like an outage', () => {
    const verdict = checkLimit({ tier: 'manager', key: 'urgans_monthly_actions', current: 200 });
    if (verdict.allowed) throw new Error('expected blocked');
    expect(verdict.message).toMatch(/keeps working/i);
    expect(verdict.message).toMatch(/reset/i);
  });
});

describe('isApproachingLimit', () => {
  it('never warns an uncapped tier', () => {
    expect(isApproachingLimit({ tier: 'label', key: 'urgans_monthly_actions', current: 10_000 })).toBe(
      false
    );
  });

  it('warns at 80 percent of the ceiling and not before', () => {
    // Manager gets 150 assistant actions, so the banner starts at 120.
    expect(isApproachingLimit({ tier: 'manager', key: 'urgans_monthly_actions', current: 119 })).toBe(
      false
    );
    expect(isApproachingLimit({ tier: 'manager', key: 'urgans_monthly_actions', current: 120 })).toBe(
      true
    );
  });

  it('still warns once past the ceiling', () => {
    expect(isApproachingLimit({ tier: 'manager', key: 'seats', current: 99 })).toBe(true);
  });

  it('uses the documented 80 percent ratio by default', () => {
    expect(LIMIT_WARNING_RATIO).toBe(0.8);
  });
});

// ── The caps are LIVE, and the guard that has to survive that ────────────────
//
// This block used to assert the opposite: that enforcement was inert because
// nothing could write `subscriptions.plan = 'manager'`. That stopped being true
// on 2026-08-24 when NEXT_PUBLIC_FEATURE_PRICING_V2 was switched on in
// production — and the old tripwire DID NOT FIRE, which is the lesson worth
// keeping. It watched BILLING_PLAN_ORDER and ADMIN_ASSIGNABLE_PLANS, and
// `manager` never entered either: it became purchasable through a THIRD path,
// `resolveCheckoutPurchase`'s `pricingV2 && isSelfServeTier(plan)` branch. A
// test pointed at two constant arrays cannot see a new branch, so this one is
// pointed at the checkout decision itself.
describe('the seat cap is reachable, and only for a team that bought Manager', () => {
  // The reachability half. Env-independent on purpose: getTierPaystackPlanCode
  // reads a PAYSTACK_PLAN_* var that no test environment sets, so a configured
  // checkout would fail here for a reason that has nothing to do with the
  // question. What matters is whether `manager` is RECOGNISED as purchasable,
  // which is exactly the rejection this asserts on.
  const rejectedAsUnknownPlan = (pricingV2: boolean): boolean => {
    const result = resolveCheckoutPurchase({
      plan: 'manager',
      currency: 'NGN',
      interval: 'monthly',
      pricingV2,
    });
    return !result.ok && /plan must be/i.test(result.error);
  };

  it('is a plan checkout will sell once pricing v2 is on', () => {
    expect(rejectedAsUnknownPlan(true)).toBe(false);
  });

  it('is not a plan checkout will sell with pricing v2 off', () => {
    expect(rejectedAsUnknownPlan(false)).toBe(true);
  });

  // The artists ceiling became enforceable on 2026-08-30, when rosters shipped.
  // Until then nothing in the product could add a second artist, so the number
  // was published and gated nothing.
  it('caps a paying Manager team at its fifth artist', () => {
    const tier = resolveTeamTier({ state: 'paid', ownerPlan: 'manager' });
    expect(checkLimit({ tier, key: 'artists', current: 4 }).allowed).toBe(true);
    const blocked = checkLimit({ tier, key: 'artists', current: 5 });
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) throw new Error('expected blocked');
    expect(blocked.message).toContain('5');
    // The published line and the refusal have to agree, or a manager reads one
    // number on the pricing page and meets another in the product.
    expect(tierHighlights('manager')[0]).toContain('5');
  });

  it('never caps artists on the tiers that advertise unlimited', () => {
    for (const tier of ['label', 'enterprise'] as const) {
      expect(isUnlimited(resolveEntitlements(tier).artists), `${tier} artists`).toBe(true);
      expect(checkLimit({ tier, key: 'artists', current: 999 }).allowed).toBe(true);
    }
  });

  it('caps a paying Manager team at its fourth seat, so the fifth invite is refused', () => {
    const tier = resolveTeamTier({ state: 'paid', ownerPlan: 'manager' });
    expect(tier).toBe('manager');
    // Three seats used, inviting a fourth: fine. Four used, inviting a fifth:
    // refused. `current` is the count BEFORE the new seat, and both invite
    // routes call it that way.
    expect(checkLimit({ tier, key: 'seats', current: 3 }).allowed).toBe(true);
    const blocked = checkLimit({ tier, key: 'seats', current: 4 });
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) throw new Error('expected blocked');
    expect(blocked.message).toContain('4');
  });

  // The half that protects everyone who already pays us. Switching the flag on
  // must not newly cap a single existing customer, and this is why it did not:
  // every plan value that existed before tiers resolves to the uncapped tier.
  const LEGACY_WRITABLE_PLANS = [
    ...BILLING_PLAN_ORDER,
    ...ADMIN_ASSIGNABLE_PLANS,
    'yearly',
    'access',
  ];

  it('leaves every pre-tier plan uncapped, so no existing team was capped by the flip', () => {
    for (const plan of LEGACY_WRITABLE_PLANS) {
      const tier = resolveTeamTier({ state: 'paid', ownerPlan: plan });
      const entitlements = resolveEntitlements(tier);
      expect(isUnlimited(entitlements.artists), `${plan} -> ${tier} artists`).toBe(true);
      expect(isUnlimited(entitlements.seats), `${plan} -> ${tier} seats`).toBe(true);
      expect(isUnlimited(entitlements.active_releases), `${plan} -> ${tier} releases`).toBe(true);
      expect(
        isUnlimited(entitlements.urgans_monthly_actions),
        `${plan} -> ${tier} assistant actions`
      ).toBe(true);
    }
  });

  // Manager is still not something an admin can hand out by hand, so the only
  // way onto a capped tier remains an actual purchase.
  it('confirms manager is still not admin-assignable', () => {
    expect(ADMIN_ASSIGNABLE_PLANS).not.toContain('manager');
  });

  // SOLO IS ON THE PRICING PAGE BUT NOT ON SALE, and this is the tripwire for
  // the day that changes. It is the tightest ceiling in the table (1 release, 2
  // seats), so it is the one tier where switching it on without minting its
  // Paystack Plans and widening subscriptions_plan_check would be felt
  // immediately. Pointed at the checkout DECISION rather than at a constant
  // array, for the reason this whole block exists: the last tripwire watched
  // arrays and missed a new branch.
  it('does not sell Solo yet, in either flag state', () => {
    for (const pricingV2 of [true, false]) {
      const result = resolveCheckoutPurchase({
        plan: 'solo',
        currency: 'NGN',
        interval: 'monthly',
        pricingV2,
      });
      expect(result.ok, `pricingV2=${pricingV2}`).toBe(false);
    }
    expect(ADMIN_ASSIGNABLE_PLANS).not.toContain('solo');
  });

  // A trial is full access by definition, so an evaluating team never meets the
  // ceiling — even though its owner may already carry a manager plan row.
  it('does not cap a team that is still trialling', () => {
    const tier = resolveTeamTier({ state: 'trial', ownerPlan: 'manager' });
    expect(isUnlimited(resolveEntitlements(tier).seats)).toBe(true);
  });
});

// ── The published numbers and the enforced numbers are one number ────────────
//
// The marketing site renders tier ceilings and cannot import from this app, so
// before 2026-08-24 a public page would have had to carry its own copy of every
// figure. These tests exist to stop that copy coming back: the ceilings live in
// @urganize/pricing and this map reads them.

describe('countable ceilings are derived, not duplicated', () => {
  it('reads every ceiling straight off the shared tier limits', () => {
    for (const tier of PRICING_TIER_ORDER) {
      const limits = PRICING_TIERS[tier].limits;
      expect(ENTITLEMENTS[tier].artists).toBe(limits.artists);
      expect(ENTITLEMENTS[tier].seats).toBe(limits.seats);
      expect(ENTITLEMENTS[tier].active_releases).toBe(limits.activeReleases);
      expect(ENTITLEMENTS[tier].urgans_monthly_actions).toBe(limits.urgansMonthlyActions);
    }
  });

  it('agrees with UNLIMITED on what "no ceiling" looks like', () => {
    // Both sides use null. If one ever moved to Infinity or 0 the comparison
    // above would still pass while isWithinLimit silently changed meaning.
    expect(UNLIMITED).toBeNull();
    expect(PRICING_TIERS.label.limits.seats).toBeNull();
  });
});

describe('tierHighlights', () => {
  it('states each ceiling using the enforced number, never a written-in one', () => {
    const managerLimits = PRICING_TIERS.manager.limits;
    const lines = tierHighlights('manager');
    // Asserted against the limit rather than against "4", so re-cutting the
    // tier moves the test with the product instead of breaking it.
    expect(lines.some((line) => line.includes(String(managerLimits.seats)))).toBe(true);
    expect(lines.some((line) => line.includes(String(managerLimits.activeReleases)))).toBe(true);
    expect(
      lines.some((line) => line.includes(String(managerLimits.urgansMonthlyActions)))
    ).toBe(true);
  });

  it('says unlimited where there is no ceiling, and quotes no number', () => {
    const lines = tierHighlights('label');
    const ceilingLines = lines.slice(0, 4);
    for (const line of ceilingLines) {
      expect(line.toLowerCase()).toContain('unlimited');
      expect(line).not.toMatch(/\d/);
    }
  });

  // The roster line leads every card and is built from `limits.artists`, so a
  // re-cut tier cannot leave "Up to 5 artists" sitting on a card that no longer
  // means it.
  it('leads with the roster size, taken from the limit', () => {
    expect(tierHighlights('solo')[0]).toBe('1 artist');
    expect(tierHighlights('manager')[0]).toBe(
      `Up to ${PRICING_TIERS.manager.limits.artists} artists`
    );
    expect(tierHighlights('label')[0]).toBe('Unlimited artists');
    expect(tierHighlights('enterprise')[0]).toBe('Unlimited artists');
  });

  it('includes every perk after the ceilings', () => {
    for (const tier of PRICING_TIER_ORDER) {
      const lines = tierHighlights(tier);
      for (const perk of PRICING_TIERS[tier].perks) {
        expect(lines).toContain(perk);
      }
    }
  });
});

describe('public tier copy tells the truth', () => {
  // Founder call, 2026-08-24: Group may be sold on SSO and sub-teams in a
  // CONTRACT, but a public page cannot claim them. Both are declared in the map
  // above and read by nothing, so this is enforced structurally rather than
  // left to a reviewer noticing.
  it('never advertises an unbuilt feature', () => {
    expect(ENTITLEMENTS.enterprise.sso).toBe(true);
    expect(ENTITLEMENTS.enterprise.sub_teams).toBe(true);
    const enterpriseCopy = tierHighlights('enterprise').join(' ').toLowerCase();
    expect(enterpriseCopy).not.toContain('sso');
    expect(enterpriseCopy).not.toContain('single sign');
    expect(enterpriseCopy).not.toContain('sub-team');
    expect(enterpriseCopy).not.toContain('sub team');
  });

  it('phrases the annual saving in months and never as a percentage', () => {
    expect(annualSavingCopy('solo')).toBe('2 months free');
    expect(annualSavingCopy('manager')).toBe('2 months free');
    expect(annualSavingCopy('label')).toBe('2 months free');
    // No annual price to save against.
    expect(annualSavingCopy('enterprise')).toBeNull();
  });

  it('carries no percentage, no em dash and no "workspace" in the tier copy', () => {
    // The pricing spec forbids a percentage saving, the marketing copy rules
    // forbid em dashes in house copy, and "workspace" is banned from tier copy
    // specifically: it is what WE call the thing, not what a manager calls the
    // place their releases live.
    for (const tier of PRICING_TIER_ORDER) {
      const copy = [PRICING_TIERS[tier].audience, ...tierHighlights(tier)].join(' ');
      expect(copy, tier).not.toContain('%');
      expect(copy, tier).not.toContain('\u2014');
      expect(copy.toLowerCase(), tier).not.toContain('workspace');
    }
  });
});
