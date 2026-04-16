import { NextRequest, NextResponse } from 'next/server';
import {
  SHARE_LINKS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  ensureShareLinkOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  toShareLink,
  type ShareLinkRecord,
} from '../../../tracks/_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) {
      return auth.error;
    }

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const { id } = await context.params;
    const shareLinkId = String(id || '').trim();
    if (!shareLinkId) {
      return NextResponse.json({ error: 'Share link id is required.' }, { status: 400 });
    }

    const ownership = await ensureShareLinkOwnership(adminClient, shareLinkId, auth.user.id);
    if ('error' in ownership) {
      return ownership.error;
    }

    const updateResult = await adminClient
      .from(SHARE_LINKS_TABLE)
      .update({ is_revoked: true })
      .eq('id', ownership.shareLink.id)
      .eq('user_id', auth.user.id)
      .select('id,track_id,user_id,token,label,expires_at,play_count,is_revoked,created_at')
      .single();

    if (updateResult.error || !updateResult.data) {
      if (isOptionalTableMissingError(updateResult.error)) {
        return buildMissingSchemaResponse();
      }

      return NextResponse.json(
        { error: updateResult.error?.message || 'Could not revoke share link.' },
        { status: 500 }
      );
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('track_share_link_revoked', {
        track_id: ownership.shareLink.track_id,
      })
    );

    return NextResponse.json({
      shareLink: toShareLink(updateResult.data as ShareLinkRecord, request.nextUrl.origin),
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
