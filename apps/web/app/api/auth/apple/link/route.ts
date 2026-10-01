import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  exchangeAppleAuthorizationCode,
  getAppleSignInConfig,
  storeAppleRefreshToken,
} from '@/lib/apple-token-server';

// POST /api/auth/apple/link — the iPhone app has just signed someone in with
// Apple and passes the one-use authorization code here. We trade it for a
// refresh token and keep it, so deleting the account can later revoke the
// Sign in with Apple link (Apple requires that; see lib/apple-token-server.ts).
//
// Open-route auth (getAuthenticatedUser, not the paywall wrapper): it runs
// seconds after sign-in, for an account that may not have started a trial, and
// it has nothing to do with payment.
//
// Never an error the person can see. The sign-in has already worked; this is
// housekeeping, so with the server not set up for Apple it answers
// `{ linked: false }` and the page carries on.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { authorizationCode?: unknown } | null;
  const authorizationCode =
    typeof body?.authorizationCode === 'string' ? body.authorizationCode.trim() : '';
  if (!authorizationCode) {
    return NextResponse.json({ error: 'authorizationCode is required.' }, { status: 400 });
  }

  const config = getAppleSignInConfig();
  if (!config) return NextResponse.json({ linked: false });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ linked: false });

  const refreshToken = await exchangeAppleAuthorizationCode(config, authorizationCode);
  if (!refreshToken) return NextResponse.json({ linked: false });

  const stored = await storeAppleRefreshToken(admin, auth.user.id, refreshToken);
  return NextResponse.json({ linked: stored });
}
