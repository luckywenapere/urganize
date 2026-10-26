import { afterResponse } from '@/lib/after-response';
import { NextRequest, NextResponse } from 'next/server';
import { buildPreProductionTaskRows, isPreProductionPlan } from '@/lib/pre-production';
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
import { DEFAULT_RELEASE_TITLE, isDbReleaseType, type DbReleaseType } from '@/types/releases';
import { writeTemplatePending } from '@/lib/release-template-pending';
import { writePlannerPending } from '@/lib/release-planner-pending';
import { isReleasePlannerEnabled } from '@/lib/release-planning';
import { isTestReleaseEnabled, readTestRelease, writeTestRelease } from '@/lib/test-release';
import { isSocialShareEnabled } from '@/lib/social-share';
import { FIRST_RELEASE_TEST_SCAN, decideFirstRelease } from '@/lib/social-share-offer';
import { enqueueReleaseReminders } from '@/lib/release-reminders-server';
import { captureActivationIfReached } from '@/lib/activation-server';
import { isPlannerAutoEnabled } from '@/lib/planner-auto';
import { runOnboardingAutoPlan } from '@/lib/planner-auto-server';
import { toPlannerOnboardingContext } from '@/lib/release-planning-actions-server';
import { normalizeReadyToday } from '@/lib/onboarding-readiness';
import { loadPlannerTeam } from './[releaseId]/plan/_shared';

// The onboarding rollout builds its plan after the reply (2026-10-17, auto
// plan): after() keeps this invocation alive for the plan's model call, whose
// deadline counts from the request start (PLANNER_DEADLINE_MS, 52 s), so the
// function needs the same 60 s ceiling as POST /api/releases/[id]/plan.
export const maxDuration = 60;

type ReleaseSelectorListResponse = { releases: ReleaseOption[] };

function sanitizeTextField(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}
import { ensureOwnedWorkspace, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { instantiateTemplate } from '@/lib/release-templates/instantiate';
import {
  CONFIRM_RELEASE_DATE_DESCRIPTION,
  CONFIRM_RELEASE_DATE_TITLE,
  ONBOARDING_BLANK_TEMPLATE_ID,
  ONBOARDING_CONFIRM_DATE_TASK_ID,
  blankSeedDueDate,
} from '@/lib/pinned-confirm-date';
import { getTemplate } from '@/lib/release-templates/loader';
import type { ReleaseType } from '@/lib/release-templates/types';
import { loadCoverArtUrls, type ResolvedCoverArt } from '@/lib/cover-art';
import { loadWorkspaceLogoFallbackUrl } from '@/lib/workspace-logo';
import {
  checkArtistAllowance,
  getWorkspaceArtist,
  isWorkspaceFeatureEnabled,
} from '@/lib/artists-server';
import { type ReleaseCreatedSource } from '@/lib/analytics';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';
import { checkActiveReleaseAllowance } from '@/lib/release-cap-server';
import { recordLimitHit } from '@/lib/seats-server';
import { resolveRolloutOrigin } from '@/lib/rollout-origin';

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
  /** Why it was made (lib/rollout-origin.ts): 'hint' from an offer the app
   * showed; anything else is 'choice', and the sign-up wizard is always
   * 'onboarding'. Stored as metadata.origin. */
  origin?: unknown;
  /** 'template' (default) instantiates the rollout plan; 'blank' creates an
   * empty release the user builds up themself (founder call, 2026-07-23). */
  plan?: unknown;
  /** The one-tap test path (NEXT_PUBLIC_FEATURE_TEST_RELEASE): marks the row
   * with the `test_release` metadata key, forces the classic template plan,
   * and skips the release reminders. Refused with a 400 when the flag is off
   * and when no release date is supplied — see the isTest block below. */
  isTest?: unknown;
  /** Onboarding's answers for the auto build (2026-10-17): "What's already
   * done?" and "Where does a rollout usually fall apart?". Only read for an
   * onboarding rollout on the template path. */
  autoPlan?: { readyToday?: unknown; whereStuck?: unknown } | null;
};

function toSelectorRelease(
  row: ReleaseRow,
  coverByReleaseId: Map<string, ResolvedCoverArt>,
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
    // Small copy for the picker rows; null falls back to coverArtUrl.
    coverThumbUrl: coverByReleaseId.get(row.id)?.thumbUrl ?? null,
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
        { error: error.message || 'Could not load rollout artwork.' },
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
  coverByReleaseId: Map<string, ResolvedCoverArt>,
  metadataByReleaseId: Map<string, ReleaseMetadataRow>,
  workspaceLogoUrl: string | null
): string | null {
  return (
    coverByReleaseId.get(releaseId)?.url ||
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
  if (
    value === 'onboarding' ||
    value === 'empty_state' ||
    value === 'chappi' ||
    value === 'planner' ||
    value === 'test_path'
  ) {
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
    .is('deleted_at', null)
    .order('release_date', { ascending: true, nullsFirst: false });

  if (releasesResult.error) {
    if (isOptionalTableMissingError(releasesResult.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: releasesResult.error.message || 'Could not load rollouts.' }, { status: 500 });
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
  const coverByReleaseId = await loadCoverArtUrls(adminClient, releases);
  const workspaceLogoUrl = await loadWorkspaceLogoFallbackUrl(adminClient, auth.user.id);

  const payload: ReleaseSelectorListResponse = {
    releases: releases.map((release) =>
      toSelectorRelease(release, coverByReleaseId, metadataResult.metadataByReleaseId, workspaceLogoUrl)
    ),
  };

  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  const posthogServer = createServerPostHogClient();

  try {
    // *OrInternal: the Chappi/MCP tool layer creates releases by calling this
    // route internally, so it also accepts the MCP internal actor (URG-183).
    const auth = await requireAuthenticatedAdminOrInternal(request);
    if ('error' in auth) return auth.error;

    const { adminClient } = auth;

    // Independent reads, run together (2026-10-11, first-user flow: the
    // onboarding create was a long chain of sequential round trips). The
    // schema answer is still checked first, so its error wins as before.
    const [schemaStatus, existingReleaseCountResult] = await Promise.all([
      ensureReleaseOpsSchema(adminClient),
      adminClient
        .from('releases')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', auth.user.id)
        .is('deleted_at', null),
    ]);
    if ('error' in schemaStatus) return schemaStatus.error;

    if (existingReleaseCountResult.error) {
      if (isOptionalTableMissingError(existingReleaseCountResult.error)) {
        return buildMissingTableResponse('Release access check failed because the releases schema is incomplete.');
      }

      return NextResponse.json(
        { error: existingReleaseCountResult.error.message || 'Could not verify rollout access.' },
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
    // Validated against the DB enum, which is the difference between a clear
    // 400 and the generic 500 an unknown value used to produce at the Postgres
    // boundary. Deliberately NOT gated on whether that type's playbook is
    // switched on: the planner intake offers EP and album regardless (it falls
    // back to the single playbook), and 400ing that live flow would be a
    // regression. Template availability is the loader's call, further down.
    const releaseTypeInput = trimString(body?.releaseType);
    let releaseType: DbReleaseType = 'single';
    if (releaseTypeInput) {
      if (!isDbReleaseType(releaseTypeInput)) {
        return NextResponse.json(
          { error: "Format must be 'single', 'ep', or 'album'." },
          { status: 400 }
        );
      }
      releaseType = releaseTypeInput;
    }
    const coverArtUrl = trimString(body?.coverArtUrl);
    const releaseSource = normalizeReleaseCreatedSource(body?.source);
    const rolloutOrigin = resolveRolloutOrigin({ source: releaseSource, origin: body?.origin });
    const isTest = body?.isTest === true;
    if (isTest && !isTestReleaseEnabled()) {
      // Loud refusal rather than silently ignoring the field: dropping it
      // would mint an unmarked release titled "Test release" — no card tag,
      // no banner, no delete exit, and nothing explaining why. The route
      // itself stays ungated; every ordinary create must keep working.
      return NextResponse.json({ error: 'Test rollouts are not switched on.' }, { status: 400 });
    }
    // A test release always takes the template plan: a blank one would be an
    // empty activity list under a banner that says "tick activities off", and
    // seeing the full plan is what the test path exists to show.
    // 'pre_production' (URG-280, 2026-10-16): "Start the next one". No date,
    // eight undated Pre-production activities, and the planner still owed for
    // the release plan once a date lands (see lib/pre-production.ts).
    const planInput = trimString(body?.plan);
    const releasePlan: 'template' | 'blank' | 'pre_production' = isTest
      ? 'template'
      : planInput === 'blank'
        ? 'blank'
        : isPreProductionPlan(planInput)
          ? 'pre_production'
          : 'template';

    // parseOptionalReleaseDate returns { value: null } for empty input — the
    // tolerance it was always written for, previously unreachable because the
    // hard 400 above sat in front of it. A malformed date is still a 400.
    const releaseDateResult = parseOptionalReleaseDate(releaseDateInput);
    if (releaseDateResult.error) {
      return NextResponse.json({ error: releaseDateResult.error }, { status: 400 });
    }
    if (isTest && !releaseDateResult.value) {
      // Load-bearing, not politeness. The insert below writes `metadata`
      // through mutually-exclusive spreads, and a dateless isTest would make
      // templatePending true beside it — two spreads setting the same key,
      // last one wins, template_pending silently lost, a release that never
      // instantiates. buildTestReleaseDraft always supplies a date; this
      // guard is what makes the spread exclusivity provable rather than
      // assumed.
      return NextResponse.json({ error: 'A test rollout needs a release date.' }, { status: 400 });
    }

    if (coverArtUrl && !isValidHttpUrl(coverArtUrl)) {
      return NextResponse.json({ error: 'Cover art URL is invalid.' }, { status: 400 });
    }

    // Share to socials (2026-09-23): was this the person's first REAL rollout?
    // The share sheet opens by itself once, right after it. Decided here, from
    // what they owned BEFORE this insert, because the client's copy of the
    // catalog may not have loaded. Test rollouts never count either way, which
    // needs their metadata, so the extra read only happens for somebody with a
    // handful of earlier rollouts, and only with the feature on. A failed read
    // answers "not the first": silence, with the Share button still there.
    let firstRelease = false;
    if (isSocialShareEnabled() && !isTest) {
      const priorCount = existingReleaseCountResult.count ?? 0;
      let priorTestFlags: boolean[] | null = [];
      if (priorCount > 0 && priorCount <= FIRST_RELEASE_TEST_SCAN) {
        const { data: priorRows, error: priorError } = await adminClient
          .from('releases')
          .select('metadata')
          .eq('owner_user_id', auth.user.id)
          .is('deleted_at', null)
          .limit(FIRST_RELEASE_TEST_SCAN);
        priorTestFlags =
          priorError || !Array.isArray(priorRows)
            ? null
            : priorRows.map((row) =>
                readTestRelease((row as { metadata?: Record<string, unknown> | null }).metadata)
              );
      }
      firstRelease = decideFirstRelease({ isTest, priorCount, priorTestFlags });
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
        // THE SECOND ARTIST CREATION POINT. Naming an artist we have not seen
        // mints one, so this path has to respect the roster ceiling exactly as
        // POST /api/workspace/artists does — capping only the button in
        // Settings would leave the API wide open, which is the hole the seat
        // cap had to close across two routes.
        //
        // Only reachable with a workspace resolved; without one the insert
        // produces a row excluded from the partial unique index and there is no
        // roster to count against, so it falls through uncapped as before.
        if (workspaceIdForArtist) {
          const allowance = await checkArtistAllowance(adminClient, workspaceIdForArtist);
          if (!allowance.allowed) {
            await recordLimitHit(adminClient, {
              workspaceId: workspaceIdForArtist,
              actorUserId: auth.user.id,
              key: allowance.key,
              limit: allowance.limit,
              current: allowance.current,
            });
            return NextResponse.json({ error: allowance.message, limitKey: allowance.key, upgradeTo: allowance.upgradeTo }, { status: 409 });
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

    // With the planner on, a Rollout-plan release is created with no
    // activities at all: the manager plans it with UrgAns and approves a draft
    // before anything is scheduled. Recorded as its own marker rather than
    // reusing template_pending, because that flag makes the schedule route
    // instantiate the whole template the moment a date lands, which is exactly
    // what the draft flow exists to prevent. See lib/release-planner-pending.ts.
    //
    // A test release opts OUT of the planner: it must land with its full plan
    // instantly, and routing a tester into the planner intake is exactly the
    // pressure the test path removes.
    const plannerPending = isReleasePlannerEnabled() && releasePlan !== 'blank' && !isTest;

    // A Rollout-plan release with no date owes its activities (URG-230).
    // Recorded rather than inferred — see lib/release-template-pending.ts for
    // why it can't be derived, and why it lives in `metadata`.
    const templatePending =
      !plannerPending && releasePlan === 'template' && !releaseDateResult.value;

    // Active-release ceiling. Separate from the existing count above, which has
    // no status predicate on purpose: that one feeds first-release analytics and
    // means "releases ever". This one means "releases still being worked", which
    // is what the cap is about and what the identity card already shows.
    //
    // Placed immediately before the insert so nothing is half-created when it
    // refuses, and after every validation so a refusal is the LAST word rather
    // than pre-empting a 400 the caller should see first.
    const releaseCap = await checkActiveReleaseAllowance(adminClient, auth.user.id);
    if (!releaseCap.verdict.allowed) {
      await recordLimitHit(adminClient, {
        workspaceId: releaseCap.workspaceId ?? '',
        ownerUserId: auth.user.id,
        actorUserId: auth.user.id,
        key: releaseCap.verdict.key,
        limit: releaseCap.verdict.limit,
        current: releaseCap.verdict.current,
      });
      return NextResponse.json({ error: releaseCap.verdict.message, limitKey: releaseCap.verdict.key, upgradeTo: releaseCap.verdict.upgradeTo }, { status: 409 });
    }

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
        // Exactly one of these three can be true: isTest forces plannerPending
        // false above, and a dateless isTest is refused with a 400, so
        // templatePending (which requires no date) cannot coexist with it
        // either. Three spreads onto one key are only safe while that holds.
        // Where the rollout was made (2026-10-17), so onboarding against later
        // is measurable in SQL; it rides on whichever flag applies.
        metadata: {
          ...(templatePending ? writeTemplatePending(null, true) : {}),
          ...(plannerPending ? writePlannerPending(null, true) : {}),
          ...(isTest ? writeTestRelease(null, true) : {}),
          created_source: releaseSource,
          // Why it was made (2026-10-24): choice, hint or onboarding.
          origin: rolloutOrigin,
        },
        updated_at: now,
      })
      .select('id,status,artist_name,title,release_date,created_at,updated_at')
      .single();

    if (releaseResult.error || !releaseResult.data?.id) {
      if (isOptionalTableMissingError(releaseResult.error)) {
        return buildMissingTableResponse('Release creation failed because the releases schema is incomplete.');
      }
      return NextResponse.json({ error: releaseResult.error?.message || 'Could not create rollout.' }, { status: 500 });
    }

    const releaseId = String(releaseResult.data.id);

    // The metadata row and the created event both hang off the new release
    // and not off each other, so they are written together. Errors are read
    // in the old order: metadata first, then the event.
    const [metadataResult, eventResult] = await Promise.all([
      adminClient
        .from(RELEASE_METADATA_TABLE)
        .insert({
          release_id: releaseId,
          primary_artist_name: artistName,
          release_title: title,
          artwork_url: coverArtUrl || null,
          updated_at: now,
        })
        .select('id')
        .single(),
      adminClient.from(RELEASE_EVENTS_TABLE).insert({
        release_id: releaseId,
        type: 'release_created',
        payload_json: {
          title,
          artistName,
        },
      }),
    ]);

    if (metadataResult.error) {
      if (isOptionalTableMissingError(metadataResult.error)) {
        return buildMissingTableResponse('Metadata initialization failed because the metadata schema is incomplete.');
      }
      return NextResponse.json({ error: metadataResult.error.message || 'Could not initialize metadata.' }, { status: 500 });
    }

    if (eventResult.error) {
      if (isOptionalTableMissingError(eventResult.error)) {
        return buildMissingTableResponse('Release event logging failed because the events schema is incomplete.');
      }
      return NextResponse.json({ error: eventResult.error.message || 'Could not log rollout event.' }, { status: 500 });
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
    //
    // With the planner on (`plannerPending`), no plan is built here at all.
    // The manager answers the intake, edits the draft UrgAns tailors from this
    // same template, and approval is what writes the task rows.
    if (releasePlan === 'template' && !templatePending && !plannerPending) {
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

    // A start-from-scratch rollout made in onboarding (URG-251 flow, agreed
    // with Oyin 2026-10-14) begins with exactly one activity, "Confirm your
    // release date", which the planner pins on top for a new user (see
    // lib/pinned-confirm-date.ts). Only from onboarding: a blank rollout made
    // in the app stays truly blank, as it always has. Best-effort, like the
    // template above: the rollout exists either way.
    if (releasePlan === 'pre_production') {
      // Best-effort, like the template above: the rollout exists either way,
      // and the manager can add the activities by hand.
      try {
        const workspaceIdForSeed =
          workspaceIdForArtist ?? (await ensureOwnedWorkspace(adminClient, auth.user)).id;
        const { error: seedError } = await adminClient
          .from('tasks')
          .insert(buildPreProductionTaskRows({ releaseId, workspaceId: workspaceIdForSeed, createdBy: auth.user.id }));
        if (seedError) {
          console.error(`Release ${releaseId} created without its pre-production activities.`, seedError);
        }
      } catch (seedError) {
        console.error(`Release ${releaseId} created without its pre-production activities.`, seedError);
      }
    }

    if (releasePlan === 'blank' && releaseSource === 'onboarding' && !isTest) {
      try {
        const workspaceIdForSeed =
          workspaceIdForArtist ?? (await ensureOwnedWorkspace(adminClient, auth.user)).id;
        const seedReleaseDate = releaseResult.data.release_date
          ? String(releaseResult.data.release_date).slice(0, 10)
          : null;
        const { error: seedError } = await adminClient.from('tasks').insert({
          release_id: releaseId,
          workspace_id: workspaceIdForSeed,
          group_id: null,
          created_by: auth.user.id,
          assigned_to_user_id: auth.user.id,
          assigned_to: null,
          assigned_collaborator_id: null,
          title: CONFIRM_RELEASE_DATE_TITLE,
          description: CONFIRM_RELEASE_DATE_DESCRIPTION,
          status: 'todo',
          priority: 'none',
          state: 'planning',
          position: 0,
          auto_generated: true,
          due_date: blankSeedDueDate({ now: Date.now(), releaseDate: seedReleaseDate }),
          dependencies: [],
          metadata: {
            template: {
              template_id: ONBOARDING_BLANK_TEMPLATE_ID,
              template_version: '1.0.0',
              task_id: ONBOARDING_CONFIRM_DATE_TASK_ID,
              role: 'manager',
              task_type: 'task',
              duration_days: 1,
              optional: false,
              tags: ['planning'],
              compressed_runway: false,
            },
          },
        });
        if (seedError) {
          console.error(`Release ${releaseId}: could not seed its first activity.`, seedError);
        }
      } catch (seedError) {
        console.error(`Release ${releaseId}: could not seed its first activity.`, seedError);
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

    // Activation (2026-10-01): a first REAL rollout plus one teammate invited,
    // within 3 days of signup. A test rollout is practice and cannot complete
    // it. Never throws; see lib/activation-server.ts.
    // After the reply (2026-10-11): it only records, and never throws, so the
    // person creating the rollout does not wait on it.
    if (!isTest) {
      const activationOwnerId = auth.user.id;
      const activationSignupAt = auth.user.created_at;
      afterResponse('release activation check', () =>
        captureActivationIfReached(adminClient, {
          ownerUserId: activationOwnerId,
          trigger: 'release',
          signupAt: activationSignupAt,
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

    // Auto-plan (2026-10-17, approved mocks in mocks/auto-plan): the rollout
    // onboarding makes on the "UrgAns recommendations" path builds its plan on
    // the server, after this reply, while the manager is still on the
    // paywall, welcome and invite screens. Same build as POST /plan, with
    // onboarding's answers plus goal "new listeners" and no budget.
    const planAuto =
      isPlannerAutoEnabled() &&
      releaseSource === 'onboarding' &&
      plannerPending &&
      releasePlan === 'template' &&
      !isTest &&
      Boolean(releaseDateResult.value);
    if (planAuto) {
      const autoUser = { id: auth.user.id, email: auth.user.email ?? null };
      const readyToday = normalizeReadyToday(
        Array.isArray(body?.autoPlan?.readyToday) ? (body.autoPlan.readyToday as unknown[]) : []
      );
      const whereStuck = Array.isArray(body?.autoPlan?.whereStuck)
        ? (body.autoPlan.whereStuck as unknown[]).filter((value): value is string => typeof value === 'string')
        : [];
      afterResponse('onboarding auto plan', () =>
        runOnboardingAutoPlan(adminClient, {
          releaseId,
          user: autoUser,
          readyToday,
          onboarding: toPlannerOnboardingContext({
            onboarding_where_stuck: whereStuck,
            onboarding_planning_preference: 'ai_recommendations',
          }),
          requestStartedAt,
          loadTeam: () => loadPlannerTeam(adminClient, releaseId, autoUser),
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

    // Re-engagement nudges (mobile push notifications, 2026-08-10): a couple
    // of reminders in case the user creates this release and doesn't come
    // back. Never throws — a queueing failure must never fail release
    // creation. Rides the existing scheduled_notifications flusher, no new
    // cron. Skipped for a test release: a "come back to your release" push
    // about a practice release is the pressure the test path removes.
    // Queued after the reply (2026-10-11), for the same reason as activation.
    if (!isTest) {
      const reminderUserId = auth.user.id;
      const reminderTitle = String(releaseResult.data.title || title);
      afterResponse('release reminders', () =>
        enqueueReleaseReminders(adminClient, {
          userId: reminderUserId,
          releaseId,
          releaseTitle: reminderTitle,
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
      // True when this release is waiting to be planned with UrgAns. Callers
      // use it to route the manager into the planner instead of showing a
      // "your release is set up" guide that would not be true yet.
      plannerPending,
      // True when the plan is building on its own (auto-plan): the caller
      // must not open the planning questions for this rollout.
      planAuto,
      // The person's first real rollout: the create flows open the share
      // sheet once off the back of it. Always false with the feature off.
      firstRelease,
      release: {
        id: releaseId,
        title: String(releaseResult.data.title || title),
        artistId: artistIdToUse || '',
        artistName: String(releaseResult.data.artist_name || artistName),
        // Echoed so an optimistic client row agrees with the stored row about
        // which playbook this release follows — the per-type activity-count and
        // runway copy reads it.
        releaseType,
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
