import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { isNewAccount, normalizeSignupAttribution, signupFromProfileProperties } from '@/lib/profile-growth';
import { captureProfileGrowthEvent, recordProfileGrowthRow } from '@/lib/profile-growth-server';

// POST /api/signup-source (2026-10-11). The onboarding page calls it once, at
// the end of sign-up, when the person arrived from a public profile's call to
// action or a claim link (lib/signup-source-intent.ts remembered it).
//
// It records `signup_from_profile` for the CALLER'S OWN new account and one
// `signup` row for the admin funnel. Nothing about anyone else is read or
// written. Rules:
//   - an account older than 7 days is not a sign-up, so an old account cannot
//     be tagged by opening a link later;
//   - once per account (a unique index on the table; a second call is a no-op);
//   - a slug is sent to PostHog only for a claimed, published page. An
//     unclaimed page is a name a team typed, and that person agreed to nothing.
//
// OPEN route (getAuthenticatedUser, never the paywall wrapper), like every
// other onboarding call: it runs in the first minute of an account. It always
// answers 200 with `recorded`, because the page does nothing with a refusal
// except stop asking.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ recorded: false });
  }
  const attribution = normalizeSignupAttribution(body);
  if (!attribution) return NextResponse.json({ recorded: false });
  if (!isNewAccount(auth.user.created_at, Date.now())) return NextResponse.json({ recorded: false });

  let slug = attribution.slug;
  let personId: string | null = null;
  const admin = createAdminClient(auth.supabaseUrl);
  if (admin && slug) {
    const { data } = await admin
      .from('person_profiles')
      .select('id, status, visibility')
      .eq('slug', slug)
      .maybeSingle();
    const row = (data ?? null) as { id?: unknown; status?: unknown; visibility?: unknown } | null;
    personId = row && typeof row.id === 'string' ? row.id : null;
    if (!(row && row.status === 'claimed' && row.visibility === 'public')) slug = null;
  } else {
    slug = null;
  }

  captureProfileGrowthEvent(
    'profile-growth signup',
    auth.user.id,
    createPostHogEvent('signup_from_profile', signupFromProfileProperties({ ...attribution, slug }))
  );
  recordProfileGrowthRow('profile-growth signup row', {
    kind: 'signup',
    slug: null,
    personId,
    cta: attribution.cta,
    source: attribution.source,
    userId: auth.user.id,
  });
  return NextResponse.json({ recorded: true });
}
