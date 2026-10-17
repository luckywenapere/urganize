import { NextRequest, NextResponse } from 'next/server';
import { flagOffResponse, isPitchingFeatureEnabled, requireTeamUser } from '../_shared';
import { isPitchCreditsEnabled } from '@/lib/pitch-credits';
import { readTeamCredits } from '@/lib/pitch-credits-server';
import { isCreditsPurchasable } from '@/lib/credits/config';

/**
 * GET /api/pitching/credits: the balance the Pitch this! tray reads, in
 * credits, plus what the top-up sheet needs (the account, for the pack sizes,
 * and whether this person may buy). Pitch on credits, URG-345.
 */
export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled() || !isPitchCreditsEnabled()) return flagOffResponse();

  const auth = await requireTeamUser(request);
  if ('error' in auth && auth.error) return auth.error;

  const credits = await readTeamCredits(auth.adminClient, auth.user);
  if (!credits) {
    return NextResponse.json({ error: 'Could not read your credits.' }, { status: 503 });
  }
  return NextResponse.json({
    balance: credits.balance,
    account: credits.account,
    canBuy: credits.canBuy,
    purchasable: isCreditsPurchasable(),
  });
}
