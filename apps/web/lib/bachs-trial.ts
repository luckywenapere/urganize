import type { BillingInterval } from '@urganize/pricing';
import { bachsAmountToKobo, koboToBachsAmount, type BachsEvent } from '@/lib/bachs';

// Card trial for customers abroad (2026-11-14, #1266). Pure pieces only, so
// vitest holds them. The network and the database live in
// lib/bachs-trial-server.ts.
//
// WHAT IT IS. Someone paying in US dollars adds a card on Bachs's page to start
// their free days. Bachs saves the card without charging it, charges the first
// month or year when the trial ends, and renews it after that. Cancel before
// the end and the card is never charged. Customers in Nigeria keep the trial
// with no card: Bachs can only renew dollar cards.
//
// NO FEATURE FLAG. Bachs keeps subscriptions and trials switched off until its
// support turns them on for an account. Until then (or with no Bachs key) this
// whole path reports "not available" and everyone gets the no-card trial, so
// it turns itself on the day Bachs does.
//
// This is NOT the retired Paystack card trial in lib/trial-card.ts. That file's
// prices and trial length are frozen history; nothing here reads them.

/** Accounts made before this are never asked for a card: they were promised a
 *  trial with none. Set to the day this went out. */
export const CARD_TRIAL_SIGNUP_CUTOFF = '2026-11-15T00:00:00Z';

/** Where the answer to "has Bachs turned card trials on?" is kept (app_settings). */
export const CARD_TRIAL_SETTING_KEY = 'bachs_card_trial';

/** How long a "no" from Bachs is believed before we ask again. */
export const CARD_TRIAL_RECHECK_MS = 60 * 60 * 1000;

/** Sent to Bachs with the checkout, and copied by Bachs onto the subscription. */
export const CARD_TRIAL_SOURCE = 'urganize_trial';

export type CardTrialPeriod = Extract<BillingInterval, 'monthly' | 'annual'>;

export function isCardTrialPeriod(value: unknown): value is CardTrialPeriod {
  return value === 'monthly' || value === 'annual';
}

/** Our own reference for a card-trial checkout. */
export function newCardTrialReference(random: () => string = () => Math.random().toString(16).slice(2, 10)): string {
  return `urganize_bt_${Date.now()}_${random()}`;
}

// ── Who owes a card ──────────────────────────────────────────────────────────

export type CardTrialOwedInput = {
  /** Outside Nigeria, with Bachs configured (shouldOfferBachs). */
  offered: boolean;
  /** Bachs has card trials on for our account. */
  available: boolean;
  createdAtIso: string | null | undefined;
  role: string | null | undefined;
  /** Sign-up finished. Only an explicit true counts. */
  onboardingCompleted: boolean | null | undefined;
  /** In somebody else's team. null means we could not tell. */
  isInvitedMember: boolean | null;
  paidAt: string | null | undefined;
  /** Already opened a card trial that Bachs turned into a subscription. */
  hasSubscription: boolean;
};

/**
 * Does this account have to add a card before it uses the app? Every
 * uncertainty answers no: a wrong yes walls somebody out of a product they
 * were promised free days on.
 */
export function resolveCardTrialOwed(input: CardTrialOwedInput): boolean {
  if (!input.offered || !input.available) return false;
  const created = Date.parse(String(input.createdAtIso ?? ''));
  if (!Number.isFinite(created) || created < Date.parse(CARD_TRIAL_SIGNUP_CUTOFF)) return false;
  if (String(input.role ?? '').trim().toLowerCase() === 'curator') return false;
  if (input.onboardingCompleted !== true) return false;
  if (input.isInvitedMember !== false) return false;
  if (input.paidAt) return false;
  if (input.hasSubscription) return false;
  return true;
}

// ── Whether Bachs has it on ──────────────────────────────────────────────────

export type CardTrialAvailability = { state: 'available' | 'unavailable'; checkedAt: string };

export function parseCardTrialAvailability(value: unknown): CardTrialAvailability | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.state !== 'available' && record.state !== 'unavailable') return null;
  return { state: record.state, checkedAt: String(record.checkedAt ?? '') };
}

/** Ask Bachs again? Never once it is on; after an hour when it said no. */
export function shouldRecheckAvailability(saved: CardTrialAvailability | null, nowMs: number): boolean {
  if (!saved) return true;
  if (saved.state === 'available') return false;
  const checked = Date.parse(saved.checkedAt);
  if (!Number.isFinite(checked)) return true;
  return nowMs - checked > CARD_TRIAL_RECHECK_MS;
}

/** Bachs refused because the feature is not on for our account (any 403). */
export function bachsAccessDenied(status: number, errorCode: string | null | undefined): boolean {
  void errorCode;
  return status === 403;
}

// ── The product ──────────────────────────────────────────────────────────────

/** POST /v1/products body: a dollar price that renews, with the free days on it. */
export function cardTrialProductBody(input: {
  planName: string;
  period: CardTrialPeriod;
  amountMinor: number;
  trialDays: number;
}): Record<string, unknown> {
  return {
    name: `Urganize ${input.planName}, ${input.period === 'annual' ? 'yearly' : 'monthly'}`,
    price: { price_type: 'fixed', amount: koboToBachsAmount(input.amountMinor), currency: 'USD' },
    billing_cycle: { interval: input.period === 'annual' ? 'year' : 'month', frequency: 1 },
    ...(input.trialDays > 0 ? { trial_period: { interval: 'day', frequency: input.trialDays } } : {}),
  };
}

// ── A Bachs subscription, as far as we read it ───────────────────────────────

export type BachsSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'paused'
  | 'canceled'
  | 'unknown';

const KNOWN_STATUSES: readonly BachsSubscriptionStatus[] = ['trialing', 'active', 'past_due', 'unpaid', 'paused', 'canceled'];

export type BachsSubscription = {
  id: string;
  customerId: string | null;
  status: BachsSubscriptionStatus;
  currency: string;
  amountMinor: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  /** Our checkout reference, from the metadata we sent. */
  reference: string | null;
  /** Bachs's own checkout id, which it adds to the metadata. */
  checkoutId: string | null;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Reads GET /v1/subscriptions/{id} (id) and the webhook shape (subscription_id). */
export function parseBachsSubscription(raw: unknown): BachsSubscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = text(record.id) ?? text(record.subscription_id);
  if (!id) return null;
  const customer = (record.customer ?? null) as Record<string, unknown> | null;
  const metadata = (record.metadata && typeof record.metadata === 'object' ? record.metadata : {}) as Record<string, unknown>;
  const status = String(record.status ?? '').toLowerCase() as BachsSubscriptionStatus;
  const amount = bachsAmountToKobo(record.amount);
  return {
    id,
    customerId: text(customer?.customer_id) ?? text(customer?.id),
    status: KNOWN_STATUSES.includes(status) ? status : 'unknown',
    currency: String(record.currency ?? '').toUpperCase(),
    amountMinor: Number.isFinite(amount) ? amount : 0,
    trialEnd: text(record.trial_end),
    currentPeriodEnd: text(record.current_period_end),
    cancelAtPeriodEnd: record.cancel_at_period_end === true,
    canceledAt: text(record.canceled_at),
    reference: text(metadata.reference),
    checkoutId: text(metadata.checkout_id),
  };
}

/** A card is on file and Bachs will still try to charge it. */
export function isLiveBachsStatus(status: string | null | undefined): boolean {
  return status === 'trialing' || status === 'active' || status === 'past_due';
}

/** The day access runs to: the trial end while trialing, the paid period after. */
export function subscriptionAccessEnd(sub: Pick<BachsSubscription, 'status' | 'trialEnd' | 'currentPeriodEnd'>): string | null {
  if (sub.status === 'trialing') return sub.trialEnd ?? sub.currentPeriodEnd;
  return sub.currentPeriodEnd ?? sub.trialEnd;
}

/** How long after the trial end the team stays open while Bachs charges the card. */
export const CHARGE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Where the team's own trial end goes while the card trial runs. Bachs charges
 * the card AT the trial end and tells us a moment later, so a team whose card
 * is about to be charged stays open one more day: without it they would meet
 * the billing wall in the gap. A cancelled trial ends on the day, exactly.
 */
export function teamTrialEndFor(sub: Pick<BachsSubscription, 'status' | 'trialEnd' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>): string | null {
  const end = subscriptionAccessEnd(sub);
  const ms = Date.parse(String(end ?? ''));
  if (!Number.isFinite(ms)) return null;
  return new Date(sub.cancelAtPeriodEnd ? ms : ms + CHARGE_GRACE_MS).toISOString();
}

// ── Webhook events ───────────────────────────────────────────────────────────

/** Which subscription an event is about, or null for events that are not ours. */
export function subscriptionIdFromEvent(event: BachsEvent): string | null {
  if (event.type.startsWith('customer.subscription.')) return text(event.data.subscription_id) ?? text(event.data.id);
  if (event.type.startsWith('invoice.')) {
    const sub = event.data.subscription as Record<string, unknown> | null | undefined;
    return text(sub?.subscription_id) ?? text(sub?.id);
  }
  return null;
}

export type PaidInvoice = { invoiceId: string; subscriptionId: string; amountMinor: number; periodEnd: string | null };

/** invoice.paid with money on it. A $0 trial invoice is not a payment. */
export function invoiceFromEvent(event: BachsEvent): PaidInvoice | null {
  if (event.type !== 'invoice.paid') return null;
  const invoiceId = text(event.data.invoice_id) ?? text(event.data.id);
  const subscriptionId = subscriptionIdFromEvent(event);
  if (!invoiceId || !subscriptionId) return null;
  if (String(event.data.status ?? '').toLowerCase() !== 'paid') return null;
  const amountMinor = bachsAmountToKobo(event.data.amount_paid);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return null;
  return { invoiceId, subscriptionId, amountMinor, periodEnd: text(event.data.period_end) };
}

// ── The words ────────────────────────────────────────────────────────────────

/** "$19", or "$8.50" when there are cents. */
export function formatUsd(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "16 November". UTC, so the server, the email and the page print the same day. */
export function formatChargeDay(iso: string | null | undefined): string {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function pricePerPeriod(amountUsd: number, period: CardTrialPeriod): string {
  return `${formatUsd(amountUsd)} a ${period === 'annual' ? 'year' : 'month'}`;
}

export type CardTrialOfferCopy = {
  title: string;
  lede: string;
  today: string;
  thenLabel: string;
  thenValue: string;
  /** Bachs adds its card fee on top of our price (#1276). */
  feeNote: string;
};

/** Our Bachs account is set to "Customer pays fees": the card is charged our
 *  price plus Bachs's fee, so every place that names the charge says so (#1276). */
export const CARD_FEE_NOTE = 'A card processing fee is added to each payment.';

/** The add-a-card screen. The first charge day is today plus the free days. */
export function cardTrialOfferCopy(input: {
  planName: string;
  amountUsd: number;
  period: CardTrialPeriod;
  trialDays: number;
  now: number;
}): CardTrialOfferCopy {
  const firstCharge = new Date(input.now + input.trialDays * 24 * 60 * 60 * 1000).toISOString();
  return {
    title: `Try ${input.planName} free for ${input.trialDays} days`,
    lede: 'Add a card to start. You pay nothing today.',
    today: '$0',
    thenLabel: `From ${formatChargeDay(firstCharge)}`,
    thenValue: pricePerPeriod(input.amountUsd, input.period),
    feeNote: CARD_FEE_NOTE,
  };
}

const REMINDER_WINDOW_MS = 36 * 60 * 60 * 1000;

/** Send the "we charge tomorrow" email now? Once, inside the last day and a half. */
export function cardTrialReminderDue(input: {
  status: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  reminderSentAt: string | null;
  now: number;
}): boolean {
  if (input.status !== 'trialing' || input.cancelAtPeriodEnd || input.reminderSentAt) return false;
  const end = Date.parse(String(input.trialEnd ?? ''));
  if (!Number.isFinite(end)) return false;
  return end > input.now && end - input.now <= REMINDER_WINDOW_MS;
}

/** The reminder, as note-text (lib/email/note-text.ts). */
export function cardTrialReminderCopy(input: {
  planName: string;
  amountUsd: number;
  trialEnd: string;
  cancelUrl: string;
}): { subject: string; body: string } {
  const day = formatChargeDay(input.trialEnd);
  return {
    subject: `Your trial ends on ${day}`,
    body: [
      `Your free days end on ${day}. We will charge ${formatUsd(input.amountUsd)} plus a card processing fee to your card that day and ${input.planName} carries on.`,
      `Want to stop? [Cancel here](${input.cancelUrl}). It takes a second, and you keep everything until ${day}.`,
    ].join('\n\n'),
  };
}
