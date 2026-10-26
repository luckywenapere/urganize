import { NextRequest, NextResponse } from 'next/server';
import { getTranscriptionConfig } from '@/lib/chappi/config';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { countBillingEventsSince, logBillingEvent } from '@/lib/billing-events-server';
import {
  VOICE_DAILY_CAP,
  parseTranscriptionSeconds,
  transcriptionMetadata,
  validateVoiceClip,
} from '@/lib/urgans-voice';
import { requestTranscription } from '@/lib/voice-transcribe-server';
import {
  createAdminClient,
  isNotesFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../../_shared';

// Bring your notes: turns one voice note into text. Same speech call, same
// per-team daily cap and the same billing event as UrgAns's dictation and the
// rollout ideas mic, so there is one abuse cap for all voice. Never charged in
// credits. The audio is streamed through and NEVER stored. The text goes back to
// the person to review; nothing is saved until they keep it.

const TRANSCRIBE_TIMEOUT_MS = 40_000;
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isNotesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const config = getTranscriptionConfig();
  if (!config) {
    return NextResponse.json({ error: "Voice isn't available right now. Type or paste it instead." }, { status: 503 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'An audio clip is required.' }, { status: 400 });
  }
  const validation = validateVoiceClip({ mimeType: file.type || '', size: file.size });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.tooLarge ? 413 : 400 });
  }

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (team.primaryWorkspaceId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const used = await countBillingEventsSince(adminClient, team.primaryWorkspaceId, 'urgans_voice_transcription', since);
    if (used >= VOICE_DAILY_CAP) {
      return NextResponse.json(
        { error: "You've used a lot of voice today. Try again tomorrow, or type instead." },
        { status: 429 }
      );
    }
  }

  const result = await requestTranscription({ config, file, hint: null, timeoutMs: TRANSCRIBE_TIMEOUT_MS });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  if (team.primaryWorkspaceId) {
    await logBillingEvent(adminClient, {
      workspaceId: team.primaryWorkspaceId,
      ownerUserId: team.ownerUserId,
      actorUserId: auth.user.id,
      type: 'urgans_voice_transcription',
      metadata: {
        ...transcriptionMetadata({
          model: config.model,
          bytes: file.size,
          mimeType: file.type || '',
          seconds: parseTranscriptionSeconds(result.rawBody),
        }),
        source: 'notes_import',
      },
    });
  }

  return NextResponse.json({ text: result.text });
}
