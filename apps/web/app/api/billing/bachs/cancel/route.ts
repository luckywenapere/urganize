import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { isBachsConfigured } from '@/lib/bachs';
import { cancelCardTrial } from '@/lib/bachs-trial-server';

// Stop the card being charged (2026-11-14, #1266). Bachs keeps the plan on
// until the day already trialled or paid for, then ends it.
//
// OPEN route on purpose: someone whose access has lapsed must still be able to
// stop a charge.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  if (!isBachsConfigured()) return NextResponse.json({ error: 'This is not on yet.' }, { status: 503 });
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const result = await cancelCardTrial(admin, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    trial: {
      status: result.row.status,
      trialEnd: result.row.trial_end,
      currentPeriodEnd: result.row.current_period_end,
      cancelAtPeriodEnd: result.row.cancel_at_period_end,
    },
  });
}
