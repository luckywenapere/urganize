import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../_shared';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { parseEmailToShow } from '../_draft';

/**
 * POST /api/admin/emails/test — send the email to the admin's own address, with
 * "[Test]" in front of the subject, so it can be read in a real inbox before it
 * goes to anyone else. Goes through the real send path (log, unsubscribe link,
 * delivery webhook), which is the point of a test.
 *
 * Admin only (ADMIN_EMAILS). Only ever to the signed-in admin's own address.
 */
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email is not set up on this deployment.' }, { status: 503 });
  }

  const parsed = parseEmailToShow(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: profile } = await admin.supabaseAdmin
    .from('profiles')
    .select('name')
    .eq('id', admin.userId)
    .maybeSingle();
  const recipientName = String((profile as { name?: string | null } | null)?.name || '');

  const common = {
    to: admin.email,
    trigger: 'admin_test',
    recipientUserId: admin.userId,
    actorUserId: admin.userId,
    subjectPrefix: '[Test] ',
  };
  const email = parsed.email;
  const result =
    email.kind === 'sequence'
      ? await sendEmail(admin.supabaseAdmin, {
          ...common,
          templateId: 'onboarding_step',
          props: { step: email.step, recipientName },
        })
      : await sendEmail(admin.supabaseAdmin, {
          ...common,
          templateId: 'announcement',
          props: {
            subject: email.subject,
            body: email.body,
            recipientName,
            includeGreeting: email.includeGreeting,
            signOff: email.signOff,
          },
        });

  if (result.ok) return NextResponse.json({ ok: true, to: admin.email });
  if (result.reason === 'suppressed') {
    return NextResponse.json(
      { error: `${admin.email} is on the unsubscribed list, so the test was not sent.` },
      { status: 409 }
    );
  }
  return NextResponse.json({ error: result.error || 'The test email could not be sent.' }, { status: 502 });
}
