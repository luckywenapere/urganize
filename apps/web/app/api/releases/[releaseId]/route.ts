import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RELEASE_EVENTS_TABLE,
  RELEASE_METADATA_TABLE,
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOwnership,
  ensureReleaseReadAccess,
  requireActiveAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseCommandCenterData,
} from '../_shared';
import { planReleaseEdit } from '@/lib/release-edit';
import { isWorkspaceFeatureEnabled } from '@/lib/artists-server';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';
import { isReleaseActive } from '@/lib/release-activity';

const TASKS_TABLE = 'tasks';
const ASSETS_TABLE = 'assets';
const WORKSPACES_TABLE = 'workspaces';
const WORKSPACE_MEMBERS_TABLE = 'workspace_members';

type ReleaseSuggestedAction =
  | {
      type: 'add_task' | 'invite_team';
      title: string;
      description: string;
      ctaLabel: string;
      href: string;
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
  // Counts come from head-only count queries (no rows shipped), and the two
  // independent lookups run together; only the member count waits on the
  // workspace id.
  const [tasksResult, workspaceResult] = await Promise.all([
    adminClient
      .from(TASKS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('release_id', releaseId),
    adminClient
      .from(WORKSPACES_TABLE)
      .select('id')
      .eq('owner_id', userId)
      .limit(1)
      .maybeSingle(),
  ]);
  const taskCount = !tasksResult.error && typeof tasksResult.count === 'number' ? tasksResult.count : 0;
  const teamMembersResult = workspaceResult.data?.id
    ? await adminClient
        .from(WORKSPACE_MEMBERS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceResult.data.id)
        .neq('role', 'owner')
        .in('status', ['active', 'invited'])
    : { count: 0, error: workspaceResult.error };

  const teamMemberCount =
    !teamMembersResult.error && typeof teamMembersResult.count === 'number'
      ? teamMembersResult.count
      : 0;

  if (tasksResult.error && !isMissingOptionalFeatureTable(tasksResult.error)) {
    throw new Error(tasksResult.error.message || 'Could not load rollout tasks.');
  }

  if (workspaceResult.error && !isMissingOptionalFeatureTable(workspaceResult.error)) {
    throw new Error(workspaceResult.error.message || 'Could not load your team.');
  }

  if (teamMembersResult.error && !isMissingOptionalFeatureTable(teamMembersResult.error)) {
    throw new Error(teamMembersResult.error.message || 'Could not load your team.');
  }

  if (taskCount === 0) {
    return {
      taskCount,
      teamMemberCount,
      suggestedAction: {
        type: 'add_task',
        title: 'Add your first task to stay on track',
        description: 'Tasks give the rollout a real plan instead of leaving important work floating in your head.',
        ctaLabel: 'Open tasks',
        href: `/dashboard?release=${releaseId}`,
      },
    };
  }

  if (teamMemberCount === 0) {
    return {
      taskCount,
      teamMemberCount,
      suggestedAction: {
        type: 'invite_team',
        title: 'Invite your team to assign work',
        description: 'Bring managers, publicists and collaborators into your team so the rollout stops depending on one person.',
        ctaLabel: 'Invite artists, freelancers and team members',
        href: `/settings`,
      },
    };
  }

  return {
    taskCount,
    teamMemberCount,
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
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  // Read path allows any member of the owner's workspace (whole-workspace
  // visibility); PATCH/DELETE below keep owner-only ensureReleaseOwnership.
  const ownership = await ensureReleaseReadAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  // Independent lookups — run together instead of serializing the request.
  const [commandCenter, retentionResult] = await Promise.all([
    loadReleaseCommandCenterData(adminClient!, ownership.release),
    loadReleaseRetentionSummary(adminClient!, releaseId, auth.user.id)
      .then((summary) => ({ summary }))
      .catch((error: unknown) => ({
        retentionError:
          error instanceof Error ? error.message : 'Could not load rollout retention state.',
      })),
  ]);
  if ('error' in commandCenter) return commandCenter.error;
  if ('retentionError' in retentionResult) {
    return NextResponse.json({ error: retentionResult.retentionError }, { status: 500 });
  }
  const retentionSummary: ReleaseRetentionSummary = retentionResult.summary;

  // The computed status is a progress read-out: ready / in_progress / draft,
  // derived from readiness and collaborators. It cannot express `released` or
  // `archived`, so overwriting them here made an archived release read back as
  // `draft` — this endpoint was the only place in the app that lied about it
  // (every other read path returns the stored value). A terminal status is the
  // user's explicit statement about the release and outranks any derivation.
  const storedStatus = String(ownership.release.status || '');
  const computedStatus = !isReleaseActive(storedStatus)
    ? storedStatus
    : commandCenter.readiness.readyForDistribution
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

/**
 * Edits a rollout's own row: title, description, status (and artist_name only
 * where the roster does not own it).
 *
 * A TRUE PARTIAL UPDATE since 2026-09-25, and that is the fix for a real bug:
 * this handler used to write every column on every call, so an omitted field
 * was overwritten — release_date with NULL. UrgAns's rename tool sent only a
 * title and a description, so renaming a rollout wiped its date and the main
 * view hid the whole plan behind "Set a release date first". The rules now live
 * in lib/release-edit.ts (planReleaseEdit, pure and tested): a field that is not
 * in the body is not touched, and the release date is not writable here at all.
 * Dates go through POST /api/releases/[releaseId]/schedule, which builds a
 * waiting plan and moves an existing one so it still lines up with release day.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = await request.json().catch(() => null);

  // ensureReleaseOwnership's shared summary drops release_date, and the edit
  // planner needs it to tell "the same date echoed back" (fine) from "a
  // different date" (refused, and pointed at the schedule route).
  const dateRow = await adminClient!
    .from('releases')
    .select('release_date')
    .eq('id', releaseId)
    .maybeSingle();
  if (dateRow.error) {
    return NextResponse.json(
      { error: dateRow.error.message || 'Could not load rollout.' },
      { status: 500 }
    );
  }

  const plan = planReleaseEdit(
    body,
    {
      title: ownership.release.title,
      slug: ownership.release.slug,
      releaseDate: dateRow.data?.release_date ? String(dateRow.data.release_date) : null,
      description: ownership.release.description,
      status: ownership.release.status,
      artistName: ownership.release.artistName,
    },
    // Artists are renamed via PATCH /api/workspace/artists/[artistId]
    // (renameWorkspaceArtist), which updates artists.name and write-throughs
    // the cache on every release; a release is MOVED to a different artist via
    // POST /api/releases/[releaseId]/artist. With the workspace flag on the
    // release row's artist_name is that cache, and writing it here would
    // silently desync it from artist_id.
    { artistNameEditable: !isWorkspaceFeatureEnabled() }
  );

  if (!plan.ok) {
    return NextResponse.json({ error: plan.error, code: plan.code }, { status: 400 });
  }

  // Nothing changed: answer honestly and write nothing, so an edit that repeats
  // the current values never bumps updated_at or fills the audit trail.
  if (plan.changed.length === 0) {
    return NextResponse.json({
      status: 'saved',
      changed: [],
      release: { id: releaseId, title: ownership.release.title },
    });
  }

  const releaseUpdate = await adminClient!
    .from('releases')
    .update({ ...plan.update, updated_at: new Date().toISOString() })
    .eq('id', releaseId)
    .eq('owner_user_id', auth.user.id);

  if (releaseUpdate.error) {
    if (isOptionalTableMissingError(releaseUpdate.error)) return buildMissingTableResponse();
    return NextResponse.json({ error: releaseUpdate.error.message || 'Could not update rollout.' }, { status: 500 });
  }

  // The metadata row mirrors the title and artist a distributor sees. Written
  // only when one of those actually moved. A failure here is logged rather than
  // answered as a 500: the rollout WAS renamed, and telling the caller it was
  // not is how an assistant ends up retrying a change that already landed.
  const warnings: string[] = [];
  if (plan.changed.includes('title') || plan.changed.includes('artistName')) {
    const metadataUpdate = await adminClient!
      .from(RELEASE_METADATA_TABLE)
      .upsert(
        {
          release_id: releaseId,
          primary_artist_name: plan.next.artistName,
          release_title: plan.next.title,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'release_id' }
      );
    if (metadataUpdate.error) {
      console.error(`[releases/patch] ${releaseId}: metadata write-through failed:`, metadataUpdate.error.message);
      warnings.push('metadata');
    }
  }

  // The audit row records what CHANGED. It used to carry `releaseDate: ''` for
  // every rename, which read as "the date was cleared on purpose".
  const eventResult = await adminClient!.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'metadata_updated',
    payload_json: {
      title: plan.next.title,
      artistName: plan.next.artistName,
      changed: plan.changed,
    },
  });
  if (eventResult.error) {
    console.error(`[releases/patch] ${releaseId}: could not log the edit:`, eventResult.error.message);
  }

  return NextResponse.json({
    status: 'saved',
    changed: plan.changed,
    release: { id: releaseId, title: plan.next.title },
    ...(warnings.length ? { warnings } : {}),
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await requireActiveAuthenticatedUser(request);
    if ('error' in auth) return auth.error;

    const { releaseId } = await context.params;
    if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

    const adminClient = createAdminClient(auth.supabaseUrl);
    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;

    // Storage objects don't cascade with the DB row, so they go first — same
    // ordering as the single-asset DELETE: if storage removal fails we leave
    // everything in place for a retry, since orphan storage is recoverable
    // but DB rows pointing at deleted objects are harder to detect.
    const assetsResult = await adminClient!
      .from(ASSETS_TABLE)
      .select('storage_bucket, storage_path')
      .eq('release_id', releaseId);

    if (assetsResult.error && !isOptionalTableMissingError(assetsResult.error)) {
      return NextResponse.json(
        { error: assetsResult.error.message || 'Could not load rollout assets.' },
        { status: 500 }
      );
    }

    const pathsByBucket = new Map<string, string[]>();
    for (const row of assetsResult.data ?? []) {
      const storagePath = String(row.storage_path || '');
      if (!storagePath) continue;
      const bucket = String(row.storage_bucket || RELEASE_ASSETS_BUCKET);
      const paths = pathsByBucket.get(bucket) ?? [];
      paths.push(storagePath);
      pathsByBucket.set(bucket, paths);
    }

    for (const [bucket, paths] of pathsByBucket) {
      const removeResult = await adminClient!.storage.from(bucket).remove(paths);
      if (removeResult.error) {
        return NextResponse.json(
          { error: removeResult.error.message || 'Could not delete rollout files from storage.' },
          { status: 500 }
        );
      }
    }

    // Child rows (tasks, task_groups, assets, metadata, events, playbook
    // steps, collaborators, activity_logs) all carry ON DELETE CASCADE FKs
    // to releases — one row delete cleans the whole tree.
    const deleteResult = await adminClient!
      .from('releases')
      .delete()
      .eq('id', releaseId)
      .eq('owner_user_id', auth.user.id);

    if (deleteResult.error) {
      if (isOptionalTableMissingError(deleteResult.error)) return buildMissingTableResponse();
      return NextResponse.json(
        { error: deleteResult.error.message || 'Could not delete rollout.' },
        { status: 500 }
      );
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('release_deleted', { release_id: releaseId })
    );

    return new NextResponse(null, { status: 204 });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
