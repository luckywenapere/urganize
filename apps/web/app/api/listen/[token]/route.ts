import { NextRequest, NextResponse } from 'next/server';
import {
  SHARE_LINKS_TABLE,
  checkTrackListenRateLimit,
  createAdminClient,
  getRequestIp,
  getSupabaseUrl,
  loadTrackByShareToken,
} from '@/app/api/tracks/_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const ipAddress = getRequestIp(request);
    const rateLimit = checkTrackListenRateLimit(ipAddress);
    if (!rateLimit.ok) {
      return NextResponse.json(
        {
          error: 'Too many listen requests. Please wait a moment and try again.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const { token } = await context.params;
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) {
      return NextResponse.json({ error: 'Listen token is required.' }, { status: 400 });
    }

    const supabaseUrl = getSupabaseUrl();
    if (!supabaseUrl) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const adminClient = createAdminClient(supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const listenResult = await loadTrackByShareToken(adminClient, normalizedToken, request.nextUrl.origin);
    if ('error' in listenResult) {
      return listenResult.error;
    }

    const updateResult = await adminClient
      .from(SHARE_LINKS_TABLE)
      .update({ play_count: listenResult.shareLink.play_count + 1 })
      .eq('id', listenResult.shareLink.id)
      .eq('token', normalizedToken);

    if (updateResult.error) {
      return NextResponse.json(
        { error: updateResult.error.message || 'Could not record this listen.' },
        { status: 500 }
      );
    }

    captureServerAnalyticsEvent(
      posthogServer,
      listenResult.shareLink.user_id,
      createPostHogEvent('track_listen_page_opened', {
        token: normalizedToken,
      })
    );

    return NextResponse.json(
      {
        data: listenResult.data,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
