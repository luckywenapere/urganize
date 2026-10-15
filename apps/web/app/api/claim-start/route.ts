import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/app/api/_shared/auth';
import { normalizeEmail } from '@/lib/person-identity';
import { mintClaimLink } from '@/lib/seeding-server';

// "Claim this profile" on an unclaimed /p page (URG-304). It hands off to the
// existing claim route, /claim/{token}, which does the rest.
//
// A claim link is normally sent by the team that credited somebody, and the
// private token is half the proof. A link made here has no such sender, so it
// is made ONLY for the strongest proof the claim flow knows: the signed-in
// account's CONFIRMED email is one of the emails on this profile's credits. A
// typed email proves nothing (anyone can type anyone's address), so somebody
// whose account email does not match gets no link and is refused; their way in
// stays the link from the team that credited them.
//
// Open route (getAuthenticatedUser, never the paywall wrapper): the person may
// have made their account a minute ago. The profile is found by slug and must
// be unclaimed and not asked to be removed. Nothing about the profile, its
// contacts or whether one matched is said beyond yes or no.

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const notYours = () =>
  NextResponse.json({ ok: false, error: 'Sign in with the email on your credits.' }, { status: 403 });

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_FEATURE_DIRECTORY !== 'true') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = asRow(await request.json());
  } catch {
    // Fall through to the slug check.
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (!slug || slug.length > 120) return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });

  const accountEmail = normalizeEmail(auth.user.email ?? null);
  if (!accountEmail || !auth.user.email_confirmed_at) return notYours();

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  try {
    const { data: profile } = await admin
      .from('person_profiles')
      .select('id, status, removal_requested_at, removed_at')
      .eq('slug', slug)
      .maybeSingle();
    const row = asRow(profile);
    if (!profile || row.status !== 'unclaimed' || row.removal_requested_at || row.removed_at) {
      return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    }
    const personId = String(row.id || '');

    const { data: match } = await admin
      .from('person_identifiers')
      .select('person_id')
      .eq('person_id', personId)
      .eq('kind', 'email')
      .eq('value', accountEmail)
      .limit(1);
    if (!match || match.length === 0) return notYours();

    // Earlier links stay as they are: a team's own link must keep working.
    const minted = await mintClaimLink(admin, {
      personId,
      actorUserId: auth.user.id,
      workspaceId: null,
      stampSeed: false,
      revokeEarlier: false,
    });
    if (!minted.ok) return NextResponse.json({ ok: false, error: 'Try again.' }, { status: 500 });
    return NextResponse.json({ ok: true, url: `/claim/${minted.token}` }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Try again.' }, { status: 500 });
  }
}
