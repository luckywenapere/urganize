import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { isBachsConfigured } from '@/lib/bachs';
import { createCardPortalUrl } from '@/lib/bachs-trial-server';

// "Change card" (2026-11-14, #1266): a one-time link to Bachs's own page for
// the saved card. Made per click and handed straight back; never stored and
// never logged, because the link signs its holder in.
//
// OPEN route: a team whose payment failed is the one that most needs it.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  if (!isBachsConfigured()) return NextResponse.json({ error: 'This is not on yet.' }, { status: 503 });
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const url = await createCardPortalUrl(admin, auth.user.id);
  if (!url) return NextResponse.json({ error: 'Could not open the card page. Try again.' }, { status: 502 });
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'private, no-store' } });
}
