import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { isCreditsPurchasable } from '@/lib/credits/config';
import { getCreditSnapshot } from '@/lib/credits/credits-server';
import { creditsForPack, findPack, packPriceUsd } from '@/lib/credits/packs';
import { isBachsConfigured, payerCurrency } from '@/lib/bachs';
import { startBachsCreditsCheckout } from '@/lib/bachs-server';
import { buildPurchaseMetadata, creditsReference, resolveCreditsReturnPath } from '@/lib/credits/purchase';
import { initializePaystackTransaction, isPaystackConfigured } from '@/lib/paystack-server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';

/**
 * POST /api/credits/checkout { priceNaira }
 *
 * Open Paystack for one UrgAns credit pack, or Bachs in US dollars for a buyer
 * outside Nigeria (#1120; the pack is still named by its Naira price). A one-off charge, no plan code: this
 * must never create a subscription.
 *
 * WHAT THE CLIENT DECIDES, AND WHAT IT DOES NOT. It sends a price. That price has
 * to be one of the four packs, and the credits it buys are worked out HERE from
 * the team's state at this moment (a subscriber's rate, or the credits-only rate
 * for a trial or an ended plan). Both are written into the transaction's
 * metadata, and settling later re-checks them against the pack table
 * (lib/credits/purchase.ts), so a tampered request buys nothing it did not pay for.
 *
 * AN OPEN ROUTE, not behind the paywall: the person who most needs to buy credits
 * is the one whose plan has ended, and the wall must not be what stops them paying.
 * Only the owner or an admin of a team may buy for it. 404 with the exact flag-gate
 * body when purchasing is off.
 */

function resolveAppBase(request: NextRequest): string {
  // The billing checkout's rule: prefer NEXT_PUBLIC_APP_URL so a branch never
  // calls back to a stale preview, fall back to the request origin locally.
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || new URL(request.url).origin).replace(/\/$/, '');
}

export async function POST(request: NextRequest) {
  if (!isCreditsPurchasable()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // Outside Nigeria a pack is bought in US dollars through Bachs (#1120); in
  // Nigeria, in Naira through Paystack.
  const currency = payerCurrency(isBachsConfigured(), request.headers.get('x-vercel-ip-country'));
  if (currency === 'NGN' && !isPaystackConfigured()) {
    return NextResponse.json({ error: 'Payments are not available right now. Try again later.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { priceNaira?: unknown; returnTo?: unknown } | null;
  const pack = findPack(body?.priceNaira);
  if (!pack) {
    return NextResponse.json({ error: 'Pick one of the credit packs.' }, { status: 400 });
  }

  const email = String(auth.user.email || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Add an email to your account before you pay.' }, { status: 400 });
  }

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!team.primaryWorkspaceId) {
    return NextResponse.json({ error: 'You are not on a team yet.' }, { status: 400 });
  }
  // Paying teams buy credits one at a time past their monthly credits, up to a
  // cap (#1112). Packs stay only for teams with no plan (credits-only).
  if (team.state === 'paid') {
    return NextResponse.json(
      { error: 'Your plan pays for extra credits one at a time. Set a monthly cap on the AI credits page.' },
      { status: 409 }
    );
  }
  if (!team.isOwnerOrAdmin) {
    return NextResponse.json(
      { error: 'Ask the person who runs your team to buy credits.' },
      { status: 403 }
    );
  }

  // The rate depends on the account right now. If the account cannot be read, the
  // lower (credits-only) rate is used: charging a subscriber the dearer price by
  // mistake is recoverable at a support desk, but crediting more than was earned
  // is not something to guess at.
  const snapshot = await getCreditSnapshot(admin, {
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    team,
  });
  const credits = creditsForPack(snapshot?.account ?? 'credits_only', pack.priceNaira);
  if (credits === null) {
    return NextResponse.json({ error: 'Pick one of the credit packs.' }, { status: 400 });
  }

  const base = resolveAppBase(request);
  // A team behind the wall buys from /locked/urgans and has to come back there.
  const returnPath = resolveCreditsReturnPath(body?.returnTo);
  const reference = creditsReference(randomBytes(16).toString('hex'));

  if (currency === 'USD') {
    const priceUsd = packPriceUsd(pack);
    const started = await startBachsCreditsCheckout(admin, {
      userId: auth.user.id,
      email,
      workspaceId: team.primaryWorkspaceId,
      ownerUserId: team.ownerUserId,
      packPriceNaira: pack.priceNaira,
      priceUsd,
      credits,
      reference,
      returnUrl: `${base}${returnPath}`,
    });
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: 502 });
    return NextResponse.json({
      authorizationUrl: started.checkoutUrl,
      reference,
      credits,
      priceNaira: pack.priceNaira,
      priceUsd,
      currency,
    });
  }

  const initialized = await initializePaystackTransaction({
    email,
    amountKobo: pack.priceNaira * 100,
    reference,
    // Paystack appends ?trxref=...&reference=... to this.
    callbackUrl: `${base}${returnPath}`,
    metadata: {
      ...buildPurchaseMetadata({
        workspaceId: team.primaryWorkspaceId,
        ownerUserId: team.ownerUserId,
        userId: auth.user.id,
        priceNaira: pack.priceNaira,
        credits,
      }),
      cancel_action: `${base}${returnPath}?payment=cancelled`,
    },
  });
  if (!initialized.ok) {
    console.error('[credits/checkout] could not open Paystack:', initialized.message);
    return NextResponse.json({ error: 'Could not open the payment page. Try again.' }, { status: 502 });
  }

  return NextResponse.json({
    authorizationUrl: initialized.data.authorizationUrl,
    reference,
    credits,
    priceNaira: pack.priceNaira,
  });
}
