import type { SupabaseClient } from '@supabase/supabase-js';
import { PRICING_TIERS, getTierPriceUsd, usdCentsToKoboEquivalent } from '@urganize/pricing';
import { isBachsConfigured } from '@/lib/bachs';
import { bachsFetch } from '@/lib/bachs-server';
import {
  CARD_TRIAL_SETTING_KEY,
  CARD_TRIAL_SOURCE,
  bachsAccessDenied,
  cardTrialProductBody,
  cardTrialReminderCopy,
  cardTrialReminderDue,
  isLiveBachsStatus,
  newCardTrialReference,
  parseBachsSubscription,
  parseCardTrialAvailability,
  shouldRecheckAvailability,
  teamTrialEndFor,
  type BachsSubscription,
  type CardTrialPeriod,
  type PaidInvoice,
} from '@/lib/bachs-trial';
import { sendEmail } from '@/lib/email';
import { APP_URL } from '@/lib/email/links';
import { applyTransferPeriod, trackSelfServe } from '@/lib/self-serve-server';
import type { CheckoutPlan } from '@/lib/self-serve';
import { invalidateSubscriptionSnapshot } from '@/lib/subscription-access';
import { TEAM_TRIAL_DAYS } from '@/lib/team-billing';
import { invalidateTeamAccess } from '@/lib/team-billing-server';

// Card trial for customers abroad (2026-11-14, #1266). Server only: the calls
// to Bachs and the rows behind them. Every decision is in lib/bachs-trial.ts.
//
// Nothing here believes a webhook or a redirect. Each write starts by asking
// Bachs for the subscription itself (GET /v1/subscriptions/{id}) and copies
// what Bachs says.

type Admin = SupabaseClient;

export type CardTrialRow = {
  id: string;
  reference: string;
  checkout_id: string | null;
  subscription_id: string | null;
  customer_id: string | null;
  user_id: string;
  workspace_id: string | null;
  plan: CheckoutPlan;
  billing_interval: CardTrialPeriod;
  amount_minor: number;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  reminder_sent_at: string | null;
};

const ROW_COLUMNS =
  'id,reference,checkout_id,subscription_id,customer_id,user_id,workspace_id,plan,billing_interval,amount_minor,status,trial_end,current_period_end,cancel_at_period_end,canceled_at,reminder_sent_at';

async function readErrorCode(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => ({}))) as { error_code?: unknown };
  return typeof body.error_code === 'string' ? body.error_code : null;
}

// ── Whether Bachs has card trials on ─────────────────────────────────────────

async function saveAvailability(admin: Admin, state: 'available' | 'unavailable'): Promise<void> {
  const now = new Date().toISOString();
  const saved = await admin
    .from('app_settings')
    .upsert({ key: CARD_TRIAL_SETTING_KEY, value_json: { state, checkedAt: now }, updated_at: now }, { onConflict: 'key' });
  if (saved.error) console.warn('[bachs-trial] availability not saved', saved.error.message);
}

/**
 * Has Bachs turned subscriptions and trials on for our account? The answer is
 * kept in app_settings: a yes is kept for good, a no is asked again after an
 * hour. Asking means listing subscriptions and making the first product, the
 * two calls Bachs refuses with a 403 while the features are off.
 */
export async function isCardTrialAvailable(admin: Admin, nowMs: number = Date.now()): Promise<boolean> {
  if (!isBachsConfigured()) return false;
  const read = await admin.from('app_settings').select('value_json').eq('key', CARD_TRIAL_SETTING_KEY).maybeSingle();
  if (read.error) return false;
  const saved = parseCardTrialAvailability((read.data as { value_json?: unknown } | null)?.value_json);
  if (saved?.state === 'available') return true;
  if (!shouldRecheckAvailability(saved, nowMs)) return false;

  try {
    const list = await bachsFetch('/v1/subscriptions?limit=1');
    if (bachsAccessDenied(list.status, null)) {
      await saveAvailability(admin, 'unavailable');
      return false;
    }
    if (!list.ok) return false;
    const product = await ensureProduct(admin, 'solo', 'monthly');
    if (product.ok) {
      await saveAvailability(admin, 'available');
      return true;
    }
    if (product.denied) await saveAvailability(admin, 'unavailable');
    return false;
  } catch (error) {
    console.warn('[bachs-trial] availability check failed', error instanceof Error ? error.message : error);
    return false;
  }
}

// ── Products ─────────────────────────────────────────────────────────────────

type ProductResult = { ok: true; productId: string; amountMinor: number } | { ok: false; denied: boolean };

/** The Bachs product for this plan and period, made the first time it is asked for. */
export async function ensureProduct(admin: Admin, plan: CheckoutPlan, period: CardTrialPeriod): Promise<ProductResult> {
  const price = getTierPriceUsd(plan, period);
  if (!price) return { ok: false, denied: false };
  const key = { plan, billing_interval: period, amount_minor: price.minorUnit, trial_days: TEAM_TRIAL_DAYS };
  const find = () => admin.from('bachs_products').select('product_id').match(key).maybeSingle();
  const existing = await find();
  const known = (existing.data as { product_id: string } | null)?.product_id;
  if (known) return { ok: true, productId: known, amountMinor: price.minorUnit };

  const response = await bachsFetch('/v1/products', {
    method: 'POST',
    idempotencyKey: `urganize-product-${plan}-${period}-${price.minorUnit}-${TEAM_TRIAL_DAYS}`,
    body: JSON.stringify(
      cardTrialProductBody({
        planName: PRICING_TIERS[plan].label,
        period,
        amountMinor: price.minorUnit,
        trialDays: TEAM_TRIAL_DAYS,
      })
    ),
  });
  if (!response.ok) {
    const code = await readErrorCode(response);
    console.error('[bachs-trial] product refused', response.status, code);
    return { ok: false, denied: bachsAccessDenied(response.status, code) };
  }
  const body = (await response.json().catch(() => ({}))) as { id?: unknown };
  const productId = typeof body.id === 'string' ? body.id : '';
  if (!productId) return { ok: false, denied: false };
  const saved = await admin.from('bachs_products').insert({ ...key, product_id: productId });
  if (saved.error) {
    // Two requests made it at once: keep whichever row landed.
    const again = await find();
    const winner = (again.data as { product_id: string } | null)?.product_id;
    if (winner) return { ok: true, productId: winner, amountMinor: price.minorUnit };
  }
  return { ok: true, productId, amountMinor: price.minorUnit };
}

// ── Opening the card page ────────────────────────────────────────────────────

export type StartCardTrialResult =
  | { ok: true; checkoutUrl: string; reference: string }
  | { ok: false; unavailable: boolean; error: string };

export async function startCardTrialCheckout(
  admin: Admin,
  input: {
    userId: string;
    email: string;
    name: string | null;
    workspaceId: string | null;
    plan: CheckoutPlan;
    period: CardTrialPeriod;
    appUrl: string;
  }
): Promise<StartCardTrialResult> {
  const fail = (error: string, unavailable = false): StartCardTrialResult => ({ ok: false, unavailable, error });
  let product: ProductResult;
  try {
    product = await ensureProduct(admin, input.plan, input.period);
  } catch (error) {
    console.error('[bachs-trial] product request failed', error);
    return fail('Could not reach the card page. Try again.');
  }
  if (!product.ok) {
    if (product.denied) await saveAvailability(admin, 'unavailable');
    return fail('Could not start the trial. Try again.', product.denied);
  }

  const reference = newCardTrialReference();
  const inserted = await admin.from('bachs_subscriptions').insert({
    reference,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    plan: input.plan,
    billing_interval: input.period,
    amount_minor: product.amountMinor,
  });
  if (inserted.error) {
    console.error('[bachs-trial] checkout row not saved', inserted.error.message);
    return fail('Could not start the trial. Try again.');
  }

  const base = input.appUrl.replace(/\/$/, '');
  let response: Response;
  try {
    response = await bachsFetch('/v1/checkout-sessions', {
      method: 'POST',
      idempotencyKey: reference,
      body: JSON.stringify({
        product_cart: [{ product_id: product.productId, quantity: 1 }],
        customer: { email: input.email, ...(input.name ? { name: input.name } : {}) },
        billing_currency: 'USD',
        reference,
        metadata: {
          reference,
          user_id: input.userId,
          plan: input.plan,
          interval: input.period,
          source: CARD_TRIAL_SOURCE,
        },
        success_url: `${base}/add-card?reference=${encodeURIComponent(reference)}`,
        cancel_url: `${base}/add-card`,
        expires_in_minutes: 1440,
      }),
    });
  } catch (error) {
    console.error('[bachs-trial] checkout request failed', error);
    return fail('Could not reach the card page. Try again.');
  }
  if (!response.ok) {
    const code = await readErrorCode(response);
    console.error('[bachs-trial] checkout refused', response.status, code);
    const denied = bachsAccessDenied(response.status, code);
    if (denied) await saveAvailability(admin, 'unavailable');
    return fail('Could not start the trial. Try again.', denied);
  }
  const payload = (await response.json().catch(() => ({}))) as { checkout_id?: string; checkout_url?: string };
  if (!payload.checkout_url || !payload.checkout_id) return fail('Could not start the trial. Try again.');
  await admin
    .from('bachs_subscriptions')
    .update({ checkout_id: payload.checkout_id, updated_at: new Date().toISOString() })
    .eq('reference', reference);
  return { ok: true, checkoutUrl: payload.checkout_url, reference };
}

// ── Copying a subscription from Bachs ────────────────────────────────────────

/** 'missing' when Bachs has no such subscription (a 404): nothing to retry. */
async function fetchSubscription(subscriptionId: string): Promise<BachsSubscription | 'missing' | null> {
  const response = await bachsFetch(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (response.status === 404) return 'missing';
  if (!response.ok) return null;
  return parseBachsSubscription(await response.json().catch(() => null));
}

async function findRow(admin: Admin, sub: BachsSubscription): Promise<CardTrialRow | null> {
  const by = async (column: string, value: string | null) => {
    if (!value) return null;
    const found = await admin.from('bachs_subscriptions').select(ROW_COLUMNS).eq(column, value).maybeSingle();
    return (found.data as CardTrialRow | null) ?? null;
  };
  return (await by('subscription_id', sub.id)) ?? (await by('reference', sub.reference)) ?? (await by('checkout_id', sub.checkoutId));
}

/** Writes what Bachs says about a subscription onto our row, and moves the
 *  team's trial end to match while it is trialing. */
async function writeSubscription(admin: Admin, row: CardTrialRow, sub: BachsSubscription): Promise<CardTrialRow> {
  const now = new Date().toISOString();
  const status = sub.status === 'unknown' ? row.status : sub.status;
  const patch = {
    subscription_id: sub.id,
    customer_id: sub.customerId ?? row.customer_id,
    status,
    trial_end: sub.trialEnd ?? row.trial_end,
    current_period_end: sub.currentPeriodEnd ?? row.current_period_end,
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    canceled_at: sub.canceledAt,
    updated_at: now,
  };
  const updated = await admin.from('bachs_subscriptions').update(patch).eq('id', row.id);
  if (updated.error) console.error('[bachs-trial] subscription not saved', updated.error.message);

  if (sub.status === 'trialing') {
    const end = teamTrialEndFor(sub);
    if (end) {
      // The free days are counted from when the card went in, not from sign-up.
      const moved = await admin.from('workspaces').update({ trial_ends_at: end }).eq('owner_id', row.user_id);
      if (moved.error) console.warn('[bachs-trial] trial end not moved', moved.error.message);
    }
  }
  invalidateSubscriptionSnapshot(row.user_id);
  invalidateTeamAccess(row.user_id);
  return { ...row, ...patch } as CardTrialRow;
}

export type SyncResult = { result: 'synced'; row: CardTrialRow } | { result: 'unknown' | 'error' };

/** Asks Bachs about one subscription and copies it. 'unknown' when it is not one of ours. */
export async function syncSubscription(admin: Admin, subscriptionId: string): Promise<SyncResult> {
  let sub: BachsSubscription | 'missing' | null;
  try {
    sub = await fetchSubscription(subscriptionId);
  } catch (error) {
    console.error('[bachs-trial] subscription lookup failed', error);
    return { result: 'error' };
  }
  if (sub === 'missing') return { result: 'unknown' };
  if (!sub) return { result: 'error' };
  const row = await findRow(admin, sub);
  if (!row) return { result: 'unknown' };
  const started = !row.subscription_id;
  const written = await writeSubscription(admin, row, sub);
  if (started && sub.status === 'trialing') {
    void trackSelfServe(row.user_id, 'card_trial_started', { plan: row.plan, period: row.billing_interval, method: 'bachs' }).catch(
      () => undefined
    );
  }
  return { result: 'synced', row: written };
}

export async function loadCardTrialByReference(admin: Admin, reference: string): Promise<CardTrialRow | null> {
  const found = await admin.from('bachs_subscriptions').select(ROW_COLUMNS).eq('reference', reference).maybeSingle();
  return (found.data as CardTrialRow | null) ?? null;
}

/** The newest card trial that became a subscription, for Settings. */
export async function loadCardTrialForUser(admin: Admin, userId: string): Promise<CardTrialRow | null> {
  const found = await admin
    .from('bachs_subscriptions')
    .select(ROW_COLUMNS)
    .eq('user_id', userId)
    .not('subscription_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  return ((found.data ?? []) as CardTrialRow[])[0] ?? null;
}

/** null when the read failed: callers treat that as "cannot tell". */
export async function hasCardTrialSubscription(admin: Admin, userId: string): Promise<boolean | null> {
  const found = await admin
    .from('bachs_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('subscription_id', 'is', null);
  if (found.error) return null;
  return (found.count ?? 0) > 0;
}

/**
 * The return page asks this. Someone back from the card page before the
 * webhook is let through: we ask Bachs for the checkout, then for the
 * customer's subscriptions, and copy the one this checkout made.
 */
export async function settleCardTrialCheckout(admin: Admin, reference: string): Promise<CardTrialRow | null> {
  const row = await loadCardTrialByReference(admin, reference);
  if (!row) return null;
  if (row.subscription_id) {
    const synced = await syncSubscription(admin, row.subscription_id);
    return synced.result === 'synced' ? synced.row : row;
  }
  if (!row.checkout_id) return row;
  try {
    const response = await bachsFetch(`/v1/checkout-sessions/${encodeURIComponent(row.checkout_id)}`);
    if (!response.ok) return row;
    const checkout = (await response.json().catch(() => ({}))) as {
      status?: string;
      customer?: { id?: string } | null;
      charge?: { subscription_id?: string | null } | null;
    };
    if (String(checkout.status ?? '').toLowerCase() !== 'completed') return row;

    const direct = checkout.charge?.subscription_id;
    if (direct) {
      const synced = await syncSubscription(admin, direct);
      if (synced.result === 'synced') return synced.row;
    }
    const customerId = checkout.customer?.id;
    if (!customerId) return row;
    const list = await bachsFetch(`/v1/subscriptions?customer_id=${encodeURIComponent(customerId)}&limit=20`);
    if (!list.ok) return row;
    const items = ((await list.json().catch(() => ({}))) as { items?: unknown[] }).items ?? [];
    for (const item of items) {
      const sub = parseBachsSubscription(item);
      if (!sub) continue;
      if (sub.reference === row.reference || (sub.checkoutId && sub.checkoutId === row.checkout_id)) {
        return await writeSubscription(admin, row, sub);
      }
    }
  } catch (error) {
    console.error('[bachs-trial] checkout lookup failed', error);
  }
  return row;
}

// ── A paid invoice ───────────────────────────────────────────────────────────

export type InvoiceResult = 'applied' | 'already' | 'unknown' | 'not_paid' | 'error';

/**
 * The card was charged (the first charge after the trial, or a renewal). Asks
 * Bachs for the subscription, claims the invoice (its id is the lock) and
 * extends the plan to the period end Bachs gives.
 */
export async function applyPaidInvoice(admin: Admin, invoice: PaidInvoice, now: Date = new Date()): Promise<InvoiceResult> {
  const synced = await syncSubscription(admin, invoice.subscriptionId);
  if (synced.result !== 'synced') return synced.result;
  const row = synced.row;
  // The money is taken, so anything that stops us applying it is answered as
  // an error: the webhook says 500 and Bachs sends the event again. Bachs's
  // own record can lag the invoice by a moment (still 'trialing', or the old
  // period end), and a 200 here would drop a paid invoice for good.
  if (row.status !== 'active') return 'error';
  if (invoice.amountMinor !== row.amount_minor) {
    console.error(`[bachs-trial] invoice ${invoice.invoiceId} is for ${invoice.amountMinor}, expected ${row.amount_minor}`);
    return 'error';
  }
  const periodEnd = row.current_period_end ?? invoice.periodEnd;
  if (!periodEnd || Date.parse(periodEnd) <= now.getTime()) return 'error';

  const claimed = await admin.from('bachs_subscription_invoices').insert({
    invoice_id: invoice.invoiceId,
    subscription_id: invoice.subscriptionId,
    user_id: row.user_id,
    amount_minor: invoice.amountMinor,
    period_end: periodEnd,
  });
  if (claimed.error) return claimed.error.code === '23505' ? 'already' : 'error';

  try {
    await applyTransferPeriod(admin, {
      userId: row.user_id,
      plan: row.plan,
      period: row.billing_interval,
      amountKobo: usdCentsToKoboEquivalent(invoice.amountMinor),
      reference: invoice.invoiceId,
      method: 'transfer',
      channel: 'bachs',
      now,
      periodEnd: new Date(periodEnd),
    });
  } catch (error) {
    // Paid but not applied: free the claim so Bachs's retry applies it.
    console.error(`[bachs-trial] PAID BUT NOT APPLIED: ${invoice.invoiceId}`, error);
    await admin.from('bachs_subscription_invoices').delete().eq('invoice_id', invoice.invoiceId);
    return 'error';
  }
  void trackSelfServe(row.user_id, 'checkout_succeeded', { plan: row.plan, period: row.billing_interval, method: 'bachs' }).catch(
    () => undefined
  );
  return 'applied';
}

// ── Cancel, and the card page ────────────────────────────────────────────────

/** Stops the next charge. Access runs to the day already trialled or paid for. */
export async function cancelCardTrial(
  admin: Admin,
  userId: string
): Promise<{ ok: true; row: CardTrialRow } | { ok: false; error: string }> {
  const row = await loadCardTrialForUser(admin, userId);
  if (!row?.subscription_id || !isLiveBachsStatus(row.status)) return { ok: false, error: 'There is nothing to cancel.' };
  if (row.cancel_at_period_end) return { ok: true, row };
  try {
    const response = await bachsFetch(`/v1/subscriptions/${encodeURIComponent(row.subscription_id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ cancel_at_period_end: true, reason: 'Customer requested' }),
    });
    if (!response.ok) {
      console.error('[bachs-trial] cancel refused', response.status, await readErrorCode(response));
      return { ok: false, error: 'Could not cancel. Try again.' };
    }
    const sub = parseBachsSubscription(await response.json().catch(() => null));
    const written = sub ? await writeSubscription(admin, row, sub) : row;
    void trackSelfServe(userId, 'card_trial_cancelled', { plan: row.plan, period: row.billing_interval, method: 'bachs' }).catch(
      () => undefined
    );
    return { ok: true, row: written };
  } catch (error) {
    console.error('[bachs-trial] cancel request failed', error);
    return { ok: false, error: 'Could not cancel. Try again.' };
  }
}

/** A one-time link to Bachs's own page for changing the card. Never stored or logged. */
export async function createCardPortalUrl(admin: Admin, userId: string): Promise<string | null> {
  const row = await loadCardTrialForUser(admin, userId);
  if (!row?.customer_id) return null;
  try {
    const response = await bachsFetch(`/v1/customers/${encodeURIComponent(row.customer_id)}/portal-sessions`, { method: 'POST' });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as { url?: unknown };
    return typeof body.url === 'string' && body.url.startsWith('https://') ? body.url : null;
  } catch {
    return null;
  }
}

/** Users whose card Bachs will charge by itself, so no renewal email asks them to pay. */
export async function loadSelfRenewingUserIds(admin: Admin): Promise<Set<string>> {
  const found = await admin
    .from('bachs_subscriptions')
    .select('user_id')
    .in('status', ['trialing', 'active', 'past_due'])
    .eq('cancel_at_period_end', false)
    .limit(5000);
  return new Set(((found.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
}

// ── The reminder ─────────────────────────────────────────────────────────────

/** The day before the first charge, once per subscription. Run by the morning cron. */
export async function runCardTrialReminderSweep(admin: Admin, now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  const result = { sent: 0, skipped: 0 };
  try {
    const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();
    const due = await admin
      .from('bachs_subscriptions')
      .select(ROW_COLUMNS)
      .eq('status', 'trialing')
      .is('reminder_sent_at', null)
      .lte('trial_end', horizon)
      .limit(200);
    if (due.error) return result;
    for (const row of (due.data ?? []) as CardTrialRow[]) {
      if (
        !cardTrialReminderDue({
          status: row.status,
          trialEnd: row.trial_end,
          cancelAtPeriodEnd: row.cancel_at_period_end,
          reminderSentAt: row.reminder_sent_at,
          now: now.getTime(),
        })
      ) {
        continue;
      }
      // The update is the lock: only the run that sets the time sends.
      const claimed = await admin
        .from('bachs_subscriptions')
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', row.id)
        .is('reminder_sent_at', null)
        .select('id')
        .maybeSingle();
      if (!claimed.data) continue;
      const owner = await admin.from('profiles').select('email,name').eq('id', row.user_id).maybeSingle();
      const profile = owner.data as { email: string | null; name: string | null } | null;
      if (!profile?.email || !row.trial_end) {
        result.skipped += 1;
        continue;
      }
      const copy = cardTrialReminderCopy({
        planName: PRICING_TIERS[row.plan]?.label ?? 'your plan',
        amountUsd: row.amount_minor / 100,
        trialEnd: row.trial_end,
        cancelUrl: `${APP_URL}/dashboard?settings=billing`,
      });
      const send = await sendEmail(admin, {
        templateId: 'card_trial_reminder',
        to: profile.email,
        recipientUserId: row.user_id,
        trigger: 'card_trial_reminder',
        idempotencyKey: `card-trial-reminder:${row.id}`,
        props: { recipientName: profile.name ?? '', subject: copy.subject, body: copy.body },
      });
      if (send.ok && !send.skipped) result.sent += 1;
      else result.skipped += 1;
    }
  } catch (error) {
    console.error('[bachs-trial] reminder sweep failed', error instanceof Error ? error.message : error);
  }
  return result;
}
