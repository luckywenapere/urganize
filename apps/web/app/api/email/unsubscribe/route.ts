import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { addSuppression } from '@/lib/email/suppression-server';
import { readUnsubscribeSecret, verifyUnsubscribeToken } from '@/lib/email/unsubscribe';

// Public and unauthenticated: the signed token in the link is the only access
// control, and all it can do is turn OFF optional mail for the address it names.
//
// Two callers share this route. A mail client's one-click unsubscribe (RFC 8058)
// POSTs `List-Unsubscribe=One-Click` here and expects a plain 2xx. Our own page
// posts a form that carries `redirect=1` and wants to land back on the page.
// Nothing changes on GET: mail scanners prefetch links, and a prefetch must not
// unsubscribe anybody.
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  const secret = readUnsubscribeSecret();
  const verified = secret ? verifyUnsubscribeToken(secret, token) : null;

  const form = await request.formData().catch(() => null);
  const wantsRedirect = form?.get('redirect') === '1';

  if (!verified) {
    return wantsRedirect
      ? NextResponse.redirect(new URL('/unsubscribe?error=1', request.url), 303)
      : NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  const saved = admin ? await addSuppression(admin, verified.email, verified.scope, 'unsubscribe') : false;

  if (wantsRedirect) {
    const target = new URL('/unsubscribe', request.url);
    target.searchParams.set('t', token ?? '');
    target.searchParams.set(saved ? 'done' : 'error', '1');
    return NextResponse.redirect(target, 303);
  }
  return saved
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
}
