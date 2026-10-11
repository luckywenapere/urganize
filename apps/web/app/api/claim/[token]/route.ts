import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/app/api/_shared/auth';
import { isValidClaimToken } from '@/lib/claim';
import { loadClaimPreview, redeemClaim } from '@/lib/claim-server';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { claimCompletedProperties } from '@/lib/profile-growth';
import { captureProfileGrowthEvent } from '@/lib/profile-growth-server';

// A credited person opens a claim link.
//
// GET is public: the person has no session yet. It answers only with what the
// claim page shows (the name on file, a masked contact, the credits).
//
// POST takes over the profile for the signed-in person. It uses
// getAuthenticatedUser and NEVER the paywall wrapper: somebody claiming their
// page is not a customer yet, and a wall in front of it would be the first
// thing a new person met. The proof is the email or phone on the credit, and
// five wrong tries lock the link.

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isValidClaimToken(token)) return NextResponse.json({ ok: false, reason: 'unavailable' });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: false, reason: 'unavailable' });
  return NextResponse.json(await loadClaimPreview(admin, token), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isValidClaimToken(token)) return NextResponse.json({ ok: false, reason: 'unavailable' }, { status: 404 });

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // An empty body is fine: a confirmed account email can prove it alone.
  }

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const typedContact = typeof body.contact === 'string' ? body.contact : '';
  const result = await redeemClaim(admin, {
    token,
    userId: auth.user.id,
    accountEmail: auth.user.email ?? null,
    accountEmailConfirmed: Boolean(auth.user.email_confirmed_at),
    typedContact,
  });
  if (result.ok) {
    // Profile growth funnel: the page is theirs now. Server-side, after the
    // reply, with whether it merged into a profile they had and which proof
    // was used. Nothing they typed is sent.
    captureProfileGrowthEvent(
      'profile-growth claim_completed',
      auth.user.id,
      createPostHogEvent(
        'claim_completed',
        claimCompletedProperties({
          merged: result.merged,
          proof: typedContact.trim() ? 'typed_contact' : 'account_email',
        })
      )
    );
  }
  const status = result.ok ? 200 : result.reason === 'no_match' ? 422 : result.reason === 'error' ? 500 : 409;
  return NextResponse.json(result, { status, headers: { 'cache-control': 'no-store' } });
}
