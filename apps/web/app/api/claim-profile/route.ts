import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/app/api/_shared/auth';
import { loadPersonCredits, setCreditHidden } from '@/lib/claim-server';
import { PERSON_AVAILABILITIES, PERSON_BIO_MAX_CHARS } from '@/lib/person-profile';
import type { PersonAvailability, PersonVisibility } from '@/types/directory';

// What somebody does right after claiming their page: review their credits,
// write a short bio, say if they are open to work, and choose whether the page
// is open to anyone with the link.
//
// Open route (getAuthenticatedUser, never the paywall wrapper), like the claim
// itself: this is the first minute of somebody's account. It only ever touches
// the signed-in person's OWN profile, found by their user id and never by an id
// in the request. The fuller editor in Settings stays where it was.

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const { data } = await admin
    .from('person_profiles')
    .select('id, display_name, slug, bio, availability, visibility, status')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!data) return NextResponse.json({ profile: null, credits: [] });
  const credits = await loadPersonCredits(admin, String((data as { id: string }).id));
  return NextResponse.json({
    profile: {
      displayName: data.display_name,
      slug: data.slug,
      bio: data.bio,
      availability: data.availability,
      visibility: data.visibility,
    },
    credits,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid request body.' }, { status: 400 });
  }
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  // Hiding one credit.
  if (typeof body.hideCredit === 'object' && body.hideCredit) {
    const hide = body.hideCredit as { submissionId?: unknown; hidden?: unknown };
    if (typeof hide.submissionId !== 'string' || typeof hide.hidden !== 'boolean') {
      return NextResponse.json({ error: 'Choose a credit.' }, { status: 400 });
    }
    const ok = await setCreditHidden(admin, {
      userId: auth.user.id,
      submissionId: hide.submissionId,
      hidden: hide.hidden,
    });
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Credit not found.' }, { status: 404 });
  }

  // The page itself. Only the three fields the claim step asks for.
  const patch: Record<string, unknown> = {};
  if ('bio' in body) {
    const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
    if (bio.length > PERSON_BIO_MAX_CHARS) {
      return NextResponse.json({ error: `Keep your bio under ${PERSON_BIO_MAX_CHARS} characters.` }, { status: 400 });
    }
    patch.bio = bio || null;
  }
  if ('availability' in body) {
    if (!PERSON_AVAILABILITIES.includes(body.availability as PersonAvailability)) {
      return NextResponse.json({ error: 'Choose open, selective or closed.' }, { status: 400 });
    }
    patch.availability = body.availability;
  }
  if ('published' in body) {
    if (typeof body.published !== 'boolean') {
      return NextResponse.json({ error: 'Choose to show your page or keep it private.' }, { status: 400 });
    }
    const visibility: PersonVisibility = body.published ? 'public' : 'private';
    patch.visibility = visibility;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });

  const updated = await admin
    .from('person_profiles')
    .update(patch)
    .eq('user_id', auth.user.id)
    .eq('status', 'claimed')
    .select('slug, visibility')
    .maybeSingle();
  if (updated.error) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  if (!updated.data) return NextResponse.json({ error: 'Claim your page first.' }, { status: 404 });
  return NextResponse.json({ ok: true, slug: updated.data.slug, visibility: updated.data.visibility });
}
