import { NextRequest, NextResponse } from 'next/server';
import { flagOffResponse, requireCuratorUser } from '../../_shared';
import { isPitchPaymentsEnabled } from '@/lib/pitch-payments';
import { getNigerianBanks } from '@/lib/pitch-payments-server';

/** Nigerian banks a curator can be paid into, from Paystack, cached daily. */
export async function GET(request: NextRequest) {
  if (!isPitchPaymentsEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const banks = await getNigerianBanks(auth.adminClient);
  if (!banks || !banks.length) {
    return NextResponse.json(
      { error: 'Could not load the list of banks. Try again in a minute.' },
      { status: 502 }
    );
  }
  return NextResponse.json({ banks });
}
