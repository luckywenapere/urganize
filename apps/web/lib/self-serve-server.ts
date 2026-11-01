// Self-serve checkout, the server half (2026-10-22). Pure rules and copy are
// lib/self-serve.ts. Everything here is service-role only and never logs a key,
// a card, an account number or an email.
//
// THE ONE RULE: a verified payment is what lets someone in. Card charges are
// confirmed by the Paystack webhook (HMAC checked there), transfers by the same
// webhook on a dedicated account, and money paid straight to our bank only by an
// admin recording it. A partial transfer never opens a team.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { PRICE_LIST_VERSION, getChargePrice, getIntroPrice, isBillingInterval, isPricingTierId, isSelfServePurchase, type BillingInterval } from '@urganize/pricing';
import { consumeClearance } from '@/lib/call-led-server';
import { isMissingColumnError } from '@/lib/billing-schema';
import { approveUser } from '@/lib/access-gate-server';
import { advancePeriodEnd, type RecurringPlanId } from '@/lib/billing-plans';
import { invalidateSubscriptionSnapshot } from '@/lib/subscription-access';
import { invalidateTeamAccess } from '@/lib/team-billing-server';
import { ensureOwnedWorkspace } from '@/lib/tasks-server';
import { isReferralsEnabled } from '@/lib/referrals';
import { isReferralCreditsEnabled } from '@/lib/referral-credits';
import {
  attachReferral,
  loadIntroMonthsLeft,
  recordSubscriptionCharge,
  rewardReferrerOnFirstPayment,
  lookupReferralCode,
  type ChargeSource,
} from '@/lib/referrals-server';
import { paystackRequest } from '@/lib/paystack-server';
import { logBillingEvent } from '@/lib/billing-events-server';
import {
  applyTransferToInvoice,
  creditToApply,
  normalizePromo,
  type CheckoutPlan,
} from '@/lib/self-serve';
import { createServerPostHogClient, captureServerAnalyticsEvent, shutdownServerAnalytics } from '@/lib/analytics/server';
import { createPostHogEvent, type SelfServeEventProperties } from '@/lib/analytics/shared';

type Admin = SupabaseClient;
export type StoredPaymentMethod = 'card' | 'transfer' | 'direct_transfer';

const UNDEFINED_COLUMN = '42703';
const UNDEFINED_TABLE = '42P01';

function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === UNDEFINED_COLUMN ||
    error.code === UNDEFINED_TABLE ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205'
  );
}

/** Server-side PostHog, never throws. */
export async function trackSelfServe(
  userId: string | null,
  name:
    | 'access_auto_approved'
    | 'checkout_succeeded'
    | 'checkout_failed'
    | 'dva_shown'
    | 'nudge_sent'
    | 'nudge_clicked'
    | 'renewal_clicked'
    | 'renewal_reminder_sent'
    | 'promo_applied'
    | 'promo_rejected',
  properties: SelfServeEventProperties
): Promise<void> {
  if (!userId) return;
  const posthog = createServerPostHogClient();
  try {
    captureServerAnalyticsEvent(posthog, userId, createPostHogEvent(name, properties));
  } catch {
    // Analytics never fails the work it describes.
  } finally {
    await shutdownServerAnalytics(posthog).catch(() => undefined);
  }
}

// ---------------------------------------------------------------- promo codes

export type PromoCheck =
  | { ok: true; code: string; name: string; kind: 'partner' | 'team' }
  | { ok: false; message: string };

/** A partner's code (SOUNDWAVE) or, while referral credits are on, another
 *  team's own code. It changes nothing about the price: it says who sent them,
 *  and the team is tagged once it exists. */
export async function validatePromoCode(admin: Admin, raw: unknown): Promise<PromoCheck> {
  const code = normalizePromo(raw);
  if (!code) return { ok: false, message: "That code doesn't look right." };
  if (!isReferralsEnabled()) return { ok: false, message: "That code isn't valid." };
  try {
    const found = await lookupReferralCode(admin, code, { teams: isReferralCreditsEnabled() });
    if (found) return { ok: true, code, name: found.name, kind: found.kind };
  } catch {
    return { ok: false, message: "We couldn't check that code. Try again." };
  }
  return { ok: false, message: "That code isn't valid." };
}

// ---------------------------------------------------------------- approval

async function loadUser(admin: Admin, userId: string): Promise<User | null> {
  try {
    const result = await admin.auth.admin.getUserById(userId);
    return result.data?.user ?? null;
  } catch {
    return null;
  }
}

async function wasHeld(admin: Admin, userId: string): Promise<boolean> {
  const result = await admin.from('profiles').select('access_approved_at').eq('id', userId).maybeSingle();
  if (result.error) return false;
  return !(result.data as { access_approved_at: string | null } | null)?.access_approved_at;
}

/**
 * A verified payment: let the payer in (if they were waiting), make sure they
 * have a team, mark how it pays, and tag who sent them. Idempotent, never
 * throws; a webhook redelivery runs it again harmlessly.
 */
export async function completePaidSignup(
  admin: Admin,
  input: {
    userId: string;
    plan: string;
    method: StoredPaymentMethod;
    period?: string | null;
    promoCode?: string | null;
  }
): Promise<{ workspaceId: string | null; approvedNow: boolean }> {
  let approvedNow = false;
  // A plan that starts with a call (Label, 6 months, yearly) counts as concierge,
  // like money the founder recorded: the founder let them in.
  const callLed =
    isPricingTierId(input.plan) && isBillingInterval(input.period) && !isSelfServePurchase(input.plan, input.period);
  try {
    if (await wasHeld(admin, input.userId)) {
      // Money the founder recorded by hand means the founder let them in, which
      // the cohort counts as concierge; a payment through checkout is self-serve.
      approvedNow = await approveUser(admin, input.userId, input.method === 'direct_transfer' || callLed ? 'admin' : 'paid_self_serve');
    }
  } catch (error) {
    console.warn('[self-serve] approval failed', { userId: input.userId, error: String(error) });
  }

  let workspaceId: string | null = null;
  try {
    const user = await loadUser(admin, input.userId);
    if (user) {
      if (callLed && user.email && input.period) {
        await consumeClearance(admin, { email: user.email, plan: input.plan, period: input.period });
      }
      const workspace = await ensureOwnedWorkspace(admin, user);
      workspaceId = workspace.id;
    }
  } catch (error) {
    // A curator-only account, or a database blip. The subscription is already
    // on the account, so the team is made on their next visit instead.
    console.warn('[self-serve] could not set up the team', { userId: input.userId, error: String(error) });
  }

  if (workspaceId) {
    const update = await admin.from('workspaces').update({ payment_method: input.method }).eq('id', workspaceId);
    if (update.error && !isMissingSchema(update.error)) {
      console.warn('[self-serve] payment method not saved', update.error.message);
    }
    if (input.promoCode && isReferralsEnabled()) {
      await attachReferral(admin, { ownerUserId: input.userId, rawCode: input.promoCode }).catch(() => undefined);
    }
  }

  if (approvedNow) {
    // A paid sign-up skips the questions wizard: the welcome page and the
    // first 14 days list do that job. Without this a later Google sign-in
    // would be sent through the wizard it already skipped.
    await admin
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', input.userId)
      .eq('onboarding_completed', false)
      .then(() => undefined, () => undefined);
    await trackSelfServe(input.userId, 'access_auto_approved', {
      path: input.method === 'direct_transfer' || callLed ? 'concierge' : 'self_serve',
      plan: input.plan,
      period: input.period ?? null,
      method: input.method,
    });
  }
  return { workspaceId, approvedNow };
}

// ---------------------------------------------------------------- dedicated accounts

export type PaymentAccount = {
  bankName: string;
  accountNumber: string;
  accountName: string;
  customerCode: string;
};

export function isDedicatedAccountEnabled(): boolean {
  return (process.env.PAYSTACK_DVA_ENABLED || '').trim().toLowerCase() === 'true';
}

function preferredBank(): string {
  return (process.env.PAYSTACK_DVA_BANK || '').trim() || 'wema-bank';
}

function toAccount(row: Record<string, unknown>): PaymentAccount {
  return {
    bankName: String(row.bank_name ?? ''),
    accountNumber: String(row.account_number ?? ''),
    accountName: String(row.account_name ?? ''),
    customerCode: String(row.paystack_customer_code ?? ''),
  };
}

export async function loadPaymentAccount(admin: Admin, userId: string): Promise<PaymentAccount | null> {
  const result = await admin
    .from('team_payment_accounts')
    .select('bank_name,account_number,account_name,paystack_customer_code,active')
    .eq('user_id', userId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data as Record<string, unknown>;
  return row.active === false ? null : toAccount(row);
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Urganize', last: 'Customer' };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/**
 * The payer's own account number, made once and reused for every renewal.
 * Null when dedicated accounts are off or Paystack will not make one; the
 * caller then falls back to a one-time bank-transfer checkout.
 */
export async function getOrCreatePaymentAccount(
  admin: Admin,
  input: { userId: string; email: string; name: string; workspaceId?: string | null }
): Promise<PaymentAccount | null> {
  const existing = await loadPaymentAccount(admin, input.userId);
  if (existing) return existing;
  if (!isDedicatedAccountEnabled()) return null;

  const { first, last } = splitName(input.name || input.email.split('@')[0] || '');
  const customer = await paystackRequest<{ customer_code?: string; id?: number }>('/customer', {
    method: 'POST',
    body: { email: input.email, first_name: first, last_name: last, metadata: { user_id: input.userId } },
  });
  if (!customer.ok || !customer.data?.customer_code) {
    console.warn('[self-serve] Paystack customer not made', { status: customer.ok ? 200 : customer.status });
    return null;
  }

  const account = await paystackRequest<{
    id?: number;
    account_number?: string;
    account_name?: string;
    bank?: { name?: string; slug?: string };
  }>('/dedicated_account', {
    method: 'POST',
    body: { customer: customer.data.customer_code, preferred_bank: preferredBank() },
  });
  if (!account.ok || !account.data?.account_number) {
    console.warn('[self-serve] dedicated account not made', { status: account.ok ? 200 : account.status });
    return null;
  }

  const row = {
    user_id: input.userId,
    workspace_id: input.workspaceId ?? null,
    provider: 'paystack_dva',
    paystack_customer_code: customer.data.customer_code,
    paystack_account_id: account.data.id ?? null,
    account_number: account.data.account_number,
    account_name: account.data.account_name || `Urganize / ${input.name}`,
    bank_name: account.data.bank?.name || 'Wema Bank',
    bank_slug: account.data.bank?.slug ?? null,
  };
  const saved = await admin.from('team_payment_accounts').upsert(row, { onConflict: 'user_id' });
  if (saved.error) {
    console.warn('[self-serve] payment account not saved', saved.error.message);
    return null;
  }
  return toAccount(row);
}

export async function findUserIdByCustomerCode(admin: Admin, customerCode: string): Promise<string | null> {
  const result = await admin
    .from('team_payment_accounts')
    .select('user_id')
    .eq('paystack_customer_code', customerCode)
    .maybeSingle();
  return (result.data as { user_id: string } | null)?.user_id ?? null;
}

// ---------------------------------------------------------------- invoices

export type InvoiceRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  plan: CheckoutPlan;
  billing_interval: BillingInterval;
  method: 'transfer' | 'direct_transfer';
  amount_kobo: number;
  credit_applied_kobo: number;
  paid_kobo: number;
  status: 'open' | 'paid' | 'cancelled';
  promo_code: string | null;
  paystack_reference: string | null;
  period_end: string | null;
  created_at: string;
  paid_at: string | null;
};

const INVOICE_COLUMNS =
  'id,user_id,workspace_id,plan,billing_interval,method,amount_kobo,credit_applied_kobo,paid_kobo,status,promo_code,paystack_reference,period_end,created_at,paid_at';

export async function loadOpenInvoice(admin: Admin, userId: string): Promise<InvoiceRow | null> {
  const result = await admin
    .from('payment_invoices')
    .select(INVOICE_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'open')
    .maybeSingle();
  return (result.data as InvoiceRow | null) ?? null;
}

export async function loadInvoice(admin: Admin, userId: string, invoiceId: string): Promise<InvoiceRow | null> {
  const result = await admin
    .from('payment_invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .maybeSingle();
  return (result.data as InvoiceRow | null) ?? null;
}

/** Credit toward the next period: overpayments on paid invoices, plus
 *  transfers that arrived with no invoice open, minus credit already used. */
export async function loadCarriedCreditKobo(admin: Admin, userId: string): Promise<number> {
  const [invoices, loose] = await Promise.all([
    admin.from('payment_invoices').select('amount_kobo,credit_applied_kobo,paid_kobo,status').eq('user_id', userId),
    admin
      .from('payment_transfers')
      .select('amount_kobo')
      .eq('user_id', userId)
      .is('invoice_id', null)
      .neq('source', 'admin_record'),
  ]);
  if (invoices.error || loose.error) return 0;
  let credit = 0;
  for (const row of (loose.data ?? []) as Array<{ amount_kobo: number }>) credit += Number(row.amount_kobo) || 0;
  for (const row of (invoices.data ?? []) as Array<Pick<InvoiceRow, 'amount_kobo' | 'credit_applied_kobo' | 'paid_kobo' | 'status'>>) {
    if (row.status === 'cancelled') continue;
    credit -= Number(row.credit_applied_kobo) || 0;
    if (row.status === 'paid') {
      credit += Math.max(0, (Number(row.paid_kobo) || 0) - Math.max(0, row.amount_kobo - row.credit_applied_kobo));
    }
  }
  return Math.max(0, credit);
}

/**
 * The transfer invoice for this plan and period. An open one for the same plan
 * and period is reused; a different choice replaces it (the money already
 * received moves across).
 */
export async function openTransferInvoice(
  admin: Admin,
  input: {
    userId: string;
    workspaceId: string | null;
    plan: CheckoutPlan;
    period: BillingInterval;
    promoCode: string | null;
    paystackReference?: string | null;
  }
): Promise<InvoiceRow | null> {
  // Starting price on a team's first monthly payments (2026-10-26).
  const price = getChargePrice(input.plan, input.period, await loadIntroMonthsLeft(admin, input.userId));
  if (!price) return null;
  const open = await loadOpenInvoice(admin, input.userId);
  if (open && open.plan === input.plan && open.billing_interval === input.period && open.amount_kobo === price.minorUnit) {
    if (input.paystackReference && open.paystack_reference !== input.paystackReference) {
      await admin
        .from('payment_invoices')
        .update({ paystack_reference: input.paystackReference, updated_at: new Date().toISOString() })
        .eq('id', open.id);
      return { ...open, paystack_reference: input.paystackReference };
    }
    return open;
  }

  let carriedPaid = 0;
  if (open) {
    carriedPaid = open.paid_kobo;
    await admin.from('payment_invoices').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', open.id);
  }

  const credit = creditToApply(price.minorUnit, await loadCarriedCreditKobo(admin, input.userId));
  const inserted = await admin
    .from('payment_invoices')
    .insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      plan: input.plan,
      billing_interval: input.period,
      method: 'transfer',
      amount_kobo: price.minorUnit,
      credit_applied_kobo: credit,
      paid_kobo: carriedPaid,
      promo_code: input.promoCode,
      paystack_reference: input.paystackReference ?? null,
    })
    .select(INVOICE_COLUMNS)
    .single();
  if (inserted.error) {
    console.warn('[self-serve] invoice not opened', inserted.error.message);
    return null;
  }
  return inserted.data as InvoiceRow;
}

// ---------------------------------------------------------------- applying a paid period

async function hasPaidBefore(admin: Admin, userId: string): Promise<boolean> {
  const result = await admin.from('profiles').select('paid_at').eq('id', userId).maybeSingle();
  return Boolean((result.data as { paid_at: string | null } | null)?.paid_at);
}

/**
 * A transfer period is paid in full: extend the subscription from the current
 * end (a renewal never shortens a paid window), mark the account paid, and let
 * them in. Transfer periods do not renew by themselves.
 */
export async function applyTransferPeriod(
  admin: Admin,
  input: {
    userId: string;
    plan: CheckoutPlan;
    period: BillingInterval;
    amountKobo: number;
    reference: string;
    method: 'transfer' | 'direct_transfer';
    now: Date;
    promoCode?: string | null;
    /** Admin-set end date, for money paid outside Paystack. */
    periodEnd?: Date | null;
    /** Paid through Bachs (2026-11-01): recorded as its own channel. The
     *  period still does not renew by itself, so method stays 'transfer'. */
    channel?: 'bachs';
  }
): Promise<{ periodEnd: string; workspaceId: string | null }> {
  const firstPayment = !(await hasPaidBefore(admin, input.userId));
  // Read before this payment is written: a monthly period paid while the team
  // still had starting-price months is one of them.
  const intro =
    input.period === 'monthly' &&
    getIntroPrice(input.plan) !== null &&
    (await loadIntroMonthsLeft(admin, input.userId)) > 0;
  const current = await admin
    .from('subscriptions')
    .select('expires_at,status')
    .eq('user_id', input.userId)
    .maybeSingle();
  const currentRow = current.data as { expires_at: string | null; status: string | null } | null;
  const currentEnd = currentRow?.expires_at ? new Date(currentRow.expires_at) : null;
  const end =
    input.periodEnd ??
    advancePeriodEnd(input.plan as RecurringPlanId, currentEnd, input.now, input.period);

  const nowIso = input.now.toISOString();
  // price_locked_kobo / plan_version (20261022170000): a transfer period is paid
  // at the price on its invoice, so that is what this period locked. Retried
  // without them on a database the migration has not reached.
  const writeSubscription = (withLock: boolean) =>
    admin.from('subscriptions').upsert(
    {
      ...(withLock ? { price_locked_kobo: input.amountKobo, plan_version: PRICE_LIST_VERSION } : {}),
      user_id: input.userId,
      plan: input.plan,
      billing_interval: input.period,
      pending_plan: null,
      pending_billing_interval: null,
      pending_change_requested_at: null,
      status: 'active',
      amount: input.amountKobo,
      paystack_reference: input.reference,
      started_at: nowIso,
      expires_at: end.toISOString(),
      updated_at: nowIso,
    },
    { onConflict: 'user_id' }
  );
  let subscription = await writeSubscription(true);
  if (subscription.error && isMissingColumnError(subscription.error)) subscription = await writeSubscription(false);
  if (subscription.error) console.error('[self-serve] subscription not saved', subscription.error.message);

  const profile = await admin.from('profiles').update({ is_subscribed: true, paid_at: nowIso }).eq('id', input.userId);
  if (profile.error) console.error('[self-serve] profile not marked paid', profile.error.message);

  invalidateSubscriptionSnapshot(input.userId);
  invalidateTeamAccess(input.userId);

  const { workspaceId } = await completePaidSignup(admin, {
    userId: input.userId,
    plan: input.plan,
    period: input.period,
    method: input.method,
    promoCode: input.promoCode ?? null,
  });

  const source: ChargeSource = input.method === 'direct_transfer' ? 'manual' : firstPayment ? 'initial' : 'renewal';
  await recordSubscriptionCharge(admin, {
    userId: input.userId,
    reference: input.reference,
    amountKobo: input.amountKobo,
    plan: input.plan,
    source,
    chargedAt: input.now,
    channel: input.channel ?? (input.method === 'direct_transfer' ? 'direct_transfer' : 'transfer'),
    interval: input.period,
    planVersion: PRICE_LIST_VERSION,
    intro,
  });
  if (firstPayment) {
    await rewardReferrerOnFirstPayment(admin, { payerUserId: input.userId, reference: input.reference }).catch(
      () => undefined
    );
  }
  if (workspaceId) {
    await logBillingEvent(admin, {
      workspaceId,
      ownerUserId: input.userId,
      actorUserId: input.userId,
      type: input.method === 'direct_transfer' ? 'transfer_recorded' : 'transfer_paid',
      metadata: { plan: input.plan, interval: input.period, reference: input.reference, amountMinorUnit: input.amountKobo },
    }).catch(() => undefined);
  }
  return { periodEnd: end.toISOString(), workspaceId };
}

// ---------------------------------------------------------------- recording a transfer

export type RecordTransferResult =
  | { ok: true; duplicate: boolean; settled: boolean; remainingKobo: number; invoice: InvoiceRow | null; periodEnd: string | null }
  | { ok: false; error: string };

/**
 * One transfer that arrived. Deduped on the Paystack reference, so a webhook
 * delivered twice records once. Applied to the payer's open invoice; settles it
 * only when the whole amount is in. Money with no open invoice is kept as
 * credit toward the next one.
 */
export async function recordIncomingTransfer(
  admin: Admin,
  input: {
    userId: string;
    amountKobo: number;
    source: 'paystack_dva' | 'paystack_bank_transfer';
    paystackReference: string;
    now: Date;
    invoiceId?: string | null;
  }
): Promise<RecordTransferResult> {
  const invoice = input.invoiceId
    ? await loadInvoice(admin, input.userId, input.invoiceId)
    : await loadOpenInvoice(admin, input.userId);

  const inserted = await admin.from('payment_transfers').insert({
    user_id: input.userId,
    workspace_id: invoice?.workspace_id ?? null,
    invoice_id: invoice && invoice.status === 'open' ? invoice.id : null,
    source: input.source,
    amount_kobo: Math.round(input.amountKobo),
    paystack_reference: input.paystackReference,
    received_at: input.now.toISOString(),
  });
  if (inserted.error) {
    if (inserted.error.code === '23505') {
      return { ok: true, duplicate: true, settled: false, remainingKobo: 0, invoice, periodEnd: null };
    }
    return { ok: false, error: inserted.error.message };
  }

  if (!invoice || invoice.status !== 'open') {
    // No invoice open: the transfer row itself is kept as credit toward the
    // next period (loadCarriedCreditKobo counts it).
    return { ok: true, duplicate: false, settled: false, remainingKobo: 0, invoice: null, periodEnd: null };
  }

  const applied = applyTransferToInvoice(
    { amountKobo: invoice.amount_kobo, creditAppliedKobo: invoice.credit_applied_kobo, paidKobo: invoice.paid_kobo },
    input.amountKobo
  );

  // Conditional on the paid amount we read, so two deliveries at once cannot
  // both add to it.
  const updated = await admin
    .from('payment_invoices')
    .update({
      paid_kobo: applied.paidKobo,
      status: applied.settled ? 'paid' : 'open',
      paid_at: applied.settled ? input.now.toISOString() : null,
      updated_at: input.now.toISOString(),
    })
    .eq('id', invoice.id)
    .eq('paid_kobo', invoice.paid_kobo)
    .eq('status', 'open')
    .select(INVOICE_COLUMNS)
    .maybeSingle();
  if (updated.error || !updated.data) {
    // Undo the transfer row so Paystack's retry is not read as a duplicate.
    await admin.from('payment_transfers').delete().eq('paystack_reference', input.paystackReference);
    return { ok: false, error: 'The invoice changed while we were recording this transfer. Paystack will retry.' };
  }

  let periodEnd: string | null = null;
  if (applied.settled) {
    const result = await applyTransferPeriod(admin, {
      userId: input.userId,
      plan: invoice.plan,
      period: invoice.billing_interval,
      amountKobo: invoice.amount_kobo,
      reference: input.paystackReference,
      method: 'transfer',
      now: input.now,
      promoCode: invoice.promo_code,
    });
    periodEnd = result.periodEnd;
    await admin.from('payment_invoices').update({ period_end: periodEnd }).eq('id', invoice.id);
  }
  return {
    ok: true,
    duplicate: false,
    settled: applied.settled,
    remainingKobo: applied.remainingKobo,
    invoice: updated.data as InvoiceRow,
    periodEnd,
  };
}

/**
 * Money paid straight to Urganize's bank, outside Paystack. Admin only: the
 * route checks ADMIN_EMAILS before calling this. Logged with who recorded it.
 */
export async function recordDirectTransfer(
  admin: Admin,
  input: {
    userId: string;
    workspaceId: string | null;
    amountKobo: number;
    receivedAt: Date;
    bankReference: string;
    plan: CheckoutPlan;
    period: BillingInterval;
    /** null: work it out from the period, extending any time left. */
    periodEnd: Date | null;
    recordedBy: string;
    note?: string | null;
  }
): Promise<{ ok: true; periodEnd: string } | { ok: false; error: string }> {
  const reference = `direct_${input.userId.slice(0, 8)}_${input.receivedAt.getTime()}_${Math.random().toString(16).slice(2, 8)}`;
  const inserted = await admin.from('payment_transfers').insert({
    user_id: input.userId,
    workspace_id: input.workspaceId,
    source: 'admin_record',
    amount_kobo: Math.round(input.amountKobo),
    bank_reference: input.bankReference.slice(0, 120),
    received_at: input.receivedAt.toISOString(),
    recorded_by: input.recordedBy,
    note: input.note ? input.note.slice(0, 500) : null,
  });
  if (inserted.error) return { ok: false, error: inserted.error.message };

  const result = await applyTransferPeriod(admin, {
    userId: input.userId,
    plan: input.plan,
    period: input.period,
    amountKobo: Math.round(input.amountKobo),
    reference,
    method: 'direct_transfer',
    now: input.receivedAt,
    periodEnd: input.periodEnd,
  });
  // Any open self-serve invoice is replaced by what was paid directly.
  await admin
    .from('payment_invoices')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', input.userId)
    .eq('status', 'open');
  if (result.workspaceId) {
    await logBillingEvent(admin, {
      workspaceId: result.workspaceId,
      ownerUserId: input.userId,
      actorUserId: input.recordedBy,
      type: 'transfer_recorded',
      metadata: {
        plan: input.plan,
        interval: input.period,
        amountMinorUnit: Math.round(input.amountKobo),
        receivedAt: input.receivedAt.toISOString(),
        periodEnd: result.periodEnd,
      },
    }).catch(() => undefined);
  }
  return { ok: true, periodEnd: result.periodEnd };
}
