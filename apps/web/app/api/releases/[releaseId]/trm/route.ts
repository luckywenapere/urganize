import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamReadAccess, ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import {
  canSendToTrm,
  completeMaster,
  loadTrmPayload,
  prepareTrmDraft,
  presignMaster,
  recordTrmInterest,
  refreshFromTrm,
  saveTrmSettings,
  submitToTrm,
  type TrmResult,
} from '@/lib/trm/server';

/**
 * Send to TRM (URG-392). GET: what the Distribute step shows (TRM's checklist,
 * the submission and its status, fix rows). POST { action }: one step of the
 * send. Every step re-checks on the server; nothing the browser says about
 * readiness is trusted. Any team member may send, a guest is read-only, a
 * non-member gets the existence-hiding 404.
 *
 * Actions: settings (artist TRM email, rights & policies), interest (not on the
 * allowlist: remember the press, call nobody), prepare (draft + cover art),
 * presign_master / complete_master (the browser PUTs the master straight to
 * TRM's storage between them), submit, refresh (poll TRM when a webhook is late).
 */

export const dynamic = 'force-dynamic';

const reply = (result: TrmResult<unknown>) =>
  result.ok
    ? NextResponse.json({ ok: true, ...(result.data as object) })
    : NextResponse.json({ error: result.error, code: result.code }, { status: result.status });

export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const { releaseId } = await context.params;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  const access = await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;
  const payload = await loadTrmPayload(admin, releaseId, { id: auth.user.id, email: auth.user.email ?? null });
  if (!payload) return NextResponse.json({ error: 'Could not check this rollout. Try again.' }, { status: 500 });
  return NextResponse.json({ trm: payload });
}

export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const { releaseId } = await context.params;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const actor = { id: auth.user.id, email: auth.user.email ?? null };

  switch (body.action) {
    case 'settings':
      return reply(await saveTrmSettings(admin, releaseId, actor, { artistEmail: body.artistEmail, settings: body.settings }));
    case 'interest':
      if (canSendToTrm(actor.email)) return NextResponse.json({ ok: true, open: true });
      return reply(await recordTrmInterest(admin, releaseId, actor, access.release.ownerUserId));
    case 'prepare':
      return reply(await prepareTrmDraft(admin, releaseId, actor, { artistEmail: body.artistEmail, termsAccepted: body.termsAccepted }));
    case 'presign_master':
      return reply(
        await presignMaster(admin, releaseId, actor, {
          fileName: body.fileName,
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes,
          sha256: body.sha256,
        })
      );
    case 'complete_master':
      return reply(await completeMaster(admin, releaseId, actor, { assetId: body.assetId, fileName: body.fileName }));
    case 'submit':
      return reply(await submitToTrm(admin, releaseId, actor));
    case 'refresh':
      return reply(await refreshFromTrm(admin, releaseId));
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}
