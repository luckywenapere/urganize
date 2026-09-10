import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TRIAL_CARD_PLAN, classifyTrialCardFailure } from '@/lib/trial-card';

// Post-checkout UI confirmation endpoint.
//
// After Paystack redirects the user to /payment/callback?reference=...,
// the callback page calls this route to look up the payment status. This
// is purely a read-side helper for the UI — the webhook
// (api/webhooks/paystack) is the authoritative path that flips
// `payments.status = 'success'`, upserts the subscription, and credits
// access. Concretely:
//
//   - The webhook usually arrives first. The UI lookup returns
//     status='success', the page shows a celebratory state, and pushes
//     the user into /dashboard.
//   - In the race window where the user lands here before the webhook,
//     the row still says 'pending'. We return that verbatim and the
//     callback page polls / retries.
//   - We do NOT call Paystack's /transaction/verify here. That belongs
//     to the webhook (which already has signature-verified payload).
//     Calling it again here would double up trust on a query-string
//     reference value that anyone can spoof in the URL.
//
// What this route REMOVED in the recurring billing migration:
//   - The trial-tokenization branch (card-on-file 3-day trial). That
//     flow was already flagged as dead code in CLAUDE.md "Known issues".
//   - The plan-amount validation and `payments` row creation. Both are
//     handled inside the webhook now.

type PaymentRow = {
  status: string;
  plan: string | null;
  amount: number | null;
  paystack_response: { failure_reason?: unknown } | null;
};

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('reference');
  if (!reference) {
    return NextResponse.json({ error: 'No reference provided' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin
    .from('payments')
    .select('status,plan,amount,paystack_response')
    .eq('reference', reference)
    .maybeSingle();

  if (error) {
    console.error('[payments/verify] payments lookup error:', error.message);
    return NextResponse.json({ error: 'Could not look up payment.' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ status: 'unknown', reference }, { status: 404 });
  }

  const row = data as PaymentRow;

  // Card-trial failures carry WHY, in the two-value classification
  // classifyTrialCardFailure allows and nothing more. This route is
  // unauthenticated (a query-string reference is its only key), so the stored
  // reason string and `failure_detail` — which can carry a Paystack message —
  // deliberately never leave the server; see the note on that classifier.
  const failureKind =
    row.status === 'failed' && row.plan === TRIAL_CARD_PLAN
      ? classifyTrialCardFailure(
          typeof row.paystack_response?.failure_reason === 'string'
            ? row.paystack_response.failure_reason
            : null
        )
      : undefined;

  return NextResponse.json({
    status: row.status,
    plan: row.plan,
    amount: row.amount,
    ...(failureKind ? { failureKind } : {}),
    reference,
  });
}
