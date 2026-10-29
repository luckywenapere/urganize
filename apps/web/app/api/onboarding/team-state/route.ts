import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { isAppAccessAllowed } from '@/lib/access-gate-server';
import { loadOnboardingTeamState } from '@/lib/onboarding-team-server';

// GET /api/onboarding/team-state (#854): where a signed-in person stands on
// the team screen. Read only, by design: it never claims an invite or makes a
// team. An open route (no paywall): a brand-new account has no team, so no
// trial, yet.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth && auth.error) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  try {
    const approved = await isAppAccessAllowed(auth.user.id, auth.user.email, admin);
    const state = await loadOnboardingTeamState(admin, auth.user, approved);
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[onboarding/team-state]', error);
    return NextResponse.json({ error: 'Could not check for invites.' }, { status: 500 });
  }
}
