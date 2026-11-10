import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_shared/auth';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { isNewAccount } from '@/lib/profile-growth';
import { captureProfileGrowthEvent } from '@/lib/profile-growth-server';
import {
  SOURCE_LINK_COOKIE,
  resolveSourceLink,
  sourceLinkCookieDomain,
  sourceLinkProperties,
} from '@/lib/source-links';

// POST /api/source-link/signup (2026-11-10, #1185). Onboarding calls it once,
// when a new account's team exists. If the browser carries the cookie a short
// link left (lib/source-links.ts), it records `signup_from_source_link` for the
// caller's own account and clears the cookie, so it is recorded once.
//
// OPEN route (getAuthenticatedUser), like every first-minute call. An account
// older than 7 days is not a sign-up, so an old account is never tagged by
// tapping a link later. Always answers 200 with `recorded`.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const link = resolveSourceLink(request.cookies.get(SOURCE_LINK_COOKIE)?.value);
  if (!link) return NextResponse.json({ recorded: false });

  const fresh = isNewAccount(auth.user.created_at, Date.now());
  if (fresh) {
    captureProfileGrowthEvent(
      'source link signup',
      auth.user.id,
      createPostHogEvent('signup_from_source_link', sourceLinkProperties(link))
    );
  }
  const response = NextResponse.json({ recorded: fresh });
  response.cookies.set(SOURCE_LINK_COOKIE, '', {
    maxAge: 0,
    path: '/',
    domain: sourceLinkCookieDomain(request.headers.get('host')),
  });
  return response;
}
