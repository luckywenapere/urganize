import { NextRequest, NextResponse } from 'next/server';
import {
  buildMissingTableResponse,
  createAdminClient,
  ensureReleaseOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  RELEASE_EVENTS_TABLE,
} from '../../_shared';
import {
  buildReleasePlaybookState,
  playbookSnapshotsMatch,
  updateReleasePlaybookSnapshot,
} from '@/lib/release-playbook';

const PLAYBOOK_EVENT_TYPE = 'playbook_state_saved';

const toPlaybookResponse = (playbook: ReturnType<typeof buildReleasePlaybookState>) => ({
  phases: playbook.phases,
  completedCount: playbook.completedCount,
  totalCount: playbook.totalCount,
  remainingCount: playbook.remainingCount,
  completionPercent: playbook.completionPercent,
});

const loadLatestPlaybookEvent = async (releaseId: string, adminClient: NonNullable<ReturnType<typeof createAdminClient>>) =>
  adminClient
    .from(RELEASE_EVENTS_TABLE)
    .select('id,payload_json,created_at')
    .eq('release_id', releaseId)
    .eq('type', PLAYBOOK_EVENT_TYPE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

const persistPlaybookSnapshot = async (
  releaseId: string,
  userId: string,
  snapshotItems: ReturnType<typeof buildReleasePlaybookState>['snapshotItems'],
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>
) =>
  adminClient.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: PLAYBOOK_EVENT_TYPE,
    payload_json: {
      items: snapshotItems,
      updatedAt: new Date().toISOString(),
      updatedByUserId: userId,
    },
  });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const playbookEventResult = await loadLatestPlaybookEvent(releaseId, adminClient!);
  if (playbookEventResult.error) {
    if (isOptionalTableMissingError(playbookEventResult.error)) {
      return buildMissingTableResponse();
    }
    return NextResponse.json(
      { error: playbookEventResult.error.message || 'Could not load release playbook.' },
      { status: 500 }
    );
  }

  const savedSnapshot = (playbookEventResult.data?.payload_json as { items?: unknown } | null)?.items;
  const playbook = buildReleasePlaybookState(savedSnapshot);

  if (!playbookEventResult.data?.id || !playbookSnapshotsMatch(savedSnapshot, playbook.snapshotItems)) {
    const persistResult = await persistPlaybookSnapshot(releaseId, auth.user.id, playbook.snapshotItems, adminClient!);
    if (persistResult.error) {
      if (isOptionalTableMissingError(persistResult.error)) {
        return buildMissingTableResponse();
      }
      return NextResponse.json(
        { error: persistResult.error.message || 'Could not initialize release playbook.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    release: ownership.release,
    playbook: toPlaybookResponse(playbook),
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const itemKey = String((body as { itemKey?: unknown } | null)?.itemKey || '').trim();
  const rawCompleted = (body as { isCompleted?: unknown } | null)?.isCompleted;

  if (!itemKey) {
    return NextResponse.json({ error: 'Playbook item is required.' }, { status: 400 });
  }

  if (typeof rawCompleted !== 'boolean') {
    return NextResponse.json({ error: 'Completion state is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const playbookEventResult = await loadLatestPlaybookEvent(releaseId, adminClient!);
  if (playbookEventResult.error) {
    if (isOptionalTableMissingError(playbookEventResult.error)) {
      return buildMissingTableResponse();
    }
    return NextResponse.json(
      { error: playbookEventResult.error.message || 'Could not load release playbook.' },
      { status: 500 }
    );
  }

  const savedSnapshot = (playbookEventResult.data?.payload_json as { items?: unknown } | null)?.items;
  const updatedSnapshot = updateReleasePlaybookSnapshot(savedSnapshot, itemKey, rawCompleted, new Date().toISOString());
  if (!updatedSnapshot) {
    return NextResponse.json({ error: 'Playbook item not found.' }, { status: 404 });
  }

  const persistResult = await persistPlaybookSnapshot(releaseId, auth.user.id, updatedSnapshot, adminClient!);
  if (persistResult.error) {
    if (isOptionalTableMissingError(persistResult.error)) {
      return buildMissingTableResponse();
    }
    return NextResponse.json(
      { error: persistResult.error.message || 'Could not update release playbook.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    playbook: toPlaybookResponse(buildReleasePlaybookState(updatedSnapshot)),
  });
}
