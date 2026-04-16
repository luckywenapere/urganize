import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../../../_shared/paywall';
import {
  parseShareLinkExpiry,
  sanitizeShareLinkLabel,
  type CreateShareLinkBody,
} from '@/lib/tracks';
import {
  SHARE_LINKS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  ensureTrackOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadShareLinksForTrack,
  toShareLink,
  type ShareLinkRecord,
} from '../../_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

async function createUniqueShareToken(adminClient: ReturnType<typeof createAdminClient>) {
  if (!adminClient) {
    throw new Error('Server environment is not configured');
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomBytes(32).toString('hex');
    const { data, error } = await adminClient
      .from(SHARE_LINKS_TABLE)
      .select('id')
      .eq('token', token)
      .maybeSingle();

    if (error && !isOptionalTableMissingError(error)) {
      throw new Error(error.message || 'Could not validate share token uniqueness.');
    }

    if (!data) {
      return token;
    }
  }

  throw new Error('Could not create a unique share token.');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id } = await context.params;
  const trackId = String(id || '').trim();
  if (!trackId) {
    return NextResponse.json({ error: 'Track id is required.' }, { status: 400 });
  }

  const ownership = await ensureTrackOwnership(adminClient, trackId, auth.user.id);
  if ('error' in ownership) {
    return ownership.error;
  }

  const shareLinksResult = await loadShareLinksForTrack(adminClient, ownership.track.id, request.nextUrl.origin);
  if ('error' in shareLinksResult) {
    return shareLinksResult.error;
  }

  return NextResponse.json({
    shareLinks: shareLinksResult.shareLinks,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) {
      return auth.error;
    }

    const paywallResponse = await requirePaidAccess(auth.user.id, {
      feature: 'private_share_links',
      message: 'Upgrade required to create private share links.',
    });
    if (paywallResponse) return paywallResponse;

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const { id } = await context.params;
    const trackId = String(id || '').trim();
    if (!trackId) {
      return NextResponse.json({ error: 'Track id is required.' }, { status: 400 });
    }

    const ownership = await ensureTrackOwnership(adminClient, trackId, auth.user.id);
    if ('error' in ownership) {
      return ownership.error;
    }

    const body = (await request.json().catch(() => ({}))) as CreateShareLinkBody;
    const label = sanitizeShareLinkLabel(body.label);
    const expiryResult = parseShareLinkExpiry(body.expiresAt);
    if (expiryResult.error) {
      return NextResponse.json({ error: expiryResult.error }, { status: 400 });
    }

    let token = '';
    try {
      token = await createUniqueShareToken(adminClient);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Could not generate share token.' },
        { status: 500 }
      );
    }

    const insertResult = await adminClient
      .from(SHARE_LINKS_TABLE)
      .insert({
        track_id: ownership.track.id,
        user_id: auth.user.id,
        token,
        label,
        expires_at: expiryResult.value,
        play_count: 0,
        is_revoked: false,
        created_at: new Date().toISOString(),
      })
      .select('id,track_id,user_id,token,label,expires_at,play_count,is_revoked,created_at')
      .single();

    if (insertResult.error || !insertResult.data) {
      if (isOptionalTableMissingError(insertResult.error)) {
        return buildMissingSchemaResponse();
      }

      return NextResponse.json(
        { error: insertResult.error?.message || 'Could not create share link.' },
        { status: 500 }
      );
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('track_share_link_created', {
        track_id: ownership.track.id,
        has_expiry: Boolean(expiryResult.value),
      })
    );

    return NextResponse.json(
      {
        shareLink: toShareLink(insertResult.data as ShareLinkRecord, request.nextUrl.origin),
      },
      { status: 201 }
    );
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
