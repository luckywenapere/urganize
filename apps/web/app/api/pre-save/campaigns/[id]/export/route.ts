import { NextRequest, NextResponse } from 'next/server';
import { escapeCsvValue } from '@/lib/pre-save';
import {
  PRE_SAVE_SUBSCRIBERS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  ensureCampaignOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
} from '../../../_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Campaign id is required.' }, { status: 400 });
    }

    const ownership = await ensureCampaignOwnership(adminClient, id, auth.user.id);
    if ('error' in ownership) {
      return ownership.error;
    }

    const { data, error } = await adminClient
      .from(PRE_SAVE_SUBSCRIBERS_TABLE)
      .select('email,subscribed_at')
      .eq('campaign_id', id)
      .order('subscribed_at', { ascending: false });

    if (error) {
      if (isOptionalTableMissingError(error)) {
        return buildMissingSchemaResponse();
      }

      return NextResponse.json({ error: error.message || 'Could not export subscribers.' }, { status: 500 });
    }

    const rows = data || [];
    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('presave_csv_exported', {
        campaign_id: id,
        subscriber_count: rows.length,
      })
    );

    const header = ['email', 'subscribed_at'];
    const lines = rows.map((row) =>
      [
        escapeCsvValue(String((row as { email?: string }).email || '')),
        escapeCsvValue(String((row as { subscribed_at?: string }).subscribed_at || '')),
      ].join(',')
    );

    return new NextResponse([header.join(','), ...lines].join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="subscribers-${ownership.campaign.slug}.csv"`,
      },
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
