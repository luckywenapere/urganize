import { describe, expect, it } from 'vitest';
import { BILLING_PLANS, PRICING_TIERS, PRICING_TIER_ORDER, getTierPrice } from '@urganize/pricing';
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
