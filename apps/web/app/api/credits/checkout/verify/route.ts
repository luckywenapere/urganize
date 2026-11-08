import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { isCreditsReference } from '@/lib/credits/purchase';
import { settleCreditsPurchase } from '@/lib/credits/purchase-server';
import { isBachsConfigured } from '@/lib/bachs';
import { fulfilBachsCheckout, loadBachsCheckout } from '@/lib/bachs-server';

/**
 * GET /api/credits/checkout/verify?reference=...
 *
 * Where the buyer lands back from Paystack. Settles the purchase if the webhook
 * has not already, and says how it went. It creates nothing: the credits come
 * only from Paystack's own record of the transaction (settleCreditsPurchase),
 * checked against the pack table to the kobo, and a second settle of the same
 * reference changes nothing.
 *
 * DELIBERATELY NOT BEHIND THE FEATURE FLAG OR THE PAYWALL, the same two calls
 * /api/pitching/checkout/verify makes: this only confirms money that Paystack says
 * arrived, so it must keep working if purchasing is switched off, or the plan
 * lapses, while someone is on the payment page.
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
  if (!isCreditsReference(reference)) {
    return NextResponse.json({ error: 'That payment reference is not one of ours.' }, { status: 400 });
  }

  // A dollar pack paid through Bachs (#1120): Bachs is asked, not Paystack.
  const bachsRow = await loadBachsCheckout(admin, reference);
  if (bachsRow) {
    if (bachsRow.user_id !== auth.user.id) {
      return NextResponse.json({ error: 'That payment reference is not one of ours.' }, { status: 400 });
    }
    if (bachsRow.status === 'paid') return NextResponse.json({ state: 'paid', credits: bachsRow.credits ?? 0 });
    const result = isBachsConfigured() ? await fulfilBachsCheckout(admin, reference) : 'not_paid';
    if (result === 'applied' || result === 'already') {
      return NextResponse.json({ state: 'paid', credits: bachsRow.credits ?? 0 });
    }
    return NextResponse.json({ state: result === 'error' ? 'pending' : 'not_paid' });
  }

  const outcome = await settleCreditsPurchase(admin, reference, 'callback');

  switch (outcome.state) {
    case 'credited':
      return NextResponse.json({ state: 'paid', credits: outcome.credits });
    case 'not_paid':
      return NextResponse.json({ state: 'not_paid' });
    case 'mismatch':
      // Said plainly to the buyer, and loud in the logs: money arrived that
      // matches no pack, and someone has to look.
      return NextResponse.json({ state: 'needs_review' });
    case 'error':
      // A slow Paystack is not a failed payment. The page tries again, and the
      // webhook settles it either way.
      return NextResponse.json({ state: outcome.transient ? 'pending' : 'error' }, { status: outcome.transient ? 200 : 502 });
  }
}
