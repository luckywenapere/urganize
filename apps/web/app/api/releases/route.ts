import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import {
  ARTISTS_TABLE,
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOpsSchema,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseCommandCenterData,
} from './_shared';
import { normalizeReleaseSlug } from '@/lib/release-ops';
import {
  sanitizeTextField,
  type PreSaveReleaseOption,
  type ReleaseSelectorListResponse,
} from '@/lib/pre-save';
import { RELEASE_PLAYBOOK_PHASES } from '@/lib/release-playbook';
import { createDefaultReleaseTaskGroups, ensureOwnedWorkspace, isTaskSchemaMissingError } from '@/lib/tasks-server';
import { type ReleaseCreatedSource } from '@/lib/analytics';
import { getSubscriptionStatus, hasAccess } from '@/lib/subscription-access';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

const trimString = (value: unknown): string => String(value || '').trim();

type ReleaseRow = {
  id: string;
  user_id: string | null;
  owner_user_id: string | null;
  artist_id: string | null;
  artist_name: string;
  title: string;
  slug: string | null;
  release_date: string | null;
  status: string | null;
  description: string | null;
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
};

type PlaybookProgressSummary = {
  completedCount: number;
  totalCount: number;
  completionPercent: number;
};

type ReleasePlaybookRow = {
  release_id: string;
  is_completed: boolean;
};

const RELEASE_PLAYBOOK_STEPS_TABLE = 'release_playbook_steps';
const TASKS_TABLE = 'tasks';
const TRACKS_TABLE = 'tracks';
const DEFAULT_PLAYBOOK_TOTAL = RELEASE_PLAYBOOK_PHASES.reduce((sum, phase) => sum + phase.items.length, 0);

function toSelectorRelease(
  row: ReleaseRow,
  metadataByReleaseId: Map<string, ReleaseMetadataRow>
): PreSaveReleaseOption {
  return {
    id: row.id,
    artistName: row.artist_name || '',
    title: row.title || '',
    releaseDate: row.release_date || null,
    coverArtUrl: metadataByReleaseId.get(row.id)?.artwork_url || null,
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
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const view = request.nextUrl.searchParams.get('view');
  const releasesResult = await adminClient
    .from('releases')
    .select('id,user_id,owner_user_id,artist_id,artist_name,title,slug,release_date,status,description,created_at,updated_at')
    .or(`owner_user_id.eq.${auth.user.id},user_id.eq.${auth.user.id}`)
    .order('release_date', { ascending: true, nullsFirst: false });

  if (releasesResult.error) {
    if (isOptionalTableMissingError(releasesResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: releasesResult.error.message || 'Could not load releases.' }, { status: 500 });
  }

  const releases = Array.isArray(releasesResult.data) ? (releasesResult.data as ReleaseRow[]) : [];
  const playbookProgressByReleaseId = new Map<string, PlaybookProgressSummary>();
  const taskCountByReleaseId = new Map<string, number>();
  const trackCountByReleaseId = new Map<string, number>();

  if (releases.length > 0) {
    const playbookResult = await adminClient
      .from(RELEASE_PLAYBOOK_STEPS_TABLE)
      .select('release_id,is_completed')
      .eq('user_id', auth.user.id)
      .in('release_id', releases.map((release) => release.id));

    if (!playbookResult.error && Array.isArray(playbookResult.data)) {
      const rows = playbookResult.data as ReleasePlaybookRow[];
      const groupedRows = new Map<string, ReleasePlaybookRow[]>();

      for (const row of rows) {
        const releaseId = String(row.release_id || '');
        if (!releaseId) {
          continue;
        }

        const group = groupedRows.get(releaseId) || [];
        group.push(row);
        groupedRows.set(releaseId, group);
      }

      for (const release of releases) {
        const rowsForRelease = groupedRows.get(release.id) || [];
        const totalCount = rowsForRelease.length || DEFAULT_PLAYBOOK_TOTAL;
        const completedCount = rowsForRelease.filter((row) => row.is_completed === true).length;
        const completionPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

        playbookProgressByReleaseId.set(release.id, {
          completedCount,
          totalCount,
          completionPercent,
        });
      }
    }

    const releaseIds = releases.map((release) => release.id);
    const [taskResult, trackResult] = await Promise.all([
      adminClient.from(TASKS_TABLE).select('release_id').in('release_id', releaseIds),
      adminClient.from(TRACKS_TABLE).select('release_id').in('release_id', releaseIds),
    ]);

    if (!taskResult.error && Array.isArray(taskResult.data)) {
      for (const row of taskResult.data) {
        const releaseId = String((row as { release_id?: string | null }).release_id || '');
        if (!releaseId) {
          continue;
        }

        taskCountByReleaseId.set(releaseId, (taskCountByReleaseId.get(releaseId) || 0) + 1);
      }
    }

    if (!trackResult.error && Array.isArray(trackResult.data)) {
      for (const row of trackResult.data) {
        const releaseId = String((row as { release_id?: string | null }).release_id || '');
        if (!releaseId) {
          continue;
        }

        trackCountByReleaseId.set(releaseId, (trackCountByReleaseId.get(releaseId) || 0) + 1);
      }
    }
  }

  if (view === 'selector') {
    const metadataResult = await loadReleaseMetadataMap(
      adminClient,
      releases.map((release) => release.id)
    );
    if ('error' in metadataResult) {
      return metadataResult.error;
    }

    const payload: ReleaseSelectorListResponse = {
      releases: releases.map((release) => toSelectorRelease(release, metadataResult.metadataByReleaseId)),
    };

    return NextResponse.json(payload);
  }

  const summaries = await Promise.all(
    releases.map(async (row) => {
      const release = {
        id: String(row.id || ''),
        ownerUserId: String(row.owner_user_id || row.user_id || ''),
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
          status: release.status,
          progress: 0,
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
      const playbookProgress = playbookProgressByReleaseId.get(release.id) || {
        completedCount: 0,
        totalCount: DEFAULT_PLAYBOOK_TOTAL,
        completionPercent: 0,
      };
      const setupProgress = Math.min(
        100,
        Math.round(
          playbookProgress.completionPercent / 3 +
            (taskCountByReleaseId.get(release.id) ? 33.333 : 0) +
            (trackCountByReleaseId.get(release.id) ? 33.333 : 0)
        )
      );

      return {
        id: release.id,
        title: release.title,
        artistName: release.artistName,
        releaseDate: release.releaseDate,
        status: computedStatus,
        progress: commandCenter.readiness.completionPercent,
        invitedCount: commandCenter.collaborators.length,
        submittedCount: commandCenter.readiness.submittedCollaborators,
        pendingCount: commandCenter.readiness.pendingCollaborators,
        playbook: playbookProgress,
        setup: {
          progressPercent: setupProgress,
          hasTask: (taskCountByReleaseId.get(release.id) || 0) > 0,
          hasTrack: (trackCountByReleaseId.get(release.id) || 0) > 0,
        },
      };
    })
  );

  return NextResponse.json({ releases: summaries });
}

export async function POST(request: NextRequest) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
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
      .or(`owner_user_id.eq.${auth.user.id},user_id.eq.${auth.user.id}`);

    if (existingReleaseCountResult.error) {
      if (isOptionalTableMissingError(existingReleaseCountResult.error)) {
        return buildMissingTableResponse('Release access check failed because the releases schema is incomplete.');
      }

      return NextResponse.json(
        { error: existingReleaseCountResult.error.message || 'Could not verify release access.' },
        { status: 500 }
      );
    }

    const existingReleaseCount = Number(existingReleaseCountResult.count || 0);
    if (existingReleaseCount >= 1) {
      const accessAllowed = await hasAccess(auth.user.id);
      if (!accessAllowed) {
        const subscriptionStatus = await getSubscriptionStatus(auth.user.id);
        return NextResponse.json(
          {
            error: 'Upgrade required to create another release.',
            code: 'PAYWALL_REQUIRED',
            feature: 'multiple_releases',
            status: subscriptionStatus,
          },
          { status: 402 }
        );
      }
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

    if (!title) return NextResponse.json({ error: 'Release title is required.' }, { status: 400 });

    const releaseDateResult = parseOptionalReleaseDate(releaseDateInput);
    if (releaseDateResult.error) {
      return NextResponse.json({ error: releaseDateResult.error }, { status: 400 });
    }

    if (coverArtUrl && !isValidHttpUrl(coverArtUrl)) {
      return NextResponse.json({ error: 'Cover art URL is invalid.' }, { status: 400 });
    }

    let artistIdToUse = artistId;
    let artistName = artistNameInput || getDefaultArtistName(auth.user);

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
        const insertArtistResult = await adminClient
          .from(ARTISTS_TABLE)
          .insert({
            owner_user_id: auth.user.id,
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
        user_id: auth.user.id,
        owner_user_id: auth.user.id,
        artist_id: artistIdToUse || null,
        artist_name: artistName,
        title,
        slug,
        release_date: releaseDateResult.value,
        status: 'draft',
        type: releaseType,
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

    try {
      const workspace = await ensureOwnedWorkspace(adminClient, auth.user);
      await createDefaultReleaseTaskGroups(adminClient, workspace.id, releaseId);
    } catch (taskError) {
      if (!isTaskSchemaMissingError(taskError)) {
        throw taskError;
      }
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('release_created', {
        release_id: releaseId,
        source: releaseSource,
      })
    );

    if (coverArtUrl) {
      captureServerAnalyticsEvent(
        posthogServer,
        auth.user.id,
        createPostHogEvent('release_cover_art_uploaded', {
          release_id: releaseId,
        })
      );
    }

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
          has_cover_art: Boolean(coverArtUrl),
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
        artistName: String(releaseResult.data.artist_name || artistName),
        releaseDate: releaseResult.data.release_date ? String(releaseResult.data.release_date) : null,
        coverArtUrl: coverArtUrl || null,
        createdAt: String(releaseResult.data.created_at || now),
        updatedAt: String(releaseResult.data.updated_at || now),
      } satisfies PreSaveReleaseOption,
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
