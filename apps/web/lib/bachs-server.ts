import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getChargePrice,
  getTierPriceUsd,
  usdCentsToKoboEquivalent,
  type BillingInterval,
  type PricingCurrencyCode,
} from '@urganize/pricing';
import {
  bachsBaseUrl,
  bachsRowAmountMinor,
  koboToBachsAmount,
  newBachsReference,
  remoteCheckoutIsPaid,
  type RemoteCheckout,
} from '@/lib/bachs';
import { logBillingEvent } from '@/lib/billing-events-server';
import { creditPurchase } from '@/lib/credits/credits-server';
import { applyTransferPeriod, trackSelfServe } from '@/lib/self-serve-server';
import { loadIntroMonthsLeft } from '@/lib/referrals-server';
import type { CheckoutPlan } from '@/lib/self-serve';

// Bachs network calls and fulfilment (2026-11-01, #946). Server only.
//
// One checkout pays one month or one year, in Naira, or in US dollars for
// payers outside Nigeria (#1120). Bachs shows the payer the
// amount in their own money and takes it however they like. Nothing here lets
// anyone in on the strength of a redirect: only fulfilBachsCheckout does, and
// it asks Bachs itself whether the checkout was paid, for exactly our amount,
// before it applies the period. The open -> paid row update makes it happen
// once, however many webhooks or polls arrive.

type Admin = SupabaseClient;

const TIMEOUT_MS = 15_000;

function secretKey(): string | null {
  return process.env.BACHS_SECRET_KEY?.trim() || null;
}

async function bachsFetch(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<Response> {
  const key = secretKey();
  if (!key) throw new Error('Bachs is not configured.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${bachsBaseUrl(key)}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export type BachsCheckoutRow = {
  id: string;
  reference: string;
  checkout_id: string | null;
  user_id: string;
  /** Null on a credits row (#1120). */
  plan: CheckoutPlan | null;
  billing_interval: BillingInterval | null;
  amount_kobo: number;
  /** Since #1120. Null on older rows, which are Naira. */
  currency?: string | null;
  amount_minor?: number | null;
  /** 'plan' (a month or a year) or 'credits' (one credit pack), since #1120.
   *  Older rows have none and are plan rows. */
  purpose?: string | null;
  credits?: number | null;
  pack_price_naira?: number | null;
  workspace_id?: string | null;
  owner_user_id?: string | null;
  status: 'open' | 'paid' | 'expired';
  period_end: string | null;
};

const ROW_COLUMNS =
  'id,reference,checkout_id,user_id,plan,billing_interval,amount_kobo,currency,amount_minor,purpose,credits,pack_price_naira,workspace_id,owner_user_id,status,period_end';

/** Opens a Bachs checkout for this plan and period and returns where to send the payer. */
export async function startBachsCheckout(
  admin: Admin,
  input: {
    userId: string;
    email: string;
    name: string | null;
    workspaceId: string | null;
    plan: CheckoutPlan;
    period: BillingInterval;
    appUrl: string;
    /** What to charge in. USD for payers outside Nigeria; NGN by default. */
    currency?: PricingCurrencyCode;
  }
): Promise<{ ok: true; checkoutUrl: string; reference: string } | { ok: false; error: string }> {
  const currency: PricingCurrencyCode = input.currency === 'USD' ? 'USD' : 'NGN';
  // A dollar price has no starting price: the fixed dollar price is what
  // everyone outside Nigeria pays from the first month.
  const price =
    currency === 'USD'
      ? getTierPriceUsd(input.plan, input.period)
      : getChargePrice(input.plan, input.period, await loadIntroMonthsLeft(admin, input.userId));
  if (!price) return { ok: false, error: 'That plan cannot be bought here.' };
  // Our books stay in kobo: a dollar checkout is recorded at its naira
  // equivalent, and amount_minor keeps the cents Bachs is asked for.
  const amountKobo = currency === 'USD' ? usdCentsToKoboEquivalent(price.minorUnit) : price.minorUnit;

  const reference = newBachsReference();
  const inserted = await admin.from('bachs_checkouts').insert({
    reference,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    plan: input.plan,
    billing_interval: input.period,
    amount_kobo: amountKobo,
    currency,
    amount_minor: price.minorUnit,
  });
  if (inserted.error) {
    console.error('[bachs] checkout row not saved', inserted.error.message);
    return { ok: false, error: 'Could not start the payment. Try again.' };
  }

  const base = input.appUrl.replace(/\/$/, '');
  return openBachsSession(admin, reference, {
    pricing: { currency, amount: koboToBachsAmount(price.minorUnit), price_type: 'fixed' },
    customer: { email: input.email, ...(input.name ? { name: input.name } : {}) },
    reference,
    metadata: { user_id: input.userId, plan: input.plan, interval: input.period, currency, source: 'urganize_plan' },
    success_url: `${base}/payment/callback?provider=bachs&reference=${encodeURIComponent(reference)}`,
    cancel_url: `${base}/locked`,
    expires_in_minutes: 1440,
  });
}

/**
 * Opens a Bachs checkout for one AI credit pack, in US dollars, for a buyer
 * outside Nigeria (#1120). The pack and the credits it buys are decided by the
 * caller from the pack table and the team's state, exactly as for Paystack;
 * the row records both, and fulfilBachsCheckout credits them only once Bachs
 * itself says the dollar amount was paid. The reference uses the credits
 * prefix so the credits return page knows it.
 */
export async function startBachsCreditsCheckout(
  admin: Admin,
  input: {
    userId: string;
    email: string;
    workspaceId: string;
    ownerUserId: string | null;
    packPriceNaira: number;
    priceUsd: number;
    credits: number;
    reference: string;
    returnUrl: string;
  }
): Promise<{ ok: true; checkoutUrl: string; reference: string } | { ok: false; error: string }> {
  const cents = Math.round(input.priceUsd * 100);
  if (!(cents > 0) || !(input.credits > 0)) return { ok: false, error: 'Pick one of the credit packs.' };
  const inserted = await admin.from('bachs_checkouts').insert({
    reference: input.reference,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    owner_user_id: input.ownerUserId,
    purpose: 'credits',
    plan: null,
    billing_interval: null,
    credits: input.credits,
    pack_price_naira: input.packPriceNaira,
    amount_kobo: usdCentsToKoboEquivalent(cents),
    currency: 'USD',
    amount_minor: cents,
  });
  if (inserted.error) {
    console.error('[bachs] credits row not saved', inserted.error.message);
    return { ok: false, error: 'Could not start the payment. Try again.' };
  }
  const separator = input.returnUrl.includes('?') ? '&' : '?';
  return openBachsSession(admin, input.reference, {
    pricing: { currency: 'USD', amount: koboToBachsAmount(cents), price_type: 'fixed' },
    customer: { email: input.email },
    reference: input.reference,
    metadata: { user_id: input.userId, credits: input.credits, currency: 'USD', source: 'urganize_credits' },
    success_url: `${input.returnUrl}${separator}provider=bachs&reference=${encodeURIComponent(input.reference)}`,
    cancel_url: `${input.returnUrl}${separator}payment=cancelled`,
    expires_in_minutes: 1440,
  });
}

/** Asks Bachs for a checkout page for a row we already saved, and records the
 *  checkout id on it. */
async function openBachsSession(
  admin: Admin,
  reference: string,
  body: Record<string, unknown>
): Promise<{ ok: true; checkoutUrl: string; reference: string } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await bachsFetch('/v1/checkout-sessions', {
      method: 'POST',
      idempotencyKey: reference,
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('[bachs] checkout request failed', error);
    return { ok: false, error: 'Could not reach the payment page. Try again.' };
  }
  const payload = (await response.json().catch(() => ({}))) as {
    checkout_id?: string;
    checkout_url?: string;
    detail?: string;
  };
  if (!response.ok || !payload.checkout_url || !payload.checkout_id) {
    console.error('[bachs] checkout refused', response.status, payload.detail);
    return { ok: false, error: 'Could not start the payment. Try again.' };
  }
  await admin
    .from('bachs_checkouts')
    .update({ checkout_id: payload.checkout_id, updated_at: new Date().toISOString() })
    .eq('reference', reference);
  return { ok: true, checkoutUrl: payload.checkout_url, reference };
}

export async function loadBachsCheckout(admin: Admin, reference: string): Promise<BachsCheckoutRow | null> {
  const result = await admin.from('bachs_checkouts').select(ROW_COLUMNS).eq('reference', reference).maybeSingle();
  return (result.data as BachsCheckoutRow | null) ?? null;
}

export type FulfilResult = 'applied' | 'already' | 'not_paid' | 'unknown' | 'error';

/**
 * Applies a paid checkout once: asks Bachs whether it is paid, then claims the
 * row (open -> paid) and extends the team's plan from its current end.
 */
export async function fulfilBachsCheckout(
  admin: Admin,
  reference: string,
  extra: { method?: string | null; paidAmount?: string | null; paidCurrency?: string | null } = {}
): Promise<FulfilResult> {
  const row = await loadBachsCheckout(admin, reference);
  if (!row) return 'unknown';
  if (row.status === 'paid') return 'already';
  if (!row.checkout_id) return 'not_paid';

  let remote: RemoteCheckout;
  try {
    const response = await bachsFetch(`/v1/checkout-sessions/${encodeURIComponent(row.checkout_id)}`);
    if (!response.ok) return 'error';
    remote = (await response.json()) as RemoteCheckout;
  } catch (error) {
    console.error('[bachs] checkout lookup failed', error);
    return 'error';
  }
  if (!remoteCheckoutIsPaid(remote, row)) return 'not_paid';

  const now = new Date();
  const claimed = await admin
    .from('bachs_checkouts')
    .update({
      status: 'paid',
      paid_at: now.toISOString(),
      updated_at: now.toISOString(),
      payment_method: extra.method ?? null,
      paid_amount: extra.paidAmount ?? (remote.charge?.amount != null ? String(remote.charge.amount) : null),
      paid_currency: extra.paidCurrency ?? remote.charge?.currency ?? null,
    })
    .eq('id', row.id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  if (!claimed.data) return 'already';

  // A credit pack (#1120): put the credits on the ledger. The ledger's key on
  // the reference makes a second settle a no-op. If the write fails, the row
  // goes back to open so the next webhook or poll tries again: the money is
  // taken, so it is retried, never dropped.
  if (row.purpose === 'credits') {
    if (!row.workspace_id || !row.credits || !row.pack_price_naira) {
      console.error(`[bachs] credits row ${row.reference} is missing its pack`);
      return 'error';
    }
    const credited = await creditPurchase(admin, {
      workspaceId: row.workspace_id,
      ownerUserId: row.owner_user_id ?? null,
      actorUserId: row.user_id,
      credits: row.credits,
      reference: row.reference,
      priceNaira: row.pack_price_naira,
      source: 'bachs',
    });
    if (credited === 'error') {
      console.error(`[bachs] PAID BUT NOT CREDITED: ${row.reference}`);
      await admin.from('bachs_checkouts').update({ status: 'open', paid_at: null }).eq('id', row.id);
      return 'error';
    }
    if (credited === 'credited') {
      await logBillingEvent(admin, {
        workspaceId: row.workspace_id,
        ownerUserId: row.owner_user_id ?? null,
        actorUserId: row.user_id,
        type: 'credits_purchased',
        metadata: {
          reference: row.reference,
          credits: row.credits,
          priceNaira: row.pack_price_naira,
          priceUsd: bachsRowAmountMinor(row) / 100,
          via: 'bachs',
        },
      }).catch(() => undefined);
    }
    return 'applied';
  }

  if (!row.plan || !row.billing_interval) {
    console.error(`[bachs] plan row ${row.reference} has no plan`);
    return 'error';
  }
  const result = await applyTransferPeriod(admin, {
    userId: row.user_id,
    plan: row.plan,
    period: row.billing_interval,
    amountKobo: row.amount_kobo,
    reference: row.reference,
    method: 'transfer',
    channel: 'bachs',
    now,
  });
  await admin.from('bachs_checkouts').update({ period_end: result.periodEnd }).eq('id', row.id);
  void trackSelfServe(row.user_id, 'checkout_succeeded', {
    plan: row.plan,
    period: row.billing_interval,
    method: 'bachs',
  }).catch(() => undefined);
  return 'applied';
}
