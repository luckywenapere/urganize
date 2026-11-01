import type { SupabaseClient } from '@supabase/supabase-js';
import { getChargePrice, type BillingInterval } from '@urganize/pricing';
import { bachsBaseUrl, koboToBachsAmount, newBachsReference, remoteCheckoutIsPaid, type RemoteCheckout } from '@/lib/bachs';
import { applyTransferPeriod, trackSelfServe } from '@/lib/self-serve-server';
import { loadIntroMonthsLeft } from '@/lib/referrals-server';
import type { CheckoutPlan } from '@/lib/self-serve';

// Bachs network calls and fulfilment (2026-11-01, #946). Server only.
//
// One checkout pays one month or one year, in Naira. Bachs shows the payer the
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
  plan: CheckoutPlan;
  billing_interval: BillingInterval;
  amount_kobo: number;
  status: 'open' | 'paid' | 'expired';
  period_end: string | null;
};

const ROW_COLUMNS = 'id,reference,checkout_id,user_id,plan,billing_interval,amount_kobo,status,period_end';

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
  }
): Promise<{ ok: true; checkoutUrl: string; reference: string } | { ok: false; error: string }> {
  const price = getChargePrice(input.plan, input.period, await loadIntroMonthsLeft(admin, input.userId));
  if (!price) return { ok: false, error: 'That plan cannot be bought here.' };

  const reference = newBachsReference();
  const inserted = await admin.from('bachs_checkouts').insert({
    reference,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    plan: input.plan,
    billing_interval: input.period,
    amount_kobo: price.minorUnit,
  });
  if (inserted.error) {
    console.error('[bachs] checkout row not saved', inserted.error.message);
    return { ok: false, error: 'Could not start the payment. Try again.' };
  }

  const base = input.appUrl.replace(/\/$/, '');
  let response: Response;
  try {
    response = await bachsFetch('/v1/checkout-sessions', {
      method: 'POST',
      idempotencyKey: reference,
      body: JSON.stringify({
        pricing: { currency: 'NGN', amount: koboToBachsAmount(price.minorUnit), price_type: 'fixed' },
        customer: { email: input.email, ...(input.name ? { name: input.name } : {}) },
        reference,
        metadata: { user_id: input.userId, plan: input.plan, interval: input.period, source: 'urganize_plan' },
        success_url: `${base}/payment/callback?provider=bachs&reference=${encodeURIComponent(reference)}`,
        cancel_url: `${base}/locked`,
        expires_in_minutes: 1440,
      }),
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
