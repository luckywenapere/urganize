import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { recordFriend } from '@/lib/waitlist-share-server';
import { approveUser, getAppAccess, redeemAccessCode } from '@/lib/access-gate-server';
import { openClaimLink } from '@/lib/seeding-server';

// Closed sign-up (2026-10-15). Signed in, never paywalled (a held account must
// reach it). Body, every field optional:
//   { code }          a /start/<code> link the browser kept across sign-in
//   { welcomeToken }  a founder /welcome seeding link the browser kept
// With neither it only reports. Always answers { approved, outcome? }.
//
// Called after sign-in by /auth/callback, by onboarding before it makes the
// first rollout, by /start/<code> when already signed in, and by the "You're on
// the list" screen, which is how a held account notices it was let in.

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  let outcome: string | undefined;
  if (typeof body.code === 'string' && body.code.trim()) {
    outcome = await redeemAccessCode(admin, auth.user.id, body.code.trim());
  }

  // A founder seeding link (no Directory referrer) counts as approval: the
  // founder built that profile with them and sent it himself.
  if (typeof body.welcomeToken === 'string' && body.welcomeToken.trim()) {
    try {
      const view = await openClaimLink(admin, body.welcomeToken.trim());
      if (view.state === 'ok' && !view.invitedBy) {
        await approveUser(admin, auth.user.id, 'founder_seed');
      }
    } catch {
      // A bad token approves nothing; the answer below says so.
    }
  }

  // A friend link (/r/<code>): credit this account to the sharer. Counts only a
  // held account, so it never changes who is let in here.
  if (typeof body.friendCode === 'string' && body.friendCode.trim()) {
    await recordFriend(admin, auth.user.id, body.friendCode.trim());
  }

  const access = await getAppAccess(auth.user.id, auth.user.email, admin);
  return NextResponse.json(
    { approved: access.allowed, ...(outcome ? { outcome } : {}) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
