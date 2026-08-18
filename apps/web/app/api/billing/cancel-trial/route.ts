import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { invalidateSubscriptionSnapshot } from '@/lib/subscription-access';
import { TRIAL_CARD_PLAN } from '@/lib/trial-card';

// POST /api/billing/cancel-trial — stop the card-backed trial's upcoming
// charge (the delayed Paystack subscription created by the card-before-trial
// webhook branch).
//
// Semantics mirror subscription.disable everywhere else in this codebase:
// status → 'cancelled' but expires_at is KEPT, so access runs to the end of
// the trial and then lapses (resolveSnapshot path 1 treats cancelled +
// not-expired as access). The card is never charged.
//
// Deliberately NOT flag-gated: an in-flight card trial must stay cancellable
// even after a NEXT_PUBLIC_FEATURE_CARD_TRIAL rollback — money is on the line.
// Deliberately open-route auth (getAuthenticatedUser, not the paywall
// wrapper): a user whose trial just lapsed must still be able to stop the
// imminent charge even if the paywall is ever switched back on.

const PAYSTACK_SUBSCRIPTION_URL = 'https://api.paystack.co/subscription';

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const userId = auth.user.id;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json(
      { error: 'Server environment is not configured.' },
      { status: 500 }
    );
  }

  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecretKey) {
    return NextResponse.json(
      { error: 'Payment provider is not configured on the server.' },
      { status: 500 }
    );
  }

  const { data: subscription, error: subLookupError } = await admin
    .from('subscriptions')
    .select('id, status, expires_at, paystack_reference, paystack_subscription_code')
    .eq('user_id', userId)
    .maybeSingle();
  if (subLookupError) {
    return NextResponse.json(
      { error: 'Could not load subscription.' },
      { status: 500 }
    );
  }

  // Idempotent: cancelling twice is a success, not an error.
  if (subscription?.status === 'cancelled') {
    return NextResponse.json({
      status: 'already_cancelled',
      accessUntil: subscription.expires_at || null,
    });
  }

  if (
    !subscription ||
    subscription.status !== 'trialing' ||
    !subscription.paystack_subscription_code
  ) {
    return NextResponse.json(
      { error: 'No card-backed trial to cancel on this account.' },
      { status: 400 }
    );
  }

  const subscriptionCode = String(subscription.paystack_subscription_code);

  // Paystack's disable call needs the subscription's email_token. Primary
  // source: the card-verification payments row's jsonb audit trail (written
  // by the webhook). Fallback: fetch the subscription from Paystack.
  let emailToken: string | null = null;
  if (subscription.paystack_reference) {
    const { data: paymentRow } = await admin
      .from('payments')
      .select('paystack_response')
      .eq('reference', subscription.paystack_reference)
      .eq('plan', TRIAL_CARD_PLAN)
      .maybeSingle();
    const stored = (paymentRow?.paystack_response as Record<string, unknown> | null)?.email_token;
    if (typeof stored === 'string' && stored.trim()) {
      emailToken = stored.trim();
    }
  }
  if (!emailToken) {
    try {
      const response = await fetch(
        `${PAYSTACK_SUBSCRIPTION_URL}/${encodeURIComponent(subscriptionCode)}`,
        { headers: { Authorization: `Bearer ${paystackSecretKey}` } }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        status?: boolean;
        data?: { email_token?: string };
      };
      if (response.ok && payload?.status && payload.data?.email_token) {
        emailToken = payload.data.email_token;
      }
    } catch {
      // fall through to the 502 below
    }
  }
  if (!emailToken) {
    return NextResponse.json(
      { error: 'Could not resolve the subscription token. Contact support and the charge will be stopped manually.' },
      { status: 502 }
    );
  }

  try {
    const response = await fetch(`${PAYSTACK_SUBSCRIPTION_URL}/disable`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
    };
    // Paystack answers "Subscription is currently not active" (or similar)
    // for an already-disabled subscription — that outcome IS the goal, so
    // treat it as success rather than surfacing an error for a charge that
    // already cannot happen.
    const alreadyInactive = /not\s*active|already/i.test(payload?.message || '');
    if ((!response.ok || !payload?.status) && !alreadyInactive) {
      return NextResponse.json(
        { error: payload?.message || 'Could not cancel the upcoming charge.' },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Could not reach the payment provider. Try again.' },
      { status: 502 }
    );
  }

  const { error: updateError } = await admin
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', subscription.id);
  if (updateError) {
    // The remote subscription IS disabled — the charge will not happen. The
    // local row will also be corrected when Paystack's subscription.disable
    // webhook lands, so log and report success.
    console.error('[billing/cancel-trial] local status update failed (webhook will correct):', updateError.message);
  }

  invalidateSubscriptionSnapshot(userId);

  return NextResponse.json({
    status: 'cancelled',
    accessUntil: subscription.expires_at || null,
  });
}
