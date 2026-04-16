import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../../_shared/paywall';
import {
  STREAMING_PLATFORMS,
  isValidHttpUrl,
  normalizeStreamingLinks,
  sanitizeTextField,
  type CreatePreSaveCampaignBody,
} from '@/lib/pre-save';
import {
  PRE_SAVE_CAMPAIGNS_TABLE,
  PRE_SAVE_SUBSCRIBERS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  generateUniqueCampaignSlug,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadOwnedReleaseOption,
  loadReleaseOptionsByIds,
  toPreSaveCampaign,
  type PreSaveCampaignRecord,
} from '../_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

function findInvalidStreamingLink(
  links: Record<string, unknown> | null | undefined
): string | null {
  if (!links) {
    return null;
  }

  for (const platform of STREAMING_PLATFORMS) {
    const rawValue = links[platform.key];
    if (typeof rawValue !== 'string') {
      continue;
    }

    const trimmedValue = rawValue.trim();
    if (!trimmedValue) {
      continue;
    }

    if (!isValidHttpUrl(trimmedValue)) {
      return `${platform.label} link must be a valid URL.`;
    }
  }

  return null;
}

async function loadSubscriberCounts(
  adminClient: ReturnType<typeof createAdminClient>,
  campaignIds: string[]
): Promise<{ counts: Map<string, number> } | { error: NextResponse }> {
  if (campaignIds.length === 0) {
    return { counts: new Map<string, number>() };
  }

  const { data, error } = await adminClient!
    .from(PRE_SAVE_SUBSCRIBERS_TABLE)
    .select('campaign_id')
    .in('campaign_id', campaignIds);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load campaign subscribers.' },
        { status: 500 }
      ),
    };
  }

  const counts = new Map<string, number>();
  for (const row of data || []) {
    const campaignId = String((row as { campaign_id?: string }).campaign_id || '');
    if (!campaignId) {
      continue;
    }

    counts.set(campaignId, (counts.get(campaignId) || 0) + 1);
  }

  return { counts };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error } = await adminClient
    .from(PRE_SAVE_CAMPAIGNS_TABLE)
    .select('id,user_id,slug,artist_name,release_id,release_title,release_date,cover_art_url,streaming_links,created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return buildMissingSchemaResponse();
    }

    return NextResponse.json({ error: error.message || 'Could not load campaigns.' }, { status: 500 });
  }

  const campaignRows = Array.isArray(data) ? (data as PreSaveCampaignRecord[]) : [];
  const linkedReleaseResult = await loadReleaseOptionsByIds(
    adminClient,
    campaignRows.map((campaign) => campaign.release_id || '').filter(Boolean)
  );
  if ('error' in linkedReleaseResult) {
    return linkedReleaseResult.error;
  }

  const countsResult = await loadSubscriberCounts(
    adminClient,
    campaignRows.map((campaign) => campaign.id)
  );
  if ('error' in countsResult) {
    return countsResult.error;
  }

  const campaigns = campaignRows.map((campaign) =>
    toPreSaveCampaign(
      campaign,
      countsResult.counts.get(campaign.id) || 0,
      linkedReleaseResult.optionsById.get(campaign.release_id || '')
    )
  );

  return NextResponse.json({ campaigns });
}

export async function POST(request: NextRequest) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const paywallResponse = await requirePaidAccess(auth.user.id, {
      feature: 'presave_campaigns',
      message: 'Upgrade required to create pre-save campaigns.',
    });
    if (paywallResponse) return paywallResponse;

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const body = (await request.json().catch(() => ({}))) as CreatePreSaveCampaignBody;
    const requestedArtistName = sanitizeTextField(String(body.artistName || ''), 120);
    const releaseId = sanitizeTextField(String(body.releaseId || ''), 80);
    if (!releaseId) {
      return NextResponse.json({ error: 'Release selection is required.' }, { status: 400 });
    }

    const invalidStreamingLinkError = findInvalidStreamingLink(body.streamingLinks || null);
    if (invalidStreamingLinkError) {
      return NextResponse.json({ error: invalidStreamingLinkError }, { status: 400 });
    }

    const streamingLinks = normalizeStreamingLinks(body.streamingLinks);
    const releaseResult = await loadOwnedReleaseOption(adminClient, releaseId, auth.user.id);
    if ('error' in releaseResult) {
      return releaseResult.error;
    }

    if (!releaseResult.release) {
      return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
    }

    const artistName = requestedArtistName || sanitizeTextField(releaseResult.release.artistName, 120);
    if (!artistName) {
      return NextResponse.json({ error: 'Artist name is required.' }, { status: 400 });
    }

    const releaseTitle = sanitizeTextField(releaseResult.release.title, 140);
    if (!releaseTitle) {
      return NextResponse.json({ error: 'Release title is required.' }, { status: 400 });
    }

    if (releaseResult.release.coverArtUrl && !isValidHttpUrl(releaseResult.release.coverArtUrl)) {
      return NextResponse.json({ error: 'Linked cover art URL is invalid.' }, { status: 400 });
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = await generateUniqueCampaignSlug(adminClient, artistName, releaseTitle);
      const { data, error } = await adminClient
        .from(PRE_SAVE_CAMPAIGNS_TABLE)
        .insert({
          user_id: auth.user.id,
          slug,
          artist_name: artistName,
          release_id: releaseResult.release.id,
          release_title: releaseTitle,
          release_date: releaseResult.release.releaseDate,
          cover_art_url: releaseResult.release.coverArtUrl,
          streaming_links: streamingLinks,
        })
        .select('id,user_id,slug,artist_name,release_id,release_title,release_date,cover_art_url,streaming_links,created_at')
        .single();

      if (!error && data) {
        captureServerAnalyticsEvent(
          posthogServer,
          auth.user.id,
          createPostHogEvent('presave_campaign_created', {
            campaign_id: String(data.id || ''),
            has_cover_art: Boolean(releaseResult.release.coverArtUrl),
            has_streaming_links: Object.values(streamingLinks).some(Boolean),
          })
        );

        return NextResponse.json(
          { campaign: toPreSaveCampaign(data as PreSaveCampaignRecord, 0, releaseResult.release) },
          { status: 201 }
        );
      }

      if (error && isOptionalTableMissingError(error)) {
        return buildMissingSchemaResponse();
      }

      if (String(error?.code || '').toUpperCase() === '23505') {
        continue;
      }

      return NextResponse.json({ error: error?.message || 'Could not create campaign.' }, { status: 500 });
    }

    return NextResponse.json({ error: 'Could not generate a unique pre-save link.' }, { status: 500 });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
