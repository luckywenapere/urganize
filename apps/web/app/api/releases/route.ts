import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import {
  ARTISTS_TABLE,
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOpsSchema,
  requireActiveAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseCommandCenterData,
} from './_shared';
import { normalizeReleaseSlug } from '@/lib/release-ops';
import { type ReleaseOption } from '@/lib/release-helpers';

type ReleaseSelectorListResponse = { releases: ReleaseOption[] };

function sanitizeTextField(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}
import { ensureOwnedWorkspace } from '@/lib/tasks-server';
import { instantiateTemplate } from '@/lib/release-templates/instantiate';
import { getTemplate } from '@/lib/release-templates/loader';
import type { ReleaseType } from '@/lib/release-templates/types';
import { loadCoverArtUrlMap } from '@/lib/cover-art';
import { getWorkspaceArtist, isWorkspaceFeatureEnabled } from '@/lib/artists-server';
import { type ReleaseCreatedSource } from '@/lib/analytics';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

const trimString = (value: unknown): string => String(value || '').trim();

type ReleaseRow = {
  id: string;
  owner_user_id: string;
  artist_id: string | null;
  artist_name: string;
  title: string;
  slug: string | null;
  release_date: string | null;
  status: string | null;
  description: string | null;
  artwork_asset_id: string | null;
  created_at: string;
  updated_at: string;
};

type ReleaseMetadataRow = {
  release_id: string;
  artwork_url: string | null;
};

type CreateReleaseBody = {
  artistId?: unknown;
  artistName?: unknown;
  title?: unknown;
  releaseDate?: unknown;
  description?: unknown;
  releaseType?: unknown;
  coverArtUrl?: unknown;
  source?: unknown;
  state?: unknown;
};

const TASKS_TABLE = 'tasks';
const RELEASE_PIPELINE_STATES = ['idea', 'planning', 'asset_prep', 'distribution', 'campaign', 'post_release'] as const;

const normalizePipelineState = (value: unknown) => {
  const normalized = trimString(value).toLowerCase();
  return RELEASE_PIPELINE_STATES.includes(normalized as (typeof RELEASE_PIPELINE_STATES)[number])
    ? normalized
    : 'idea';
};

function toSelectorRelease(
  row: ReleaseRow,
  coverByReleaseId: Map<string, string>,
  metadataByReleaseId: Map<string, ReleaseMetadataRow>
): ReleaseOption {
  return {
    id: row.id,
    artistId: row.artist_id || '',
    artistName: row.artist_name || '',
    title: row.title || '',
    releaseDate: row.release_date || null,
    coverArtUrl: resolveCoverArtUrl(row.id, coverByReleaseId, metadataByReleaseId),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

async function loadReleaseMetadataMap(
  adminClient: ReturnType<typeof createAdminClient>,
  releaseIds: string[]
): Promise<{ metadataByReleaseId: Map<string, ReleaseMetadataRow> } | { error: NextResponse }> {
  if (!adminClient || releaseIds.length === 0) {
    return { metadataByReleaseId: new Map<string, ReleaseMetadataRow>() };
  }

  const { data, error } = await adminClient
    .from(RELEASE_METADATA_TABLE)
    .select('release_id,artwork_url')
    .in('release_id', releaseIds);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { metadataByReleaseId: new Map<string, ReleaseMetadataRow>() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load release artwork.' },
        { status: 500 }
      ),
    };
  }

  const metadataByReleaseId = new Map<string, ReleaseMetadataRow>();
  for (const row of data || []) {
    const metadata = row as Partial<ReleaseMetadataRow>;
    const releaseId = String(metadata.release_id || '');
    if (!releaseId) {
      continue;
    }

    metadataByReleaseId.set(releaseId, {
      release_id: releaseId,
      artwork_url: typeof metadata.artwork_url === 'string' ? metadata.artwork_url : null,
    });
  }

  return { metadataByReleaseId };
}

/**
 * Cover-art URL for a release: the signed URL from `artwork_asset_id` when
 * available, otherwise the legacy `release_metadata.artwork_url`.
 *
 * The legacy fallback is temporary — it keeps cover art visible for releases
 * created before Phase 3 that only have the old text URL. v2 should backfill
 * those into the assets table via a migration script and drop this fallback.
 */
function resolveCoverArtUrl(
  releaseId: string,
  coverByReleaseId: Map<string, string>,
  metadataByReleaseId: Map<string, ReleaseMetadataRow>
): string | null {
  return (
    coverByReleaseId.get(releaseId) ||
    metadataByReleaseId.get(releaseId)?.artwork_url ||
    null
  );
}

function getDefaultArtistName(user: User): string {
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const emailHandle = user.email ? user.email.split('@')[0] : '';
  const candidates = [
    metadata.artist_name,
    metadata.artistName,
    metadata.stage_name,
    metadata.stageName,
    metadata.name,
    metadata.full_name,
    emailHandle,
  ];

  for (const candidate of candidates) {
    const normalized = sanitizeTextField(String(candidate || ''), 120);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function parseOptionalReleaseDate(value: string): { value: string | null; error?: string } {
  if (!value) {
    return { value: null };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { value: null, error: 'Release date must use YYYY-MM-DD format.' };
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return { value: null, error: 'Release date is invalid.' };
  }

  return { value };
}

function isValidHttpUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeReleaseCreatedSource(value: unknown): ReleaseCreatedSource {
  if (value === 'onboarding' || value === 'empty_state') {
    return value;
  }

  return 'dashboard';
}

export async function GET(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const view = request.nextUrl.searchParams.get('view');
  const releasesResult = await adminClient
    .from('releases')
    .select('id,owner_user_id,artist_id,artist_name,title,slug,release_date,status,description,artwork_asset_id,created_at,updated_at')
    .eq('owner_user_id', auth.user.id)
    .order('release_date', { ascending: true, nullsFirst: false });

  if (releasesResult.error) {
    if (isOptionalTableMissingError(releasesResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: releasesResult.error.message || 'Could not load releases.' }, { status: 500 });
  }

  const releases = Array.isArray(releasesResult.data) ? (releasesResult.data as ReleaseRow[]) : [];
  const taskCountByReleaseId = new Map<string, number>();
  const taskDoneCountByReleaseId = new Map<string, number>();

  if (releases.length > 0) {
    const releaseIds = releases.map((release) => release.id);
    const taskResult = await adminClient.from(TASKS_TABLE).select('release_id,status').in('release_id', releaseIds);

    if (!taskResult.error && Array.isArray(taskResult.data)) {
      for (const row of taskResult.data) {
        const typed = row as { release_id?: string | null; status?: string | null };
        const releaseId = String(typed.release_id || '');
        if (!releaseId) {
          continue;
        }

        taskCountByReleaseId.set(releaseId, (taskCountByReleaseId.get(releaseId) || 0) + 1);
        if (typed.status === 'done') {
          taskDoneCountByReleaseId.set(releaseId, (taskDoneCountByReleaseId.get(releaseId) || 0) + 1);
        }
      }
    }
  }

  const metadataResult = await loadReleaseMetadataMap(
    adminClient,
    releases.map((release) => release.id)
  );
  if ('error' in metadataResult) {
    return metadataResult.error;
  }

  // Cover art is sourced from releases.artwork_asset_id (Phase 3 source of
  // truth), resolved to a signed URL; falls back to the legacy artwork_url.
  const coverByReleaseId = await loadCoverArtUrlMap(adminClient, releases);

  if (view === 'selector') {
    const payload: ReleaseSelectorListResponse = {
      releases: releases.map((release) =>
        toSelectorRelease(release, coverByReleaseId, metadataResult.metadataByReleaseId)
      ),
    };

    return NextResponse.json(payload);
  }

  const summaries = await Promise.all(
    releases.map(async (row) => {
      const release = {
        id: String(row.id || ''),
        ownerUserId: String(row.owner_user_id || ''),
        artistId: String(row.artist_id || ''),
        artistName: String(row.artist_name || ''),
        title: String(row.title || ''),
        slug: String(row.slug || ''),
        releaseDate: String(row.release_date || ''),
        status: String(row.status || 'draft') as 'draft' | 'in_progress' | 'ready',
        description: String(row.description || ''),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
      };

      const commandCenter = await loadReleaseCommandCenterData(adminClient, release);
      if ('error' in commandCenter) {
        return {
          id: release.id,
          title: release.title,
          artistName: release.artistName,
          releaseDate: release.releaseDate || null,
          coverArtUrl: resolveCoverArtUrl(release.id, coverByReleaseId, metadataResult.metadataByReleaseId),
          status: release.status,
          progress: 0,
          tasksDone: 0,
          tasksTotal: 0,
          invitedCount: 0,
          submittedCount: 0,
          pendingCount: 0,
        };
      }

      const computedStatus = commandCenter.readiness.readyForDistribution
        ? 'ready'
        : commandCenter.collaborators.length > 0
          ? 'in_progress'
          : 'draft';

      return {
        id: release.id,
        title: release.title,
        artistName: release.artistName,
        releaseDate: release.releaseDate,
        coverArtUrl: resolveCoverArtUrl(release.id, coverByReleaseId, metadataResult.metadataByReleaseId),
        status: computedStatus,
        progress: commandCenter.readiness.completionPercent,
        tasksDone: taskDoneCountByReleaseId.get(release.id) || 0,
        tasksTotal: taskCountByReleaseId.get(release.id) || 0,
        invitedCount: commandCenter.collaborators.length,
        submittedCount: commandCenter.readiness.submittedCollaborators,
        pendingCount: commandCenter.readiness.pendingCollaborators,
      };
    })
  );

  return NextResponse.json({ releases: summaries });
}

export async function POST(request: NextRequest) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await requireActiveAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const schemaStatus = await ensureReleaseOpsSchema(adminClient);
    if ('error' in schemaStatus) return schemaStatus.error;

    const existingReleaseCountResult = await adminClient
      .from('releases')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', auth.user.id);

    if (existingReleaseCountResult.error) {
      if (isOptionalTableMissingError(existingReleaseCountResult.error)) {
        return buildMissingTableResponse('Release access check failed because the releases schema is incomplete.');
      }

      return NextResponse.json(
        { error: existingReleaseCountResult.error.message || 'Could not verify release access.' },
        { status: 500 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as CreateReleaseBody;
    const artistId = trimString(body?.artistId);
    const artistNameInput = sanitizeTextField(trimString(body?.artistName), 120);
    const title = sanitizeTextField(trimString(body?.title), 140);
    const releaseDateInput = trimString(body?.releaseDate);
    const description = sanitizeTextField(trimString(body?.description), 400);
    const releaseType = trimString(body?.releaseType) || 'single';
    const coverArtUrl = trimString(body?.coverArtUrl);
    const releaseSource = normalizeReleaseCreatedSource(body?.source);
    const state = normalizePipelineState(body?.state);

    if (!title) return NextResponse.json({ error: 'Release title is required.' }, { status: 400 });

    if (!releaseDateInput) {
      return NextResponse.json({ error: 'Release date is required.' }, { status: 400 });
    }

    const releaseDateResult = parseOptionalReleaseDate(releaseDateInput);
    if (releaseDateResult.error) {
      return NextResponse.json({ error: releaseDateResult.error }, { status: 400 });
    }

    if (coverArtUrl && !isValidHttpUrl(coverArtUrl)) {
      return NextResponse.json({ error: 'Cover art URL is invalid.' }, { status: 400 });
    }

    let artistIdToUse = artistId;
    let artistName = artistNameInput || getDefaultArtistName(auth.user);

    // Phase 3 (workspace-scoped artists): when the workspace flag is on AND
    // the client did not provide an artistId/artistName, derive both from the
    // workspace's single artist. This is the implicit-artist path the
    // CreateReleaseModal relies on — it doesn't collect artist input anymore.
    // If no workspace artist exists yet, fall through to the legacy
    // lookup-or-create branch below, which will scope the new artist to the
    // workspace (see workspaceIdForArtist below).
    let workspaceIdForArtist: string | null = null;
    if (isWorkspaceFeatureEnabled() && !artistIdToUse) {
      try {
        const workspace = await ensureOwnedWorkspace(adminClient, auth.user);
        workspaceIdForArtist = workspace.id;
        if (!artistNameInput) {
          const workspaceArtist = await getWorkspaceArtist(adminClient, workspace.id);
          if (workspaceArtist) {
            artistIdToUse = workspaceArtist.id;
            artistName = workspaceArtist.name;
          }
        }
      } catch (workspaceError) {
        // Non-fatal: workspace lookup degrades the implicit-artist path back
        // to the legacy branch. The release still creates.
        console.error('[releases.POST] workspace artist resolution failed', workspaceError);
      }
    }

    if (artistIdToUse) {
      const artistResult = await adminClient
        .from(ARTISTS_TABLE)
        .select('id,name')
        .eq('id', artistIdToUse)
        .eq('owner_user_id', auth.user.id)
        .maybeSingle();

      if (artistResult.error) {
        if (isOptionalTableMissingError(artistResult.error)) {
          return buildMissingTableResponse('Artist lookup failed because the artists schema is incomplete.');
        }
        return NextResponse.json({ error: artistResult.error.message || 'Could not load artist.' }, { status: 500 });
      }

      if (!artistResult.data) {
        return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
      }

      artistName = String(artistResult.data.name || '');
    } else if (artistName) {
      const normalizedSlug = normalizeReleaseSlug(artistName);
      const existingArtistResult = await adminClient
        .from(ARTISTS_TABLE)
        .select('id,name')
        .eq('owner_user_id', auth.user.id)
        .eq('slug', normalizedSlug)
        .maybeSingle();

      if (existingArtistResult.error && !isOptionalTableMissingError(existingArtistResult.error)) {
        return NextResponse.json({ error: existingArtistResult.error.message || 'Could not load artist.' }, { status: 500 });
      }
      if (existingArtistResult.error && isOptionalTableMissingError(existingArtistResult.error)) {
        return buildMissingTableResponse('Artist lookup failed because the artists schema is incomplete.');
      }

      if (existingArtistResult.data?.id) {
        artistIdToUse = String(existingArtistResult.data.id);
        artistName = String(existingArtistResult.data.name || artistName);
      } else {
        // Phase 1+2: new artists must be workspace-scoped. The unique index
        // after Migration 2 is (workspace_id, slug); inserting with
        // workspace_id NULL produces a row excluded from the partial
        // unique index, which would silently allow duplicates. If the
        // feature flag is off the workspace lookup may not have run above
        // — resolve it eagerly here. Failure to find a workspace falls
        // back to NULL (legacy behaviour); the insert may still succeed
        // depending on which migration revision is live.
        if (!workspaceIdForArtist) {
          try {
            const ws = await ensureOwnedWorkspace(adminClient, auth.user);
            workspaceIdForArtist = ws.id;
          } catch {
            workspaceIdForArtist = null;
          }
        }

        const insertArtistResult = await adminClient
          .from(ARTISTS_TABLE)
          .insert({
            owner_user_id: auth.user.id,
            workspace_id: workspaceIdForArtist,
            name: artistName,
            slug: normalizedSlug || `artist-${Date.now()}`,
            updated_at: new Date().toISOString(),
          })
          .select('id,name')
          .single();

        if (insertArtistResult.error) {
          if (isOptionalTableMissingError(insertArtistResult.error)) {
            return buildMissingTableResponse('Artist creation failed because the artists schema is incomplete.');
          }
          return NextResponse.json({ error: insertArtistResult.error.message || 'Could not create artist.' }, { status: 500 });
        }

        artistIdToUse = String(insertArtistResult.data.id || '');
        artistName = String(insertArtistResult.data.name || artistName);
      }
    }

    if (!artistName) {
      return NextResponse.json({ error: 'Artist name is required.' }, { status: 400 });
    }

    const slug = normalizeReleaseSlug(title) || `release-${Date.now()}`;
    const now = new Date().toISOString();

    const releaseResult = await adminClient
      .from('releases')
      .insert({
        owner_user_id: auth.user.id,
        artist_id: artistIdToUse || null,
        artist_name: artistName,
        title,
        slug,
        release_date: releaseDateResult.value,
        status: 'draft',
        state,
        readiness_score: 0,
        release_type: releaseType,
        description: description || null,
        updated_at: now,
      })
      .select('id,status,artist_name,title,release_date,created_at,updated_at')
      .single();

    if (releaseResult.error || !releaseResult.data?.id) {
      if (isOptionalTableMissingError(releaseResult.error)) {
        return buildMissingTableResponse('Release creation failed because the releases schema is incomplete.');
      }
      return NextResponse.json({ error: releaseResult.error?.message || 'Could not create release.' }, { status: 500 });
    }

    const releaseId = String(releaseResult.data.id);

    const metadataResult = await adminClient
      .from(RELEASE_METADATA_TABLE)
      .insert({
        release_id: releaseId,
        primary_artist_name: artistName,
        release_title: title,
        artwork_url: coverArtUrl || null,
        updated_at: now,
      })
      .select('id')
      .single();

    if (metadataResult.error) {
      if (isOptionalTableMissingError(metadataResult.error)) {
        return buildMissingTableResponse('Metadata initialization failed because the metadata schema is incomplete.');
      }
      return NextResponse.json({ error: metadataResult.error.message || 'Could not initialize metadata.' }, { status: 500 });
    }

    const eventResult = await adminClient.from(RELEASE_EVENTS_TABLE).insert({
      release_id: releaseId,
      type: 'release_created',
      payload_json: {
        title,
        artistName,
      },
    });

    if (eventResult.error) {
      if (isOptionalTableMissingError(eventResult.error)) {
        return buildMissingTableResponse('Release event logging failed because the events schema is incomplete.');
      }
      return NextResponse.json({ error: eventResult.error.message || 'Could not log release event.' }, { status: 500 });
    }

    // Template-driven task generation. If template instantiation fails, the
    // release is still created without tasks. The user can manually add tasks.
    // This is a known limitation of v1 — recoverable state (release exists,
    // tasks missing) beats partial-rollback risk (orphaned release row).
    //
    // Common failure modes absorbed here: TemplateNotAvailableError when the
    // release_type has no template yet (ep, album, music_video at v1), and
    // TemplateInstantiationError with reason 'missing_release_date' when the
    // release was created without a date.
    try {
      const workspace = await ensureOwnedWorkspace(adminClient, auth.user);
      const template = getTemplate(releaseType as ReleaseType);
      await instantiateTemplate({
        template,
        releaseId,
        releaseDate: releaseResult.data.release_date
          ? String(releaseResult.data.release_date)
          : null,
        workspaceId: workspace.id,
        ownerUserId: auth.user.id,
        supabaseClient: adminClient,
      });
    } catch (templateError) {
      console.error(
        `Release ${releaseId} created without tasks: template instantiation failed.`,
        templateError
      );
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('release_created', {
        release_id: releaseId,
        source: releaseSource,
      })
    );

    if (releaseDateResult.value) {
      captureServerAnalyticsEvent(
        posthogServer,
        auth.user.id,
        createPostHogEvent('release_date_set', {
          release_id: releaseId,
        })
      );
    }

    if (releaseSource === 'onboarding') {
      captureServerAnalyticsEvent(
        posthogServer,
        auth.user.id,
        createPostHogEvent('onboarding_release_created', {
          release_id: releaseId,
          has_release_date: Boolean(releaseDateResult.value),
        })
      );
    }

    return NextResponse.json({
      releaseId,
      status: String(releaseResult.data.status || 'draft'),
      release: {
        id: releaseId,
        title: String(releaseResult.data.title || title),
        artistId: artistIdToUse || '',
        artistName: String(releaseResult.data.artist_name || artistName),
        releaseDate: releaseResult.data.release_date ? String(releaseResult.data.release_date) : null,
        coverArtUrl: coverArtUrl || null,
        createdAt: String(releaseResult.data.created_at || now),
        updatedAt: String(releaseResult.data.updated_at || now),
      } satisfies ReleaseOption,
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
