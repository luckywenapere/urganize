// Per-plan entitlements — the first thing in this product that maps a plan to
// what it can DO.
//
// Everything before this was binary: `requireActiveAccount` answered yes or no,
// and feature availability was a global `NEXT_PUBLIC_FEATURE_*` env flag that is
// the same for every paying team. This module adds the second axis.
//
// THE RULE THAT MATTERS MOST: never compare a plan name inside a feature check.
// Always resolve through this map. That is what lets a tier be re-cut without a
// code change, and it is why `getEntitlement` exists rather than exported
// per-tier constants. If you find yourself writing `tier === 'manager'` in a
// route, add an entitlement key instead.
//
// Lives in apps/web rather than @urganize/pricing on purpose: vitest.config.ts
// collects `lib/**/*.test.ts` only, and this is decision logic that has to be
// tested. Prices stay in the shared package because apps/homepage renders them.
//
// Gating philosophy, per the spec and worth keeping: a gate is only ever put on
// something that costs us money to deliver — concierge onboarding, unlimited
// assistant calls, saved custom templates, response times, volume. Nothing is
// withheld to manufacture an upsell, because the founder is personally in the
// room when a buyer asks why.

import type { PricingTierId } from '@urganize/pricing';

/** Feature switch for the tier model. Function form (the isHardPaywallEnabled /
 * isCardTrialEnabled precedent) so it inlines into a client bundle, is read at
 * request time on the server, and can be stubbed in tests. */
export const isPricingV2Enabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_PRICING_V2 === 'true';

/** No ceiling. An explicit sentinel rather than Infinity or a huge integer:
 * `null` survives JSON, cannot be accidentally compared with `<`, and forces
 * callers through `isWithinLimit` instead of hand-rolling the check. */
export const UNLIMITED = null;
export type Limit = number | typeof UNLIMITED;

export type SupportChannel = 'email' | 'whatsapp_24h' | 'sla';

export type Entitlements = {
  /** Active team members. UNLIMITED on label and enterprise: this is a
   *  coordination product, and a seat wall pushes half the release back into
   *  WhatsApp and churns the account. */
  seats: Limit;
  /** Releases still being worked. See the NOT-YET-ENFORCEABLE note below. */
  active_releases: Limit;
  /** The hand-written 11-week rollout template, in full, on every tier. */
  rollout_template_default: boolean;
  /** Save a modified template as reusable. DECLARATIVE ONLY today — see below. */
  rollout_template_custom_save: boolean;
  /** Assistant actions per billing period. DECLARATIVE ONLY today — see below. */
  urgans_monthly_actions: Limit;
  urgans_priority: boolean;
  file_attachments: boolean;
  /** Export your data. TRUE ON EVERY TIER, AND NOT NEGOTIABLE — see below. */
  data_export: boolean;
  /** Founder-delivered setup: real hours, so it is a real gate. */
  concierge_onboarding: boolean;
  support_channel: SupportChannel;
  sso: boolean;
  sub_teams: boolean;
};

// ── Three keys need a caveat before anyone builds against them ───────────────
//
// `data_export` IS TRUE EVERYWHERE, INCLUDING TRIAL AND GRANDFATHERED
// ACCOUNTS, AND MUST STAY THAT WAY. It is a trust feature, not a revenue
// feature: a buyer who cannot get their catalogue back out has been trapped,
// not sold to. `entitlements.test.ts` asserts this structurally across every
// tier precisely so a later edit cannot quietly gate it. If a future change
// needs to flip it, that test failing is the conversation, not an obstacle.
// (Note the feature itself does not exist yet — no export route, no Settings
// control. Declaring it here is a commitment, so do not advertise it on a
// public page until it is built.)
//
// `rollout_template_custom_save` and `urgans_monthly_actions` are DECLARATIVE
// ONLY. Neither has anything behind it yet: rollout templates are static
// TypeScript in lib/release-templates and `release_plan_drafts` is unique per
// release, so there is nowhere to save a reusable one; and nothing anywhere
// counts assistant calls — no counter table, no server-side event, not even a
// PostHog event per invocation. They are declared now so the map matches the
// published tier table, but reading them to gate anything today would gate a
// feature that does not exist.
//
// `active_releases` IS NOT ENFORCEABLE YET, and the reason is worth reading
// before anyone wires it up. Nothing in the product ever writes
// `releases.status = 'released'` or `'archived'`, no UI exposes a status
// picker, and GET /api/releases/[id] OVERWRITES the stored status with a
// computed value that can only be draft | in_progress | ready. So a cap keyed
// on `releases.status` is a cap on releases-ever-created with no way for a user
// to free a slot — the opposite of the spec's "archiving or completing a
// release frees a slot immediately". lib/recap-eligibility.ts already answers
// "is this finished" honestly (release date passed OR every task done) and is
// the definition to reuse, but an explicit archive action is a prerequisite.
//
// `sso` and `sub_teams` are declared false everywhere except enterprise and
// are read by nothing. That is deliberate and consistent with this repo's
// principle 6 (do not build enterprise features until the problem is real):
// the map records the offer, it does not authorise the build.

export const ENTITLEMENTS: Record<PricingTierId, Entitlements> = {
  manager: {
    seats: 4,
    active_releases: 3,
    rollout_template_default: true,
    rollout_template_custom_save: false,
    urgans_monthly_actions: 150,
    urgans_priority: false,
    file_attachments: true,
    data_export: true,
    concierge_onboarding: false,
    support_channel: 'email',
    sso: false,
    sub_teams: false,
  },
  label: {
    seats: UNLIMITED,
    active_releases: UNLIMITED,
    rollout_template_default: true,
    rollout_template_custom_save: true,
    urgans_monthly_actions: UNLIMITED,
    urgans_priority: false,
    file_attachments: true,
    data_export: true,
    concierge_onboarding: true,
    support_channel: 'whatsapp_24h',
    sso: false,
    sub_teams: false,
  },
  enterprise: {
    seats: UNLIMITED,
    active_releases: UNLIMITED,
    rollout_template_default: true,
    rollout_template_custom_save: true,
    urgans_monthly_actions: UNLIMITED,
    urgans_priority: true,
    file_attachments: true,
    data_export: true,
    concierge_onboarding: true,
    support_channel: 'sla',
    sso: true,
    sub_teams: true,
  },
};

/** The tier a team on trial is treated as. The shipped trial is a 14-day
 * FULL-ACCESS team trial, so it resolves to the flagship rather than to the
 * entry tier: a trial that quietly capped seats would teach the buyer the wrong
 * thing about the product they are evaluating. */
export const TRIAL_TIER: PricingTierId = 'label';

/** The tier a grandfathered legacy account is treated as, per the spec's
 * "flagged accounts receive label entitlements in full". */
export const LEGACY_FOUNDING_TIER: PricingTierId = 'label';

export function resolveEntitlements(tier: PricingTierId): Entitlements {
  return ENTITLEMENTS[tier];
}

export function getEntitlement<K extends keyof Entitlements>(
  tier: PricingTierId,
  key: K
): Entitlements[K] {
  return ENTITLEMENTS[tier][key];
}

export function isUnlimited(limit: Limit): boolean {
  return limit === UNLIMITED;
}

/** Would `current` still be within `limit`? Unlimited always passes.
 * Takes the CURRENT count and asks whether it is under the ceiling, so a
 * caller adding one more thing passes the count BEFORE the addition. */
export function isWithinLimit(current: number, limit: Limit): boolean {
  return limit === UNLIMITED || current < limit;
}

/** Remaining headroom, or null when unlimited. Never negative: an account that
 * dropped below its seat count on a downgrade reads 0 rather than a negative,
 * because the spec's rule there is "block new invites, deactivate nobody". */
export function remainingAllowance(current: number, limit: Limit): number | null {
  if (limit === UNLIMITED) return null;
  return Math.max(0, limit - current);
}
