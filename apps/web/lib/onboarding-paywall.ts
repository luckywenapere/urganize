/**
 * The paywall screen straight after account creation (URG-251 Part 3,
 * 2026-10-14; founder decisions in the issue's comments).
 *
 * What is decided here, pure so vitest holds it:
 *  - the headline, exactly "Run your music like a pro." (no number:
 *    the founder dropped the task count on 2026-10-14),
 *  - the logo strip's line, "Shaped with managers from", the landing page's
 *    wording (AffiliationsSection). Never "Trusted by": those companies have
 *    not endorsed Urganize,
 *  - which plan is PRE-SELECTED from the "Who are you?" persona (URG-262),
 *  - the swipe cards: their "where does it fall apart" answer first, at most
 *    five, each with the signed-off testimonial mapped in URG-251,
 *  - the plan they picked, remembered so the billing wall opens on it later.
 *
 * Not decided here: prices. They come from @urganize/pricing PRICING_TIERS
 * (never hardcoded), and yearly keeps today's ten-month arithmetic. Part 4
 * ("Save 55%") is on hold and is deliberately absent.
 *
 * The trial is the existing 3-day team trial with NO card (TEAM_TRIAL_DAYS in
 * lib/team-billing.ts), granted when the team is created. "Start my free trial"
 * is the only way forward: no skip, no close.
 */

import { isBillingInterval, isPricingTierId, type BillingInterval, type PricingTierId } from '@urganize/pricing';
import type { OnboardingPersona, OnboardingWhereStuck } from './onboarding';

export const PAYWALL_HEADLINE = 'Run your music like a pro.';
export const PAYWALL_LOGOS_LINE = 'Shaped with managers from';
export const PAYWALL_CTA = 'Start my free trial';
export const PAYWALL_CHAT_LINE = 'Questions? Chat with us';

/** The plans offered on the paywall, cheapest first. Label is contact-us and absent. */
export const PAYWALL_TIERS: readonly PricingTierId[] = ['solo', 'solo_plus', 'manager', 'pro'] as const;

/**
 * The plan that starts selected (founder call, 2026-10-14):
 * independent artist → Solo; manager, label / A&R (Label is contact-us since
 * 2026-10-26), artist's team,
 * other (and anything unanswered) → Manager. The other plans are one tap away.
 */
export function paywallTierForPersona(persona: OnboardingPersona | null | undefined): PricingTierId {
  if (persona === 'independent_artist') return 'solo';
  return 'manager';
}

/** "Start your 3-day free trial, cancel anytime." From the real trial length. */
export function paywallTrialLine(trialDays: number): string {
  return `Start your ${trialDays}-day free trial, cancel anytime.`;
}

/**
 * The same three people-based logos as the landing page's "Shaped with
 * managers from" row, as black-on-transparent masks coloured by the theme. Sizes match
 * apps/homepage/app/components/landing/sections/AffiliationsSection.tsx.
 * Greylight is "Backed by" on the landing page, a different claim, and is not
 * in this row.
 */
export const PAYWALL_LOGOS = [
  {
    name: 'Creative Business Academy for Africa',
    src: '/images/affiliations/creative-business-academy-for-africa.png',
    width: 389,
    height: 160,
    shown: 44,
  },
  { name: 'Chocolate City', src: '/images/affiliations/chocolate-city.png', width: 841, height: 160, shown: 30 },
  { name: 'The CAP Music', src: '/images/affiliations/the-cap-music.png', width: 278, height: 160, shown: 46 },
] as const;

export type PaywallTestimonial = { quote: string; name: string; role: string };

export type PaywallCard = {
  id: OnboardingWhereStuck;
  title: string;
  line: string;
  testimonial: PaywallTestimonial | null;
};

/**
 * VERBATIM from apps/homepage/content/testimonials.ts (signed off; never edit
 * or truncate a quote there or here without re-approval). The web app cannot
 * import the marketing app, so the words are copied, and
 * onboarding-paywall.test.ts holds them equal to the source file.
 */
export const PAYWALL_TESTIMONIALS = {
  tamuno: {
    quote:
      "I open a release and see what's done, what's blocked and what's due this week, without chasing anyone for an update. That's a call I don't have to make anymore.",
    name: 'Tamuno-Tekena Ayafa',
    role: 'A&R',
  },
  antoine: {
    quote:
      'I manage myself, so every dropped ball is mine. The first time I created a release, the whole rollout was already laid out, week by week, task by task. I stopped planning from memory.',
    name: 'Antoine',
    role: 'Artist bringing his roster onto Urganize, Creative Business Academy alum',
  },
  adenaiye: {
    quote:
      'Urganize significantly reduces the chaos that often comes with managing multiple music releases, artists, and team members.',
    name: 'Adenaiye Miracle',
    role: 'Artist Manager',
  },
  zaddyfunds: {
    quote: 'This solves an actual problem in the industry.',
    name: '@zaddyfunds_',
    role: 'Artist Manager',
  },
} as const satisfies Record<string, PaywallTestimonial>;

/** One card per "where does it fall apart" answer, mapped in URG-251. */
export const PAYWALL_CARDS: Record<OnboardingWhereStuck, PaywallCard> = {
  keeping_team_aligned: {
    id: 'keeping_team_aligned',
    title: "Everyone sees who's on what",
    line: 'Every activity has an owner and a date, so nobody has to chase.',
    testimonial: PAYWALL_TESTIMONIALS.tamuno,
  },
  tracking_progress: {
    id: 'tracking_progress',
    title: 'Your rollout, laid out week by week',
    line: "Your plan is ready from day one, with what's next on top.",
    testimonial: PAYWALL_TESTIMONIALS.antoine,
  },
  managing_multiple_releases: {
    id: 'managing_multiple_releases',
    title: 'Every release, artist and teammate in one place',
    line: 'Switch between rollouts without losing track of any of them.',
    testimonial: PAYWALL_TESTIMONIALS.adenaiye,
  },
  collecting_credits: {
    id: 'collecting_credits',
    title: 'Credits and splits collected for you',
    line: 'Send one link and every collaborator fills in their own credits.',
    testimonial: PAYWALL_TESTIMONIALS.zaddyfunds,
  },
  marketing_promo: {
    id: 'marketing_promo',
    title: 'Pitch curators and share your rollout',
    line: 'Send your song to playlists and share your plan in a tap.',
    testimonial: null,
  },
  distribution: {
    id: 'distribution',
    title: 'Get it on every platform',
    line: 'Check you are ready, then hand off to our distribution partner.',
    testimonial: null,
  },
};

/** The order cards fall back to after the person's own answers. */
export const PAYWALL_CARD_ORDER: readonly OnboardingWhereStuck[] = [
  'keeping_team_aligned',
  'tracking_progress',
  'managing_multiple_releases',
  'collecting_credits',
  'marketing_promo',
  'distribution',
] as const;

export const MAX_PAYWALL_CARDS = 5;

/**
 * The swipe cards, in order. Their "where does it fall apart" answers come
 * first (in the order they ticked them), then the rest, at most five.
 *
 * A person who chose to start from scratch gets no week-by-week plan, so the
 * "laid out week by week" card would be untrue for them: it is left out, and
 * the team-alignment card leads instead (agreed with Oyin, 2026-10-14).
 */
export function buildPaywallCards(input: {
  whereStuck: readonly OnboardingWhereStuck[];
  startFromScratch: boolean;
}): PaywallCard[] {
  const order: OnboardingWhereStuck[] = [];
  const push = (id: OnboardingWhereStuck) => {
    if (input.startFromScratch && id === 'tracking_progress') return;
    if (!order.includes(id)) order.push(id);
  };
  if (input.startFromScratch) push('keeping_team_aligned');
  for (const id of input.whereStuck) if (PAYWALL_CARDS[id]) push(id);
  for (const id of PAYWALL_CARD_ORDER) push(id);
  return order.slice(0, MAX_PAYWALL_CARDS).map((id) => PAYWALL_CARDS[id]);
}

// ── The plan they picked, for the billing wall later ────────────────────────

const PLAN_CHOICE_KEY = 'urganize.onboarding.plan-choice';
/** The trial is 3 days; a choice older than this is not worth honouring. */
export const PLAN_CHOICE_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export type PaywallPlanChoice = { tier: PricingTierId; interval: BillingInterval };

export function parsePaywallPlanChoice(raw: string | null, now: number): PaywallPlanChoice | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { tier?: unknown; interval?: unknown; at?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!isPricingTierId(parsed.tier) || !PAYWALL_TIERS.includes(parsed.tier)) return null;
    if (!isBillingInterval(parsed.interval)) return null;
    if (typeof parsed.at !== 'number' || now - parsed.at > PLAN_CHOICE_MAX_MS || now < parsed.at) return null;
    return { tier: parsed.tier, interval: parsed.interval };
  } catch {
    return null;
  }
}

export function savePaywallPlanChoice(choice: PaywallPlanChoice, now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PLAN_CHOICE_KEY, JSON.stringify({ ...choice, at: now }));
  } catch {
    // Blocked storage: the wall opens on its own default.
  }
}

export function readPaywallPlanChoice(now: number = Date.now()): PaywallPlanChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    return parsePaywallPlanChoice(window.localStorage.getItem(PLAN_CHOICE_KEY), now);
  } catch {
    return null;
  }
}
