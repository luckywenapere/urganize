import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureReleaseOwnership } from '@/app/api/releases/_shared';
import { requirePaidAccess } from '../../_shared/paywall';
import { slugifySegment } from '@/lib/pre-save';
import {
  isAllowedAudioFile,
  parseDurationSeconds,
  parseTrackPosition,
  parseTrackWaveformPayload,
  sanitizeTrackTitle,
  TRACK_STORAGE_BUCKET,
} from '@/lib/tracks';
import {
  TRACKS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  createSignedTrackUrl,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  toTrack,
  type TrackRecord,
} from '../_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

function buildTrackStoragePath(userId: string, trackId: string, fileName: string): string {
  const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';
  const sanitizedExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const slugBase = slugifySegment(baseName) || 'track';

  return [userId, 'tracks', trackId, `${Date.now()}-${slugBase}${sanitizedExtension ? `.${sanitizedExtension}` : ''}`].join('/');
}

async function getNextTrackPosition(adminClient: ReturnType<typeof createAdminClient>, releaseId: string | null) {
  if (!adminClient || !releaseId) {
    return { position: 1 as const };
  }

  const { data, error } = await adminClient
    .from(TRACKS_TABLE)
    .select('position')
    .eq('release_id', releaseId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not determine track order.' },
        { status: 500 }
      ),
    };
  }

  return { position: Math.max(1, Number(data?.position || 0) + 1) };
}

export async function POST(request: NextRequest) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) {
      return auth.error;
    }

    const paywallResponse = await requirePaidAccess(auth.user.id, {
      feature: 'track_management',
      message: 'Upgrade required to upload tracks.',
    });
    if (paywallResponse) return paywallResponse;

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Upload form data is required.' }, { status: 400 });
    }

    const uploadFile = formData.get('file');
    if (!(uploadFile instanceof File)) {
      return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 });
    }

    if (!isAllowedAudioFile(uploadFile.name, uploadFile.type)) {
      return NextResponse.json(
        { error: 'Only .mp3, .wav, .aiff, and .flac files are supported.' },
        { status: 400 }
      );
    }

    const releaseId = String(formData.get('releaseId') || '').trim() || null;
    if (releaseId) {
      const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
      if ('error' in ownership) {
        return ownership.error;
      }
    }

    const parsedPosition = parseTrackPosition(formData.get('position'));
    let position = parsedPosition;
    if (!position) {
      const positionResult = await getNextTrackPosition(adminClient, releaseId);
      if ('error' in positionResult) {
        return positionResult.error;
      }

      position = positionResult.position;
    }

    const defaultTitle = uploadFile.name.replace(/\.[^.]+$/, '');
    const title = sanitizeTrackTitle(formData.get('title')) || sanitizeTrackTitle(defaultTitle);
    if (!title) {
      return NextResponse.json({ error: 'Track title is required.' }, { status: 400 });
    }

    const durationSeconds = parseDurationSeconds(formData.get('durationSeconds'));
    const waveformData = parseTrackWaveformPayload(formData.get('waveformData'));
    const trackId = randomUUID();
    const storagePath = buildTrackStoragePath(auth.user.id, trackId, uploadFile.name);
    const fileSize = Number(uploadFile.size || 0);
    const mimeType = String(uploadFile.type || 'audio/mpeg').trim() || 'audio/mpeg';
    const now = new Date().toISOString();

    const { error: insertError } = await adminClient
      .from(TRACKS_TABLE)
      .insert({
        id: trackId,
        release_id: releaseId,
        user_id: auth.user.id,
        title,
        file_url: storagePath,
        file_size: fileSize,
        duration_seconds: durationSeconds,
        mime_type: mimeType,
        waveform_data: waveformData,
        status: 'processing',
        position,
        created_at: now,
        updated_at: now,
      });

    if (insertError) {
      if (isOptionalTableMissingError(insertError)) {
        return buildMissingSchemaResponse();
      }

      return NextResponse.json({ error: insertError.message || 'Could not create track.' }, { status: 500 });
    }

    const fileBuffer = Buffer.from(await uploadFile.arrayBuffer());
    const uploadResult = await adminClient.storage
      .from(TRACK_STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: '3600',
      });

    if (uploadResult.error) {
      await adminClient
        .from(TRACKS_TABLE)
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', trackId)
        .eq('user_id', auth.user.id);

      return NextResponse.json(
        { error: uploadResult.error.message || 'Could not upload track audio.' },
        { status: 500 }
      );
    }

    const updateResult = await adminClient
      .from(TRACKS_TABLE)
      .update({
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', trackId)
      .eq('user_id', auth.user.id)
      .select('id,release_id,user_id,title,file_url,file_size,duration_seconds,mime_type,waveform_data,status,position,created_at,updated_at')
      .single();

    if (updateResult.error || !updateResult.data) {
      if (isOptionalTableMissingError(updateResult.error)) {
        return buildMissingSchemaResponse();
      }

      return NextResponse.json(
        { error: updateResult.error?.message || 'Could not finalize track upload.' },
        { status: 500 }
      );
    }

    const signedResult = await createSignedTrackUrl(adminClient, storagePath);
    if ('error' in signedResult) {
      return signedResult.error;
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('track_upload_completed', {
        release_id: releaseId,
        track_id: trackId,
        duration_seconds: durationSeconds,
      })
    );

    return NextResponse.json(
      {
        trackId,
        track: toTrack(updateResult.data as TrackRecord, signedResult.signedUrl),
      },
      { status: 201 }
    );
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
