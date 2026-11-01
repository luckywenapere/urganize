import { describe, expect, it } from 'vitest';
import { DISTRIBUTION_ALLOWANCE, PRICING_TIERS, type PricingTierId } from '@urganize/pricing';
import { planPictureFacts } from './plan-picture';

const TIERS = Object.keys(PRICING_TIERS) as PricingTierId[];

describe('planPictureFacts', () => {
  it('draws Emerging as one artist and two people, with no distribution', () => {
    const facts = planPictureFacts('solo');
    expect(facts.artists).toEqual([{ name: 'Kanmi Gold', distributed: false }]);
    expect(facts.faces).toHaveLength(2);
    expect(facts.peopleLabel).toBe('2 people');
  });

  it('draws Pro as three artists, five people and one distributed artist', () => {
    const facts = planPictureFacts('manager');
    expect(facts.artists.map((a) => a.name)).toEqual(['Kanmi Gold', 'Hadiza Moon', 'Lagoon Theory']);
    expect(facts.artists.filter((a) => a.distributed)).toHaveLength(1);
    expect(facts.faces).toHaveLength(5);
    expect(facts.peopleLabel).toBe('5 people');
  });

  // The picture must never promise more than the plan: every tier, read from
  // the pricing package, so a reprice that cuts a limit fails here.
  it.each(TIERS)('never shows more than %s allows', (tierId) => {
    const { limits } = PRICING_TIERS[tierId];
    const facts = planPictureFacts(tierId);
    if (limits.artists !== null) expect(facts.artists.length).toBeLessThanOrEqual(limits.artists);
    if (limits.seats !== null) expect(facts.faces.length).toBeLessThanOrEqual(limits.seats);
    const allowance = DISTRIBUTION_ALLOWANCE[tierId]?.artists ?? 0;
    expect(facts.artists.filter((a) => a.distributed).length).toBeLessThanOrEqual(allowance);
    if (!PRICING_TIERS[tierId].includesDistribution) {
      expect(facts.artists.some((a) => a.distributed)).toBe(false);
    }
  });

  it('says "Your whole team" when seats are unlimited', () => {
    expect(planPictureFacts('label').peopleLabel).toBe('Your whole team');
  });
});
