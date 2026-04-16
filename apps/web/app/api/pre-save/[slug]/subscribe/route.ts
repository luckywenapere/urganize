import { NextRequest, NextResponse } from 'next/server';
import { isValidEmail, normalizeEmail, type SubscribePreSaveBody } from '@/lib/pre-save';
import {
  PRE_SAVE_SUBSCRIBERS_TABLE,
  buildMissingSchemaResponse,
  checkPreSaveSubscribeRateLimit,
  createAdminClient,
  getCampaignStreamingLinks,
  getRequestIp,
  isOptionalTableMissingError,
  loadCampaignBySlug,
} from '../../_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const ipAddress = getRequestIp(request);
    const rateLimit = checkPreSaveSubscribeRateLimit(ipAddress);
    if (!rateLimit.ok) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please wait a minute and try again.',
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!supabaseUrl) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const adminClient = createAdminClient(supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const { slug } = await context.params;
    const normalizedSlug = String(slug || '').trim().toLowerCase();
    if (!normalizedSlug) {
      return NextResponse.json({ error: 'Slug is required.' }, { status: 400 });
    }

    const campaignResult = await loadCampaignBySlug(adminClient, normalizedSlug);
    if ('error' in campaignResult) {
      if (campaignResult.error.status === 501) {
        return buildMissingSchemaResponse();
      }

      return campaignResult.error;
    }

    if (!campaignResult.campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as SubscribePreSaveBody;
    const email = normalizeEmail(String(body.email || ''));
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    const existingResult = await adminClient
      .from(PRE_SAVE_SUBSCRIBERS_TABLE)
      .select('id')
      .eq('campaign_id', campaignResult.campaign.id)
      .ilike('email', email)
      .limit(1);

    if (existingResult.error) {
      if (isOptionalTableMissingError(existingResult.error)) {
        return buildMissingSchemaResponse();
      }

      return NextResponse.json(
        { error: existingResult.error.message || 'Could not save your subscription.' },
        { status: 500 }
      );
    }

    if ((existingResult.data || []).length > 0) {
      captureServerAnalyticsEvent(
        posthogServer,
        campaignResult.campaign.user_id,
        createPostHogEvent('presave_email_submitted', {
          campaign_id: campaignResult.campaign.id,
        })
      );

      return NextResponse.json({
        ok: true,
        streamingLinks: getCampaignStreamingLinks(campaignResult.campaign),
      });
    }

    const insertResult = await adminClient
      .from(PRE_SAVE_SUBSCRIBERS_TABLE)
      .insert({
        campaign_id: campaignResult.campaign.id,
        email,
      })
      .select('id')
      .maybeSingle();

    if (insertResult.error) {
      if (isOptionalTableMissingError(insertResult.error)) {
        return buildMissingSchemaResponse();
      }

      if (String(insertResult.error.code || '').toUpperCase() === '23505') {
        captureServerAnalyticsEvent(
          posthogServer,
          campaignResult.campaign.user_id,
          createPostHogEvent('presave_email_submitted', {
            campaign_id: campaignResult.campaign.id,
          })
        );

        return NextResponse.json({
          ok: true,
          streamingLinks: getCampaignStreamingLinks(campaignResult.campaign),
        });
      }

      return NextResponse.json(
        { error: insertResult.error.message || 'Could not save your subscription.' },
        { status: 500 }
      );
    }

    captureServerAnalyticsEvent(
      posthogServer,
      campaignResult.campaign.user_id,
      createPostHogEvent('presave_email_submitted', {
        campaign_id: campaignResult.campaign.id,
      })
    );

    return NextResponse.json({
      ok: true,
      streamingLinks: getCampaignStreamingLinks(campaignResult.campaign),
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
