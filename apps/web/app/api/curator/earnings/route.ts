import { NextRequest, NextResponse } from 'next/server';
import { CURATOR_PROFILES_TABLE, flagOffResponse, requireCuratorUser } from '../_shared';
import { loadCurrentPayoutAccount, toCuratorPayoutAccount } from '../payouts/_shared';
import {
  CURATOR_TERMS_VERSION,
  PITCH_PLATFORM_FEE_BPS,
  PITCH_PRICE_MAX_KOBO,
  PITCH_PRICE_MIN_KOBO,
  PITCH_RESPONSE_WINDOW_HOURS,
  STRIKE_LIMIT,
  STRIKE_WINDOW_DAYS,
  countRecentStrikes,
  isPitchPaymentsEnabled,
} from '@/lib/pitch-payments';
import {
  PAYMENTS_TABLE,
  PRICING_TABLE,
  RECOVERIES_TABLE,
  STRIKES_TABLE,
  loadCuratorPaymentStates,
} from '@/lib/pitch-payments-server';
import type { CuratorEarnings, CuratorEarningsRow } from '@/types/pitch-payments';

const EARNINGS_LIMIT = 100;

/**
 * Everything the curator's Earnings page shows, in one read: their bank
 * account, their price and whether it is charging, what they have earned, what
 * they still owe back from missed windows, and their strikes.
 *
 * Every row here is the curator's own. `sentToBankKobo` is what Paystack sent
 * them for a pitch, which is their share minus anything that went to clear an
 * earlier missed window, and that second number is exactly what an artist is
 * never shown.
 */
export async function GET(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const userId = auth.user.id;
  const now = new Date();

  const [account, pricing, payments, recoveries, strikes, profile, states] = await Promise.all([
    loadCurrentPayoutAccount(auth.adminClient, userId),
    auth.adminClient
      .from(PRICING_TABLE)
      .select('pitch_price_kobo,response_window_hours,is_live')
      .eq('curator_user_id', userId)
      .maybeSingle(),
    auth.adminClient
      .from(PAYMENTS_TABLE)
      .select('id,song_title,artist_name,price_kobo,curator_share_kobo,recovery_applied_kobo,status,paid_at')
      .eq('curator_user_id', userId)
      .order('paid_at', { ascending: false })
      .limit(EARNINGS_LIMIT),
    auth.adminClient
      .from(RECOVERIES_TABLE)
      .select('owed_kobo,recovered_kobo')
      .eq('curator_user_id', userId)
      .eq('status', 'open'),
    auth.adminClient
      .from(STRIKES_TABLE)
      .select('created_at')
      .eq('curator_user_id', userId)
      .gte('created_at', new Date(now.getTime() - STRIKE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()),
    auth.adminClient
      .from(CURATOR_PROFILES_TABLE)
      .select('inbox_paused_at,strikes_reset_at')
      .eq('user_id', userId)
      .maybeSingle(),
    loadCuratorPaymentStates(auth.adminClient, [userId]),
  ]);

  if ('error' in account || pricing.error || payments.error || recoveries.error || strikes.error || profile.error) {
    return NextResponse.json({ error: 'Could not load your earnings.' }, { status: 500 });
  }

  const pricingRow = pricing.data as Record<string, unknown> | null;
  const profileRow = profile.data as Record<string, unknown> | null;

  const earnings: CuratorEarningsRow[] = ((payments.data || []) as Array<Record<string, unknown>>).map((row) => {
    const share = Number(row.curator_share_kobo) || 0;
    const recovery = Number(row.recovery_applied_kobo) || 0;
    const status = String(row.status);
    const refunded = status === 'refund_pending' || status === 'refunded' || status === 'refund_failed';
    return {
      id: String(row.id),
      songTitle: String(row.song_title || ''),
      artistName: String(row.artist_name || ''),
      priceKobo: Number(row.price_kobo) || 0,
      shareKobo: share,
      recoveryAppliedKobo: recovery,
      // A refunded row's WHOLE share turns into an open recovery the instant the
      // window is missed (expire_paid_pitch inserts curator_recoveries for the
      // full curator_share_kobo, whether or not it had already settled to the
      // bank) — so nothing from this row reaches the curator once it is
      // refunded. share - recovery is only true for a row that stayed paid.
      sentToBankKobo: refunded ? 0 : Math.max(0, share - recovery),
      status: refunded ? (status as 'refund_pending' | 'refunded' | 'refund_failed') : 'paid',
      paidAt: String(row.paid_at || ''),
    };
  });

  const recoveryOwedKobo = ((recoveries.data || []) as Array<Record<string, unknown>>).reduce(
    (sum, row) => sum + Math.max(0, (Number(row.owed_kobo) || 0) - (Number(row.recovered_kobo) || 0)),
    0
  );

  const body: CuratorEarnings = {
    payoutAccount: account.row ? toCuratorPayoutAccount(account.row) : null,
    pricing: pricingRow
      ? {
          priceKobo: Number(pricingRow.pitch_price_kobo) || 0,
          responseWindowHours: Number(pricingRow.response_window_hours) || PITCH_RESPONSE_WINDOW_HOURS,
          isLive: pricingRow.is_live === true,
        }
      : null,
    livePriceKobo: states.get(userId)?.priceKobo ?? null,
    paused: Boolean(profileRow?.inbox_paused_at),
    strikeCount: countRecentStrikes(
      ((strikes.data || []) as Array<Record<string, unknown>>).map((row) => String(row.created_at)),
      now,
      (profileRow?.strikes_reset_at as string | null) ?? null,
      STRIKE_WINDOW_DAYS
    ),
    recoveryOwedKobo,
    earnings,
    config: {
      feeBps: PITCH_PLATFORM_FEE_BPS,
      priceMinKobo: PITCH_PRICE_MIN_KOBO,
      priceMaxKobo: PITCH_PRICE_MAX_KOBO,
      responseWindowHours: PITCH_RESPONSE_WINDOW_HOURS,
      strikeLimit: STRIKE_LIMIT,
      strikeWindowDays: STRIKE_WINDOW_DAYS,
      termsVersion: CURATOR_TERMS_VERSION,
    },
  };

  return NextResponse.json(body);
}
