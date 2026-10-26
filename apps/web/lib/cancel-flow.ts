// The cancel flow (2026-10-14, founder-approved) — pure rules. Client-safe: no
// env reads except the public flag and the retention plan codes (passed in by
// the server), no DB, no Paystack.
//
// The order a person walks, and every rule about who sees which screen, lives
// here so it can be tested; components/billing/CancelFlow.tsx renders whatever
// buildCancelSteps returns and app/api/billing/cancel-flow/route.ts executes the
// decisions. Every screen keeps a plain "Continue to cancel": cancelling stays
// as easy as signing up.
//
//   1. discount     10% off this month, given as 3 bonus days. Once per team.
//   2. invite       Trial teams only: invite one teammate, get 7 more days. Once per team.
//   3. pause        Paid teams only: 2 weeks to 3 months, from the end of the paid period.
//                   At most one pause per 6 months.
//   4. reason       "Why are you leaving?" Five reasons, one pick, no "Other".
//   5. followup     One matched screen: budget bands + an offer, or a short text box.
//   6. anything     "Anything else?" optional.
//   7. confirm      The last button, branded.
//   8. done         "Thank you, {first name}".

import { PRICING_TIERS, type PricingTierId } from '@urganize/pricing';
import { computeExtendedTrialEnd } from './team-billing';

/** ON BY DEFAULT (founder rule, 2026-10-11: flags ship on). Kill switch:
 *  NEXT_PUBLIC_FEATURE_CANCEL_FLOW=false in Vercel Web, then redeploy. With it
 *  off, Settings > Billing falls back to the old card-trial cancel control. */
export const isCancelFlowEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_CANCEL_FLOW !== 'false';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "10% off this month" is given as days: Paystack has no coupon on a live
 *  subscription, and 3 days is ~10% of a month. Same mechanism as the share
 *  reward (workspaces.paid_bonus_days for a paying team, trial_ends_at for a
 *  trial), so Paystack is never touched. */
export const CANCEL_DISCOUNT_BONUS_DAYS = 3;
/** Trial teams: days added for inviting one more teammate. */
export const CANCEL_INVITE_EXTENSION_DAYS = 7;
/** An invite only counts toward the extension if it was sent this recently. */
export const CANCEL_INVITE_FRESH_MS = 60 * 60 * 1000;
/** At most one pause per this many months. */
export const PAUSE_COOLDOWN_MONTHS = 6;
/** The "your plan comes back soon" email goes out this many days before. */
export const PAUSE_REMINDER_DAYS = 3;
/** How long a budget-band price holds before the plan returns to full price. */
export const RETENTION_OFFER_MONTHS = 3;
/** Longest free-text answer we keep. */
export const CANCEL_TEXT_MAX = 1000;

// ---------------------------------------------------------------------------
// Reasons (founder's list, exact wording and order; no "Other")
// ---------------------------------------------------------------------------

export const CANCEL_REASONS = [
  { id: 'budget', label: "It doesn't fit my budget" },
  { id: 'break', label: "I'm taking a break" },
  { id: 'missing_features', label: "It's missing features I need" },
  { id: 'hard_to_use', label: "It's hard to use" },
  { id: 'alternative', label: 'I found a better alternative' },
] as const;

export type CancelReasonId = (typeof CANCEL_REASONS)[number]['id'];

export function isCancelReasonId(value: unknown): value is CancelReasonId {
  return CANCEL_REASONS.some((reason) => reason.id === value);
}

/** The one follow-up screen each reason gets. `null` skips straight to
 *  "Anything else?" (a break: they already turned the pause down). */
export type CancelFollowUp =
  | { kind: 'budget'; title: string }
  | { kind: 'text'; title: string }
  | null;

export function followUpFor(reason: CancelReasonId | null): CancelFollowUp {
  switch (reason) {
    case 'budget':
      return { kind: 'budget', title: 'What would you pay?' };
    case 'missing_features':
      return { kind: 'text', title: "What's missing?" };
    case 'hard_to_use':
      return { kind: 'text', title: 'What felt hard?' };
    case 'alternative':
      return { kind: 'text', title: 'Which one?' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export type CancelStep =
  | 'discount'
  | 'invite'
  | 'pause'
  | 'reason'
  | 'followup'
  | 'anything'
  | 'confirm'
  | 'done';

export type CancelFlowKind = 'trial' | 'paid';

export function buildCancelSteps(input: {
  kind: CancelFlowKind;
  discountAvailable: boolean;
  inviteAvailable: boolean;
  pauseAvailable: boolean;
  reason: CancelReasonId | null;
}): CancelStep[] {
  const steps: CancelStep[] = [];
  if (input.discountAvailable) steps.push('discount');
  if (input.kind === 'trial' && input.inviteAvailable) steps.push('invite');
  if (input.kind === 'paid' && input.pauseAvailable) steps.push('pause');
  steps.push('reason');
  if (followUpFor(input.reason)) steps.push('followup');
  steps.push('anything', 'confirm', 'done');
  return steps;
}

/** The step after `current`, given what is known now. The reason can change
 *  the list (it adds or removes the follow-up), so the list is rebuilt rather
 *  than indexed once. */
export function nextCancelStep(
  current: CancelStep,
  input: Parameters<typeof buildCancelSteps>[0]
): CancelStep {
  const steps = buildCancelSteps(input);
  const index = steps.indexOf(current);
  if (index === -1) return steps[0];
  return steps[Math.min(index + 1, steps.length - 1)];
}

// ---------------------------------------------------------------------------
// Once-per-team guards
// ---------------------------------------------------------------------------

/** The discount: once per team, ever, and never for free teams. */
export function isDiscountAvailable(input: {
  claimedAt: string | null | undefined;
  comped: boolean;
}): boolean {
  return !input.claimedAt && !input.comped;
}

/** The invite extension: trial teams, once per team, and only when the plan has
 *  room for one more person (a team at its seat ceiling would be refused by
 *  the invite route anyway). */
export function isInviteExtensionAvailable(input: {
  kind: CancelFlowKind;
  usedAt: string | null | undefined;
  hasSeatRoom: boolean;
}): boolean {
  return input.kind === 'trial' && !input.usedAt && input.hasSeatRoom;
}

/** Was this invite sent recently enough to earn the extension? */
export function isFreshInvite(invitedAt: string | null | undefined, now: Date = new Date()): boolean {
  const ms = invitedAt ? Date.parse(invitedAt) : Number.NaN;
  if (!Number.isFinite(ms)) return false;
  const age = now.getTime() - ms;
  return age >= -60 * 1000 && age <= CANCEL_INVITE_FRESH_MS;
}

export type CancelDiscountDecision =
  | { kind: 'already_claimed' }
  | { kind: 'not_needed' }
  | { kind: 'trial_extended'; trialEndsAt: string; accessUntil: string }
  | { kind: 'paid_bonus'; paidBonusDays: number; accessUntil: string | null };

/**
 * Where the 3 days go. The share reward's shape on purpose
 * (lib/share-reward.ts decideShareReward), so the paywall already honours
 * both outcomes: a paying team gets paid_bonus_days, which sit on the END of
 * whatever the owner has paid for (renewals keep charging on schedule); a trial
 * gets trial_ends_at moved 3 days later.
 */
export function decideCancelDiscount(input: {
  claimedAt: string | null;
  comped: boolean;
  kind: CancelFlowKind;
  ownerPaidThrough: string | null;
  teamTrialEndsAt: string | null;
  paidBonusDays: number | null;
  now?: Date;
}): CancelDiscountDecision {
  const now = input.now ?? new Date();
  if (input.claimedAt) return { kind: 'already_claimed' };
  if (input.comped) return { kind: 'not_needed' };
  if (input.kind === 'paid') {
    const paidBonusDays = Math.max(0, input.paidBonusDays ?? 0) + CANCEL_DISCOUNT_BONUS_DAYS;
    const through = parseMs(input.ownerPaidThrough);
    return {
      kind: 'paid_bonus',
      paidBonusDays,
      accessUntil: through === null ? null : new Date(through + paidBonusDays * DAY_MS).toISOString(),
    };
  }
  const trialEndsAt = computeExtendedTrialEnd(input.teamTrialEndsAt, CANCEL_DISCOUNT_BONUS_DAYS, now).toISOString();
  return { kind: 'trial_extended', trialEndsAt, accessUntil: trialEndsAt };
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------

export const PAUSE_OPTIONS = [
  { id: '2w', label: '2 weeks' },
  { id: '1m', label: '1 month' },
  { id: '2m', label: '2 months' },
  { id: '3m', label: '3 months' },
] as const;

export type PauseOptionId = (typeof PAUSE_OPTIONS)[number]['id'];

export function isPauseOptionId(value: unknown): value is PauseOptionId {
  return PAUSE_OPTIONS.some((option) => option.id === value);
}

/** Add calendar months in UTC, clamped to the target month's last day, so a
 *  pause from January 31 for a month ends February 28 (or 29), never March 3. */
export function addCalendarMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(from.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds()
    )
  );
}

export function addPauseDuration(from: Date, option: PauseOptionId): Date {
  switch (option) {
    case '2w':
      return new Date(from.getTime() + 14 * DAY_MS);
    case '1m':
      return addCalendarMonths(from, 1);
    case '2m':
      return addCalendarMonths(from, 2);
    case '3m':
      return addCalendarMonths(from, 3);
  }
}

/**
 * When a pause starts and ends. It starts when the current paid period ends
 * (they keep what they paid for), or now if that date is unknown or already
 * past, and runs for the chosen length.
 */
export function computePauseWindow(input: {
  periodEnd: string | null;
  option: PauseOptionId;
  now?: Date;
}): { pausedFrom: string; pausedUntil: string } {
  const now = input.now ?? new Date();
  const endMs = parseMs(input.periodEnd);
  const from = new Date(endMs !== null && endMs > now.getTime() ? endMs : now.getTime());
  return { pausedFrom: from.toISOString(), pausedUntil: addPauseDuration(from, input.option).toISOString() };
}

/** At most one pause per PAUSE_COOLDOWN_MONTHS, counted from when the last one
 *  was asked for (subscriptions.paused_at, which resume never clears). */
export function canStartPause(input: { lastPausedAt: string | null | undefined; now?: Date }): boolean {
  const last = parseMs(input.lastPausedAt ?? null);
  if (last === null) return true;
  const now = input.now ?? new Date();
  return addCalendarMonths(new Date(last), PAUSE_COOLDOWN_MONTHS).getTime() <= now.getTime();
}

/** Is a pause in force? Only while the subscription is still the disabled one:
 *  once they pay again (status back to active) the old pause dates mean
 *  nothing, whether or not the daily sweep has cleared them yet. */
export function isPauseActive(input: {
  status: string | null | undefined;
  pausedUntil: string | null | undefined;
  now?: Date;
}): boolean {
  const until = parseMs(input.pausedUntil ?? null);
  if (until === null) return false;
  const now = input.now ?? new Date();
  return input.status === 'cancelled' && until > now.getTime();
}

/** The daily sweep's two questions about one paused subscription. */
export function pauseSweepAction(input: {
  status: string | null | undefined;
  pausedUntil: string | null | undefined;
  reminderSentAt: string | null | undefined;
  now?: Date;
}): 'none' | 'remind' | 'end' {
  const until = parseMs(input.pausedUntil ?? null);
  if (until === null) return 'none';
  const now = input.now ?? new Date();
  // Paid again already: the pause is over, clear it.
  if (input.status !== 'cancelled') return 'end';
  if (until <= now.getTime()) return 'end';
  if (!input.reminderSentAt && until - now.getTime() <= PAUSE_REMINDER_DAYS * DAY_MS) return 'remind';
  return 'none';
}

// ---------------------------------------------------------------------------
// Budget bands and the matched offer
// ---------------------------------------------------------------------------

export type BudgetBandId = 'low' | 'mid' | 'high';

export type BudgetBand = {
  id: BudgetBandId;
  label: string;
  /** Whole naira. Null for the open-ended bottom of the lowest band. */
  min: number | null;
  max: number;
};

export function isBudgetBandId(value: unknown): value is BudgetBandId {
  return value === 'low' || value === 'mid' || value === 'high';
}

/** "₦10,000". Whole naira, no decimals, the app's own shape. */
export function formatNaira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-US')}`;
}

function bandStep(price: number): number {
  if (price <= 10_000) return 500;
  if (price <= 30_000) return 1_000;
  return 5_000;
}

const roundTo = (value: number, step: number): number => Math.max(step, Math.round(value / step) * step);

/**
 * Three price bands under a plan's monthly price. Anchored on the founder's
 * Manager example (at the old ₦22,000: under ₦10,000 / ₦10,000–₦15,000 /
 * ₦15,000–₦20,000), which is 5/11, 15/22 and 10/11 of the price, rounded to a
 * step that suits the size of the price. Solo ₦5,000 (2026-10-23) gives
 * ₦2,500 / ₦3,500 / ₦4,500. Since the 2026-10-22 reprice: Manager ₦30,000 gives ₦14,000 /
 * ₦20,000 / ₦27,000; Label ₦100,000 (2026-10-26) gives ₦45,000 / ₦70,000 /
 * ₦90,000. The retention Plans for the current prices need minting (the old
 * Label _40000/_55000 ones no longer match), and until then those offers stay
 * hidden.
 */
export function budgetBands(monthlyPrice: number): BudgetBand[] {
  const step = bandStep(monthlyPrice);
  const lowMax = roundTo((monthlyPrice * 5) / 11, step);
  const midMax = Math.max(lowMax + step, roundTo((monthlyPrice * 15) / 22, step));
  const highMax = Math.max(midMax + step, roundTo((monthlyPrice * 10) / 11, step));
  return [
    { id: 'low', label: `Under ${formatNaira(lowMax)}`, min: null, max: lowMax },
    { id: 'mid', label: `${formatNaira(lowMax)}–${formatNaira(midMax)}`, min: lowMax, max: midMax },
    { id: 'high', label: `${formatNaira(midMax)}–${formatNaira(highMax)}`, min: midMax, max: highMax },
  ];
}

export type RetentionTierId = Extract<PricingTierId, 'solo' | 'manager' | 'label'>;

export function isRetentionTier(value: unknown): value is RetentionTierId {
  return value === 'solo' || value === 'manager' || value === 'label';
}

export function tierMonthlyPrice(tier: RetentionTierId): number {
  return PRICING_TIERS[tier].monthlyPrice?.amount ?? 0;
}

/** The env var holding the Paystack Plan for a tier at a retention price, e.g.
 *  PAYSTACK_PLAN_MANAGER_RETENTION_15000. A monthly Plan at that amount. */
export function retentionPlanEnvVar(tier: RetentionTierId, price: number): string {
  return `PAYSTACK_PLAN_${tier.toUpperCase()}_RETENTION_${Math.round(price)}`;
}

/** Every retention Plan the offers can use, for the setup checklist. */
export function allRetentionPlanEnvVars(): Array<{ envVar: string; tier: RetentionTierId; price: number }> {
  const out: Array<{ envVar: string; tier: RetentionTierId; price: number }> = [];
  for (const tier of ['solo', 'manager', 'label'] as const) {
    for (const band of budgetBands(tierMonthlyPrice(tier))) {
      if (band.id === 'low') continue;
      out.push({ envVar: retentionPlanEnvVar(tier, band.max), tier, price: band.max });
    }
  }
  return out;
}

export type RetentionOffer =
  /** Move to a cheaper plan (the existing change-plan route, a downgrade that
   *  waits for the renewal). */
  | { kind: 'switch_plan'; tier: RetentionTierId; price: number }
  /** Keep the plan at the band's price for RETENTION_OFFER_MONTHS months. */
  | { kind: 'discounted_plan'; tier: RetentionTierId; price: number; months: number; planCode: string };

/** An offer as the browser sees it: everything but the Paystack Plan code. */
export type PublicRetentionOffer =
  | Extract<RetentionOffer, { kind: 'switch_plan' }>
  | Omit<Extract<RetentionOffer, { kind: 'discounted_plan' }>, 'planCode'>;

/**
 * The offer for a budget answer.
 *   low  -> the dearest cheaper plan that fits under the band (Manager -> Solo,
 *           Label -> Manager). Solo has nothing cheaper: no offer.
 *   mid / high -> their own plan at the band's top price for 3 months, only when
 *           the Paystack Plan for that price is configured (`planCodes`, read
 *           from env by the server). Missing -> no offer, the screen just moves on.
 */
export function matchBudgetOffer(input: {
  tier: RetentionTierId;
  band: BudgetBandId;
  planCodes: Record<string, string | null | undefined>;
}): RetentionOffer | null {
  const price = tierMonthlyPrice(input.tier);
  if (price <= 0) return null;
  const band = budgetBands(price).find((candidate) => candidate.id === input.band);
  if (!band) return null;

  if (band.id === 'low') {
    const cheaper = (['label', 'manager', 'solo'] as const)
      .filter((tier) => tier !== input.tier)
      .map((tier) => ({ tier, price: tierMonthlyPrice(tier) }))
      .filter((candidate) => candidate.price > 0 && candidate.price < price && candidate.price <= band.max)
      .sort((a, b) => b.price - a.price)[0];
    return cheaper ? { kind: 'switch_plan', tier: cheaper.tier, price: cheaper.price } : null;
  }

  // Never offer a "discount" at or above the list price (a stale retention
  // Plan left over from a dearer price must not surface after a reprice).
  if (band.max >= price) return null;
  const planCode = String(input.planCodes[retentionPlanEnvVar(input.tier, band.max)] ?? '').trim();
  if (!planCode) return null;
  return {
    kind: 'discounted_plan',
    tier: input.tier,
    price: band.max,
    months: RETENTION_OFFER_MONTHS,
    planCode,
  };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export function tierName(tier: RetentionTierId): string {
  return PRICING_TIERS[tier].label;
}

/** The offer button's words. */
export function retentionOfferLabel(offer: RetentionOffer): string {
  if (offer.kind === 'switch_plan') {
    return `Switch to ${tierName(offer.tier)} for ${formatNaira(offer.price)}/month`;
  }
  return `Keep ${tierName(offer.tier)} for ${formatNaira(offer.price)}/month for ${offer.months} months`;
}

/** First name for the goodbye, or '' (the screen then says just "Thank you"). */
export function cancelFirstName(name: string | null | undefined): string {
  const first = String(name ?? '').trim().split(/\s+/)[0] || '';
  if (!first || first.includes('@') || first.length > 24) return '';
  return first;
}

export function cancelThanksTitle(name: string | null | undefined): string {
  const first = cancelFirstName(name);
  return first ? `Thank you, ${first}` : 'Thank you';
}

export const CANCEL_THANKS_NOTE =
  'Thank you for the time you spent building on Urganize. Everything you made stays right here, ready to read whenever you need it. Come back and you pick up where you left off.';

/** "October 14, 2026", the app's own long date shape. '' for a bad date. */
export function formatCancelDate(iso: string | null | undefined): string {
  const ms = parseMs(iso ?? null);
  if (ms === null) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Trim and cap a free-text answer; '' when empty. */
export function cleanCancelText(value: unknown): string {
  return String(value ?? '').trim().slice(0, CANCEL_TEXT_MAX);
}

// ---------------------------------------------------------------------------
// The record (cancel_flow_events)
// ---------------------------------------------------------------------------

export const CANCEL_FLOW_EVENTS = [
  'flow_started',
  'offer_shown',
  'offer_accepted',
  'offer_declined',
  'reason_selected',
  'budget_band_selected',
  'feedback_given',
  'final_note_given',
  'cancelled',
  'resumed',
] as const;

export type CancelFlowEvent = (typeof CANCEL_FLOW_EVENTS)[number];

export function isCancelFlowEvent(value: unknown): value is CancelFlowEvent {
  return CANCEL_FLOW_EVENTS.includes(value as CancelFlowEvent);
}

export const CANCEL_FLOW_OFFERS = [
  'discount',
  'invite_extension',
  'pause',
  'budget_switch_plan',
  'budget_discounted_plan',
] as const;

export type CancelFlowOffer = (typeof CANCEL_FLOW_OFFERS)[number];

export function isCancelFlowOffer(value: unknown): value is CancelFlowOffer {
  return CANCEL_FLOW_OFFERS.includes(value as CancelFlowOffer);
}

function parseMs(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
