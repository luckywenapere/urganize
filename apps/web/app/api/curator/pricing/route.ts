import { NextRequest, NextResponse } from 'next/server';
import { flagOffResponse, requireCuratorUser } from '../_shared';
import {
  PITCH_RESPONSE_WINDOW_HOURS,
  isPitchPaymentsEnabled,
  nairaToKobo,
  validatePitchPrice,
} from '@/lib/pitch-payments';
import { PRICING_TABLE, loadCuratorPaymentStates } from '@/lib/pitch-payments-server';
import type { CuratorPricing } from '@/types/pitch-payments';

const toPricing = (row: Record<string, unknown>): CuratorPricing => ({
  priceKobo: Number(row.pitch_price_kobo) || 0,
  responseWindowHours: Number(row.response_window_hours) || PITCH_RESPONSE_WINDOW_HOURS,
  isLive: row.is_live === true,
});

async function livePriceFor(admin: Parameters<typeof loadCuratorPaymentStates>[0], userId: string) {
  const states = await loadCuratorPaymentStates(admin, [userId]);
  return states.get(userId)?.priceKobo ?? null;
}

/**
 * Set the pitch price and switch paid pitches on.
 *
 * The price must sit inside the band Urganize controls (lib/pitch-payments.ts).
 * The window is not the curator's to set in v1: one window for everybody, and
 * the route writes it rather than reading it from the request.
 *
 * Saving a price does not make it charge on its own. It only charges once the
 * payout account is active and the inbox is not paused; the response says what
 * artists are charged right now, so the screen never has to guess.
 */
export async function PUT(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const raw = payload.price;
  const priceKobo =
    typeof payload.priceKobo === 'number'
      ? Math.round(payload.priceKobo)
      : typeof raw === 'string' || typeof raw === 'number'
        ? nairaToKobo(raw)
        : null;
  if (priceKobo === null) {
    return NextResponse.json({ error: 'Enter a price in naira.' }, { status: 400 });
  }

  const check = validatePitchPrice(priceKobo);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const isLive = payload.live === false ? false : true;

  const { data, error } = await auth.adminClient
    .from(PRICING_TABLE)
    .upsert(
      {
        curator_user_id: auth.user.id,
        pitch_price_kobo: priceKobo,
        response_window_hours: PITCH_RESPONSE_WINDOW_HOURS,
        is_live: isLive,
      },
      { onConflict: 'curator_user_id' }
    )
    .select('pitch_price_kobo,response_window_hours,is_live')
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Could not save your price.' }, { status: 500 });
  }

  return NextResponse.json({
    pricing: toPricing(data as Record<string, unknown>),
    livePriceKobo: await livePriceFor(auth.adminClient, auth.user.id),
  });
}

/** Go back to free pitches. The price is kept for when they switch back. */
export async function DELETE(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const { data, error } = await auth.adminClient
    .from(PRICING_TABLE)
    .update({ is_live: false })
    .eq('curator_user_id', auth.user.id)
    .select('pitch_price_kobo,response_window_hours,is_live')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Could not switch paid pitches off.' }, { status: 500 });
  }

  return NextResponse.json({
    pricing: data ? toPricing(data as Record<string, unknown>) : null,
    livePriceKobo: null,
  });
}
