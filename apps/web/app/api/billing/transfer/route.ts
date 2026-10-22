import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { fetchPaystackInit } from '@/lib/paystack-init';
import {
  TRANSFER_CHECKOUT_SOURCE,
  invoiceRemainingKobo,
  isCheckoutPeriod,
  isCheckoutPlan,
} from '@/lib/self-serve';
import {
  applyTransferPeriod,
  getOrCreatePaymentAccount,
  loadInvoice,
  openTransferInvoice,
  trackSelfServe,
  validatePromoCode,
} from '@/lib/self-serve-server';
import { afterResponse } from '@/lib/after-response';

// Pay by bank transfer (self-serve checkout, 2026-10-22).
//
// POST { plan, period, promo? }
//   Opens (or reuses) the payer's invoice for that plan and period, then hands
//   back their own account number (Paystack dedicated account, reused for every
//   renewal). When dedicated accounts are off or Paystack will not make one, it
//   starts a one-time Paystack checkout limited to bank transfer instead.
// GET ?invoiceId=
//   What the waiting screen polls: paid, part paid, or still waiting.
//
// Nothing here lets anyone in. Only the Paystack webhook (HMAC checked) records
// money, and a part payment never opens a team.
//
// OPEN route: the payer is usually still on the waitlist.

export const dynamic = 'force-dynamic';

function resolveCallbackUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configured || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/payment/callback`;
}

function generateReference(): string {
  return `urganize_tr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function invoicePayload(invoice: {
  id: string;
  plan: string;
  billing_interval: string;
  amount_kobo: number;
  credit_applied_kobo: number;
  paid_kobo: number;
  status: string;
  period_end: string | null;
}) {
  return {
    id: invoice.id,
    plan: invoice.plan,
    period: invoice.billing_interval,
    status: invoice.status,
    amountKobo: invoice.amount_kobo,
    creditKobo: invoice.credit_applied_kobo,
    paidKobo: invoice.paid_kobo,
    remainingKobo: invoiceRemainingKobo({
      amountKobo: invoice.amount_kobo,
      creditAppliedKobo: invoice.credit_applied_kobo,
      paidKobo: invoice.paid_kobo,
    }),
    periodEnd: invoice.period_end,
  };
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const userId = auth.user.id;
  const email = String(auth.user.email || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'No email on your account.' }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  let body: { plan?: unknown; period?: unknown; promo?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!isCheckoutPlan(body.plan)) return NextResponse.json({ error: 'Pick a plan.' }, { status: 400 });
  if (!isCheckoutPeriod(body.period)) return NextResponse.json({ error: 'Pick how often to pay.' }, { status: 400 });
  const plan = body.plan;
  const period = body.period;

  let promoCode: string | null = null;
  if (body.promo !== undefined && body.promo !== null && body.promo !== '') {
    const promo = await validatePromoCode(admin, body.promo);
    if (!promo.ok) return NextResponse.json({ error: promo.message }, { status: 400 });
    promoCode = promo.code;
  }

  const workspace = await admin.from('workspaces').select('id').eq('owner_id', userId).maybeSingle();
  const workspaceId = (workspace.data as { id: string } | null)?.id ?? null;

  const invoice = await openTransferInvoice(admin, { userId, workspaceId, plan, period, promoCode });
  if (!invoice) return NextResponse.json({ error: 'Could not start the transfer. Try again.' }, { status: 500 });

  // Credit carried from before can cover the whole period.
  if (invoiceRemainingKobo({
    amountKobo: invoice.amount_kobo,
    creditAppliedKobo: invoice.credit_applied_kobo,
    paidKobo: invoice.paid_kobo,
  }) === 0) {
    const now = new Date();
    const claimed = await admin
      .from('payment_invoices')
      .update({ status: 'paid', paid_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', invoice.id)
      .eq('status', 'open')
      .select('id')
      .maybeSingle();
    if (claimed.data) {
      const result = await applyTransferPeriod(admin, {
        userId,
        plan,
        period,
        amountKobo: invoice.amount_kobo,
        reference: `credit_${invoice.id}`,
        method: 'transfer',
        now,
        promoCode,
      });
      await admin.from('payment_invoices').update({ period_end: result.periodEnd }).eq('id', invoice.id);
    }
    return NextResponse.json({ mode: 'paid', invoice: invoicePayload({ ...invoice, status: 'paid', period_end: null }) });
  }

  const name =
    String((auth.user.user_metadata as Record<string, unknown> | null)?.full_name || '') ||
    String((auth.user.user_metadata as Record<string, unknown> | null)?.name || '') ||
    email.split('@')[0];
  const account = await getOrCreatePaymentAccount(admin, { userId, email, name, workspaceId });

  if (account) {
    afterResponse('self-serve dva shown', () =>
      trackSelfServe(userId, 'dva_shown', { plan, period, method: 'transfer' })
    );
    return NextResponse.json({
      mode: 'account',
      invoice: invoicePayload(invoice),
      account: { bankName: account.bankName, accountNumber: account.accountNumber, accountName: account.accountName },
    });
  }

  // Fallback: a one-time Paystack checkout that only offers bank transfer.
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Payment provider is not configured on the server.' }, { status: 500 });

  const remaining = invoiceRemainingKobo({
    amountKobo: invoice.amount_kobo,
    creditAppliedKobo: invoice.credit_applied_kobo,
    paidKobo: invoice.paid_kobo,
  });
  const reference = generateReference();
  const reserved = await admin.from('payments').insert({
    user_id: userId,
    amount: remaining,
    reference,
    status: 'pending',
    plan,
    paystack_response: {
      source: TRANSFER_CHECKOUT_SOURCE,
      currency: 'NGN',
      selected_interval: period,
      invoice_id: invoice.id,
      ...(promoCode ? { promo_code: promoCode } : {}),
      self_serve: true,
    },
  });
  if (reserved.error) {
    console.error('[billing/transfer] payments insert failed:', reserved.error.message);
    return NextResponse.json({ error: 'Could not start the transfer. Try again.' }, { status: 500 });
  }

  const init = await fetchPaystackInit({
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      amount: remaining,
      reference,
      currency: 'NGN',
      channels: ['bank_transfer'],
      callback_url: resolveCallbackUrl(request),
      metadata: { user_id: userId, plan, interval: period, source: TRANSFER_CHECKOUT_SOURCE, invoice_id: invoice.id },
    }),
  });
  const payload = (await init.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string };
  };
  if (!init.ok || !payload.status || !payload.data?.authorization_url) {
    await admin.from('payments').delete().eq('reference', reference);
    return NextResponse.json({ error: payload.message || 'Could not start the transfer. Try again.' }, { status: 502 });
  }

  return NextResponse.json({
    mode: 'checkout',
    invoice: invoicePayload(invoice),
    authorizationUrl: payload.data.authorization_url,
    reference,
  });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const invoiceId = request.nextUrl.searchParams.get('invoiceId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return NextResponse.json({ error: 'Unknown transfer.' }, { status: 400 });
  const invoice = await loadInvoice(admin, auth.user.id, invoiceId);
  if (!invoice) return NextResponse.json({ error: 'Unknown transfer.' }, { status: 404 });
  return NextResponse.json({ invoice: invoicePayload(invoice) });
}
