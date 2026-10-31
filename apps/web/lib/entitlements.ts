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

import { PRICING_TIERS, PRICING_TIER_ORDER, isPricingTierId } from '@urganize/pricing';
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
  /** Artists on the roster. */
  artists: Limit;
  /** Active team members. UNLIMITED on label: this is a coordination product,
   *  and a seat wall pushes half the release back into WhatsApp and churns the
   *  account. */
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
  /** UrgAns drafts a change, edits it, taps Apply — inside a product function
   *  rather than in chat. Manager and Label get it; Solo keeps chat only. The
   *  first feature-by-tier gate in this map that is NOT a countable ceiling: it
   *  fits the module's own gating philosophy above (a run costs a real model
   *  call to deliver) exactly as cleanly as the countable ones do. */
  urgans_embedded_actions: boolean;
};

// ── Three keys need a caveat before anyone builds against them ───────────────
//
// `data_export` IS TRUE EVERYWHERE, INCLUDING TRIAL AND GRANDFATHERED
// ACCOUNTS, AND MUST STAY THAT WAY. It is a trust feature, not a revenue
// feature: a buyer who cannot get their catalogue back out has been trapped,
// not sold to. `entitlements.test.ts` asserts this structurally across every
// tier precisely so a later edit cannot quietly gate it. If a future change
// needs to flip it, that test failing is the conversation, not an obstacle.
// (Built 2026-08-23: GET /api/account/export plus "Your data" in Settings,
// behind NEXT_PUBLIC_FEATURE_DATA_EXPORT. That route is deliberately NOT behind
// the paywall and has its own guard test — see lib/account-export.ts.)
//
// `artists` IS ENFORCED as of 2026-08-30, when rosters shipped. It was declared
// a week earlier with the Solo tier and gated nothing, because until then no
// code path could add a second artist to a team. Two things about it worth
// knowing here: like seats, it has TWO creation points (POST
// /api/workspace/artists and the lookup-or-create branch inside POST
// /api/releases), and capping only the first would leave the second open; and
// it is the only ceiling whose count is not what the user sees listed, because
// an artist with no releases yet still occupies a slot.
//
// `rollout_template_custom_save` is STILL DECLARATIVE ONLY, and reading it to
// gate anything would gate a feature that does not exist: rollout templates are
// static TypeScript in lib/release-templates, and `release_plan_drafts` is
// unique per release so there is nowhere to save a reusable one. It is declared
// so the map matches the published tier table, nothing more.
//
// `seats`, `active_releases` and `urgans_monthly_actions` ARE enforced as of
// 2026-08-23 — see resolveTeamTier and checkLimit at the foot of this file, and
// the enforcement notes in CLAUDE.md. Two things about that worth knowing here:
// enforcing `active_releases` required building an explicit archive action
// first, because nothing in the product had ever written
// `releases.status = 'archived'`; and every cap is a no-op unless a team
// resolves to a CAPPED tier, which since 2026-09-01 means `solo` or `manager`
// and requires somebody to be paying for one of them. Everything else — trial,
// grace, comped, walled, read-only, founding, and every legacy plan id — still
// resolves to the uncapped tier, which is what has kept these caps from ever
// touching an existing customer.
//
// `sso` and `sub_teams` are declared false on EVERY tier, Group included. Group
// (id `enterprise`) carried both as true until it was removed 2026-09-09; it came
// back 2026-10-02 WITHOUT them, because both keys are read by nothing and a
// public card may not promise an unbuilt feature. That is deliberate and
// consistent with this repo's principle 6 (do not build enterprise features
// until the problem is real): the map records the offer, it does not
// authorise the build.

// The three COUNTABLE ceilings come from @urganize/pricing rather than being
// written here, and that is the point: the marketing site renders those numbers
// and cannot import from this app, so a literal here would be a second copy of
// a figure a public page already quotes. One number, read by the page that
// advertises it and by the route that enforces it, is the only arrangement in
// which a published limit cannot drift from a real one — the failure this repo
// has shipped repeatedly with prices.
//
// The BOOLEANS stay written out below. They gate behaviour rather than being
// numbers anyone quotes, and keeping the decision logic in this file is what
// keeps it inside vitest's collection glob.
const limitsOf = (tier: PricingTierId) => PRICING_TIERS[tier].limits;

export const ENTITLEMENTS: Record<PricingTierId, Entitlements> = {
  // Solo (2026-08-30; LIVE since 2026-09-01). It shipped inert — absent from
  // SelfServeTierId and from subscriptions_plan_check, so `resolveTeamTier` could
  // never return it and all four ceilings were unreachable dead code while the
  // pricing page advertised them at ₦8,000. That is closed: Solo is self-serve,
  // the migration permits the plan id, and these numbers now bite a real team.
  //
  // IT IS THE TIGHTEST ROW IN THE TABLE and the one most new accounts land on,
  // so it is where a wrong number is felt first. Two of them are load-bearing in
  // ways that are not obvious from the figure alone:
  //   - `seats` counts the OWNER, because ensureOwnedWorkspace writes an owner
  //     row into workspace_members like any other member. It was 2 (the owner
  //     plus one collaborator) until 2026-10-02, when the strategy doc set Solo
  //     to one seat. So a Solo owner can now invite nobody, which is the point:
  //     Solo is for an independent artist working alone, and a team is
  //     Manager. The invite form is NOT disabled for it; the refusal comes back
  //     at submit with the reason and the upgrade, which is the 2026-09-01
  //     "show the reason, not a dimmed button" rule.
  //   - `active_releases: 1` is only survivable because archiving exists to free
  //     the slot. It was built in the same pass that made these caps real, for
  //     exactly this reason.
  solo: {
    artists: limitsOf('solo').artists,
    seats: limitsOf('solo').seats,
    active_releases: limitsOf('solo').activeReleases,
    rollout_template_default: true,
    rollout_template_custom_save: false,
    urgans_monthly_actions: limitsOf('solo').urgansMonthlyActions,
    urgans_priority: false,
    file_attachments: true,
    data_export: true,
    concierge_onboarding: false,
    support_channel: 'email',
    sso: false,
    sub_teams: false,
    urgans_embedded_actions: false,
  },
  manager: {
    artists: limitsOf('manager').artists,
    seats: limitsOf('manager').seats,
    active_releases: limitsOf('manager').activeReleases,
    rollout_template_default: true,
    rollout_template_custom_save: false,
    urgans_monthly_actions: limitsOf('manager').urgansMonthlyActions,
    urgans_priority: false,
    file_attachments: true,
    data_export: true,
    concierge_onboarding: false,
    support_channel: 'email',
    sso: false,
    sub_teams: false,
    urgans_embedded_actions: true,
  },
  label: {
    artists: limitsOf('label').artists,
    seats: limitsOf('label').seats,
    active_releases: limitsOf('label').activeReleases,
    rollout_template_default: true,
    rollout_template_custom_save: true,
    urgans_monthly_actions: limitsOf('label').urgansMonthlyActions,
    urgans_priority: false,
    file_attachments: true,
    data_export: true,
    concierge_onboarding: true,
    support_channel: 'whatsapp_24h',
    sso: false,
    sub_teams: false,
    urgans_embedded_actions: true,
  },
  // Group (back 2026-10-02, strategy doc section 8). The same as Label in every
  // key, on purpose: what makes Group different is the price and how it is
  // agreed (by hand, per deal), not what the product does for it. Its ceilings
  // read from @urganize/pricing like every other tier, and they are all null.
  enterprise: {
    artists: limitsOf('enterprise').artists,
    seats: limitsOf('enterprise').seats,
    active_releases: limitsOf('enterprise').activeReleases,
    rollout_template_default: true,
    rollout_template_custom_save: true,
    urgans_monthly_actions: limitsOf('enterprise').urgansMonthlyActions,
    urgans_priority: false,
    file_attachments: true,
    data_export: true,
    concierge_onboarding: true,
    support_channel: 'whatsapp_24h',
    sso: false,
    sub_teams: false,
    urgans_embedded_actions: true,
  },
};

/** A boolean-valued entitlement key — the subset `minimumTierWith` can search. */
export type BooleanEntitlementKey = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

/** The cheapest tier a team can BUY that grants a boolean entitlement, or null
 *  if none does. Exists so a refusal copy never hardcodes a tier name that a
 *  later re-cut would leave lying.
 *
 *  It walks PRICING_TIER_ORDER (the tiers a visitor sees) and SKIPS the
 *  sales-led ones, because the answer is used as an upgrade target and pointing
 *  a team at a card whose only button is "Let's talk" is not an upgrade path.
 *
 *  THE SKIP USED TO BE IMPLICIT and stopped being true on 2026-09-08. The
 *  displayed order carried no sales-led tier between 2026-08-30 and then, so
 *  reading the order alone happened to give the right answer; Group rejoining
 *  the page made `minimumTierWith('sso')` start answering 'enterprise' for an
 *  entitlement nothing implements and no page advertises. Filtering on
 *  `contactSales` says what was always meant. */
export function minimumTierWith<K extends BooleanEntitlementKey>(key: K): PricingTierId | null {
  for (const tier of PRICING_TIER_ORDER) {
    // A tier with no price at all (Group) is never the answer; Label, contact-us
    // since 2026-10-26, still is.
    if (!PRICING_TIERS[tier].monthlyPrice) continue;
    if (ENTITLEMENTS[tier][key]) return tier;
  }
  return null;
}

/** The tier a team on trial is treated as. The shipped trial is a 3-day
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

// ─────────────────────────────────────────────────────────────────────────────
// Which tier is a team on, and is it over a limit
// ─────────────────────────────────────────────────────────────────────────────
//
// Enforcement needs one question answered before it can ask anything else:
// what tier is this team on? The team resolver already fetches the owner's
// subscription snapshot to decide hasAccess and throws the plan away; this maps
// that plan onto a tier.
//
// THE SAFETY PROPERTY THAT MAKES THIS MERGEABLE ONTO A LIVE PAYWALL: every
// route that cannot be confidently placed on a capped tier resolves to `label`,
// which is uncapped. So an unknown plan, a legacy plan, a trial, a comped team
// and a grandfathered account are all uncapped, and enforcement is a structural
// no-op until pricing v2 is live AND somebody is actually paying for Manager.
// Never invert this into "unknown means entry tier" — that would cap real teams
// on a read failure.

/** Plan ids that predate the tier model. All of them were the single team
 * price, which Label inherits at the same amount, so they map there. */
const LEGACY_PLAN_IDS = new Set([
  'monthly',
  'annual',
  'yearly',
  'access',
  'custom',
  'founding',
]);

export function resolveTeamTier(input: {
  /** TeamAccessResolution.state. */
  state: 'paid' | 'comped' | 'trial' | 'grace' | 'read_only' | 'credits_only' | 'walled';
  /** subscriptions.plan for the team OWNER, or null. */
  ownerPlan?: string | null;
  /** workspaces.billing_plan — the deal marker, not an access grant. */
  billingPlan?: string | null;
}): PricingTierId {
  // A grandfathered rate carries label entitlements in full, per the pricing
  // spec's grandfathering rule. Checked first: the deal is what was agreed,
  // whatever the subscription row says.
  // Credits-only: Solo features (strategy doc, section 8). Checked FIRST, before
  // the founding deal and every fail-open branch below, because this is the one
  // state where a team with no plan can write, and it must write under Solo's
  // ceilings, not Label's. A founding deal is a price lock, not access; a
  // founding team that lapsed and runs on credits is on Solo like anyone else.
  if (input.state === 'credits_only') return 'solo';

  if (input.billingPlan === 'founding') return LEGACY_FOUNDING_TIER;

  // A trial is full access by definition. Capping seats during an evaluation
  // would teach the buyer the wrong thing about what they are evaluating.
  if (input.state === 'trial' || input.state === 'grace') return TRIAL_TIER;

  // Admin-granted free access. Nothing was bought, so there is no tier to read
  // off a subscription; treat it as the flagship, same as a trial.
  if (input.state === 'comped') return TRIAL_TIER;

  // Walled: no access at all, so entitlements are moot. Read-only likewise —
  // a team that cannot write cannot reach a ceiling. Return the flagship rather
  // than the entry tier so that if a caller ever reads this without checking
  // hasAccess (or canWrite) first, it errs toward permissive.
  if (input.state === 'walled' || input.state === 'read_only') return 'label';

  const plan = (input.ownerPlan ?? '').trim();
  if (isPricingTierId(plan)) return plan;
  if (LEGACY_PLAN_IDS.has(plan)) return 'label';
  // Unknown or absent. Fail OPEN — see the note above.
  return 'label';
}

// ── Limit checks ─────────────────────────────────────────────────────────────

/** The entitlement keys that carry a countable ceiling. Deliberately not every
 * key: the booleans are checked directly, and a limit only needs this shape
 * when there is a number to compare and copy to write. */
export type CountableLimitKey =
  | 'artists'
  | 'seats'
  | 'active_releases'
  | 'urgans_monthly_actions';

export type LimitVerdict =
  | { allowed: true; limit: Limit; current: number; remaining: number | null }
  | {
      allowed: false;
      key: CountableLimitKey;
      limit: number;
      current: number;
      /** What to show the person who hit it. */
      message: string;
      /** The tier that lifts this limit, for the upgrade CTA. */
      upgradeTo: PricingTierId;
    };

/** Read from the package so the name in a limit message is the same string the
 *  pricing page and Settings show. It used to be a third hand-written copy. */
const tierLabel = (tier: PricingTierId): string => PRICING_TIERS[tier].label;

/** Copy for a limit that has been reached.
 *
 * Rules this copy follows, from the pricing spec: plain and confident, no
 * guilt, no countdown pressure, never the word "workspace", and no em dashes.
 * Every number comes from the limit rather than being written into the string,
 * so re-cutting a tier cannot leave the copy lying. A test asserts all of that.
 */
/** Which tier lifts a limit. Solo's is Manager (self-serve checkout,
 *  2026-10-22): the next plan up, bought on the same checkout, with the days
 *  left on Solo coming off the price. Everyone else's is Label. */
export function upgradeTargetFor(tier: PricingTierId): PricingTierId {
  return tier === 'solo' ? 'manager' : 'label';
}

/** Solo's refusals name Manager's numbers and monthly price, all read from the
 *  pricing package so a re-cut tier cannot leave the copy lying. */
function soloLimitMessage(key: CountableLimitKey, limit: number): string {
  const manager = PRICING_TIERS.manager;
  const price = manager.monthlyPrice
    ? ` for ₦${manager.monthlyPrice.amount.toLocaleString('en-US')} a month`
    : '';
  const artists = manager.limits.artists;
  const seats = manager.limits.seats;
  const both = `${artists === null ? 'unlimited' : artists} artists and ${seats === null ? 'unlimited' : seats} people`;
  const credit = ' The days left on Emerging come off the price.';
  switch (key) {
    case 'artists':
      return `Emerging covers ${limit} ${limit === 1 ? 'artist' : 'artists'}. upgrade to Pro for ${both}${price}.${credit}`;
    case 'seats':
      return `Emerging includes ${limit} ${limit === 1 ? 'person' : 'people'}. upgrade to Pro for ${both}${price}.${credit}`;
    case 'active_releases': {
      const releases = manager.limits.activeReleases;
      return `Emerging covers ${limit} ${limit === 1 ? 'release' : 'releases'} at a time. Archive one you have finished, or upgrade to Pro for ${releases === null ? 'unlimited releases' : `${releases} at a time`}${price}.${credit}`;
    }
    case 'urgans_monthly_actions': {
      const actions = manager.limits.urgansMonthlyActions;
      return `You have used all ${limit} UrgAns actions on your plan this period. Everything else keeps working normally, and these reset when your billing period does. upgrade to Pro for ${actions === null ? 'unlimited' : `${actions} a month`}.`;
    }
  }
}

function limitMessage(key: CountableLimitKey, limit: number, tier: PricingTierId): string {
  if (tier === 'solo') return soloLimitMessage(key, limit);
  const label = tierLabel(tier);
  switch (key) {
    case 'artists':
      return `${label} plans cover ${limit} ${limit === 1 ? 'artist' : 'artists'}. Upgrade to Label for unlimited artists.`;
    case 'seats':
      return `${label} plans include ${limit} ${limit === 1 ? 'person' : 'people'}. Upgrade to Label for unlimited team members.`;
    case 'active_releases':
      return `${label} plans cover ${limit} ${limit === 1 ? 'release' : 'releases'} at a time. Archive one you have finished, or upgrade to Label for unlimited releases.`;
    case 'urgans_monthly_actions':
      return `You have used all ${limit} UrgAns actions on your plan this period. Everything else keeps working normally, and these reset when your billing period does. Upgrade to Label for unlimited.`;
  }
}

/** Is `current` within this tier's ceiling for `key`?
 *
 * `current` is the count BEFORE the thing being added, so a team with 3 of 4
 * seats passes and a team with 4 of 4 does not. Unlimited always passes. */
export function checkLimit(input: {
  tier: PricingTierId;
  key: CountableLimitKey;
  current: number;
}): LimitVerdict {
  const limit = getEntitlement(input.tier, input.key);
  if (isWithinLimit(input.current, limit)) {
    return {
      allowed: true,
      limit,
      current: input.current,
      remaining: remainingAllowance(input.current, limit),
    };
  }
  // isWithinLimit only returns false for a numeric ceiling, so this narrows.
  const numericLimit = limit as number;
  return {
    allowed: false,
    key: input.key,
    limit: numericLimit,
    current: input.current,
    message: limitMessage(input.key, numericLimit, input.tier),
    upgradeTo: upgradeTargetFor(input.tier),
  };
}

/** True once a tier is at or past `ratio` of its ceiling. Used for the
 * warn-before-you-hit-it banner, which the spec puts at 80% and explicitly
 * requires to be non-interrupting. Unlimited never warns. */
export function isApproachingLimit(input: {
  tier: PricingTierId;
  key: CountableLimitKey;
  current: number;
  ratio?: number;
}): boolean {
  const limit = getEntitlement(input.tier, input.key);
  if (limit === UNLIMITED) return false;
  const ratio = input.ratio ?? 0.8;
  return input.current >= Math.floor(limit * ratio);
}

/** The ratio at which the usage banner appears. */
export const LIMIT_WARNING_RATIO = 0.8;
