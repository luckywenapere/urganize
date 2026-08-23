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
  it('prices Manager below Label on both intervals', () => {
    for (const interval of ['monthly', 'annual'] as const) {
      const manager = getTierPrice('manager', interval)?.amount ?? 0;
      const label = getTierPrice('label', interval)?.amount ?? 0;
      expect(manager).toBeLessThan(label);
    }
  });

  it('holds the 2-months-free ratio on both priced tiers', () => {
    for (const tier of ['manager', 'label'] as const) {
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

  it('recommends exactly one tier, and it is the one we sell', () => {
    const recommended = TIERS.filter((tier) => PRICING_TIERS[tier].recommended);
    expect(recommended).toEqual(['label']);
  });

  it('orders the cards entry point, flagship, sales-led', () => {
    expect(PRICING_TIER_ORDER).toEqual(['manager', 'label', 'enterprise']);
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

// ── Enforcement is inert today, and that is what makes it safe to merge ──────
//
// Nothing in the product can currently put a team on a capped tier: checkout
// validates against the legacy plan ids, and ADMIN_ASSIGNABLE_PLANS has no
// 'manager' in it. So every plan the system is capable of WRITING must resolve
// to an uncapped tier. If someone later adds 'manager' to a write path, this
// test failing is the reminder that caps just went live for real teams.
describe('no plan the product can write today lands on a capped tier', () => {
  // Every value any code path can put in subscriptions.plan right now:
  // checkout's isBillingPlanId set, the admin-assignable set, and the legacy
  // values the CHECK constraint still permits.
  const WRITABLE_PLANS = [
    ...BILLING_PLAN_ORDER,
    ...ADMIN_ASSIGNABLE_PLANS,
    'yearly',
    'access',
  ];

  it('resolves every one of them to an uncapped tier', () => {
    for (const plan of WRITABLE_PLANS) {
      const tier = resolveTeamTier({ state: 'paid', ownerPlan: plan });
      const entitlements = resolveEntitlements(tier);
      expect(isUnlimited(entitlements.seats), `${plan} -> ${tier} seats`).toBe(true);
      expect(isUnlimited(entitlements.active_releases), `${plan} -> ${tier} releases`).toBe(true);
      expect(
        isUnlimited(entitlements.urgans_monthly_actions),
        `${plan} -> ${tier} assistant actions`
      ).toBe(true);
    }
  });

  it('confirms manager is not admin-assignable, which is why the above holds', () => {
    expect(ADMIN_ASSIGNABLE_PLANS).not.toContain('manager');
  });

  // The corollary: once 'manager' IS writable, the cap bites. Proving that here
  // means the enforcement path is tested before it is ever reachable.
  it('does cap a team once it is actually on manager', () => {
    const tier = resolveTeamTier({ state: 'paid', ownerPlan: 'manager' });
    expect(tier).toBe('manager');
    expect(checkLimit({ tier, key: 'seats', current: 4 }).allowed).toBe(false);
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
    const ceilingLines = lines.slice(0, 3);
    for (const line of ceilingLines) {
      expect(line.toLowerCase()).toContain('unlimited');
      expect(line).not.toMatch(/\d/);
    }
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
  // Founder call, 2026-08-24: Enterprise may be sold on SSO and sub-teams in a
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
    expect(annualSavingCopy('manager')).toBe('2 months free');
    expect(annualSavingCopy('label')).toBe('2 months free');
    // No annual price to save against.
    expect(annualSavingCopy('enterprise')).toBeNull();
  });

  it('carries no percentage and no em dash anywhere in the tier copy', () => {
    // The pricing spec forbids a percentage saving, and the marketing copy
    // rules forbid em dashes in house copy.
    for (const tier of PRICING_TIER_ORDER) {
      const copy = [PRICING_TIERS[tier].audience, ...tierHighlights(tier)].join(' ');
      expect(copy).not.toContain('%');
      expect(copy).not.toContain('\u2014');
    }
  });
});
