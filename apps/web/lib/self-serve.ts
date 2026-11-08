// Self-serve checkout (2026-10-22). Pure rules and copy, safe for the client.
// The server half (Paystack, the database) is lib/self-serve-server.ts.
//
// Anyone can sign up, pay for a plan by card or bank transfer, and start their
// first rollout with no founder call. Paying skips the waitlist (access_source
// 'paid_self_serve'); free and trial sign-ups stay on it. Prices always come
// from @urganize/pricing, never from a number typed here.

import {
  INTRO_MONTHS,
  PRICING_TIERS,
  getChargePrice,
  getIntroPrice,
  getTierPrice,
  intervalLabel,
  type BillingInterval,
  type PricingTierId,
  type PricingCurrencyCode,
  formatMoney,
  getTierPriceUsd,
} from '@urganize/pricing';
import { ALLOWANCE_CREDITS } from '@/lib/credits/allowance';

/** "₦30,000": whole naira, no decimals. */
export function formatNaira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------- the intent

export type CheckoutPlan = Extract<PricingTierId, 'solo' | 'solo_plus' | 'manager' | 'pro' | 'label'>;
// What checkout offers: Solo, Manager and Pro (2026-11-07, #1112), monthly or
// yearly.
// Label and the 6-month period are still valid ids (isCheckoutPlan,
// isCheckoutPeriod) so teams already on them can renew.
// Solo Plus joined 2026-11-08 (pricing v4). Free is never bought.
export const CHECKOUT_PLANS: readonly CheckoutPlan[] = ['solo', 'solo_plus', 'manager', 'pro'];
export const CHECKOUT_PERIODS: readonly BillingInterval[] = ['monthly', 'annual'];
export type PaymentMethodChoice = 'card' | 'transfer';

export function isCheckoutPlan(value: unknown): value is CheckoutPlan {
  return value === 'solo' || value === 'solo_plus' || value === 'manager' || value === 'pro' || value === 'label';
}

export function isCheckoutPeriod(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'semiannual' || value === 'annual';
}

export type CheckoutIntent = { plan: CheckoutPlan; period: BillingInterval; promo: string | null };

const PROMO_PATTERN = /^[A-Z0-9_-]{3,40}$/;

/** Upper-cased and trimmed, or null. The server validates it against the
 *  partner and team codes; this only stops junk from travelling. */
export function normalizePromo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toUpperCase();
  return PROMO_PATTERN.test(value) ? value : null;
}

/** Reads ?plan=&period=&promo=. Manager monthly when nothing usable is given. */
export function parseCheckoutIntent(input: {
  plan?: unknown;
  period?: unknown;
  promo?: unknown;
}): CheckoutIntent {
  return {
    plan: isCheckoutPlan(input.plan) ? input.plan : 'manager',
    period: isCheckoutPeriod(input.period) ? input.period : 'monthly',
    promo: normalizePromo(input.promo),
  };
}

/** The pending intent is also kept on the account (user_metadata) so an email
 *  confirmation opened on another device still comes back to pay. */
export const PENDING_CHECKOUT_METADATA_KEY = 'pending_checkout';

export function readPendingCheckout(metadata: unknown): CheckoutIntent | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[PENDING_CHECKOUT_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!isCheckoutPlan(value.plan)) return null;
  return parseCheckoutIntent(value);
}

export function checkoutPath(intent: Partial<CheckoutIntent> & { plan: CheckoutPlan }): string {
  const params = new URLSearchParams({ plan: intent.plan, period: intent.period ?? 'monthly' });
  if (intent.promo) params.set('promo', intent.promo);
  return `/checkout?${params.toString()}`;
}

// ---------------------------------------------------------------- the amounts

export function planName(plan: CheckoutPlan): string {
  return PRICING_TIERS[plan].label;
}

/** Naira for one period of a plan, or null when the plan has no price.
 *  `introMonthsLeft` > 0 gives the starting price on monthly. */
export function periodAmount(
  plan: CheckoutPlan,
  period: BillingInterval,
  introMonthsLeft = 0,
  currency: PricingCurrencyCode = 'NGN'
): number | null {
  // Dollars (#1120) have no starting price: the fixed dollar price from day one.
  if (currency === 'USD') return getTierPriceUsd(plan, period)?.amount ?? null;
  return getChargePrice(plan, period, introMonthsLeft)?.amount ?? null;
}

/** "₦30,000" or "$29": an amount in the payer's currency. */
export function formatPrice(amount: number, currency: PricingCurrencyCode = 'NGN'): string {
  return currency === 'USD' ? formatMoney(amount, 'USD') : formatNaira(amount);
}

/** "For your first 6 months, then ₦30,000 a month." when this payment is at
 *  the starting price, else null. */
export function introSubline(
  plan: CheckoutPlan,
  period: BillingInterval,
  introMonthsLeft: number,
  currency: PricingCurrencyCode = 'NGN'
): string | null {
  if (currency === 'USD') return null;
  const intro = getIntroPrice(plan);
  const full = getTierPrice(plan, 'monthly');
  if (period !== 'monthly' || !intro || !full || introMonthsLeft <= 0) return null;
  const months = introMonthsLeft === 1 ? 'month' : `${introMonthsLeft} months`;
  return `For your ${introMonthsLeft === INTRO_MONTHS ? 'first ' : 'next '}${months}, then ${formatNaira(full.amount)} a month.`;
}

/** "₦30,000 a month", "₦150,000 for 6 months", "₦300,000 a year". */
export function periodHeadline(
  plan: CheckoutPlan,
  period: BillingInterval,
  introMonthsLeft = 0,
  currency: PricingCurrencyCode = 'NGN'
): string {
  const amount = periodAmount(plan, period, introMonthsLeft, currency);
  if (amount === null) return '';
  const naira = formatPrice(amount, currency);
  if (period === 'semiannual') return `${naira} for 6 months`;
  if (period === 'annual') return `${naira} a year`;
  return `${naira} a month`;
}

/** The short line under the headline. */
export function periodSaving(period: BillingInterval): string | null {
  if (period === 'semiannual') return 'One month free';
  if (period === 'annual') return 'Two months free';
  return null;
}

export function periodLabel(period: BillingInterval): string {
  return intervalLabel(period);
}

export type YouGetRow = { label: string; value: string };

/** "You get", from the plan's own limits. Distribution only shows while the
 *  partner send is on. */
export function youGet(plan: CheckoutPlan, distributionOn: boolean): YouGetRow[] {
  const limits = PRICING_TIERS[plan].limits;
  const rows: YouGetRow[] = [
    { label: 'Artists', value: limits.artists === null ? 'No limit' : String(limits.artists) },
    { label: 'People on your team', value: limits.seats === null ? 'No limit' : String(limits.seats) },
    { label: 'AI credits', value: `${ALLOWANCE_CREDITS[plan].toLocaleString('en-NG')} / mo` },
  ];
  // Only a plan that includes distribution (Pro and Label since 2026-11-07).
  if (distributionOn && PRICING_TIERS[plan].includesDistribution) {
    rows.push({ label: 'Distribution', value: 'Partner' });
  }
  return rows;
}

// ---------------------------------------------------------------- transfers

/** payments.paystack_response.source for a one-time bank-transfer checkout. */
export const TRANSFER_CHECKOUT_SOURCE = 'self_serve_transfer';

export type InvoiceMoney = { amountKobo: number; creditAppliedKobo: number; paidKobo: number };

/** What still has to arrive, never below zero. */
export function invoiceRemainingKobo(invoice: InvoiceMoney): number {
  return Math.max(0, invoice.amountKobo - invoice.creditAppliedKobo - invoice.paidKobo);
}

export type TransferApplied = {
  paidKobo: number;
  /** True once the whole amount is in. Never true on a partial payment. */
  settled: boolean;
  remainingKobo: number;
  /** Anything over the amount, kept as credit toward the next period. */
  overpaidKobo: number;
};

/** Adds one transfer to an open invoice. A partial payment never settles it. */
export function applyTransferToInvoice(invoice: InvoiceMoney, incomingKobo: number): TransferApplied {
  const incoming = Number.isFinite(incomingKobo) && incomingKobo > 0 ? Math.round(incomingKobo) : 0;
  const paidKobo = invoice.paidKobo + incoming;
  const due = Math.max(0, invoice.amountKobo - invoice.creditAppliedKobo);
  const settled = paidKobo >= due && due >= 0;
  return {
    paidKobo,
    settled,
    remainingKobo: Math.max(0, due - paidKobo),
    overpaidKobo: Math.max(0, paidKobo - due),
  };
}

/** How much of a carried credit an invoice may use. */
export function creditToApply(amountKobo: number, availableCreditKobo: number): number {
  return Math.max(0, Math.min(amountKobo, Math.floor(availableCreditKobo)));
}

/** Card payments go through a Paystack Plan per period; a period whose Plan is
 *  not set is hidden, transfer still offers it. */
export function periodsForMethod(
  method: PaymentMethodChoice,
  cardPeriods: readonly BillingInterval[]
): BillingInterval[] {
  if (method === 'transfer') return [...CHECKOUT_PERIODS];
  return CHECKOUT_PERIODS.filter((period) => cardPeriods.includes(period));
}

// ---------------------------------------------------------------- renewals

const DAY_MS = 24 * 60 * 60 * 1000;

export const RENEWAL_REMINDER_DAYS = [7, 3, 1] as const;

export function daysUntil(endIso: string | null, now: Date): number | null {
  if (!endIso) return null;
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - now.getTime()) / DAY_MS);
}

/** The reminder that is due now, or null. Only the tightest one is sent, so a
 *  missed morning never sends two at once. Transfer periods only: a card
 *  renews by itself. */
export function renewalReminderDue(input: {
  expiresAt: string | null;
  now: Date;
  sentKeys: readonly string[];
}): { days: (typeof RENEWAL_REMINDER_DAYS)[number]; key: string } | null {
  const left = daysUntil(input.expiresAt, input.now);
  if (left === null || left < 1) return null;
  const due = [...RENEWAL_REMINDER_DAYS].sort((a, b) => a - b).find((d) => left <= d);
  if (!due) return null;
  const key = `${input.expiresAt?.slice(0, 10)}:${due}`;
  return input.sentKeys.includes(key) ? null : { days: due, key };
}

/** The in-app line, from 7 days out. */
export function renewalBannerText(plan: CheckoutPlan, daysLeft: number): { title: string; body: string } {
  const name = planName(plan);
  const title = daysLeft <= 1 ? `${name} ends tomorrow.` : `${name} ends in ${daysLeft} days.`;
  return { title, body: 'Renew to keep your team working.' };
}

// ---------------------------------------------------------------- checklist

export const CHECKLIST_DAYS = 14;

export type ChecklistStepId = 'rollout' | 'cover' | 'tasks' | 'invite' | 'distribute';

export type ChecklistFacts = {
  plan: CheckoutPlan | null;
  rolloutCount: number;
  doneTasks: number;
  hasCoverAndDetails: boolean;
  invitedSomeone: boolean;
  distributionStarted: boolean;
  distributionOn: boolean;
};

export type ChecklistStep = { id: ChecklistStepId; label: string; done: boolean; progress?: string };

export const CHECKLIST_TASK_TARGET = 3;

export function buildChecklist(facts: ChecklistFacts): ChecklistStep[] {
  const steps: ChecklistStep[] = [
    { id: 'rollout', label: 'Create your first rollout', done: facts.rolloutCount > 0 },
    { id: 'cover', label: 'Add cover art and details', done: facts.hasCoverAndDetails },
    {
      id: 'tasks',
      label: 'Finish 3 tasks',
      done: facts.doneTasks >= CHECKLIST_TASK_TARGET,
      progress:
        facts.doneTasks >= CHECKLIST_TASK_TARGET
          ? undefined
          : `${Math.min(facts.doneTasks, CHECKLIST_TASK_TARGET)} / ${CHECKLIST_TASK_TARGET}`,
    },
  ];
  // Solo is one person and an artist; there is nobody else to bring in.
  if (facts.plan !== 'solo') {
    steps.push({ id: 'invite', label: 'Invite one teammate', done: facts.invitedSomeone });
  }
  if (facts.distributionOn) {
    steps.push({ id: 'distribute', label: 'Unlock distribution', done: facts.distributionStarted });
  }
  return steps;
}

export function checklistDaysLeft(teamCreatedAt: string | null, now: Date): number {
  if (!teamCreatedAt) return CHECKLIST_DAYS;
  const created = new Date(teamCreatedAt).getTime();
  if (!Number.isFinite(created)) return CHECKLIST_DAYS;
  return Math.max(0, CHECKLIST_DAYS - Math.floor((now.getTime() - created) / DAY_MS));
}

/** "2 of 4 done · 11 days left". */
export function checklistSummary(steps: readonly ChecklistStep[], daysLeft: number): string {
  const done = steps.filter((step) => step.done).length;
  const days = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  return `${done} of ${steps.length} done · ${days}`;
}

/** Shown in the first 14 days unless closed. Once every step is done it says
 *  so for one more day (hiddenAfter is set then), then goes. */
export function isChecklistVisible(input: {
  hiddenAfter: string | null;
  daysLeft: number;
  now: Date;
}): boolean {
  if (input.hiddenAfter) {
    const at = new Date(input.hiddenAfter).getTime();
    if (Number.isFinite(at) && at <= input.now.getTime()) return false;
  }
  return input.daysLeft > 0;
}

// ---------------------------------------------------------------- nudges

export type NudgeKey = 'day1' | 'day3' | 'day7';

export type NudgeFacts = {
  plan: CheckoutPlan | null;
  rolloutCount: number;
  doneTasks: number;
  invitedSomeone: boolean;
  hasCoverAndDetails: boolean;
};

export type NudgeVariant = 'rollout' | 'tasks' | 'invite' | 'cover';

/** The one nudge due today, or null. Each goes on its own day only while its
 *  step is undone, and only within 2 days of that day (a late nudge reads odd). */
export function pickNudge(input: {
  teamCreatedAt: string | null;
  now: Date;
  facts: NudgeFacts;
  sentKeys: readonly string[];
}): { key: NudgeKey; variant: NudgeVariant } | null {
  if (!input.teamCreatedAt) return null;
  const created = new Date(input.teamCreatedAt).getTime();
  if (!Number.isFinite(created)) return null;
  const age = Math.floor((input.now.getTime() - created) / DAY_MS);
  const { facts } = input;
  const candidates: Array<{ key: NudgeKey; day: number; variant: NudgeVariant | null }> = [
    { key: 'day1', day: 1, variant: facts.rolloutCount === 0 ? 'rollout' : null },
    { key: 'day3', day: 3, variant: facts.doneTasks < CHECKLIST_TASK_TARGET ? 'tasks' : null },
    {
      key: 'day7',
      day: 7,
      variant:
        facts.plan === 'solo'
          ? facts.hasCoverAndDetails
            ? null
            : 'cover'
          : facts.invitedSomeone
            ? null
            : 'invite',
    },
  ];
  for (const candidate of candidates) {
    if (age < candidate.day || age > candidate.day + 2) continue;
    if (input.sentKeys.includes(candidate.key)) continue;
    if (!candidate.variant) continue;
    return { key: candidate.key, variant: candidate.variant };
  }
  return null;
}

// ---------------------------------------------------------------- help

export const HELP_TOPICS = ['billing', 'rollouts', 'distribution', 'account', 'other'] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

export const HELP_TOPIC_LABELS: Record<HelpTopic, string> = {
  billing: 'Billing',
  rollouts: 'Rollouts',
  distribution: 'Distribution',
  account: 'Account',
  other: 'Other',
};

export function isHelpTopic(value: unknown): value is HelpTopic {
  return typeof value === 'string' && (HELP_TOPICS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------- setup call

/** The founder's booking page. Manager and Label only. */
export function setupCallUrl(): string | null {
  const value = (process.env.NEXT_PUBLIC_ONBOARDING_CALL_URL || '').trim();
  return /^https:\/\//.test(value) ? value : null;
}

export function offersSetupCall(plan: string | null | undefined): boolean {
  return plan === 'manager' || plan === 'pro' || plan === 'label' || plan === 'enterprise';
}

// ---------------------------------------------------------------- copy

export const SELF_SERVE_COPY = {
  cardFine: 'Paystack handles the payment. Cancel anytime in Settings.',
  transferFine: 'Transfer from any bank app. It confirms by itself.',
  transferWaiting: 'Waiting for your transfer. This page updates by itself.',
  transferKeep: 'This number is yours. Save it as a beneficiary and use it for every renewal.',
  transferWrong: 'Wrong amount? Send the difference to the same number.',
  successTitle: "You're in.",
  pendingTitle: 'Confirming your payment.',
  pendingBody: "This usually takes a few seconds. You can close this page; we'll email you when it's done.",
  failedTitle: "Payment didn't go through.",
  failedBody: "Your card wasn't charged. Nothing is lost.",
  finishTitle: 'Finish setting up.',
  signupTitle: 'Create your account, then pay.',
} as const;

export function partPaidCopy(remainingKobo: number, receivedKobo: number): { title: string; body: string } {
  return {
    title: `${formatNaira(remainingKobo / 100)} still to pay.`,
    body: `We got ${formatNaira(receivedKobo / 100)}. Send the rest to the same account and your team opens.`,
  };
}

export function finishBody(plan: CheckoutPlan): string {
  return `You picked ${planName(plan)}. Pay and your team opens straight away.`;
}

// ---------------------------------------------------------------- emails

export type NudgeEmailInput = {
  variant: NudgeVariant;
  plan: CheckoutPlan | null;
  releaseTitle: string | null;
  taskCount: number;
};

export type LifecycleEmailCopy = { subject: string; preview: string; body: string; cta: string };

/** The day 1 / 3 / 7 notes, word for word from the approved mocks. Plain
 *  note-text (see lib/email/note-text.ts): a blank line starts a paragraph. */
export function nudgeEmailCopy(input: NudgeEmailInput): LifecycleEmailCopy {
  switch (input.variant) {
    case 'rollout': {
      const plan = input.plan ? planName(input.plan) : 'Urganize';
      return {
        subject: "Start with the release you're on",
        preview: 'It takes two minutes, and AI writes the plan.',
        body: `${plan} is set up for your team. The quickest way to see what Urganize does is to add the release you're working on now. It takes two minutes, and AI writes the plan.`,
        cta: 'Start your first rollout',
      };
    }
    case 'tasks': {
      const title = (input.releaseTitle || '').trim();
      const lead =
        title && input.taskCount > 0
          ? `Your plan for ${title} has ${input.taskCount} tasks.`
          : 'Your plan has tasks waiting.';
      return {
        subject: 'Three tasks this week',
        preview: "Tick off three and you'll always know what comes next.",
        body: `${lead} Tick off three this week and you'll always know what comes next, without asking anyone.`,
        cta: 'Open your plan',
      };
    }
    case 'invite':
      return {
        subject: 'Bring one person in',
        preview: "They don't pay, and they only see your team.",
        body: "Rollouts move faster when the person doing the cover art can see the plan. Invite one teammate. They don't pay, and they only see your team.",
        cta: 'Invite a teammate',
      };
    case 'cover':
      return {
        subject: 'Add your cover art',
        preview: 'It takes a minute.',
        body: 'A rollout with its cover art and release date looks real to everyone you send it to. It takes a minute.',
        cta: 'Add cover art',
      };
  }
}

/** "Friday 24 October" and "Fri 24 Oct", in Lagos. */
export function renewalDates(expiresAt: string): { long: string; short: string } {
  const date = new Date(expiresAt);
  const opts = { timeZone: 'Africa/Lagos' } as const;
  return {
    long: date.toLocaleDateString('en-GB', { ...opts, weekday: 'long', day: 'numeric', month: 'long' }),
    short: date.toLocaleDateString('en-GB', { ...opts, weekday: 'short', day: 'numeric', month: 'short' }),
  };
}

export function renewalEmailCopy(input: {
  plan: CheckoutPlan;
  expiresAt: string;
  amountNaira: number | null;
  /** Set for a team that pays in US dollars through Bachs (#1120). */
  amountUsd?: number | null;
}): {
  subject: string;
  preview: string;
  body: string;
  footnote: string;
} {
  const name = planName(input.plan);
  const { long, short } = renewalDates(input.expiresAt);
  const pay =
    input.amountUsd && input.amountUsd > 0
      ? `To keep going, pay ${formatMoney(input.amountUsd, 'USD')} on Urganize.`
      : input.amountNaira && input.amountNaira > 0
      ? `To keep going, transfer ${formatNaira(input.amountNaira)} to your Urganize account, or pay by card.`
      : 'To keep going, transfer to your Urganize account, or pay by card.';
  return {
    subject: `${name} ends on ${short}`,
    preview: pay,
    body: `Your ${name} plan ends on ${long}. ${pay}`,
    footnote: "If nothing comes in, your team can still see everything but can't make changes until you renew.",
  };
}

// ---------------------------------------------------------------- help request

export const HELP_MESSAGE_MAX = 2000;
export const HELP_INBOX = 'wenapere@urganize.app';

export type HelpRequest = { topic: HelpTopic; message: string; pagePath: string | null };

/** Checks what the help form sends. The page is the one fact only the browser
 *  knows; it must be one of our own paths. Everything else (team, plan,
 *  version, who) is read on the server. */
export function parseHelpRequest(body: unknown): { ok: true; value: HelpRequest } | { ok: false; error: string } {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isHelpTopic(input.topic)) return { ok: false, error: 'Pick what it is about.' };
  const message = typeof input.message === 'string' ? input.message.replace(/\r\n/g, '\n').trim() : '';
  if (!message) return { ok: false, error: "Tell us what's going on." };
  if (message.length > HELP_MESSAGE_MAX) return { ok: false, error: 'That is a bit long. Keep it under 2,000 characters.' };
  const rawPath = typeof input.pagePath === 'string' ? input.pagePath.trim().slice(0, 300) : '';
  const pagePath = rawPath.startsWith('/') && !rawPath.startsWith('//') && !/[\u0000-\u001f\\]/.test(rawPath) ? rawPath : null;
  return { ok: true, value: { topic: input.topic, message, pagePath } };
}

// ---------------------------------------------------------------- limit sheet

/** The Solo limit sheet's title is the refusal's first sentence; the rest is the body. */
export function splitLimitMessage(message: string): { title: string; body: string } {
  const match = message.match(/^([\s\S]+?[.!?])\s+([\s\S]*)$/);
  if (!match) return { title: message, body: '' };
  return { title: match[1], body: match[2] };
}
