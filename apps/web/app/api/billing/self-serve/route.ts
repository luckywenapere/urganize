import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { cardIntervals } from '@/lib/billing-plans';
import { CHECKOUT_PLANS, isCheckoutPeriod, isCheckoutPlan } from '@/lib/self-serve';
import { isDedicatedAccountEnabled, loadOpenInvoice, loadPaymentAccount, validatePromoCode } from '@/lib/self-serve-server';
import { getAppAccess } from '@/lib/access-gate-server';
import { allowedCallLed } from '@/lib/call-led-server';


// GET  /api/billing/self-serve   what the checkout page can offer this person:
//      which card periods have a Paystack plan, whether transfers use their own
//      account number, whether distribution is on, whether they are already
//      let in, and any transfer they have started.
// POST /api/billing/self-serve   { promo }  checks a code and says who sent them.
//
// OPEN routes (getAuthenticatedUser, never the paywall wrapper): the person
// paying is usually still on the waitlist, and a 402 would send them away from
// the page that lets them in.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const cardPeriods = Object.fromEntries(
    CHECKOUT_PLANS.map((plan) => [plan, cardIntervals(plan)])
  ) as Record<(typeof CHECKOUT_PLANS)[number], string[]>;

  const [access, invoice, account, subscription] = await Promise.all([
    getAppAccess(auth.user.id, auth.user.email ?? null, admin).catch(() => ({ allowed: true })),
    loadOpenInvoice(admin, auth.user.id).catch(() => null),
    loadPaymentAccount(admin, auth.user.id).catch(() => null),
    admin
      .from('subscriptions')
      .select('plan,billing_interval,status,expires_at,paystack_subscription_code')
      .eq('user_id', auth.user.id)
      .maybeSingle()
      .then(
        (result) => (result.error ? null : result.data),
        () => null
      ),
  ]);

  // The plan this person already pays for, so the checkout can upgrade it
  // (prorated, through /api/billing/change-plan) instead of starting a second
  // subscription. Only a live, self-serve tier counts.
  const sub = subscription as {
    plan: string | null;
    billing_interval: string | null;
    status: string | null;
    expires_at: string | null;
    paystack_subscription_code: string | null;
  } | null;
  const live =
    sub &&
    (sub.status === 'active' || sub.status === 'past_due') &&
    isCheckoutPlan(sub.plan) &&
    (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now());
  const current = live
    ? {
        plan: sub.plan,
        period: isCheckoutPeriod(sub.billing_interval) ? sub.billing_interval : 'monthly',
        card: Boolean(sub.paystack_subscription_code),
      }
    : null;

  const callLedAllowed = await allowedCallLed(admin, {
    userId: auth.user.id,
    email: auth.user.email ?? '',
  }).catch(() => [] as string[]);

  return NextResponse.json({
    callLedAllowed,
    cardPeriods,
    transferAccounts: isDedicatedAccountEnabled(),
    distributionOn: process.env.NEXT_PUBLIC_FEATURE_TRM_SEND !== 'false',
    approved: Boolean((access as { allowed?: boolean }).allowed),
    openInvoice: invoice
      ? {
          id: invoice.id,
          plan: invoice.plan,
          period: invoice.billing_interval,
          amountKobo: invoice.amount_kobo,
          creditKobo: invoice.credit_applied_kobo,
          paidKobo: invoice.paid_kobo,
        }
      : null,
    hasAccount: Boolean(account),
    current,
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  let body: { promo?: unknown } = {};
  try {
    body = (await request.json()) as { promo?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const result = await validatePromoCode(admin, body.promo);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message });
  return NextResponse.json({ ok: true, code: result.code, line: `${result.name} sent you.` });
}
