import { NextRequest, NextResponse } from 'next/server';
import {
  buildMissingSchemaResponse,
  createAdminClient,
  loadCampaignBySlug,
  loadReleaseOptionsByIds,
  toPublicPreSaveCampaign,
} from '../_shared';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
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

  const result = await loadCampaignBySlug(adminClient, normalizedSlug);
  if ('error' in result) {
    if (result.error.status === 501) {
      return buildMissingSchemaResponse();
    }

    return result.error;
  }

  if (!result.campaign) {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  }

  const linkedReleaseResult = await loadReleaseOptionsByIds(
    adminClient,
    result.campaign.release_id ? [result.campaign.release_id] : []
  );
  if ('error' in linkedReleaseResult) {
    return linkedReleaseResult.error;
  }

  return NextResponse.json({
    campaign: toPublicPreSaveCampaign(
      result.campaign,
      linkedReleaseResult.optionsById.get(result.campaign.release_id || '')
    ),
  });
}
