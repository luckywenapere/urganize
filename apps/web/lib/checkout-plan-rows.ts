/**
 * The plan list on the desktop checkout (#1229, part of #1175; mock
 * docs/mocks/signin-onboarding-desktop, screen 3). Every figure comes from the
 * plan itself (`@urganize/pricing` limits) or from what the plan is given each
 * month (`ALLOWANCE_CREDITS`), so the list cannot drift from what checkout
 * charges and grants. Pure, so vitest holds it.
 */
import { PRICING_TIERS, type BillingInterval } from '@urganize/pricing';
import { ALLOWANCE_CREDITS } from '@/lib/credits/allowance';
import { CHECKOUT_PLANS, type CheckoutPlan } from '@/lib/self-serve';

function count(value: number | null, one: string, many: string): string {
  if (value === null) return `No limit on ${many}`;
  return `${value} ${value === 1 ? one : many}`;
}

function baseLine(plan: CheckoutPlan): string {
  const { artists, seats } = PRICING_TIERS[plan].limits;
  return `${count(artists, 'artist', 'artists')}, ${count(seats, 'person', 'people')}`;
}

/** "3 artists, 6 people". When two plans on sale would read the same, the one
 *  with more rollouts at once says so ("…, 3 rollouts at once"). */
export function planRowLine(plan: CheckoutPlan): string {
  const base = baseLine(plan);
  const rollouts = PRICING_TIERS[plan].limits.activeReleases;
  const twin = CHECKOUT_PLANS.find(
    (other) =>
      other !== plan &&
      baseLine(other) === base &&
      (PRICING_TIERS[other].limits.activeReleases ?? Infinity) < (rollouts ?? Infinity)
  );
  if (!twin) return base;
  return `${base}, ${rollouts === null ? 'any number of rollouts' : `${rollouts} rollouts at once`}`;
}

export type PlanTile = { value: string; label: string };

/** The three tiles under the list: artists, people, AI credits a month. */
export function planTiles(plan: CheckoutPlan): PlanTile[] {
  const { artists, seats } = PRICING_TIERS[plan].limits;
  return [
    { value: artists === null ? 'No limit' : String(artists), label: 'Artists' },
    { value: seats === null ? 'No limit' : String(seats), label: 'People on your team' },
    { value: ALLOWANCE_CREDITS[plan].toLocaleString('en-NG'), label: 'AI credits a month' },
  ];
}

/** A monthly/yearly toggle only when there is a real choice. */
export function showsIntervalChoice(periods: readonly BillingInterval[]): boolean {
  return periods.length > 1;
}
