import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { isReferralsEnabled } from '@/lib/referrals';
import { attachReferral } from '@/lib/referrals-server';

// POST /api/referrals/attach — a new account saying "I came in through this
// partner's link". The onboarding page calls it once, right after the account
// and its first rollout exist, with the code it remembered from the link.
//
// It tags the CALLER'S OWN team and nothing else: the team is found from the
// authenticated user, never from the request, so nobody can tag someone else's.
// The rules (new team only, never an invitee, once ever) are decideAttach in
// lib/referrals.ts.
//
// An OPEN route (getAuthenticatedUser, not the paywall gate), like the other
// onboarding calls: this runs in the first minutes of an account's life and must
// not depend on a plan. 404 while the switch is off.
//
// The answer is always a 200 with `tagged`, because the page does not act on a
// refusal except to stop asking. `retry` is true only when the team did not
// exist yet, the one case worth asking again.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!isReferralsEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: { code?: unknown } = {};
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ tagged: false, retry: true });

  const result = await attachReferral(admin, { ownerUserId: auth.user.id, rawCode: body.code });
  if (result.ok) return NextResponse.json({ tagged: true });
  return NextResponse.json({ tagged: false, reason: result.reason, retry: result.reason === 'no_team' });
}
