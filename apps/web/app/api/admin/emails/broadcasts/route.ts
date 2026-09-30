import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../_shared';
import { parseAnnouncementDraft } from '@/lib/email/announcement';
import { createBroadcast, listBroadcasts } from '@/lib/email/broadcast-server';
import { isEmailConfigured } from '@/lib/email';
import { readEmailConfig } from '@/lib/email/config';
import { budgetPayload, resolveAudienceFromBody } from '../_compose';

/**
 * /api/admin/emails/broadcasts — emails written in /admin/emails/new.
 *
 *   GET   the recent ones with their progress, and today's email limit.
 *   POST  save one and queue it for everyone in its audience. This sends
 *         nothing by itself: the page then calls ./[broadcastId]/send, and the
 *         morning cron finishes whatever the daily limit held back.
 *
 * Admin only (ADMIN_EMAILS). Not flag-gated, the /admin/teams precedent.
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const [list, budget] = await Promise.all([listBroadcasts(admin.supabaseAdmin), budgetPayload(admin.supabaseAdmin)]);
  return NextResponse.json({
    broadcasts: list.broadcasts,
    broadcastsError: list.error,
    budget,
    emailConfigured: isEmailConfigured(),
    // Shown on the composer so the founder knows who it comes from and where
    // replies land. It is the verified sender, not a secret.
    from: readEmailConfig()?.from ?? null,
    replyTo: readEmailConfig()?.replyTo ?? null,
  });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email is not set up on this deployment.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { audience?: unknown; draft?: unknown } | null;
  const draft = parseAnnouncementDraft(body?.draft);
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 });

  const { parsed, resolved } = await resolveAudienceFromBody(admin.supabaseAdmin, body?.audience);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!resolved || !resolved.ok) {
    return NextResponse.json({ error: resolved?.error || 'Could not work out who this goes to.' }, { status: 500 });
  }

  const created = await createBroadcast(admin.supabaseAdmin, {
    audience: parsed.audience,
    audienceLabel: resolved.label,
    draft: draft.draft,
    recipients: resolved.recipients,
    suppressedCount: resolved.suppressedCount,
    createdBy: admin.userId,
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 });

  return NextResponse.json({
    broadcastId: created.broadcastId,
    total: created.total,
    suppressedCount: resolved.suppressedCount,
  });
}
