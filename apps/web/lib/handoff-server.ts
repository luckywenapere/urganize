// The handoff to the distributor: the reads, the task sync and the writes.
// Server only. The rules and the shapes are lib/handoff.ts; see the note at the
// top of that file for where each part is kept.
//
// THE TASKS ARE IDEMPOTENT BY ID. Each row's task id is derived from the
// rollout and the item (handoffTaskId), so two tabs opening the Distribute step
// at once cannot make two tasks: the second insert collides on the primary key
// and is ignored. No claim row, no new table.

import { handoffTaskId } from './handoff-task-id';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkDistributionFacts } from './distribution-rules';
import { loadDistributionFacts } from './distribution-server';
import { splitTotalIsOff, sumSplits } from './credit-split-totals';
import { readTestRelease } from './test-release';
import { createTaskNotification, loadProfilesByIds, loadWorkspaceMembers } from './tasks-server';
import {
  HANDOFF_ITEMS,
  SHOWN_HANDOFF_ITEMS,
  HANDOFF_ITEM_LABELS,
  HANDOFF_TASK_DESCRIPTION,
  HANDOFF_TASK_TAG,
  HANDOFF_TASK_TITLES,
  LEAD_DAYS_METADATA_KEY,
  canActOnItem,
  deriveHandoffStatus,
  dueDateToTimestamp,
  fixFor,
  handoffDueDate,
  isUploaded,
  itemErrors,
  planHandoffTaskSync,
  readHandoffRecord,
  readLeadDays,
  withItemRecord,
  type HandoffItemKey,
  type HandoffItemView,
  type HandoffLeadDays,
  type HandoffMember,
  type HandoffPayload,
  type HandoffTaskState,
} from './handoff';

const TASKS_TABLE = 'tasks';
const RELEASES_TABLE = 'releases';

type ReleaseRow = {
  id: string;
  owner_user_id: string;
  artist_id: string | null;
  release_date: string | null;
  status: string | null;
  artwork_asset_id: string | null;
  metadata: unknown;
};

type TaskRow = {
  id: string;
  workspace_id: string | null;
  status: string;
  assigned_to_user_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  metadata: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

const taskItem = (metadata: unknown): HandoffItemKey | null => {
  const tag = asRecord(metadata)[HANDOFF_TASK_TAG];
  return (HANDOFF_ITEMS as readonly string[]).includes(String(tag)) ? (tag as HandoffItemKey) : null;
};

/** Whether this rollout should carry handoff tasks at all. A plan still being
 *  built, a test rollout and a finished one get none. */
function shouldSyncTasks(release: ReleaseRow): boolean {
  const metadata = asRecord(release.metadata);
  if (readTestRelease(metadata)) return false;
  if (metadata.planner_pending === true || metadata.template_pending === true) return false;
  return release.status !== 'archived' && release.status !== 'released';
}

async function workspaceIdOf(admin: SupabaseClient, ownerUserId: string): Promise<string | null> {
  const { data, error } = await admin.from('workspaces').select('id').eq('owner_id', ownerUserId).maybeSingle();
  if (error) return null;
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * The people a row can belong to: the rollout owner and every joined teammate
 * on their team who can see this artist. Guests are read-only, so they never
 * own a row. The owner is always on the list, even with no member row.
 */
async function loadHandoffMembers(
  admin: SupabaseClient,
  release: ReleaseRow,
  viewerId: string,
  workspaceId: string | null
): Promise<HandoffMember[]> {
  const people = new Map<string, string>();
  if (workspaceId) {
    try {
      const [members, scopes] = await Promise.all([
        loadWorkspaceMembers(admin, workspaceId, viewerId),
        admin.from('workspace_members').select('id,artist_scope_id').eq('workspace_id', workspaceId),
      ]);
      const scopeById = new Map<string, string | null>(
        ((scopes.data as Array<{ id: string; artist_scope_id: string | null }> | null) ?? []).map((row) => [
          String(row.id),
          row.artist_scope_id ? String(row.artist_scope_id) : null,
        ])
      );
      for (const member of members) {
        if (!member.userId || member.status !== 'active' || member.role === 'guest') continue;
        const scope = scopeById.get(member.id) ?? null;
        if (scope && release.artist_id && scope !== release.artist_id) continue;
        people.set(member.userId, member.name || member.email);
      }
    } catch {
      // The owner alone is still a working list.
    }
  }
  if (!people.has(release.owner_user_id)) {
    const profiles = await loadProfilesByIds(admin, [release.owner_user_id]);
    const profile = profiles.get(release.owner_user_id) as { name?: string; email?: string } | undefined;
    people.set(release.owner_user_id, asText(profile?.name) ?? asText(profile?.email) ?? 'Rollout owner');
  }
  const list = [...people.entries()].map(([userId, name]) => {
    const isYou = userId === viewerId;
    const shown = isYou ? 'You' : name;
    return { userId, name: shown, initial: (shown.trim()[0] ?? '?').toUpperCase(), isYou };
  });
  return list.sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));
}

/** The rollout's handoff tasks by item, and whether it has a plan at all (any
 *  other task). Null when the read failed. */
async function loadHandoffTasks(
  admin: SupabaseClient,
  releaseId: string
): Promise<{ byItem: Map<HandoffItemKey, TaskRow>; hasPlan: boolean; planWorkspaceId: string | null } | null> {
  const { data, error } = await admin
    .from(TASKS_TABLE)
    .select('id,workspace_id,status,assigned_to_user_id,due_date,completed_at,metadata')
    .eq('release_id', releaseId);
  if (error) return null;
  const byItem = new Map<HandoffItemKey, TaskRow>();
  let hasPlan = false;
  let planWorkspaceId: string | null = null;
  for (const row of (data as TaskRow[] | null) ?? []) {
    const item = taskItem(row.metadata);
    if (!item) {
      hasPlan = true;
      planWorkspaceId = planWorkspaceId ?? asText(row.workspace_id);
      continue;
    }
    // Prefer the derived id if an older duplicate ever exists.
    const existing = byItem.get(item);
    if (!existing || row.id === handoffTaskId(releaseId, item)) byItem.set(item, row);
  }
  return { byItem, hasPlan, planWorkspaceId };
}

const toTaskState = (row: TaskRow | undefined): HandoffTaskState | null =>
  row
    ? {
        id: row.id,
        status: String(row.status),
        assignedToUserId: row.assigned_to_user_id,
        dueDate: row.due_date,
        completedAt: row.completed_at,
      }
    : null;

export type LoadedHandoff = {
  release: ReleaseRow;
  workspaceId: string | null;
  payload: HandoffPayload;
  /** What each item's approval would be for right now. */
  fingerprints: Record<HandoffItemKey, string | null>;
  tasks: Map<HandoffItemKey, TaskRow>;
};

/**
 * Read everything, bring the three tasks into step, and build what the screen
 * shows. Null when any read the status depends on failed: a wrong "Uploaded" is
 * worse than an error with Try again.
 */
export async function loadHandoff(
  admin: SupabaseClient,
  releaseId: string,
  viewerId: string,
  options: { sync?: boolean } = {}
): Promise<LoadedHandoff | null> {
  const [releaseResult, metadataResult, facts] = await Promise.all([
    admin
      .from(RELEASES_TABLE)
      .select('id,owner_user_id,artist_id,release_date,status,artwork_asset_id,metadata')
      .eq('id', releaseId)
      .is('deleted_at', null)
      .maybeSingle(),
    admin.from('release_metadata').select('isrc,lyrics').eq('release_id', releaseId).maybeSingle(),
    loadDistributionFacts(admin, releaseId),
  ]);
  if (releaseResult.error || metadataResult.error || !releaseResult.data || !facts) return null;
  const release = releaseResult.data as ReleaseRow;

  const taskRead = await loadHandoffTasks(admin, releaseId);
  if (!taskRead) return null;
  let tasks = taskRead.byItem;

  const check = checkDistributionFacts(facts, { today: new Date() });
  const meta = (metadataResult.data as { isrc?: unknown; lyrics?: unknown } | null) ?? null;
  const lyrics = asText(meta?.lyrics);
  const uploadFacts = { hasArtwork: Boolean(facts.artwork), lyrics };

  const leadDays = readLeadDays(release.metadata);
  const dueDate = handoffDueDate(release.release_date, leadDays);
  const record = readHandoffRecord(release.metadata);
  const workspaceId = await workspaceIdOf(admin, release.owner_user_id);
  const fingerprints: Record<HandoffItemKey, string | null> = {
    // No file in the app (song upload removed Oct 17, 2026), so an approval
    // of the master is for the master as such, like the metadata's.
    master: 'master',
    cover_art: asText(release.artwork_asset_id),
    metadata: 'metadata',
  };
  const uploaded = Object.fromEntries(
    HANDOFF_ITEMS.map((item) => [item, isUploaded(item, check, uploadFacts)])
  ) as Record<HandoffItemKey, boolean>;
  const ownerOf = (item: HandoffItemKey) =>
    tasks.get(item)?.assigned_to_user_id ?? record[item].ownerUserId ?? release.owner_user_id;

  // Tasks only once the rollout has a plan: an empty rollout is how the app
  // knows to offer the planner, and three handoff tasks would hide it.
  // The plan's own team is where its tasks live; the owner's team is the fallback.
  const taskWorkspaceId = taskRead.planWorkspaceId ?? workspaceId;
  if (options.sync !== false && taskRead.hasPlan && shouldSyncTasks(release) && taskWorkspaceId) {
    const ops = planHandoffTaskSync({
      dueDate,
      items: SHOWN_HANDOFF_ITEMS.map((item) => ({
        item,
        uploaded: uploaded[item],
        sentBeforeTask: Boolean(record[item].sentAt),
        ownerUserId: ownerOf(item),
        task: toTaskState(tasks.get(item)),
      })),
    });
    if (ops.length > 0) {
      await applyTaskOps(admin, { releaseId, release, workspaceId: taskWorkspaceId, ops });
      tasks = (await loadHandoffTasks(admin, releaseId))?.byItem ?? tasks;
    }
  }

  const members = await loadHandoffMembers(admin, release, viewerId, workspaceId);
  const items: HandoffItemView[] = SHOWN_HANDOFF_ITEMS.map((item) => {
    const task = tasks.get(item);
    const status = deriveHandoffStatus({
      uploaded: uploaded[item],
      record: record[item],
      fingerprint: fingerprints[item],
      task: task ? { status: String(task.status) } : null,
      sentWithoutTask: !task && Boolean(record[item].sentAt),
    });
    const ownerUserId = ownerOf(item);
    return {
      key: item,
      label: HANDOFF_ITEM_LABELS[item],
      status,
      ownerUserId,
      sentAt: status === 'sent' ? (task?.completed_at ?? record[item].sentAt ?? null) : null,
      canAct: canActOnItem(viewerId, release.owner_user_id, ownerUserId),
      fix: status === 'missing' ? fixFor(item, check, uploadFacts) : null,
      detail: detailFor(item, facts, check, meta, lyrics),
    };
  });

  return {
    release,
    workspaceId,
    fingerprints,
    tasks,
    payload: {
      releaseDate: release.release_date ? String(release.release_date).slice(0, 10) : null,
      leadDays,
      dueDate,
      canEditLead: viewerId === release.owner_user_id,
      members,
      items,
    },
  };
}

function detailFor(
  item: HandoffItemKey,
  facts: NonNullable<Awaited<ReturnType<typeof loadDistributionFacts>>>,
  check: ReturnType<typeof checkDistributionFacts>,
  meta: { isrc?: unknown } | null,
  lyrics: string | null
): HandoffItemView['detail'] {
  if (item === 'master') return { kind: 'master' };
  if (item === 'cover_art') {
    const art = facts.artwork;
    const mime = (art?.mimeType ?? '').toLowerCase();
    const format = mime === 'image/jpeg' ? 'JPG' : mime === 'image/png' ? 'PNG' : mime ? mime.split('/')[1]?.toUpperCase() ?? null : null;
    const problem = itemErrors('cover_art', check).find((issue) => issue.code !== 'artwork_missing');
    return {
      kind: 'cover_art',
      width: art?.width ?? null,
      height: art?.height ?? null,
      format,
      problem: problem ? problem.code : null,
    };
  }
  const writing = sumSplits(facts.credits.map((credit) => credit.songwriterSplit));
  const master = sumSplits(facts.credits.map((credit) => credit.masterSplit));
  let splits: 'ok' | 'none' | number = 'none';
  if (writing.answered && splitTotalIsOff(writing.total)) splits = writing.total;
  else if (master.answered && splitTotalIsOff(master.total)) splits = master.total;
  else if (writing.answered || master.answered) splits = 'ok';
  return {
    kind: 'metadata',
    isrc: Boolean(asText(meta?.isrc)),
    credits: !check.errors.some((issue) => issue.code === 'missing_songwriter_credits'),
    splits,
    lyrics: Boolean(lyrics),
  };
}

async function applyTaskOps(
  admin: SupabaseClient,
  input: {
    releaseId: string;
    release: ReleaseRow;
    workspaceId: string;
    ops: ReturnType<typeof planHandoffTaskSync>;
  }
): Promise<void> {
  const inserts = input.ops.filter((op) => op.kind === 'insert');
  if (inserts.length > 0) {
    const positionResult = await admin
      .from(TASKS_TABLE)
      .select('position')
      .eq('release_id', input.releaseId)
      .order('position', { ascending: false })
      .limit(1);
    const top = Number(((positionResult.data as Array<{ position?: number }> | null) ?? [])[0]?.position ?? 0);
    const rows = inserts.map((op, index) => ({
      id: handoffTaskId(input.releaseId, op.item),
      release_id: input.releaseId,
      workspace_id: input.workspaceId,
      created_by: input.release.owner_user_id,
      assigned_to_user_id: op.assigneeUserId,
      title: HANDOFF_TASK_TITLES[op.item],
      description: HANDOFF_TASK_DESCRIPTION,
      status: op.done ? 'done' : 'todo',
      completed_at: op.done ? new Date().toISOString() : null,
      priority: 'none',
      state: 'planning',
      position: (Number.isFinite(top) ? top : 0) + index + 1,
      auto_generated: true,
      due_date: dueDateToTimestamp(op.dueDate),
      metadata: { [HANDOFF_TASK_TAG]: op.item },
    }));
    // ignoreDuplicates: a second tab racing this one loses quietly on the id.
    const result = await admin.from(TASKS_TABLE).upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (result.error) console.error('[handoff] could not add the handoff tasks', result.error.message);
  }
  for (const op of input.ops) {
    if (op.kind !== 'update') continue;
    const result = await admin.from(TASKS_TABLE).update(op.patch).eq('id', op.taskId);
    if (result.error) console.error('[handoff] could not update a handoff task', result.error.message);
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type HandoffAction =
  | { action: 'approve'; item: HandoffItemKey }
  | { action: 'send'; item: HandoffItemKey }
  | { action: 'unsend'; item: HandoffItemKey }
  | { action: 'owner'; item: HandoffItemKey; ownerUserId: string }
  | { action: 'lead'; leadDays: HandoffLeadDays };

export type HandoffWriteResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

async function writeReleaseMetadata(admin: SupabaseClient, releaseId: string, metadata: Record<string, unknown>) {
  return admin.from(RELEASES_TABLE).update({ metadata }).eq('id', releaseId);
}

/** Re-read the release metadata right before writing, so a write lands on the
 *  freshest copy rather than the one read at the start of the request. */
async function freshMetadata(admin: SupabaseClient, releaseId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin.from(RELEASES_TABLE).select('metadata').eq('id', releaseId).maybeSingle();
  if (error || !data) return null;
  return asRecord((data as { metadata?: unknown }).metadata);
}

export async function applyHandoffAction(
  admin: SupabaseClient,
  input: { releaseId: string; actorUserId: string; loaded: LoadedHandoff; change: HandoffAction }
): Promise<HandoffWriteResult> {
  const { releaseId, actorUserId, loaded, change } = input;
  const { release, payload } = loaded;
  const nowIso = new Date().toISOString();

  if (change.action === 'lead') {
    if (actorUserId !== release.owner_user_id) {
      return { ok: false, status: 403, error: 'Only the rollout owner can change the lead time.' };
    }
    const metadata = await freshMetadata(admin, releaseId);
    if (!metadata) return { ok: false, status: 500, error: 'Could not save the lead time.' };
    const result = await writeReleaseMetadata(admin, releaseId, { ...metadata, [LEAD_DAYS_METADATA_KEY]: change.leadDays });
    return result.error ? { ok: false, status: 500, error: 'Could not save the lead time.' } : { ok: true };
  }

  const view = payload.items.find((entry) => entry.key === change.item);
  if (!view) return { ok: false, status: 400, error: 'Unknown item.' };
  if (!view.canAct) {
    return { ok: false, status: 403, error: 'Only the rollout owner or the person it belongs to can do that.' };
  }
  const task = loaded.tasks.get(change.item) ?? null;

  if (change.action === 'owner') {
    if (!payload.members.some((member) => member.userId === change.ownerUserId)) {
      return { ok: false, status: 400, error: 'Pick someone on this rollout’s team.' };
    }
    const metadata = await freshMetadata(admin, releaseId);
    if (!metadata) return { ok: false, status: 500, error: 'Could not change the owner.' };
    const saved = await writeReleaseMetadata(
      admin,
      releaseId,
      withItemRecord(metadata, change.item, { ownerUserId: change.ownerUserId })
    );
    if (saved.error) return { ok: false, status: 500, error: 'Could not change the owner.' };
    if (task && task.assigned_to_user_id !== change.ownerUserId) {
      const update = await admin
        .from(TASKS_TABLE)
        .update({ assigned_to_user_id: change.ownerUserId })
        .eq('id', task.id);
      if (update.error) return { ok: false, status: 500, error: 'Could not change the owner.' };
      if (change.ownerUserId !== actorUserId) {
        await createTaskNotification(admin, {
          userId: change.ownerUserId,
          type: 'task_assigned',
          taskId: task.id,
          actorId: actorUserId,
        }).catch(() => undefined);
      }
    }
    return { ok: true };
  }

  // A dropped send (its task cancelled) is undone on the task, not here: Mark
  // sent or reopen would quietly un-cancel it.
  if (view.status === 'dropped') {
    return { ok: false, status: 409, error: 'That send was cancelled. Restore its task first.' };
  }

  if (change.action === 'approve') {
    if (view.status !== 'uploaded' && view.status !== 'approved') {
      return { ok: false, status: 409, error: 'There is nothing to approve yet.' };
    }
    const metadata = await freshMetadata(admin, releaseId);
    if (!metadata) return { ok: false, status: 500, error: 'Could not approve it.' };
    const saved = await writeReleaseMetadata(
      admin,
      releaseId,
      withItemRecord(metadata, change.item, {
        approvedAt: nowIso,
        approvedBy: actorUserId,
        approvedFor: loaded.fingerprints[change.item],
      })
    );
    return saved.error ? { ok: false, status: 500, error: 'Could not approve it.' } : { ok: true };
  }

  if (change.action === 'send') {
    if (view.status === 'missing') return { ok: false, status: 409, error: 'Upload it first.' };
    if (task) {
      const update = await admin
        .from(TASKS_TABLE)
        .update({ status: 'done', completed_at: nowIso })
        .eq('id', task.id);
      if (update.error) return { ok: false, status: 500, error: 'Could not mark it sent.' };
    }
    // With no task yet (no plan), the record is the sent state until there is one.
    const metadata = await freshMetadata(admin, releaseId);
    if (!metadata) return task ? { ok: true } : { ok: false, status: 500, error: 'Could not mark it sent.' };
    const saved = await writeReleaseMetadata(
      admin,
      releaseId,
      withItemRecord(metadata, change.item, { sentAt: nowIso, sentBy: actorUserId })
    );
    return saved.error && !task ? { ok: false, status: 500, error: 'Could not mark it sent.' } : { ok: true };
  }

  // unsend: reopen the task. The row falls back to Approved or Uploaded.
  if (task) {
    const update = await admin.from(TASKS_TABLE).update({ status: 'todo', completed_at: null }).eq('id', task.id);
    if (update.error) return { ok: false, status: 500, error: 'Could not reopen it.' };
  }
  const metadata = await freshMetadata(admin, releaseId);
  if (metadata) {
    await writeReleaseMetadata(admin, releaseId, withItemRecord(metadata, change.item, { sentAt: null, sentBy: null }));
  }
  return { ok: true };
}

