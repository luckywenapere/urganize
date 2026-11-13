/**
 * The one plan the billing wall shows (2026-11-13, #1258, mock
 * docs/mocks/one-plan-wall).
 *
 * The wall used to lay four plans side by side and ask the person to compare
 * them. It now shows the plan that fits what their team already has, with one
 * price and one pay button, and keeps the rest behind "See all plans".
 *
 * How the plan is chosen, in order:
 *  1. Moving up (`intent=upgrade`) with the team's current plan known: the
 *     cheapest plan above it that lifts the limit they hit (`need`), or the next
 *     plan up when no limit was named. Same ladder as limit refusals
 *     (upgradeTargetFor), so the wall never names a different plan than the
 *     refusal that sent them here.
 *  2. Otherwise: start from the plan they picked on the sign-up paywall, or from
 *     who they said they are (artist starts at Solo, everyone else at Pro).
 *  3. Then move up until the plan holds what they already have (artists, people,
 *     rollouts in progress). Nobody is offered a plan that would lock part of
 *     their team out.
 *
 * Every answer must be a plan the server says it can charge (`offered`). When
 * nothing fits, the answer is null and the wall shows every plan, because a wall
 * that shows nothing to buy is worse than one that asks them to compare.
 *
 * Pure, so vitest holds it. No prices here: those come from @urganize/pricing.
 */

import { PRICING_TIER_ORDER, PRICING_TIERS, type PricingTierId } from '@urganize/pricing';
import { upgradeTargetFor, type CountableLimitKey } from './entitlements';
import { paywallTierForPersona } from './onboarding-paywall';
import type { OnboardingPersona } from './onboarding';

/** What the team already has. Null means "could not read", which never blocks
 *  a plan. `seats` counts everyone, the owner included. */
export type WallUsage = {
  artists: number | null;
  seats: number | null;
  activeReleases: number | null;
};

export type WallPlanInput = {
  /** The plans checkout can charge, in pricing order. */
  offered: readonly PricingTierId[];
  /** True when they came to move up (`intent=upgrade`). */
  isUpgrade: boolean;
  /** The team's plan now, when known. */
  currentTier?: PricingTierId | null;
  /** The limit they hit, when the link that sent them here said. */
  need?: CountableLimitKey | null;
  /** "Who are you?" from sign-up. */
  persona?: OnboardingPersona | null;
  /** The plan they picked on the sign-up paywall, if any. */
  chosenTier?: PricingTierId | null;
  usage?: WallUsage | null;
};

export type WallPlanKind = 'upgrade' | 'team' | 'solo';

export type WallPlan = { tier: PricingTierId; kind: WallPlanKind };

const LIMIT_KEYS: readonly CountableLimitKey[] = ['artists', 'seats', 'active_releases', 'urgans_monthly_actions'];

export function isWallNeed(value: unknown): value is CountableLimitKey {
  return typeof value === 'string' && (LIMIT_KEYS as readonly string[]).includes(value);
}

const rank = (tier: PricingTierId): number => PRICING_TIER_ORDER.indexOf(tier);

const within = (have: number | null | undefined, limit: number | null): boolean =>
  have === null || have === undefined || limit === null || have <= limit;

/** Does this plan hold what the team already has? */
export function planFitsUsage(tier: PricingTierId, usage: WallUsage | null | undefined): boolean {
  if (!usage) return true;
  const limits = PRICING_TIERS[tier].limits;
  return (
    within(usage.artists, limits.artists) &&
    within(usage.seats, limits.seats) &&
    within(usage.activeReleases, limits.activeReleases)
  );
}

/** More than one artist or more than one person means a team, not one artist. */
function isTeam(usage: WallUsage | null | undefined): boolean {
  return Boolean(usage && ((usage.artists ?? 0) > 1 || (usage.seats ?? 0) > 1));
}

export function pickWallPlan(input: WallPlanInput): WallPlan | null {
  const offered = input.offered.filter((tier) => rank(tier) >= 0);
  if (offered.length === 0) return null;

  if (input.isUpgrade && input.currentTier && rank(input.currentTier) >= 0) {
    // Same ladder as the limit refusals. A target we cannot sell here (Label is
    // a conversation) falls back to showing every plan.
    const target = upgradeTargetFor(input.currentTier, input.need ?? undefined);
    return offered.includes(target) ? { tier: target, kind: 'upgrade' } : null;
  }

  const chosen = input.chosenTier && rank(input.chosenTier) >= 0 ? input.chosenTier : null;
  const start = chosen ?? paywallTierForPersona(input.persona);
  // Move up from the starting plan until one holds the team.
  const tier = offered.find((candidate) => rank(candidate) >= rank(start) && planFitsUsage(candidate, input.usage));
  if (!tier) return null;
  return { tier, kind: isTeam(input.usage) ? 'team' : 'solo' };
}

// ------------------------------------------------------------------ the copy

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const limitWord = (n: number | null, one: string, many: string) =>
  n === null ? `unlimited ${many}` : count(n, one, many);

/** The small badge above the plan name. */
export function wallPlanBadge(kind: WallPlanKind): string {
  if (kind === 'upgrade') return 'Next step up';
  if (kind === 'team') return 'Fits your team';
  return 'Made for you';
}

/** One plain sentence saying why this plan. Numbers come from the plan's
 *  limits and the team's real counts, never typed in. No em dashes. */
export function wallPlanReason(plan: WallPlan, input: Pick<WallPlanInput, 'currentTier' | 'need' | 'usage'>): string {
  const limits = PRICING_TIERS[plan.tier].limits;

  if (plan.kind === 'upgrade' && input.currentTier) {
    const from = PRICING_TIERS[input.currentTier];
    const was = from.limits;
    if (input.need === 'active_releases') {
      return `Up to ${limitWord(limits.activeReleases, 'rollout', 'rollouts')} at a time, up from ${was.activeReleases ?? 'unlimited'} on ${from.label}.`;
    }
    if (input.need === 'urgans_monthly_actions') {
      return `${PRICING_TIERS[plan.tier].urgansMonthlyCredits.toLocaleString('en-US')} AI credits a month, up from ${from.urgansMonthlyCredits.toLocaleString('en-US')} on ${from.label}.`;
    }
    return `Up to ${limitWord(limits.artists, 'artist', 'artists')} and ${limitWord(limits.seats, 'person', 'people')}, up from ${limitWord(was.artists, 'artist', 'artists')} and ${limitWord(was.seats, 'person', 'people')} on ${from.label}.`;
  }

  const usage = input.usage;
  if (plan.kind === 'team' && usage) {
    const parts: string[] = [];
    if (usage.artists && usage.artists > 0) parts.push(count(usage.artists, 'artist', 'artists'));
    if (usage.seats && usage.seats > 1) parts.push(count(usage.seats, 'person', 'people'));
    const have = parts.length > 0 ? `your ${parts.join(' and ')}` : 'your team';
    return `Room for ${have}, with space to grow to ${limitWord(limits.artists, 'artist', 'artists')} and ${limitWord(limits.seats, 'person', 'people')}.`;
  }

  const extra = limits.seats === null ? 'as many people as you like' : count(Math.max(0, limits.seats - 1), 'more person', 'more people');
  return `Everything you need for your next release, with room for ${extra} on your team.`;
}
