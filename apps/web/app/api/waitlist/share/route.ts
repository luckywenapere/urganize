import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { getAppAccess } from '@/lib/access-gate-server';
import { getShareState } from '@/lib/waitlist-share-server';

// Held accounts share a link to move up the line (2026-10-23). Signed in, never
// paywalled (a held account must reach it).
// GET → { approved: true } once let in, else { approved: false, code, url,
// friends, place, name }. Makes the account's code on first ask.

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const access = await getAppAccess(auth.user.id, auth.user.email, admin);
  const headers = { 'Cache-Control': 'no-store' };
  if (access.allowed) return NextResponse.json({ approved: true }, { headers });

  try {
    const state = await getShareState(admin, { id: auth.user.id, email: auth.user.email }, request.nextUrl.origin);
    return NextResponse.json({ approved: false, ...state }, { headers });
  } catch {
    return NextResponse.json({ error: 'Could not load your link.' }, { status: 500, headers });
  }
}
