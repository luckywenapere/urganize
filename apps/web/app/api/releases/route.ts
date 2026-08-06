import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import {
  ARTISTS_TABLE,
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOpsSchema,
  requireAuthenticatedAdmin,
  requireAuthenticatedAdminOrInternal,
  isOptionalTableMissingError,
  parseOptionalReleaseDate,
} from './_shared';
import { normalizeReleaseSlug } from '@/lib/release-ops';
import { type ReleaseOption } from '@/lib/release-helpers';
import { DEFAULT_RELEASE_TITLE } from '@/types/releases';
import { writeTemplatePending } from '@/lib/release-template-pending';

type ReleaseSelectorListResponse = { releases: ReleaseOption[] };

function sanitizeTextField(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}
import { ensureOwnedWorkspace, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { instantiateTemplate } from '@/lib/release-templates/instantiate';
import { getTemplate } from '@/lib/release-templates/loader';
import type { ReleaseType } from '@/lib/release-templates/types';
import { loadCoverArtUrlMap } from '@/lib/cover-art';
import { loadWorkspaceLogoFallbackUrl } from '@/lib/workspace-logo';
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
  /** 'template' (default) instantiates the rollout plan; 'blank' creates an
   * empty release the user builds up themself (founder call, 2026-07-23). */
  plan?: unknown;
};

function toSelectorRelease(
  row: ReleaseRow,
  coverByReleaseId: Map<string, string>,
  metadataByReleaseId: Map<string, ReleaseMetadataRow>,
  workspaceLogoUrl: string | null
): ReleaseOption {
  return {
    id: row.id,
    artistId: row.artist_id || '',
    artistName: row.artist_name || '',
    title: row.title || '',
    releaseDate: row.release_date || null,
    coverArtUrl: resolveCoverArtUrl(row.id, coverByReleaseId, metadataByReleaseId, workspaceLogoUrl),
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
 * available, otherwise the legacy `release_metadata.artwork_url`, otherwise
 * the workspace logo (record label / team logo) — releases without their own
 * artwork display the logo automatically until cover art is uploaded.
 *
 * The legacy fallback is temporary — it keeps cover art visible for releases
 * created before Phase 3 that only have the old text URL. v2 should backfill
 * those into the assets table via a migration script and drop this fallback.
 */
function resolveCoverArtUrl(
  releaseId: string,
  coverByReleaseId: Map<string, string>,
  metadataByReleaseId: Map<string, ReleaseMetadataRow>,
  workspaceLogoUrl: string | null
): string | null {
  return (
    coverByReleaseId.get(releaseId) ||
    metadataByReleaseId.get(releaseId)?.artwork_url ||
    workspaceLogoUrl ||
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
  if (value === 'onboarding' || value === 'empty_state' || value === 'chappi') {
    return value;
  }

  return 'dashboard';
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  // The only live consumer of this GET is the release-selector combobox
  // (historically ?view=selector). The old default "summary list" view — a
  // 3-queries-per-release fan-out — had no callers left (the product's list
  // view loads through /api/command-center), so it was removed 2026-07-10
  // rather than hardened. Every GET now returns the selector payload.
  // Whole-workspace visibility (founder decision, 2026-07-23): the selector
  // lists releases owned by ANY owner of a workspace the caller belongs to,
  // so teammates can pick the shared releases too.
  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  const visibleOwnerIds = access.releaseOwnerIds.length
    ? access.releaseOwnerIds
    : [auth.user.id];
  const releasesResult = await adminClient
    .from('releases')
    .select('id,owner_user_id,artist_id,artist_name,title,slug,release_date,status,description,artwork_asset_id,created_at,updated_at')
    .in('owner_user_id', visibleOwnerIds)
    .order('release_date', { ascending: true, nullsFirst: false });

  if (releasesResult.error) {
    if (isOptionalTableMissingError(releasesResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: releasesResult.error.message || 'Could not load releases.' }, { status: 500 });
  }

  // Artist-scoped members only see their own artist's releases.
  const releases = (Array.isArray(releasesResult.data) ? (releasesResult.data as ReleaseRow[]) : []).filter(
    (release) => {
      const scope = access.artistScopeByOwnerId[String(release.owner_user_id || '')];
      if (!scope) return true;
      return String(release.artist_id || '') === scope;
    }
  );

  const metadataResult = await loadReleaseMetadataMap(
    adminClient,
    releases.map((release) => release.id)
  );
  if ('error' in metadataResult) {
    return metadataResult.error;
  }

  // Cover art is sourced from releases.artwork_asset_id (Phase 3 source of
  // truth), resolved to a signed URL; falls back to the legacy artwork_url,
  // then to the workspace logo for releases with no artwork at all.
  const coverByReleaseId = await loadCoverArtUrlMap(adminClient, releases);
  const workspaceLogoUrl = await loadWorkspaceLogoFallbackUrl(adminClient, auth.user.id);

  const payload: ReleaseSelectorListResponse = {
    releases: releases.map((release) =>
      toSelectorRelease(release, coverByReleaseId, metadataResult.metadataByReleaseId, workspaceLogoUrl)
    ),
  };

  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const posthogServer = createServerPostHogClient();

  try {
    // *OrInternal: the Chappi/MCP tool layer creates releases by calling this
    // route internally, so it also accepts the MCP internal actor (URG-183).
    const auth = await requireAuthenticatedAdminOrInternal(request);
    if ('error' in auth) return auth.error;

    const { adminClient } = auth;

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
    // Title and release date are both OPTIONAL as of URG-230 (founder call):
    // creating a release should have zero required fields. An untitled
    // release takes DEFAULT_RELEASE_TITLE, which the read path in
    // lib/services/release-service.ts already used as its empty-title
    // fallback — so this stores what the UI would have displayed anyway.
    //
    // Dropping the date requirement reopens the path the 2026-05-26 modal
    // change closed (a release created with no date silently getting zero
    // activities). It is no longer silent: a dateless Rollout-plan release
    // is marked `template_pending` below and the activities view carries a
    // card explaining that setting a date builds the plan. See the
    // instantiation block further down.
    const title = sanitizeTextField(trimString(body?.title), 140) || DEFAULT_RELEASE_TITLE;
    const releaseDateInput = trimString(body?.releaseDate);
    const description = sanitizeTextField(trimString(body?.description), 400);
    const releaseType = trimString(body?.releaseType) || 'single';
    const coverArtUrl = trimString(body?.coverArtUrl);
    const releaseSource = normalizeReleaseCreatedSource(body?.source);
    const releasePlan = trimString(body?.plan) === 'blank' ? 'blank' : 'template';

    // parseOptionalReleaseDate returns { value: null } for empty input — the
    // tolerance it was always written for, previously unreachable because the
    // hard 400 above sat in front of it. A malformed date is still a 400.
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
      // Authorize by workspace membership, not owner_user_id only. After
      // Migration 2 the artist is workspace-scoped; a workspace member
      // (non-owner) must be able to create releases against the workspace's
      // existing artist row even though they don't own it. The membership
      // lookup is lazy — only fires when the owner check fails, so the
      // single-owner v1 ICP keeps its previous DB-call count.
      const artistResult = await adminClient
        .from(ARTISTS_TABLE)
        .select('id,name,workspace_id,owner_user_id')
        .eq('id', artistIdToUse)
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

      const artistOwnerId = String(artistResult.data.owner_user_id || '');
      const artistWorkspaceId = String(artistResult.data.workspace_id || '');
      let authorized = artistOwnerId === auth.user.id;
      if (!authorized && artistWorkspaceId) {
        const access = await loadWorkspaceAccessContext(adminClient, auth.user);
        authorized = access.workspaceIds.includes(artistWorkspaceId);
      }
      if (!authorized) {
        return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
      }

      artistName = String(artistResult.data.name || '');
    } else if (artistName) {
      // Lookup-or-create keyed by (workspace_id, slug). Migration 2 dropped
      // the (owner_user_id, slug) unique index; the new partial unique is
      // (workspace_id, slug) WHERE workspace_id IS NOT NULL. Resolve the
      // user's owned workspace once up front and use it for both the
      // lookup leg and the insert. When ensureOwnedWorkspace throws,
      // workspaceIdForArtist stays null and the insert produces a row
      // excluded from the partial unique — matching pre-Migration-1
      // fallback behaviour.
      if (!workspaceIdForArtist) {
        try {
          const ws = await ensureOwnedWorkspace(adminClient, auth.user);
          workspaceIdForArtist = ws.id;
        } catch {
          workspaceIdForArtist = null;
        }
      }

      const normalizedSlug = normalizeReleaseSlug(artistName);

      const existingArtistResult = workspaceIdForArtist
        ? await adminClient
            .from(ARTISTS_TABLE)
            .select('id,name')
            .eq('workspace_id', workspaceIdForArtist)
            .eq('slug', normalizedSlug)
            .maybeSingle()
        : { data: null, error: null };

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

    // A Rollout-plan release with no date owes its activities (URG-230).
    // Recorded rather than inferred — see lib/release-template-pending.ts for
    // why it can't be derived, and why it lives in `metadata`.
    const templatePending = releasePlan !== 'blank' && !releaseDateResult.value;

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
        // state/readiness_score are relics of the removed six-stage pipeline
        // UI — no longer written here; both columns carry NOT NULL defaults
        // ('idea' / 0) until a follow-up migration drops them. BEFORE writing
        // that migration: lib/services/release-service.ts still SELECTs both
        // columns for /api/command-center — migrate that read (and the
        // readinessScore fields in types/releases.ts, lib/execution-types.ts,
        // stores/useReleaseStore.ts) first or the dashboard 500s.
        release_type: releaseType,
        description: description || null,
        ...(templatePending ? { metadata: writeTemplatePending(null, true) } : {}),
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
    // Common failure mode absorbed here: TemplateNotAvailableError when the
    // release_type has no template yet (ep, album, music_video at v1).
    //
    // Blank releases (founder call, 2026-07-23) skip the rollout plan
    // entirely — the user builds their own activities from zero.
    //
    // A dateless release is no longer routed here at all (URG-230). It used
    // to fall through and throw 'missing_release_date' into the catch below,
    // which is exactly the silent no-tasks path the required-date rule
    // existed to prevent. Now `templatePending` short-circuits it, and the
    // plan is built by POST /api/releases/[releaseId]/schedule when a date
    // arrives — same instantiateTemplate call, just later.
    if (releasePlan !== 'blank' && !templatePending) {
      try {
        // Reuse the workspace id the artist branch already resolved — a normal
        // create used to run the full ensureOwnedWorkspace (upsert + org sync)
        // twice in one request.
        const workspaceIdForTemplate =
          workspaceIdForArtist ?? (await ensureOwnedWorkspace(adminClient, auth.user)).id;
        const template = getTemplate(releaseType as ReleaseType);
        await instantiateTemplate({
          template,
          releaseId,
          releaseDate: releaseResult.data.release_date
            ? String(releaseResult.data.release_date)
            : null,
          workspaceId: workspaceIdForTemplate,
          ownerUserId: auth.user.id,
          supabaseClient: adminClient,
        });
      } catch (templateError) {
        console.error(
          `Release ${releaseId} created without tasks: template instantiation failed.`,
          templateError
        );
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

    // Activation timing: this was the account's FIRST release (the ownership
    // count above ran before this insert, so 0 means none existed). Once per
    // account by construction — the count is never 0 again.
    if (existingReleaseCountResult.count === 0) {
      const signupMs = new Date(auth.user.created_at || '').getTime();
      if (Number.isFinite(signupMs)) {
        captureServerAnalyticsEvent(
          posthogServer,
          auth.user.id,
          createPostHogEvent('time_to_first_release', {
            seconds_since_signup: Math.max(0, Math.round((Date.now() - signupMs) / 1000)),
          })
        );
      }
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
          has_release_date: Boolean(releaseDateResult.value),
        })
      );
    }

    return NextResponse.json({
      releaseId,
      status: String(releaseResult.data.status || 'draft'),
      // Lets the caller tell "plan built" from "plan waiting on a date"
      // without re-reading the row — the create flows use it to skip the
      // "Your release is set up" guide, which would be untrue here.
      templatePending,
      release: {
        id: releaseId,
        title: String(releaseResult.data.title || title),
        artistId: artistIdToUse || '',
        artistName: String(releaseResult.data.artist_name || artistName),
        releaseDate: releaseResult.data.release_date ? String(releaseResult.data.release_date) : null,
        // New releases have no artwork yet, so the workspace logo (when set)
        // stands in immediately — same fallback the list endpoints apply.
        coverArtUrl:
          coverArtUrl || (await loadWorkspaceLogoFallbackUrl(adminClient, auth.user.id)),
        createdAt: String(releaseResult.data.created_at || now),
        updatedAt: String(releaseResult.data.updated_at || now),
      } satisfies ReleaseOption,
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
