import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../_shared';
import { renderEmailPreview } from '@/lib/email/preview';
import { parseEmailToShow } from '../_draft';

/**
 * POST /api/admin/emails/preview — the email exactly as it will be sent,
 * rendered by the same template, for the composer and the sequence page to show
 * in a frame. Uses "Ada" as the name so the greeting is visible.
 *
 * Admin only (ADMIN_EMAILS). Sends nothing.
 */
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const parsed = parseEmailToShow(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const email = parsed.email;
  const rendered =
    email.kind === 'sequence'
      ? await renderEmailPreview('onboarding_step', { step: email.step, recipientName: 'Ada' })
      : await renderEmailPreview('announcement', {
          subject: email.subject,
          body: email.body,
          recipientName: 'Ada',
          includeGreeting: email.includeGreeting,
          signOff: email.signOff,
        });

  if ('error' in rendered) return NextResponse.json({ error: rendered.error }, { status: 500 });
  return NextResponse.json({ subject: rendered.subject, html: rendered.html });
}
