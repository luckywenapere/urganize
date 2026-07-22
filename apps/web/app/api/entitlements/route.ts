import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { getEntitlements } from '@/lib/entitlements';

// Auth-only (core, no paywall) — a free-tier user must be able to ask "what
// am I entitled to" without hitting the 402/locked path. Live, per-request
// resolution (URG-178): no caching here, so an upgrade or a founding-member
// grant is visible on this request, not the next deploy.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const entitlements = await getEntitlements(auth.user.id, auth.user.email, auth.adminClient);
  return NextResponse.json({ entitlements });
}
