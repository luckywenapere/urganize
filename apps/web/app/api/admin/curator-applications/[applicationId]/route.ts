import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/app/api/admin/_shared';
import {
  createAdminClient,
  flagOffResponse,
  isPitchingFeatureEnabled,
} from '@/app/api/curator/_shared';
import { buildCuratorJoinUrl } from '@/lib/tasks-server';
import { CURATOR_INVITE_TTL_DAYS } from '@/lib/curator-invites';
import { playlistDisplayName } from '@/lib/curator-applications';
import {
  CURATOR_APPLICATIONS_TABLE,
  CURATOR_APPLICATION_COLUMNS,
  mintCuratorInvite,
  toCuratorApplication,
} from '@/lib/curator-applications-server';
import { isEmailConfigured, sendEmail } from '@/lib/email';

// POST /api/admin/curator-applications/<id>  { action: 'approve' | 'decline' }
//
// Approve mints the existing single-use curator invite (lib/curator-invites.ts
// through mintCuratorInvite), marks the application approved and links the
// invite, in a conditional update (where status = 'new') so two admins cannot
// both approve and mint two links. The loser's invite is turned off at once.
// Then, when the contact is an email and email is set up, the invite goes out
// (template curator_application_approved). The reply always carries the link,
// so a WhatsApp contact (or a failed send) gets it copied by hand.
//
// Decline only marks it declined. Nothing is sent.

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> }
) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const { applicationId } = await context.params;
  if (!applicationId || !/^[0-9a-f-]{36}$/i.test(applicationId)) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  const payload = (await request.json().catch(() => ({}))) as { action?: unknown };
  const action = payload.action;
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: 'Choose approve or decline.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const client = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!client) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data: found, error: loadError } = await client
    .from(CURATOR_APPLICATIONS_TABLE)
    .select(CURATOR_APPLICATION_COLUMNS)
    .eq('id', applicationId)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: loadError.message || 'Could not load the application.' }, { status: 500 });
  }
  if (!found) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  const current = toCuratorApplication(found as unknown as Record<string, unknown>);
  if (current.status !== 'new') {
    return NextResponse.json(
      { error: current.status === 'approved' ? 'Already approved.' : 'Already declined.' },
      { status: 409 }
    );
  }

  const reviewedAt = new Date().toISOString();

  if (action === 'decline') {
    const { data, error } = await client
      .from(CURATOR_APPLICATIONS_TABLE)
      .update({ status: 'declined', reviewed_by: admin.userId, reviewed_at: reviewedAt })
      .eq('id', applicationId)
      .eq('status', 'new')
      .select(CURATOR_APPLICATION_COLUMNS)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message || 'Could not decline.' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Someone already answered this one.' }, { status: 409 });
    return NextResponse.json({ application: toCuratorApplication(data as unknown as Record<string, unknown>) });
  }

  const invite = await mintCuratorInvite(client, admin.userId);
  if ('error' in invite) {
    return NextResponse.json({ error: invite.error }, { status: 500 });
  }
  const inviteUrl = buildCuratorJoinUrl(invite.code);

  const { data: updated, error: updateError } = await client
    .from(CURATOR_APPLICATIONS_TABLE)
    .update({ status: 'approved', invite_id: invite.id, reviewed_by: admin.userId, reviewed_at: reviewedAt })
    .eq('id', applicationId)
    .eq('status', 'new')
    .select(CURATOR_APPLICATION_COLUMNS)
    .maybeSingle();

  if (updateError || !updated) {
    // Lost the race, or the write failed: the link just minted must not stay open.
    await client.from('curator_invites').update({ revoked_at: reviewedAt }).eq('id', invite.id);
    return NextResponse.json(
      { error: updateError?.message || 'Someone already answered this one.' },
      { status: updateError ? 500 : 409 }
    );
  }

  const application = toCuratorApplication(
    updated as unknown as Record<string, unknown>,
    new Map([[invite.id, inviteUrl]])
  );

  let emailed = false;
  if (application.contactKind === 'email' && isEmailConfigured()) {
    const send = await sendEmail(client, {
      templateId: 'curator_application_approved',
      to: application.contact,
      trigger: 'curator_application_approved',
      actorUserId: admin.userId,
      props: {
        playlistName: playlistDisplayName(application),
        inviteUrl,
        expiresInDays: CURATOR_INVITE_TTL_DAYS,
      },
    });
    emailed = send.ok && !send.skipped;
    if (!send.ok) console.error('[curator-applications] invite email failed', send.reason ?? send.error ?? 'error');
  }

  return NextResponse.json({ application, inviteUrl, emailed });
}
