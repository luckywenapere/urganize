import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { requireUrgansAccess } from '@/app/api/_shared/urgans-access';
import { getTranscriptionConfig, isChappiEnabled, isUrgansVoiceEnabled } from '@/lib/chappi/config';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { countBillingEventsSince, logBillingEvent } from '@/lib/billing-events-server';
import { VOICE_DAILY_CAP, parseTranscription, validateVoiceClip } from '@/lib/urgans-voice';

// Proxy a short voice clip to the speech model and return the transcript. The
// browser records it (components/chappi/useVoiceInput.ts) and drops the result
// into the message box for the person to read, fix and send — nothing is sent
// automatically, and the audio is streamed through and NEVER stored.
//
// This is a second access path to RodiumAi, the same gateway UrgAns already
// uses (founder call: one vendor). Speaking is NOT metered against the monthly
// UrgAns action ceiling — only the send that follows is, exactly as typing is —
// so this route never calls recordUrgansAction or checkUrgansAllowance. A
// per-team daily cap (VOICE_DAILY_CAP) is the only guard, and it fails open.

// One attempt, no retry — re-uploading the clip doubles the worst case for
// little gain (the predict-genre precedent). maxDuration 60 is the Hobby-plan
// ceiling, so the 30s upstream budget plus auth/DB pre-work fits with slack.
const TRANSCRIBE_TIMEOUT_MS = 30_000;
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Flag check before auth: the surface stays dark unless BOTH the assistant
  // and voice are switched on. 404 with this exact body so a direct call can't
  // reach the model through us (the plan/EPK precedent).
  if (!isChappiEnabled() || !isUrgansVoiceEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireUrgansAccess(request);
  if ('error' in auth) return auth.error;

  const config = getTranscriptionConfig();
  if (!config) {
    return NextResponse.json({ error: "Voice isn't available right now." }, { status: 503 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Audio form data is required.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'An audio clip is required.' }, { status: 400 });
  }

  const validation = validateVoiceClip({ mimeType: file.type || '', size: file.size });
  if (!validation.ok) {
    // 413 for size (Vercel itself 413s past ~4.5 MB before this runs), 400 for
    // type or an empty clip.
    return NextResponse.json({ error: validation.error }, { status: validation.tooLarge ? 413 : 400 });
  }

  // Per-team daily cap, purely an abuse guard. Fails OPEN on an unreadable
  // count (the countBillingEventsSince contract), like every other counter
  // here — wrongly refusing a real recording is worse than allowing one more.
  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (team.primaryWorkspaceId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const used = await countBillingEventsSince(
      adminClient,
      team.primaryWorkspaceId,
      'urgans_voice_transcription',
      since
    );
    if (used >= VOICE_DAILY_CAP) {
      return NextResponse.json(
        { error: "You've used a lot of voice today. Try again tomorrow, or type instead." },
        { status: 429 }
      );
    }
  }

  const hint = formData.get('hint');

  // Forward as multipart, the OpenAI transcription shape. Never set
  // Content-Type by hand — fetch derives the boundary from the FormData body.
  const upstreamForm = new FormData();
  upstreamForm.append('file', file, file.name || 'audio');
  upstreamForm.append('model', config.model);
  upstreamForm.append('language', 'en');
  upstreamForm.append('response_format', 'json');
  if (typeof hint === 'string' && hint.trim()) {
    upstreamForm.append('prompt', hint.trim());
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(`${config.baseURL}/audio/transcriptions`, {
      method: 'POST',
      body: upstreamForm,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  } catch (error) {
    const isAbort = (error as { name?: string } | null)?.name === 'AbortError';
    if (isAbort) {
      return NextResponse.json({ error: 'That took too long. Try a shorter clip.' }, { status: 504 });
    }
    return NextResponse.json(
      { error: 'Voice is unreachable right now. Try again in a moment.' },
      { status: 503 }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    if (upstream.status === 429) {
      return NextResponse.json(
        { error: 'Voice is busy right now. Try again in a moment.' },
        { status: 503 }
      );
    }
    console.error(`[urgans-transcribe] Upstream returned ${upstream.status}.`);
    return NextResponse.json(
      { error: 'Voice hit an error. Try again later, or type instead.' },
      { status: 502 }
    );
  }

  const rawText = await upstream.text().catch(() => '');
  let rawBody: unknown = rawText;
  try {
    rawBody = JSON.parse(rawText);
  } catch {
    // Leave rawBody as the raw string — parseTranscription handles a bare string.
  }

  const text = parseTranscription(rawBody);
  if (!text) {
    return NextResponse.json({ error: "Didn't catch that. Try again." }, { status: 422 });
  }

  // Record AFTER success, for the daily cap and founder visibility. Never
  // throws (logBillingEvent swallows its own failures), so a lost count can't
  // fail a transcript the person already spoke.
  if (team.primaryWorkspaceId) {
    await logBillingEvent(adminClient, {
      workspaceId: team.primaryWorkspaceId,
      ownerUserId: team.ownerUserId,
      actorUserId: auth.user.id,
      type: 'urgans_voice_transcription',
    });
  }

  return NextResponse.json({ text });
}
