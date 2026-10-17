import { NextRequest, NextResponse } from 'next/server';
import {
  CURATOR_INBOX_STATUSES,
  CURATOR_PITCH_LIST_LIMIT,
  PITCHES_TABLE,
  curatorPitchColumns,
  flagOffResponse,
  isPitchingFeatureEnabled,
  requireCuratorUser,
  toCuratorPitch,
} from '../_shared';
import { PAYMENTS_TABLE } from '@/lib/pitch-payments-server';

/**
 * The curator inbox: every pitch sent to their playlists, newest first.
 *
 * Note the column list — CURATOR_PITCH_COLUMNS selects no release id, no owner
 * id, no playlist id. Everything the card shows is denormalized onto the pitch
 * row, so this read cannot reach team data even by accident.
 *
 * No status filter param: the client holds the inbox and filters in memory, the
 * same call the notes list makes. The one filter here is not a choice: a pitch
 * nobody has paid for, or one that ran out of time and was refunded, is never
 * in a curator's inbox (see CURATOR_INBOX_STATUSES).
 *
 * A paid pitch carries its deadline and the curator's own share, read from
 * their OWN payment rows. That follows the ROW, not the feature flag, for the
 * same reason the reply rules in [pitchId]/route.ts do: switching paid pitching
 * off must not strand a curator with a pitch somebody paid for and a card that
 * no longer shows the deadline or asks for the written reply. The sweeps keep
 * running either way, so a curator who could not answer would earn a strike.
 */
export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const read = (columns: string) =>
    auth.adminClient
      .from(PITCHES_TABLE)
      .select(columns)
      .eq('curator_user_id', auth.user.id)
      .in('status', CURATOR_INBOX_STATUSES)
      .order('created_at', { ascending: false })
      .limit(CURATOR_PITCH_LIST_LIMIT);

  // credits_charged (Pitch on credits, URG-345) first; a database without that
  // migration answers 42703 and the read drops back a step.
  let { data, error } = await read(`${curatorPitchColumns(true)},credits_charged`);
  if (error && isUndefinedColumn(error)) {
    ({ data, error } = await read(curatorPitchColumns(true)));
  }

  // The one database this can meet without the payment columns is one the
  // payments migration has not reached yet: Postgres answers "undefined
  // column" (42703). Then the inbox reads exactly the columns it always read,
  // and nothing else changes. This is not the retired schema-missing pattern:
  // nothing is reported to the user, there is no SQL to run, and once the
  // migration is applied this branch is never taken again.
  if (error && isUndefinedColumn(error)) {
    ({ data, error } = await read(curatorPitchColumns(false)));
  }

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load your pitches.' },
      { status: 500 }
    );
  }

  const rows = (data || []) as unknown as Array<Record<string, unknown>>;
  const shares = new Map<string, number>();

  const paidIds = rows.filter((row) => row.payment_kind === 'paid').map((row) => String(row.id));
  if (paidIds.length) {
    const { data: payments } = await auth.adminClient
      .from(PAYMENTS_TABLE)
      .select('pitch_id,curator_share_kobo')
      .eq('curator_user_id', auth.user.id)
      .in('pitch_id', paidIds);
    for (const payment of (payments || []) as Array<Record<string, unknown>>) {
      shares.set(String(payment.pitch_id), Number(payment.curator_share_kobo) || 0);
    }
  }

  return NextResponse.json({
    pitches: rows.map((row) => toCuratorPitch(row, { shareKobo: shares.get(String(row.id)) ?? null })),
  });
}

function isUndefinedColumn(error: { code?: string | null } | null): boolean {
  return error?.code === '42703';
}
