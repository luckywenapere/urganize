import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';

// PATCH /api/user/marketing-consent (URG-251 Part 2, 2026-10-14).
//
// Records the caller's own answer to "Email updates" (digest, tips, offers):
// profiles.marketing_email_consent plus the time it was given. Called by
// onboarding's opt-in step once the account exists, and directly in
// authed-setup mode. Marketing only: transactional email never reads it.
//
// OPEN route (getAuthenticatedUser, never the paywall wrapper), like every
// other onboarding call: it runs in the first minute of an account, and a
// person must always be able to say no to marketing email, paid or not.

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: { consent?: unknown } | null = null;
  try {
    body = (await request.json()) as { consent?: unknown } | null;
  } catch {
    body = null;
  }
  if (!body || typeof body.consent !== 'boolean') {
    return NextResponse.json({ error: 'consent must be true or false.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error } = await adminClient
    .from('profiles')
    .update({ marketing_email_consent: body.consent, marketing_email_consent_at: now })
    .eq('id', auth.user.id);

  if (error) {
    console.error('[marketing-consent] could not save:', error.message);
    return NextResponse.json({ error: 'Could not save your email choice.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, consent: body.consent, at: now });
}
