import type { SupabaseClient } from '@supabase/supabase-js';

import { editorialRow, sortEditorialRows, type EditorialRow } from '@/lib/editorial-overview';
import { isEditorialPitchTask } from '@/lib/editorial-pitch';
import { readPitchTaskMeta, readTemplateOrigin } from '@/lib/editorial-pitch-server';
import { IN_LIST_CHUNK, inChunks } from '@/lib/paged-rows';
import { decideReleaseAccess } from '@/lib/release-access';
import { readTestRelease } from '@/lib/test-release';
import type { WorkspaceAccessContext } from '@/lib/tasks-server';

type ReleaseRow = {
  id: string;
  owner_user_id: string;
  artist_id: string;
  title: string | null;
  release_date: string | null;
  status: string | null;
  metadata: unknown;
};

/**
 * Every visible rollout's editorial pitch, for the Pitching page. Read only.
 * Returns null when a read fails: a half-read list must not look complete.
 *
 * Each release goes through decideReleaseAccess (the owner list is a team
 * boundary, not a per-release one) and fails closed. Test and archived
 * rollouts are left out, as the backfill leaves them out.
 */
export async function loadEditorialOverview(
  admin: SupabaseClient,
  access: WorkspaceAccessContext,
  userId: string,
  now: Date
): Promise<EditorialRow[] | null> {
  const ownerIds = access.releaseOwnerIds.length ? access.releaseOwnerIds : [userId];
  const { data, error } = await admin
    .from('releases')
    .select('id,owner_user_id,artist_id,title,release_date,status,metadata')
    .in('owner_user_id', ownerIds)
    .is('deleted_at', null)
    .limit(1000);
  if (error) return null;

  const releases = ((data || []) as ReleaseRow[]).filter(
    (release) =>
      release.status !== 'archived' &&
      !readTestRelease((release.metadata || {}) as never) &&
      decideReleaseAccess({
        releaseOwnerId: release.owner_user_id,
        releaseArtistId: release.artist_id,
        userId,
        access,
        write: false,
      }) === 'allow'
  );
  if (!releases.length) return [];
  const byId = new Map(releases.map((release) => [release.id, release]));

  const rows: EditorialRow[] = [];
  for (const group of inChunks(Array.from(byId.keys()), IN_LIST_CHUNK)) {
    const { data: tasks, error: taskError } = await admin
      .from('tasks')
      .select('id,release_id,status,metadata')
      .in('release_id', group);
    if (taskError) return null;
    for (const task of (tasks || []) as Array<{
      id: string;
      release_id: string;
      status: string | null;
      metadata: unknown;
    }>) {
      if (!isEditorialPitchTask(readTemplateOrigin(task.metadata).taskId)) continue;
      const release = byId.get(task.release_id);
      if (!release) continue;
      const meta = readPitchTaskMeta(task.metadata);
      rows.push(
        editorialRow(
          {
            releaseId: release.id,
            releaseTitle: release.title || 'Untitled rollout',
            releaseDate: release.release_date,
            taskId: task.id,
            taskStatus: task.status,
            skippedAt: meta.skippedAt,
            fields: meta.fields,
          },
          now
        )
      );
    }
  }
  return sortEditorialRows(rows);
}
