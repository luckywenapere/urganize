import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../_shared';
import { resolveAudienceFromBody } from '../_compose';

/**
 * POST /api/admin/emails/audience — who an email would go to, before it is
 * sent: how many people, how many are left out because they unsubscribed, and
 * the first few names so the founder can see it is the right list.
 *
 * Admin only (ADMIN_EMAILS). Reads, never writes.
 */
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as { audience?: unknown } | null;
  const { parsed, resolved } = await resolveAudienceFromBody(admin.supabaseAdmin, body?.audience);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!resolved || !resolved.ok) {
    return NextResponse.json({ error: resolved?.error || 'Could not work out who this goes to.' }, { status: 500 });
  }

  return NextResponse.json({
    label: resolved.label,
    count: resolved.recipients.length,
    suppressedCount: resolved.suppressedCount,
    invalidCount: resolved.invalidCount,
    sample: resolved.recipients.slice(0, 5).map((recipient) => ({ email: recipient.email, name: recipient.name })),
  });
}
