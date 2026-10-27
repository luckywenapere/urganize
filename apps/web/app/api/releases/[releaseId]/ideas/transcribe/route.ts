import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getTranscriptionConfig } from '@/lib/chappi/config';
import { ideaAudioPrefix, isIdeaRoundEnabled } from '@/lib/idea-round';
import { storeIdeaAudio } from '@/lib/idea-round-server';
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
  ensureReleaseTeamWriteAccess,
  ideasEnabled,
  notFoundResponse,
  requireActiveAuthenticatedUser,
} from '../_shared';

// The Ideas card's mic (2026-10-26). UrgAns's own transcribe route stays dark
// behind the cut voice flag, so this one is gated by the ideas flag and by
// write access to the rollout instead. Same speech call
// (lib/voice-transcribe-server.ts), same per-team daily cap and the same
// billing event, so dictation here and in UrgAns share one abuse cap. Never
// charged in credits. Since the idea round (2026-10-27) the clip is KEPT in the
// private release-assets bucket under ideas/<release>/<user>/ and its path is
// returned for the note to claim; a failed store still returns the words.

const TRANSCRIBE_TIMEOUT_MS = 30_000;
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!ideasEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const config = getTranscriptionConfig();
  if (!config) {
    return NextResponse.json({ error: "Voice isn't available right now. Type it instead." }, { status: 503 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'An audio clip is required.' }, { status: 400 });
  }
  const validation = validateVoiceClip({ mimeType: file.type || '', size: file.size });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.tooLarge ? 413 : 400 });
  }

  // The same per-team daily cap as UrgAns's dictation. Fails open.
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

  const hint = formData?.get('hint');
  const result = await requestTranscription({
    config,
    file,
    hint: typeof hint === 'string' ? hint : null,
    timeoutMs: TRANSCRIBE_TIMEOUT_MS,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const seconds = parseTranscriptionSeconds(result.rawBody);
  let audioPath: string | null = null;
  if (isIdeaRoundEnabled()) {
    const base = (file.type || '').split(';')[0];
    const extension = base.includes('mp4') ? 'mp4' : base.includes('ogg') ? 'ogg' : 'webm';
    audioPath = await storeIdeaAudio(adminClient, {
      path: `${ideaAudioPrefix(releaseId, auth.user.id)}${randomUUID()}.${extension}`,
      file,
    });
  }

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
          seconds,
        }),
        source: 'rollout_ideas',
      },
    });
  }

  return NextResponse.json({ text: result.text, audioPath, seconds });
}
