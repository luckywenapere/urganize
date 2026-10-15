import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/app/api/_shared/auth';
import { isValidClaimToken } from '@/lib/claim';
import { checkClaimContact } from '@/lib/claim-server';
import { makeClaimCode, readClaimCodeSecret } from '@/lib/claim-code';
import { sendEmail } from '@/lib/email';

// Step one of the claim (URG-305): "Prove it's you".
//
// The signed-in person gives the work email on the credit. If it matches, a
// six-digit code goes to that address and the page asks for it; the redeem
// route checks it. Two proofs need no code and answer `skip`: their own sign-in
// email when the provider says it is confirmed, and a typed phone (there is no
// SMS sender; the phone path is exactly as strong as it was before this).
//
// A wrong address counts against the link (five lock it), in the claim server,
// which is the one writer of the invites table. getAuthenticatedUser, never the
// paywall wrapper: claiming is somebody's first minute.

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isValidClaimToken(token)) return NextResponse.json({ ok: false, reason: 'unavailable' }, { status: 404 });

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const typedContact = typeof body.contact === 'string' ? body.contact : '';

  const admin = adminClient();
  const secret = readClaimCodeSecret();
  if (!admin || !secret) return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });

  const check = await checkClaimContact(admin, {
    token,
    accountEmail: auth.user.email ?? null,
    accountEmailConfirmed: Boolean(auth.user.email_confirmed_at),
    typedContact,
  });
  const noStore = { 'cache-control': 'no-store' };
  if (!check.ok) {
    const status = check.reason === 'no_match' ? 422 : check.reason === 'error' ? 500 : 409;
    return NextResponse.json(check, { status, headers: noStore });
  }
  if (check.via !== 'typed_email' || !check.email) {
    return NextResponse.json({ ok: true, skip: true }, { headers: noStore });
  }

  const sent = await sendEmail(admin, {
    templateId: 'claim_code',
    to: check.email,
    props: { code: makeClaimCode({ secret, token, email: check.email }) },
    trigger: 'claim_code_requested',
    recipientUserId: auth.user.id,
    actorUserId: auth.user.id,
  });
  if (!sent.ok) return NextResponse.json({ ok: false, reason: 'not_sent' }, { status: 502, headers: noStore });
  return NextResponse.json({ ok: true, skip: false, sentTo: check.email }, { headers: noStore });
}
