// The reads and writes behind the Spotify editorial pitch step. The rules
// (dates, windows, copy, what a backfill should do) are pure and live in
// lib/editorial-pitch.ts; this file only fetches, decides through them, and
// writes.
//
// Nothing here throws into a request path that matters: the sweeps and the
// backfill answer with an outcome and log, so a missing migration or a
// database blip costs the pitch step, never the page it was opened from.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DISTRIBUTION_ORDER_TASK_ID_BY_TEMPLATE,
  EDITORIAL_PITCH_TASK_ID,
  EMPTY_PITCH_FIELDS,
  PITCH_BLOCKED_COPY,
  decideBackfill,
  daysToRelease,
  isDistributionOrderTask,
  isEditorialPitchTask,
  isLegacyPitchTask,
  parsePitchFields,
  pitchDueDate,
  pitchReminderCopy,
  pitchWindowState,
  reminderTierFor,
  type BackfillOutcome,
  type PitchFields,
  type PitchReminderTier,
} from './editorial-pitch';
import { sendPushToUsers } from './push-server';
import { ALBUM_RELEASE_TEMPLATE } from './release-templates/album';
import { EP_RELEASE_TEMPLATE } from './release-templates/ep';
import { buildTaskRow } from './release-templates/instantiate';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import type { Template } from './release-templates/types';
import { readTestRelease } from './test-release';

const TASKS_TABLE = 'tasks';
const RELEASES_TABLE = 'releases';
const NOTIFICATIONS_TABLE = 'notifications';

/** releases.metadata key recording that the once-only backfill ran. */
export const BACKFILL_METADATA_KEY = 'editorial_pitch_backfill';
/** tasks.metadata key holding the saved pitch fields and the skip record. */
export const PITCH_TASK_METADATA_KEY = 'editorial_pitch';

/** Every playbook ever written, flag-blind: a stored plan was built by whichever
 *  playbook was on at the time, and reading it back must not depend on today's flags. */
const TEMPLATES_BY_ID: Readonly<Record<string, Template>> = {
  [SINGLE_RELEASE_TEMPLATE.id]: SINGLE_RELEASE_TEMPLATE,
  [EP_RELEASE_TEMPLATE.id]: EP_RELEASE_TEMPLATE,
  [ALBUM_RELEASE_TEMPLATE.id]: ALBUM_RELEASE_TEMPLATE,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The playbook and step a task row came from, off `metadata.template`. */
export function readTemplateOrigin(metadata: unknown): {
  templateId: string | null;
  taskId: string | null;
} {
  const template = asRecord(asRecord(metadata).template);
  return {
    templateId: readText(template.template_id),
    taskId: readText(template.task_id ?? template.template_task_id),
  };
}

export type PitchTaskMeta = {
  fields: PitchFields;
  skippedAt: string | null;
  skippedBy: string | null;
};

export function readPitchTaskMeta(metadata: unknown): PitchTaskMeta {
  const meta = asRecord(asRecord(metadata)[PITCH_TASK_METADATA_KEY]);
  return {
    fields: meta.fields ? parsePitchFields(meta.fields) : { ...EMPTY_PITCH_FIELDS },
    skippedAt: readText(meta.skipped_at),
    skippedBy: readText(meta.skipped_by),
  };
}

/** `metadata` with the pitch block merged in, every other key kept. */
export function withPitchTaskMeta(metadata: unknown, patch: JsonRecord): JsonRecord {
  const base = { ...asRecord(metadata) };
  base[PITCH_TASK_METADATA_KEY] = { ...asRecord(base[PITCH_TASK_METADATA_KEY]), ...patch };
  return base;
}

// ---------------------------------------------------------------------------
// The blocker: the pitch waits on the distribution order
// ---------------------------------------------------------------------------

type DependencyRow = { id: string; status: string | null; metadata: unknown };

/** Pure half of {@link loadPitchBlocker}, so the rule is testable without a database. */
export function pitchBlockedBy(
  taskTemplateId: string | null,
  dependencies: readonly DependencyRow[]
): string | null {
  if (!isEditorialPitchTask(taskTemplateId)) return null;
  const orderOpen = dependencies.some(
    (dependency) =>
      isDistributionOrderTask(readTemplateOrigin(dependency.metadata).taskId) &&
      dependency.status !== 'done'
  );
  return orderOpen ? PITCH_BLOCKED_COPY : null;
}

/**
 * The copy to show when a task cannot be completed because distribution has not
 * been ordered, or null. Fails OPEN: an unreadable dependency list never blocks
 * somebody from finishing a task they have in fact finished.
 */
export async function loadPitchBlocker(
  admin: SupabaseClient,
  task: { metadata: unknown; dependencies?: string[] | null }
): Promise<string | null> {
  const templateId = readTemplateOrigin(task.metadata).taskId;
  if (!isEditorialPitchTask(templateId)) return null;
  const dependencyIds = (task.dependencies ?? []).filter(Boolean);
  if (dependencyIds.length === 0) return null;
  const result = await admin.from(TASKS_TABLE).select('id,status,metadata').in('id', dependencyIds);
  if (result.error || !Array.isArray(result.data)) return null;
  return pitchBlockedBy(templateId, result.data as DependencyRow[]);
}

// ---------------------------------------------------------------------------
// Saved fields and skipping
// ---------------------------------------------------------------------------

export async function savePitchFields(
  admin: SupabaseClient,
  taskId: string,
  fields: PitchFields
): Promise<boolean> {
  const current = await admin.from(TASKS_TABLE).select('metadata').eq('id', taskId).maybeSingle();
  if (current.error || !current.data) return false;
  const next = withPitchTaskMeta((current.data as { metadata: unknown }).metadata, { fields });
  const update = await admin.from(TASKS_TABLE).update({ metadata: next }).eq('id', taskId);
  return !update.error;
}

/**
 * "Release without a pitch": the task is cancelled, and the metadata says it
 * was a skip, so reporting can tell skipped from cancelled. There is no
 * "skipped" status on purpose: an unknown status reads back as "todo" in
 * several places, while "cancelled" is already handled everywhere.
 */
export async function skipEditorialPitch(
  admin: SupabaseClient,
  taskId: string,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const current = await admin.from(TASKS_TABLE).select('metadata,status').eq('id', taskId).maybeSingle();
  if (current.error || !current.data) return false;
  const row = current.data as { metadata: unknown; status: string | null };
  if (row.status === 'done') return false;
  const next = withPitchTaskMeta(row.metadata, {
    skipped_at: now.toISOString(),
    skipped_by: userId,
  });
  const update = await admin
    .from(TASKS_TABLE)
    .update({ status: 'cancelled', metadata: next })
    .eq('id', taskId);
  return !update.error;
}

// ---------------------------------------------------------------------------
// The once-only backfill
// ---------------------------------------------------------------------------

type ReleaseRow = {
  id: string;
  owner_user_id: string;
  release_date: string | null;
  status: string | null;
  metadata: unknown;
  updated_at: string | null;
};

type PlanTaskRow = {
  id: string;
  status: string | null;
  title: string | null;
  position: number | null;
  workspace_id: string;
  dependencies: string[] | null;
  metadata: unknown;
};

export type BackfillResult = {
  /** What happened, or 'skipped' when nothing was decided or recorded. */
  outcome: BackfillOutcome | 'skipped';
  taskId?: string;
};

/** Plan tasks grouped by what built them: the playbook in use and the steps present. */
function summarisePlan(tasks: readonly PlanTaskRow[]) {
  const counts = new Map<string, number>();
  const byStep = new Map<string, PlanTaskRow>();
  for (const task of tasks) {
    const origin = readTemplateOrigin(task.metadata);
    if (origin.templateId) counts.set(origin.templateId, (counts.get(origin.templateId) ?? 0) + 1);
    if (origin.taskId) byStep.set(origin.taskId, task);
  }
  let templateId: string | null = null;
  let best = 0;
  for (const [id, count] of counts) {
    if (count > best) {
      best = count;
      templateId = id;
    }
  }
  return { templateId, byStep };
}

/**
 * Add the Spotify pitch to a rollout that was planned before it existed, once.
 *
 * Skipped without recording anything (so a later date or plan still gets it):
 * no usable release date, no plan, a test rollout, an archived or released one,
 * and a release day 7 days away or less. Recorded, never repeated: a pitch
 * added, an old one converted, one already there, one already done.
 *
 * The claim is a conditional update on the release row's `updated_at`, so two
 * tabs opening the same rollout cannot both insert, and nothing written to the
 * row in between is lost.
 */
export async function ensureEditorialPitchTask(
  admin: SupabaseClient,
  releaseId: string,
  now: Date = new Date()
): Promise<BackfillResult> {
  const releaseResult = await admin
    .from(RELEASES_TABLE)
    .select('id,owner_user_id,release_date,status,metadata,updated_at')
    .eq('id', releaseId)
    .maybeSingle();
  if (releaseResult.error || !releaseResult.data) return { outcome: 'skipped' };
  const release = releaseResult.data as ReleaseRow;

  const metadata = asRecord(release.metadata);
  if (BACKFILL_METADATA_KEY in metadata) return { outcome: 'skipped' };
  if (readTestRelease(metadata)) return { outcome: 'skipped' };
  if (metadata.planner_pending === true || metadata.template_pending === true) {
    return { outcome: 'skipped' };
  }
  if (release.status === 'archived' || release.status === 'released') return { outcome: 'skipped' };

  const days = daysToRelease(release.release_date, now);
  if (days === null || pitchWindowState(days) !== 'open') return { outcome: 'skipped' };

  const tasksResult = await admin
    .from(TASKS_TABLE)
    .select('id,status,title,position,workspace_id,dependencies,metadata')
    .eq('release_id', releaseId);
  if (tasksResult.error || !Array.isArray(tasksResult.data) || tasksResult.data.length === 0) {
    return { outcome: 'skipped' };
  }
  const tasks = tasksResult.data as PlanTaskRow[];
  const { templateId, byStep } = summarisePlan(tasks);
  // A plan with no playbook behind it (built by hand) has nothing to extend.
  if (!templateId) return { outcome: 'skipped' };

  const existingPitch = byStep.get(EDITORIAL_PITCH_TASK_ID) ?? null;
  const legacy = [...byStep.entries()].find(([step]) => isLegacyPitchTask(step))?.[1] ?? null;
  const outcome = decideBackfill({
    daysToRelease: days,
    hasPitchTask: Boolean(existingPitch),
    // A cancelled old pitch is the team's own decision, so it counts as settled
    // rather than as a gap to fill with a second pitch.
    hasOpenLegacyPitch: Boolean(legacy) && legacy!.status !== 'done' && legacy!.status !== 'cancelled',
    hasDoneLegacyPitch: Boolean(legacy) && (legacy!.status === 'done' || legacy!.status === 'cancelled'),
  });
  if (outcome === null || outcome === 'too_late') return { outcome: 'skipped' };

  // Claim first, so a second tab loses here rather than inserting a second task.
  const claimed = await admin
    .from(RELEASES_TABLE)
    .update({
      metadata: { ...metadata, [BACKFILL_METADATA_KEY]: { outcome, at: now.toISOString() } },
    })
    .eq('id', releaseId)
    .eq('updated_at', release.updated_at ?? '')
    .select('id');
  if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length === 0) {
    return { outcome: 'skipped' };
  }

  const releaseClaim = async () => {
    // Best effort: put the metadata back so the next open tries again.
    const latest = await admin.from(RELEASES_TABLE).select('metadata').eq('id', releaseId).maybeSingle();
    if (latest.error || !latest.data) return;
    const restored = { ...asRecord((latest.data as { metadata: unknown }).metadata) };
    delete restored[BACKFILL_METADATA_KEY];
    await admin.from(RELEASES_TABLE).update({ metadata: restored }).eq('id', releaseId);
  };

  const template = TEMPLATES_BY_ID[templateId] ?? SINGLE_RELEASE_TEMPLATE;
  const pitchStep =
    template.tasks.find((task) => task.id === EDITORIAL_PITCH_TASK_ID) ??
    SINGLE_RELEASE_TEMPLATE.tasks.find((task) => task.id === EDITORIAL_PITCH_TASK_ID)!;
  const due = pitchDueDate(release.release_date, now);
  if (!due) {
    await releaseClaim();
    return { outcome: 'skipped' };
  }
  const compressedRunway = Date.parse(due) < now.getTime();

  // What the pitch waits on, resolved to this rollout's own rows.
  const orderStepId = DISTRIBUTION_ORDER_TASK_ID_BY_TEMPLATE[templateId];
  const dependencyIds = (pitchStep.depends_on ?? [])
    .map((step) => byStep.get(step)?.id)
    .filter((id): id is string => Boolean(id));
  if (orderStepId && byStep.get(orderStepId) && !dependencyIds.includes(byStep.get(orderStepId)!.id)) {
    dependencyIds.push(byStep.get(orderStepId)!.id);
  }

  try {
    if (outcome === 'converted' && legacy) {
      const origin = asRecord(asRecord(legacy.metadata).template);
      const mergedDependencies = [...new Set([...(legacy.dependencies ?? []), ...dependencyIds])];
      const update = await admin
        .from(TASKS_TABLE)
        .update({
          title: pitchStep.title,
          description: pitchStep.description,
          due_date: due,
          dependencies: mergedDependencies,
          metadata: {
            ...asRecord(legacy.metadata),
            template: {
              ...origin,
              task_id: EDITORIAL_PITCH_TASK_ID,
              role: pitchStep.role,
              tags: pitchStep.tags ?? [],
              optional: pitchStep.optional,
              compressed_runway: compressedRunway,
            },
          },
        })
        .eq('id', legacy.id);
      if (update.error) throw update.error;
      return { outcome, taskId: legacy.id };
    }

    if (outcome === 'added') {
      const newId = randomUUID();
      const idMap = new Map<string, string>([[pitchStep.id, newId]]);
      for (const step of pitchStep.depends_on ?? []) {
        const existing = byStep.get(step);
        if (existing) idMap.set(step, existing.id);
      }
      const maxPosition = tasks.reduce((max, task) => Math.max(max, task.position ?? 0), 0);
      const row = buildTaskRow({
        task: pitchStep,
        index: maxPosition + 1,
        template,
        releaseId,
        workspaceId: tasks[0].workspace_id,
        ownerUserId: release.owner_user_id,
        releaseEpoch: Date.parse(due) - pitchStep.offset_days * MS_PER_DAY,
        templateIdToUuid: idMap,
        instantiationMs: now.getTime(),
      });
      const insert = await admin
        .from(TASKS_TABLE)
        .insert({
          ...row,
          due_date: due,
          dependencies: dependencyIds,
          metadata: {
            template: { ...row.metadata.template, compressed_runway: compressedRunway },
          },
        })
        .select('id')
        .maybeSingle();
      if (insert.error) throw insert.error;
      return { outcome, taskId: (insert.data as { id?: string } | null)?.id ?? newId };
    }

    // present / already_pitched: the claim above is the whole write.
    return { outcome };
  } catch (error) {
    console.error('[editorial-pitch] backfill failed', error);
    await releaseClaim();
    return { outcome: 'skipped' };
  }
}

// ---------------------------------------------------------------------------
// The reminders (a passenger on the 07:00 UTC cron, never throws)
// ---------------------------------------------------------------------------

export const PITCH_REMINDER_TYPE_BY_TIER: Readonly<Record<PitchReminderTier, string>> = {
  28: 'pitch_reminder_28d',
  14: 'pitch_reminder_14d',
  8: 'pitch_reminder_8d',
};

type OpenPitchRow = {
  id: string;
  release_id: string | null;
  assigned_to_user_id: string | null;
};

type SweepReleaseRow = {
  id: string;
  title: string | null;
  release_date: string | null;
  owner_user_id: string;
  status: string | null;
  metadata: unknown;
};

/**
 * Remind the owner of an open pitch at 28, 14 and 8 days before release day.
 *
 * "Sent once" is a row of that exact type for the task, read or unread, so a
 * reminder that was read is never sent again, and a missed cron day lands on
 * the next one (the tiers are windows, see reminderTierFor). Stops by itself
 * when the task is done or cancelled, or the window closes. Goes to the task's
 * assignee, falling back to the release owner.
 */
export async function runEditorialPitchReminderSweep(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ checked: number; sent: number }> {
  const summary = { checked: 0, sent: 0 };
  try {
    const open = await admin
      .from(TASKS_TABLE)
      .select('id,release_id,assigned_to_user_id')
      .eq('metadata->template->>task_id', EDITORIAL_PITCH_TASK_ID)
      .not('status', 'in', '(done,cancelled)')
      .not('release_id', 'is', null)
      .limit(1000);
    if (open.error || !Array.isArray(open.data) || open.data.length === 0) return summary;
    const tasks = open.data as OpenPitchRow[];

    const releaseIds = [...new Set(tasks.map((task) => task.release_id).filter(Boolean))] as string[];
    const releasesResult = await admin
      .from(RELEASES_TABLE)
      .select('id,title,release_date,owner_user_id,status,metadata')
      .in('id', releaseIds);
    if (releasesResult.error || !Array.isArray(releasesResult.data)) return summary;
    const releases = new Map(
      (releasesResult.data as SweepReleaseRow[]).map((release) => [release.id, release])
    );

    for (const task of tasks) {
      const release = task.release_id ? releases.get(task.release_id) : null;
      if (!release) continue;
      if (readTestRelease(asRecord(release.metadata))) continue;
      if (release.status === 'archived' || release.status === 'released') continue;

      summary.checked += 1;
      const days = daysToRelease(release.release_date, now);
      const tier = reminderTierFor(days);
      if (tier === null || days === null) continue;

      const type = PITCH_REMINDER_TYPE_BY_TIER[tier];
      const recipient = task.assigned_to_user_id || release.owner_user_id;
      if (!recipient) continue;

      const already = await admin
        .from(NOTIFICATIONS_TABLE)
        .select('id')
        .eq('task_id', task.id)
        .eq('type', type)
        .limit(1)
        .maybeSingle();
      // An unreadable answer is not "never sent": skip rather than risk a repeat.
      if (already.error || already.data) continue;

      const insert = await admin
        .from(NOTIFICATIONS_TABLE)
        .insert({ user_id: recipient, type, task_id: task.id, actor_id: null });
      if (insert.error) {
        // Most likely the enum values are not in yet; say so once and stop.
        console.error('[editorial-pitch] could not record a reminder:', insert.error.message);
        return summary;
      }

      summary.sent += 1;
      try {
        await sendPushToUsers(admin, [recipient], {
          title: 'Spotify pitch',
          body: pitchReminderCopy(days, release.title ?? ''),
          url: `/dashboard?release=${release.id}`,
          tag: `pitch-reminder-${task.id}-${tier}`,
        });
      } catch (error) {
        console.error('[editorial-pitch] reminder push failed', error);
      }
    }
  } catch (error) {
    console.error('[editorial-pitch] reminder sweep failed', error);
  }
  return summary;
}
