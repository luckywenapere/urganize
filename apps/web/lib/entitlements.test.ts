import { describe, expect, it } from 'vitest';
import {
  BILLING_PLANS,
  BILLING_PLAN_ORDER,
  PRICING_TIERS,
  PRICING_TIER_ORDER,
  ANNUAL_MONTHS_BILLED,
  SIX_MONTH_MONTHS_BILLED,
  DEFAULT_SELLING_INTERVAL,
  SELLABLE_INTERVALS,
  annualSavingCopy,
  formatTierPrice,
  getTierPrice,
  tierHighlights,
} from '@urganize/pricing';
import { ADMIN_ASSIGNABLE_PLANS } from './admin-teams';
import { isRecurringPlan, isSelfServeTier, resolveCheckoutPurchase } from './billing-plans';
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
  minimumTierWith,
} from './entitlements';

// The tiers a visitor SEES. Copy and ordering rules apply to these.
const TIERS = PRICING_TIER_ORDER;

// Every tier that EXISTS, display-retired ones included. Structural checks use
// this rather than TIERS, so a future tier that comes off PRICING_TIER_ORDER
// while staying in PRICING_TIERS (the way `enterprise` briefly did between
// 2026-08-30 and 2026-09-08) is still covered. Currently identical to TIERS —
// `enterprise` was removed from PRICING_TIERS entirely on 2026-09-09, so there
// is no display-retired tier left to differ on.
const ALL_TIERS = Object.keys(PRICING_TIERS) as PricingTierId[];

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
  it('caps Manager at exactly 3 artists, 5 seats, 3 active releases and 150 assistant actions', () => {
    // 3 artists / 5 seats since 2026-10-17 (founder-approved reprice); it was
    // 5 artists / 4 seats.
    const manager = resolveEntitlements('manager');
    expect(manager.artists).toBe(3);
    expect(manager.seats).toBe(5);
    expect(manager.active_releases).toBe(3);
    expect(manager.urgans_monthly_actions).toBe(150);
  });

  it('caps Solo at exactly 1 artist, 2 seats, 1 active release and 40 assistant actions', () => {
    // Two seats since 2026-10-17 (founder-approved reprice: the artist and
    // their manager). It was one seat from 2026-10-02.
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
  it('never caps seats or releases on label', () => {
    const tier = 'label';
    expect(isUnlimited(resolveEntitlements(tier).seats), `${tier} seats`).toBe(true);
    expect(isUnlimited(resolveEntitlements(tier).active_releases), `${tier} releases`).toBe(true);
    expect(isUnlimited(resolveEntitlements(tier).urgans_monthly_actions)).toBe(true);
  });

  it('gives every tier the hand-written rollout template and file attachments', () => {
    for (const tier of TIERS) {
      expect(resolveEntitlements(tier).rollout_template_default).toBe(true);
      expect(resolveEntitlements(tier).file_attachments).toBe(true);
    }
  });

  it('escalates support from Manager to Label', () => {
    expect(getEntitlement('manager', 'support_channel')).toBe('email');
    expect(getEntitlement('label', 'support_channel')).toBe('whatsapp_24h');
  });

  // Group (id `enterprise`) was the one tier with 'sla' support, priority
  // routing, sso and sub-teams — all four gone with it on 2026-09-09. This is
  // the replacement for a test that used to assert `enterprise` carried them;
  // now that no such tier exists, the meaningful assertion is that nothing
  // does.
  it('reserves priority routing, sla support, sso and sub-teams for nothing', () => {
    for (const tier of TIERS) {
      expect(getEntitlement(tier, 'urgans_priority'), `${tier} urgans_priority`).toBe(false);
      expect(getEntitlement(tier, 'sso'), `${tier} sso`).toBe(false);
      expect(getEntitlement(tier, 'sub_teams'), `${tier} sub_teams`).toBe(false);
      expect(getEntitlement(tier, 'support_channel'), `${tier} support_channel`).not.toBe('sla');
    }
  });

  it('gates concierge onboarding, which is real founder hours', () => {
    expect(getEntitlement('manager', 'concierge_onboarding')).toBe(false);
    expect(getEntitlement('label', 'concierge_onboarding')).toBe(true);
  });

  // UrgAns embedded actions (2026-09-03): the first feature-by-tier gate in
  // this map that is not a countable ceiling. Solo keeps chat only.
  it('gates UrgAns embedded actions to Manager and above', () => {
    expect(getEntitlement('solo', 'urgans_embedded_actions')).toBe(false);
    expect(getEntitlement('manager', 'urgans_embedded_actions')).toBe(true);
    expect(getEntitlement('label', 'urgans_embedded_actions')).toBe(true);
  });

  it('declares an entitlement for every tier, with no gaps', () => {
    const keys = Object.keys(ENTITLEMENTS.manager).sort();
    for (const tier of ALL_TIERS) {
      expect(Object.keys(ENTITLEMENTS[tier]).sort(), `${tier} keys`).toEqual(keys);
    }
  });
});

// Label used to be pinned to these amounts, because its tier prices had to
// equal the live monthly/annual Plans it shared. Label went sales-led on
// 2026-08-30 and carries no prices at all, so the pinning tests went with them
// — but the guard below matters MORE now, not less: those Plan objects still
// renew every live monthly, annual and Label subscription.
describe('the live plan amounts', () => {
  // Regression guard: the LIVE paywall renders BILLING_PLANS, so no pricing
  // edit may move it. If this fails, a real checkout's advertised price moved.
  it('are untouched at NGN 80,000 / 800,000', () => {
    expect(BILLING_PLANS.monthly.prices.NGN.amount).toBe(80_000);
    expect(BILLING_PLANS.annual.prices.NGN.amount).toBe(800_000);
  });
});

describe('tier prices and the sales-led tier', () => {
  // The ladder has to read as a ladder. A card priced above the one to its
  // right is the kind of inversion this repo has shipped before (Annual once
  // exceeded Label in Naira), and it makes the whole table look unconsidered.
  it('prices the tiers in ascending order, left to right', () => {
    // Two priced cards since 2026-08-30, then a conversation. Derived from the
    // order rather than named, so this keeps holding if a tier is added.
    const priced = PRICING_TIER_ORDER.filter((tier) => !PRICING_TIERS[tier].contactSales);
    expect(priced.length).toBeGreaterThan(1);
    let previous = 0;
    for (const tier of priced) {
      const amount = getTierPrice(tier, DEFAULT_SELLING_INTERVAL)?.amount ?? 0;
      expect(amount, tier).toBeGreaterThan(previous);
      previous = amount;
    }
  });

  // THE SHAPE OF THE 2026-09-10 REPRICE, held structurally rather than by a copy
  // sweep. It replaces the 2026-09-08 bar ("a monthly figure appears nowhere"),
  // which was true while annual was the only interval on sale and is deliberately
  // false now: monthly is the price we set. What holds instead is that no tier
  // carries a YEARLY figure, so a yearly price that disagrees with the monthly
  // one cannot be typed into the data at all.
  it('stores a monthly price only, and computes the yearly one', () => {
    // Three periods since 2026-10-22: 6 months is five months' money, a year ten.
    expect(SELLABLE_INTERVALS).toEqual(['monthly', 'six_month', 'annual']);
    expect(DEFAULT_SELLING_INTERVAL).toBe('monthly');
    for (const tier of ALL_TIERS) {
      const monthly = PRICING_TIERS[tier].monthlyPrice;
      if (!monthly) continue;
      expect(getTierPrice(tier, 'monthly'), `${tier}/monthly`).toEqual(monthly);
      const annual = getTierPrice(tier, 'annual');
      expect(annual?.amount, `${tier}/annual`).toBe(monthly.amount * ANNUAL_MONTHS_BILLED);
      // The kobo leg is derived too, so it cannot fall out of step with the
      // naira one — a mismatch there is what a Paystack charge is built on.
      expect(annual?.minorUnit, `${tier}/annual kobo`).toBe((annual?.amount ?? 0) * 100);
      const six = getTierPrice(tier, 'six_month');
      expect(six?.amount, `${tier}/six_month`).toBe(monthly.amount * SIX_MONTH_MONTHS_BILLED);
      expect(six?.minorUnit, `${tier}/six_month kobo`).toBe((six?.amount ?? 0) * 100);
    }
  });

  // THE REGRESSION GUARD ON DERIVED MONEY. Yearly amounts are not typed
  // anywhere, so a change to ANNUAL_MONTHS_BILLED silently moves every one of
  // them — including tiers whose yearly Plan is already minted, which is how this
  // repo has five times advertised one price and charged another. If this fails,
  // the arithmetic moved: mint the Plans and repoint the vars BEFORE shipping it.
  it('resolves the yearly prices to the figures the Plans must be minted at', () => {
    // 2026-10-22 reprice: Solo keeps ₦75,000 a year; Manager is ₦300,000 and
    // Label ₦1,000,000. Their Plans are new env vars (_1M/_6M/_12M), minted
    // only on the founder's yes, so nothing is charged at these figures until
    // then: an unset var hides the period.
    expect(getTierPrice('solo', 'annual')?.amount).toBe(75_000);
    expect(getTierPrice('manager', 'annual')?.amount).toBe(300_000);
    expect(getTierPrice('label', 'annual')?.amount).toBe(1_000_000);
    expect(getTierPrice('solo', 'six_month')?.amount).toBe(37_500);
    expect(getTierPrice('manager', 'six_month')?.amount).toBe(150_000);
    expect(getTierPrice('label', 'six_month')?.amount).toBe(500_000);
  });

  it('labels each price by its interval, spelled out', () => {
    // "/month" and "/year" rather than "/mo" and "/yr": the founder's copy rules
    // ask for fifth-grade readable, and an abbreviation is one more thing to
    // decode. The no-argument call takes the default, which is monthly.
    expect(formatTierPrice('solo')).toBe('₦7,500/month');
    expect(formatTierPrice('manager')).toBe('₦30,000/month');
    expect(formatTierPrice('label')).toBe('₦100,000/month');
    expect(formatTierPrice('manager', 'six_month')).toBe('₦150,000/6 months');
    expect(formatTierPrice('solo', 'annual')).toBe('₦75,000/year');
    expect(formatTierPrice('manager', 'annual')).toBe('₦300,000/year');
    expect(formatTierPrice('label', 'annual')).toBe('₦1,000,000/year');
  });

  it('phrases the yearly saving in months and never as a percentage', () => {
    // A percentage invites an argument about how it was calculated; "2 months
    // free" is something a manager can check against their own statement.
    for (const tier of PRICING_TIER_ORDER) {
      // A sales-led tier has no price, so there is no saving to state.
      if (PRICING_TIERS[tier].contactSales) {
        expect(annualSavingCopy(tier), tier).toBeNull();
        continue;
      }
      expect(annualSavingCopy(tier), tier).toBe('2 months free');
    }
  });

  // Never render a price for a tier we quote by hand. Returning null forces the
  // caller into the "Let's talk" branch instead of formatting a zero. Written
  // over every contactSales tier rather than naming one, so a future sales-led
  // tier cannot ship still carrying an amount.
  it('renders no price for the sales-led tier, which is Group alone', () => {
    // Group (id `enterprise`) came back 2026-10-02 as the one sales-led tier.
    // The loop proves the refusal for every contactSales tier rather than
    // naming Group, so a second sales-led tier cannot ship carrying an amount.
    const salesLed = ALL_TIERS.filter((tier) => PRICING_TIERS[tier].contactSales);
    expect(salesLed).toEqual(['enterprise']);
    for (const tier of salesLed) {
      expect(PRICING_TIERS[tier].monthlyPrice, `${tier} monthlyPrice`).toBeUndefined();
      expect(getTierPrice(tier, 'monthly'), `${tier}/monthly`).toBeNull();
      expect(getTierPrice(tier, 'annual'), `${tier}/annual`).toBeNull();
      expect(formatTierPrice(tier), `${tier} formatted`).toBeNull();
    }
  });

  // Group (id `enterprise`) was the sales-led tier, called "Group" on every
  // customer-facing surface (founder call, 2026-08-24) while the id stayed
  // `enterprise` because it was written into subscriptions.plan. It was
  // removed entirely on 2026-09-09 — not hidden, not renamed, DELETED — so
  // there is no `enterprise` member of PricingTierId left to carry either
  // name. This is what stops either from quietly coming back.
  it('calls the enterprise id Group, and no tier says enterprise to a customer', () => {
    // Back 2026-10-02. The id stays `enterprise` because subscriptions.plan
    // stores it and subscriptions_plan_check permits it; the name a customer
    // reads is Group, on every surface.
    expect(PRICING_TIERS.enterprise.label).toBe('Group');
    for (const tier of ALL_TIERS) {
      expect(PRICING_TIERS[tier].label).not.toMatch(/enterprise/i);
      expect(PRICING_TIERS[tier].audience).not.toMatch(/enterprise/i);
    }
  });

  it('gives Group every Label entitlement, uncapped', () => {
    expect(ENTITLEMENTS.enterprise).toEqual(ENTITLEMENTS.label);
    expect(PRICING_TIERS.enterprise.limits).toEqual({
      artists: null,
      seats: null,
      activeReleases: null,
      urgansMonthlyActions: null,
    });
  });

  it('recommends exactly one tier, and it is the one we sell', () => {
    // ON MANAGER since 2026-10-17 (founder-approved reprice: Manager "becomes
    // the RECOMMENDED plan"). It sat on Solo from 2026-09-09 and on Manager
    // from 2026-08-30 before that.
    const recommended = TIERS.filter((tier) => PRICING_TIERS[tier].recommended);
    expect(recommended).toEqual(['manager']);
    expect(PRICING_TIERS.manager.contactSales).toBeUndefined();
  });

  it('orders the cards cheapest first and ends on the one conversation', () => {
    // FOUR cards since 2026-10-02: three self-serve, then Group, the lone
    // "Let's talk" card.
    expect(PRICING_TIER_ORDER).toEqual(['solo', 'manager', 'label', 'enterprise']);
    for (const tier of PRICING_TIER_ORDER.slice(0, -1)) {
      expect(PRICING_TIERS[tier].contactSales, tier).toBeUndefined();
    }
    expect(PRICING_TIERS.enterprise.contactSales).toBe(true);
  });

  it('carries a price at every sellable interval, in whole kobo', () => {
    for (const tier of TIERS) {
      if (PRICING_TIERS[tier].contactSales) continue;
      for (const interval of SELLABLE_INTERVALS) {
      const price = getTierPrice(tier, interval);
      expect(price, `${tier}/${interval}`).not.toBeNull();
      // The minor unit is pre-computed in the package so no caller multiplies
      // by 100 at the call site, which is where unit-mismatch bugs hide.
      expect(price?.minorUnit, `${tier}/${interval}`).toBe((price?.amount ?? 0) * 100);
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

describe('minimumTierWith', () => {
  it('finds the cheapest displayed tier that grants a boolean entitlement', () => {
    expect(minimumTierWith('urgans_embedded_actions')).toBe('manager');
    expect(minimumTierWith('concierge_onboarding')).toBe('label');
  });

  it('returns null when no tier a visitor can buy grants it', () => {
    // `sso` used to be granted by Group alone (the one sales-led tier, id
    // `enterprise`), which is exactly why minimumTierWith cannot just read the
    // displayed order — a sales-led tier is never something a visitor can buy
    // into from this page. Group was removed 2026-09-09, so `sso` is now
    // granted by NOTHING, and the answer is still null for the same reason:
    // there is nothing to self-serve into either way.
    expect(ALL_TIERS.every((tier) => !ENTITLEMENTS[tier].sso)).toBe(true);
    expect(minimumTierWith('sso')).toBeNull();
  });

  it('never returns a sales-led tier a visitor cannot self-serve into', () => {
    // Asserted against data_export (true everywhere) to confirm the search
    // starts at the cheapest displayed tier rather than skipping into the
    // middle of the ladder.
    expect(minimumTierWith('data_export')).toBe(PRICING_TIER_ORDER[0]);
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
  });

  // A stray 'enterprise' row is possible — the DB CHECK constraint still
  // permits the string, deliberately not narrowed by a migration (see
  // @urganize/pricing) — but 'enterprise' is no longer a PricingTierId, so
  // isPricingTierId rejects it and this falls through to the same "unknown
  // plan" fail-open path every other retired id already takes.
  it('resolves a stray enterprise row to label rather than throwing', () => {
    expect(resolveTeamTier({ state: 'paid', ownerPlan: 'enterprise' })).toBe('label');
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

  // The boundary: 4 of 5 may add one more, 5 of 5 may not (5 seats since 2026-10-17).
  it('blocks the addition that would exceed the ceiling, not the one that reaches it', () => {
    expect(checkLimit({ tier: 'manager', key: 'seats', current: 4 }).allowed).toBe(true);
    expect(checkLimit({ tier: 'manager', key: 'seats', current: 5 }).allowed).toBe(false);
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
  // 3 artists since the 2026-10-17 reprice (was 5): the fourth is refused.
  it('caps a paying Manager team at its third artist', () => {
    const tier = resolveTeamTier({ state: 'paid', ownerPlan: 'manager' });
    expect(checkLimit({ tier, key: 'artists', current: 2 }).allowed).toBe(true);
    const blocked = checkLimit({ tier, key: 'artists', current: 3 });
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) throw new Error('expected blocked');
    expect(blocked.message).toContain('3');
    // The published line and the refusal have to agree, or a manager reads one
    // number on the pricing page and meets another in the product.
    expect(tierHighlights('manager')[0]).toContain('3');
  });

  it('never caps artists on the tiers that advertise unlimited', () => {
    const tier = 'label';
    expect(isUnlimited(resolveEntitlements(tier).artists), `${tier} artists`).toBe(true);
    expect(checkLimit({ tier, key: 'artists', current: 999 }).allowed).toBe(true);
  });

  it('caps a paying Manager team at its fifth seat, so the sixth invite is refused', () => {
    const tier = resolveTeamTier({ state: 'paid', ownerPlan: 'manager' });
    expect(tier).toBe('manager');
    // Five seats since the 2026-10-17 reprice (was four). Four used, inviting a
    // fifth: fine. Five used, inviting a sixth: refused. `current` is the count
    // BEFORE the new seat, and both invite routes call it that way.
    expect(checkLimit({ tier, key: 'seats', current: 4 }).allowed).toBe(true);
    const blocked = checkLimit({ tier, key: 'seats', current: 5 });
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) throw new Error('expected blocked');
    expect(blocked.message).toContain('5');
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

  // SOLO IS SELF-SERVE AS OF 2026-09-01. Until then it sat on the public
  // pricing page at ₦8,000 while being absent from SelfServeTierId and from
  // subscriptions_plan_check, which made all four of its ceilings unreachable
  // dead code — advertised, and enforced on nobody.
  //
  // THE ASSERTION IS ABOUT *WHICH* FAILURE, and that is the whole value of it.
  // Solo's Paystack Plans are not minted yet, so checkout still refuses — but it
  // must now refuse at the CONFIGURATION step (500, "plan code not configured")
  // rather than at the VALIDATION step (400, unknown plan). Those two look
  // identical from the outside and mean opposite things: the first says "mint the
  // Plans", the second says "the tier does not exist". Distinguishing them is
  // what stops the next session concluding Solo was never meant to be sold.
  //
  // When the Plans are minted and the env vars set, this flips to ok: true with
  // no code change — the env read is the only thing standing in the way.
  it('accepts Solo at checkout, refusing only for want of a minted Plan', () => {
    const result = resolveCheckoutPurchase({
      plan: 'solo',
      currency: 'NGN',
      interval: DEFAULT_SELLING_INTERVAL,
      pricingV2: true,
    });
    if (result.ok) {
      // The Plans have been minted in this environment. Then the only thing
      // worth checking is that it resolved as the tier and not as something else.
      expect(result.planId).toBe('solo');
      expect(result.interval).toBe(DEFAULT_SELLING_INTERVAL);
      return;
    }
    expect(result.status).toBe(500);
    expect(result.error).toContain('not configured');
  });

  // Reachability is decided by the pricing-v2 flag, exactly as Manager's is.
  // With the flag off, Solo is not a plan id the legacy generation knows.
  it('does not sell Solo with pricing v2 off', () => {
    const result = resolveCheckoutPurchase({
      plan: 'solo',
      currency: 'NGN',
      interval: 'monthly',
      pricingV2: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.status).toBe(400);
  });

  // Still not something an admin hands out by hand: the only way onto a capped
  // tier is an actual purchase, for Solo exactly as for Manager.
  it('confirms solo is not admin-assignable', () => {
    expect(ADMIN_ASSIGNABLE_PLANS).not.toContain('solo');
  });

  // A Solo subscription has to keep extending at each renewal. Missing from
  // RECURRING_PLAN_IDS, it would charge correctly on day one and then silently
  // stop — the failure mode isRecurringPlan's own comment was written about.
  it('renews a Solo subscription', () => {
    expect(isRecurringPlan('solo')).toBe(true);
  });

  // THE WALL AND CHECKOUT MUST AGREE ON WHICH TIERS ARE SELF-SERVE, and this is
  // what holds them together across a boundary an import cannot cross.
  //
  // TeamWall.tsx derives its radio list by filtering PRICING_TIER_ORDER on
  // `!contactSales`; checkout gates on `isSelfServeTier`. It cannot import that
  // predicate — lib/billing-plans.ts is server-only Paystack config — so the two
  // are separate expressions of one fact, and this asserts they say the same
  // thing for every tier that exists.
  //
  // Both failure directions are real and neither is loud on its own: a tier the
  // wall offers but checkout refuses is a dead-end radio, and a tier checkout
  // accepts but the wall omits is a price nobody can buy — precisely the state
  // Solo was in between 2026-08-30 and 2026-09-01.
  it('the wall and checkout agree on which tiers are self-serve', () => {
    for (const tier of Object.keys(PRICING_TIERS) as PricingTierId[]) {
      const salesLed = Boolean(PRICING_TIERS[tier].contactSales);
      expect(isSelfServeTier(tier), `${tier} self-serve`).toBe(!salesLed);
    }
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
    // UrgAns is quoted in credits, the unit the app meters (2026-10-15), from
    // the same field lib/credits/allowance.ts grants.
    expect(
      lines.some((line) =>
        line.includes(PRICING_TIERS.manager.urgansMonthlyCredits.toLocaleString('en-US'))
      )
    ).toBe(true);
  });

  it('says unlimited where there is no ceiling, and quotes no number', () => {
    const lines = tierHighlights('label');
    // The UrgAns line is a credit grant, not a ceiling, so it carries a number.
    const ceilingLines = lines.slice(0, 4).filter((line) => !line.includes('UrgAns credits'));
    expect(ceilingLines.length).toBe(3);
    expect(lines).toContain(
      `${PRICING_TIERS.label.urgansMonthlyCredits.toLocaleString('en-US')} UrgAns credits a month`
    );
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
  // Founder call, 2026-08-24: a sales-led tier may be sold on SSO and
  // sub-teams in a CONTRACT, but a public page cannot claim them. Group (id
  // `enterprise`) was the one tier that carried both, declared in the map and
  // read by nothing; it was removed entirely on 2026-09-09, so this is now a
  // structural guarantee over every remaining tier rather than a single named
  // one — the moment a future tier declares either, this starts proving its
  // copy stays silent about it.
  it('never advertises an unbuilt feature', () => {
    for (const tier of TIERS) {
      expect(ENTITLEMENTS[tier].sso, `${tier} sso`).toBe(false);
      expect(ENTITLEMENTS[tier].sub_teams, `${tier} sub_teams`).toBe(false);
      const copy = tierHighlights(tier).join(' ').toLowerCase();
      expect(copy, `${tier} copy`).not.toContain('sso');
      expect(copy, `${tier} copy`).not.toContain('single sign');
      expect(copy, `${tier} copy`).not.toContain('sub-team');
      expect(copy, `${tier} copy`).not.toContain('sub team');
    }
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

describe('directory search', () => {
  it('is not a plan entitlement: every plan can search', () => {
    // Manager and up from 2026-09-05 to 2026-10-02. The strategy doc
    // (section 10) opened it to every plan, Solo and trials included, so the
    // key was removed rather than set true everywhere: a gate that can never
    // refuse is code somebody will one day "fix". tier-limits-guard.test.ts
    // holds the directory route to reading no entitlement at all.
    for (const tier of PRICING_TIER_ORDER) {
      expect(Object.keys(resolveEntitlements(tier)), tier).not.toContain('directory_search');
    }
  });
});

describe('limit copy reads correctly at a limit of one', () => {
  // No tier has a one-seat ceiling since 2026-10-17 (Solo went to two seats),
  // so the seat line is checked at Solo's two: plural, and never "2 persons".
  it("says Solo's two seats as people", () => {
    const verdict = checkLimit({ tier: 'solo', key: 'seats', current: 2 });
    if (verdict.allowed) throw new Error('expected blocked');
    expect(verdict.message).toContain('2 people');
    expect(verdict.message).not.toContain('person');
  });

  it('says one rollout, not one rollouts', () => {
    const verdict = checkLimit({ tier: 'solo', key: 'active_releases', current: 1 });
    if (verdict.allowed) throw new Error('expected blocked');
    expect(verdict.message).toContain('1 release at a time');
  });

  it('keeps the plural above one', () => {
    const seats = checkLimit({ tier: 'manager', key: 'seats', current: 5 });
    const releases = checkLimit({ tier: 'manager', key: 'active_releases', current: 3 });
    if (seats.allowed || releases.allowed) throw new Error('expected blocked');
    expect(seats.message).toContain('5 people');
    expect(releases.message).toContain('3 releases at a time');
  });
});

describe('credits-only teams are on Solo (2026-10-02)', () => {
  it('resolves to Solo, whatever plan or deal the team had before', () => {
    expect(resolveTeamTier({ state: 'credits_only' })).toBe('solo');
    expect(resolveTeamTier({ state: 'credits_only', ownerPlan: 'label' })).toBe('solo');
    expect(resolveTeamTier({ state: 'credits_only', ownerPlan: 'manager', billingPlan: 'founding' })).toBe('solo');
  });
});
