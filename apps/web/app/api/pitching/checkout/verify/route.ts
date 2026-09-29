import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { isPitchPaymentReference, toArtistQuoteView } from '@/lib/pitch-payments';
import { QUOTES_TABLE, settlePitchCheckout } from '@/lib/pitch-payments-server';
import { QUOTE_COLUMNS } from '@/lib/pitch-quotes-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';

/**
 * Where the artist lands back from Paystack. Settles the checkout if the
 * webhook has not already, and says how it went.
 *
 * DELIBERATELY NOT BEHIND THE FEATURE FLAG OR THE PAYWALL, the same two calls
 * /api/payments/verify makes: this only ever confirms money that Paystack says
 * arrived, so it must keep working if paid pitching is switched off, or the
 * team's plan lapses, while somebody is on the payment page. It creates
 * nothing. Nothing is marked paid on this request's word either: settling reads
 * Paystack's own record of the transaction and checks it against the quote to
 * the kobo.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const reference = (url.searchParams.get('reference') || url.searchParams.get('trxref') || '').trim();
  if (!isPitchPaymentReference(reference)) {
    return NextResponse.json({ error: 'That payment reference is not one of ours.' }, { status: 400 });
  }

  const { data: found } = await admin
    .from(QUOTES_TABLE)
    .select(QUOTE_COLUMNS)
    .eq('paystack_reference', reference)
    .maybeSingle();
  const quote = found as unknown as (Parameters<typeof toArtistQuoteView>[0] & Record<string, unknown>) | null;
  if (!quote) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });

  // The payer, or anyone on the team that owns the rollout.
  if (String(quote.payer_user_id) !== auth.user.id) {
    const access = await loadWorkspaceAccessContext(admin, auth.user as never);
    if (!access.releaseOwnerIds.includes(String(quote.owner_user_id || ''))) {
      return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
    }
  }

  const outcome = await settlePitchCheckout(admin, reference, 'callback');

  const { data: refreshed } = await admin
    .from(QUOTES_TABLE)
    .select(QUOTE_COLUMNS)
    .eq('id', quote.id)
    .maybeSingle();
  const view = toArtistQuoteView(
    ((refreshed as unknown) || quote) as Parameters<typeof toArtistQuoteView>[0]
  );

  switch (outcome.state) {
    case 'settled':
      return NextResponse.json({ state: 'paid', quote: view });
    case 'not_paid':
      return NextResponse.json({ state: 'not_paid', quote: view });
    case 'needs_review':
      return NextResponse.json({ state: 'needs_review', quote: view });
    case 'not_found':
      return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
    case 'error':
      // A slow Paystack is not a failed payment. The page tries again, and the
      // webhook settles it either way.
      return NextResponse.json(
        { state: outcome.transient ? 'pending' : 'error', quote: view },
        { status: outcome.transient ? 200 : 502 }
      );
    default:
      return NextResponse.json({ state: 'pending', quote: view });
  }
}
