import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseCommandCenterData,
  rebuildReleaseMetadataSnapshot,
} from '../_shared';
import { normalizeReleaseSlug } from '@/lib/release-ops';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

const trimString = (value: unknown): string => String(value || '').trim();
const TRACKS_TABLE = 'tracks';
const TASKS_TABLE = 'tasks';
const PRE_SAVE_CAMPAIGNS_TABLE = 'pre_save_campaigns';
const WORKSPACES_TABLE = 'workspaces';
const WORKSPACE_MEMBERS_TABLE = 'workspace_members';

type ReleaseSuggestedAction =
  | {
      type: 'add_task' | 'invite_team' | 'launch_pre_save';
      title: string;
      description: string;
      ctaLabel: string;
      href: string;
    }
  | {
      type: 'upload_track';
      title: string;
      description: string;
      ctaLabel: string;
      target: 'tracks';
    }
  | {
      type: 'none';
      title: '';
      description: '';
      ctaLabel: '';
    };

type ReleaseRetentionSummary = {
  taskCount: number;
  teamMemberCount: number;
  trackCount: number;
  preSaveCampaignCount: number;
  suggestedAction: ReleaseSuggestedAction;
};

const isMissingOptionalFeatureTable = (error: unknown) => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist')
  );
};

async function loadReleaseRetentionSummary(
  adminClient: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<ReleaseRetentionSummary> {
  const tasksResult = await adminClient.from(TASKS_TABLE).select('id').eq('release_id', releaseId);
  const tracksResult = await adminClient
    .from(TRACKS_TABLE)
    .select('id')
    .eq('release_id', releaseId)
    .eq('user_id', userId);

  const trackRows =
    !tracksResult.error && Array.isArray(tracksResult.data)
      ? tracksResult.data.map((row) => String(row.id || '')).filter(Boolean)
      : [];
  const trackCount = trackRows.length;
  const taskCount = !tasksResult.error && Array.isArray(tasksResult.data) ? tasksResult.data.length : 0;
  const preSaveResult = await adminClient
    .from(PRE_SAVE_CAMPAIGNS_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('release_id', releaseId);
  const workspaceResult = await adminClient
    .from(WORKSPACES_TABLE)
    .select('id')
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle();
  const teamMembersResult =
    workspaceResult.data?.id
      ? await adminClient
          .from(WORKSPACE_MEMBERS_TABLE)
          .select('id')
          .eq('workspace_id', workspaceResult.data.id)
          .neq('role', 'owner')
          .in('status', ['active', 'invited'])
      : { data: [], error: workspaceResult.error };

  const preSaveCampaignCount =
    !preSaveResult.error && Array.isArray(preSaveResult.data) ? preSaveResult.data.length : 0;
  const teamMemberCount =
    !teamMembersResult.error && Array.isArray(teamMembersResult.data) ? teamMembersResult.data.length : 0;

  if (tasksResult.error && !isMissingOptionalFeatureTable(tasksResult.error)) {
    throw new Error(tasksResult.error.message || 'Could not load release tasks.');
  }

  if (tracksResult.error && !isMissingOptionalFeatureTable(tracksResult.error)) {
    throw new Error(tracksResult.error.message || 'Could not load release tracks.');
  }

  if (workspaceResult.error && !isMissingOptionalFeatureTable(workspaceResult.error)) {
    throw new Error(workspaceResult.error.message || 'Could not load workspace.');
  }

  if (teamMembersResult.error && !isMissingOptionalFeatureTable(teamMembersResult.error)) {
    throw new Error(teamMembersResult.error.message || 'Could not load workspace members.');
  }

  if (preSaveResult.error && !isMissingOptionalFeatureTable(preSaveResult.error)) {
    throw new Error(preSaveResult.error.message || 'Could not load pre-save campaigns.');
  }

  if (taskCount === 0) {
    return {
      taskCount,
      teamMemberCount,
      trackCount,
      preSaveCampaignCount,
      suggestedAction: {
        type: 'add_task',
        title: 'Add your first task to stay on track',
        description: 'Tasks give the release a real plan instead of leaving important work floating in your head.',
        ctaLabel: 'Open tasks',
        href: `/dashboard/releases/${releaseId}/tasks`,
      },
    };
  }

  if (teamMemberCount === 0) {
    return {
      taskCount,
      teamMemberCount,
      trackCount,
      preSaveCampaignCount,
      suggestedAction: {
        type: 'invite_team',
        title: 'Invite your team to assign work',
        description: 'Bring managers, publicists, and collaborators into the workspace so the release stops depending on one person.',
        ctaLabel: 'Invite teammates',
        href: `/dashboard/settings/team?releaseId=${releaseId}`,
      },
    };
  }

  if (trackCount === 0) {
    return {
      taskCount,
      teamMemberCount,
      trackCount,
      preSaveCampaignCount,
      suggestedAction: {
        type: 'upload_track',
        title: 'Upload your first track',
        description: 'Tracks unlock private sharing and turn the release workspace into something your team can actually use.',
        ctaLabel: 'Go to tracks',
        target: 'tracks',
      },
    };
  }

  if (preSaveCampaignCount === 0) {
    return {
      taskCount,
      teamMemberCount,
      trackCount,
      preSaveCampaignCount,
      suggestedAction: {
        type: 'launch_pre_save',
        title: 'Start a pre-save campaign',
        description: 'A pre-save page gives this release a clear fan capture destination before launch day arrives.',
        ctaLabel: 'Open pre-save',
        href: `/dashboard/pre-save?releaseId=${releaseId}`,
      },
    };
  }

  return {
    taskCount,
    teamMemberCount,
    trackCount,
    preSaveCampaignCount,
    suggestedAction: {
      type: 'none',
      title: '',
      description: '',
      ctaLabel: '',
    },
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const commandCenter = await loadReleaseCommandCenterData(adminClient!, ownership.release);
  if ('error' in commandCenter) return commandCenter.error;
  let retentionSummary: ReleaseRetentionSummary;

  try {
    retentionSummary = await loadReleaseRetentionSummary(adminClient!, releaseId, auth.user.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load release retention state.' },
      { status: 500 }
    );
  }

  const computedStatus = commandCenter.readiness.readyForDistribution
    ? 'ready'
    : commandCenter.collaborators.length > 0
      ? 'in_progress'
      : 'draft';

  return NextResponse.json({
    release: {
      ...ownership.release,
      status: computedStatus,
    },
    readiness: commandCenter.readiness,
    collaborators: commandCenter.collaborators,
    metadata: commandCenter.metadata,
    retention: retentionSummary,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const { releaseId } = await context.params;
    if (!releaseId) return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });

    const adminClient = createAdminClient(auth.supabaseUrl);
    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;

    const body = await request.json().catch(() => ({}));
    const title = trimString(body?.title);
    const releaseDate = trimString(body?.releaseDate);
    const description = trimString(body?.description);
    const artistName = trimString(body?.artistName) || ownership.release.artistName;
    const status = trimString(body?.status) || ownership.release.status;

    if (!title) return NextResponse.json({ error: 'Release title is required.' }, { status: 400 });
    if (!releaseDate) return NextResponse.json({ error: 'Release date is required.' }, { status: 400 });

    const releaseUpdate = await adminClient!
      .from('releases')
      .update({
        title,
        slug: normalizeReleaseSlug(title) || ownership.release.slug,
        release_date: releaseDate,
        description: description || null,
        artist_name: artistName,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', releaseId)
      .eq('owner_user_id', auth.user.id);

    if (releaseUpdate.error) {
      if (isOptionalTableMissingError(releaseUpdate.error)) return buildMissingTableResponse();
      return NextResponse.json({ error: releaseUpdate.error.message || 'Could not update release.' }, { status: 500 });
    }

    const metadataUpdate = await adminClient!
      .from(RELEASE_METADATA_TABLE)
      .upsert(
        {
          release_id: releaseId,
          primary_artist_name: artistName,
          release_title: title,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'release_id' }
      );

    if (metadataUpdate.error) {
      if (isOptionalTableMissingError(metadataUpdate.error)) return buildMissingTableResponse();
      return NextResponse.json({ error: metadataUpdate.error.message || 'Could not update metadata.' }, { status: 500 });
    }

    const refreshedRelease = {
      ...ownership.release,
      title,
      artistName,
      releaseDate,
      description,
      status: status as typeof ownership.release.status,
    };

    const rebuildResult = await rebuildReleaseMetadataSnapshot(adminClient!, refreshedRelease);
    if ('error' in rebuildResult) return rebuildResult.error;

    const eventResult = await adminClient!.from(RELEASE_EVENTS_TABLE).insert({
      release_id: releaseId,
      type: 'metadata_updated',
      payload_json: { title, artistName, releaseDate },
    });

    if (eventResult.error) {
      if (isOptionalTableMissingError(eventResult.error)) return buildMissingTableResponse();
      return NextResponse.json({ error: eventResult.error.message || 'Could not log metadata event.' }, { status: 500 });
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('release_date_set', {
        release_id: releaseId,
      })
    );

    return NextResponse.json({ status: 'saved' });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
