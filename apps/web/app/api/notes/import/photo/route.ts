import { NextRequest, NextResponse } from 'next/server';
import { countBillingEventsSince, logBillingEvent } from '@/lib/billing-events-server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { PHOTO_DAILY_CAP, validatePhoto } from '@/lib/note-import/photo';
import { isPhotoReadingConfigured, requestPhotoText } from '@/lib/note-import/photo-server';
import {
  createAdminClient,
  isNotesFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../../_shared';

// Bring your notes: reads one photo or screenshot and returns its text. The
// phone shrinks the picture first and sends one per request. It is streamed
// through and never stored. The text goes back to the person to review; nothing
// is saved until they keep it.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isNotesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  if (!isPhotoReadingConfigured()) {
    return NextResponse.json({ error: "Reading photos isn't available right now. Paste the text instead." }, { status: 503 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A photo is required.' }, { status: 400 });
  }
  const validation = validatePhoto({ mimeType: file.type || '', size: file.size });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.tooLarge ? 413 : 400 });
  }

  // Per-team daily cap, an abuse guard that fails open on an unreadable count.
  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (team.primaryWorkspaceId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const used = await countBillingEventsSince(adminClient, team.primaryWorkspaceId, 'notes_import_photo', since);
    if (used >= PHOTO_DAILY_CAP) {
      return NextResponse.json({ error: "You've read a lot of photos today. Try again tomorrow, or paste the text." }, { status: 429 });
    }
  }

  const result = await requestPhotoText({ bytes: await file.arrayBuffer(), mimeType: file.type });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  if (team.primaryWorkspaceId) {
    await logBillingEvent(adminClient, {
      workspaceId: team.primaryWorkspaceId,
      ownerUserId: team.ownerUserId,
      actorUserId: auth.user.id,
      type: 'notes_import_photo',
      metadata: { model: result.model, bytes: file.size },
    });
  }

  return NextResponse.json({ text: result.text });
}
