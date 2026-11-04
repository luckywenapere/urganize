/**
 * The next record, one line in (step 2, 2026-10-27, mock screen 4). The
 * manager says "session with tolu friday, doing wahala free and the new one";
 * add_to_record shows what it will add and nothing is saved until they tap
 * Add. The rules (dates never invented, people matched to the team's contacts
 * first, unknown songs at Idea) are in lib/next-records-capture.ts; every
 * write goes through lib/next-records-server.ts, so typed people reach
 * Relationships through saveSession and its one find-or-add.
 *
 * Like artist-facts, this calls the server layer with the Chappi context
 * rather than the REST routes: there is no flag to translate, and the context
 * carries the same scope the routes' gate builds (the caller's teams, the
 * artist-scoped teammates, and guests read-only).
 */

import { isRelationshipsEnabled } from '@/app/api/relationships/_shared';
import { DEFAULT_RECORD_TITLE, SONG_STAGES, isRecordDone, lagosToday, type NextRecord } from '@/lib/next-records';
import {
  describeCaptureCard,
  isEmptyPlan,
  parseCaptureArgs,
  planCapture,
  type CapturePlan,
  type TeamContact,
} from '@/lib/next-records-capture';
import {
  addSong,
  createRecord,
  findTeamArtist,
  isReadOnlyOnTeam,
  listRecordsInMaking,
  readRecord,
  saveSession,
  updateSong,
} from '@/lib/next-records-server';
import { listRelationships } from '@/lib/relationships-server';
import { buildProjectOffer, type ProjectOffer } from '@/lib/project-offer';
import { suggestProjectTasks } from '@/lib/project-suggestions';
import { isTaskClosed } from '@/types/tasks';
import { recordScopeLine } from '../record-scope';
import { argString, fail, type ChappiTool, type ChappiToolContext } from './shared';

type Target = {
  workspaceId: string;
  artistId: string;
  artistName: string;
  /** Null: the Add starts an untitled record for the artist first. */
  record: NextRecord | null;
  canUseContacts: boolean;
};

type Prepared = { ok: true; target: Target; plan: CapturePlan } | { ok: false; error: string };

const recordLine = (r: { id: string; title: string; artistName: string }) => `${r.title} (${r.artistName}, recordId ${r.id})`;

async function resolveTarget(ctx: ChappiToolContext, args: Record<string, unknown>): Promise<{ ok: true; target: Target } | { ok: false; error: string }> {
  const scope = {
    workspaceIds: ctx.workspaceIds,
    artistScopeByWorkspaceId: ctx.artistScopeByWorkspaceId,
    releaseScopeByWorkspaceId: ctx.releaseScopeByWorkspaceId,
  };
  const records = await listRecordsInMaking(ctx.adminClient, scope);
  if (!records) return { ok: false, error: 'Could not load the records.' };

  const recordId = argString(args, 'recordId');
  const artistId = argString(args, 'artistId');
  let candidates = records;
  if (recordId) candidates = records.filter((r) => r.id === recordId);
  else if (artistId) candidates = records.filter((r) => r.artistId === artistId);

  if (recordId && candidates.length === 0) {
    return { ok: false, error: 'That record was not found among the records in the making. Leave recordId out to see them.' };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      error: `More than one record is in the making: ${candidates.map(recordLine).join('; ')}. Ask the user which one, then pass its recordId.`,
    };
  }

  const scopeFor = (workspaceId: string) => ctx.artistScopeByWorkspaceId[workspaceId];
  if (candidates.length === 1) {
    const found = candidates[0];
    const loaded = await readRecord(ctx.adminClient, found.workspaceId, found.id);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    return {
      ok: true,
      target: {
        workspaceId: found.workspaceId,
        artistId: found.artistId,
        artistName: found.artistName,
        record: loaded.value,
        canUseContacts: isRelationshipsEnabled() && !scopeFor(found.workspaceId),
      },
    };
  }

  if (!artistId) {
    return { ok: false, error: 'No record is in the making yet. Ask which artist it is for, then pass artistId (from list_artists).' };
  }
  for (const workspaceId of ctx.workspaceIds) {
    // Records are artist-wide; a member limited to chosen rollouts gets none.
    if (ctx.releaseScopeByWorkspaceId[workspaceId]) continue;
    const scoped = scopeFor(workspaceId);
    if (scoped && scoped !== artistId) continue;
    const artist = await findTeamArtist(ctx.adminClient, workspaceId, artistId);
    if (artist) {
      return {
        ok: true,
        target: { workspaceId, artistId: artist.id, artistName: artist.name, record: null, canUseContacts: isRelationshipsEnabled() && !scoped },
      };
    }
  }
  return { ok: false, error: 'That artist was not found. Call list_artists for the right id.' };
}

/** Read-only: confirm and execute both run it, so the card and the Add agree. */
async function prepare(ctx: ChappiToolContext, args: Record<string, unknown>): Promise<Prepared> {
  const parsed = parseCaptureArgs(args);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const resolved = await resolveTarget(ctx, args);
  if (!resolved.ok) return resolved;
  const { target } = resolved;
  if (await isReadOnlyOnTeam(ctx.adminClient, target.workspaceId, ctx.user.id)) {
    return { ok: false, error: 'Your role on this team is view-only, so nothing can be added.' };
  }

  let contacts: TeamContact[] | null = null;
  if (target.canUseContacts && parsed.value.sessions.some((s) => s.people.length > 0)) {
    const listed = await listRelationships(ctx.adminClient, target.workspaceId);
    if (!listed.ok) return { ok: false, error: listed.error };
    contacts = listed.relationships.map((r) => ({ personId: r.personId, label: r.label, role: r.role }));
  }

  const planned = planCapture({ songs: target.record?.songs ?? [] }, parsed.value, contacts, lagosToday());
  if (!planned.ok) return planned;
  if (isEmptyPlan(planned.plan)) return { ok: false, error: 'All of that is already on the record. Nothing to add.' };
  return { ok: true, target, plan: planned.plan };
}

/**
 * When this Add made the last song Done, the reply points to the rollout
 * button at the top of the record (v2 decision 6). Only on the change that
 * finishes it, so it is said once.
 */
export function doneLine(before: NextRecord | null, after: NextRecord): string {
  if ((before && isRecordDone(before)) || !isRecordDone(after)) return '';
  const count = after.songs.length;
  return ` That's ${count} of ${count} songs done. The Plan the rollout button is ready at the top of the record.`;
}

/**
 * The line UrgAns reads when the box is on a record, or null when the record
 * is not one the caller can reach (or no longer in the making). The client's
 * record id is advice; this is the check.
 */
export async function recordScopePrompt(ctx: ChappiToolContext, recordId: string): Promise<string | null> {
  const records = await listRecordsInMaking(ctx.adminClient, {
    workspaceIds: ctx.workspaceIds,
    artistScopeByWorkspaceId: ctx.artistScopeByWorkspaceId,
    releaseScopeByWorkspaceId: ctx.releaseScopeByWorkspaceId,
  });
  const record = records?.find((r) => r.id === recordId);
  return record ? recordScopeLine(record) : null;
}

export const RECORD_TOOLS: ChappiTool[] = [
  {
    name: 'add_to_record',
    kind: 'mutate',
    level: 'confirm',
    description: `File what the user says about the next record (music still being made) in one go: studio sessions, the songs worked on in them, who was there, and song stages (${SONG_STAGES.join(', ')}; done means mastered). Shows a card; nothing is saved until they tap Add. Pass "when" in the user's own words ("friday", "next week"); never work out a date yourself. Pass people as the user named them; they are matched to the team's contacts. For a song with no name yet ("the new one") pass an empty string. Leave recordId out to use the only record in the making; if there are several it tells you to ask which. Pass artistId alone to start a record for an artist with none.`,
    inputSchema: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The record, when the user named one or there are several.' },
        artistId: { type: 'string', description: 'The artist, to pick their record or start one.' },
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              when: { type: 'string', description: 'The user\'s words: "friday", "next week", "31 oct".' },
              people: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: { type: 'string' }, role: { type: 'string', description: 'Only if the user said it.' } },
                  required: ['name'],
                },
              },
              songs: { type: 'array', items: { type: 'string' }, description: 'Song titles worked on. "" for an unnamed one.' },
              note: { type: 'string' },
              happened: { type: 'boolean', description: 'True only when the user says it already happened.' },
            },
            required: ['when'],
          },
        },
        songs: {
          type: 'array',
          description: 'Songs to add or move outside a session, e.g. "pressure is in mixing".',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, stage: { type: 'string', enum: [...SONG_STAGES] } },
            required: ['title'],
          },
        },
      },
    },
    confirm: async (ctx, args) => {
      const prepared = await prepare(ctx, args);
      if (!prepared.ok) return { ok: false, summary: prepared.error };
      const { target, plan } = prepared;
      return {
        ok: true,
        ...describeCaptureCard(plan, {
          recordTitle: target.record?.title ?? DEFAULT_RECORD_TITLE,
          artistName: target.artistName,
          isNewRecord: !target.record,
        }),
      };
    },
    execute: async (ctx, args) => {
      const prepared = await prepare(ctx, args);
      if (!prepared.ok) return fail(prepared.error);
      const { target, plan } = prepared;
      const admin = ctx.adminClient;
      const { workspaceId } = target;

      let record = target.record;
      if (!record) {
        const created = await createRecord(admin, {
          workspaceId,
          artistId: target.artistId,
          userId: ctx.user.id,
          title: DEFAULT_RECORD_TITLE,
          kind: null,
          idea: '',
        });
        if (!created.ok) return fail(created.error);
        record = created.value;
      }
      const recordId = record.id;

      // New songs first, so sessions can name them.
      const songIds = new Map<string, string>();
      for (const song of plan.newSongs) {
        const before = new Set(record.songs.map((s) => s.id));
        const added = await addSong(admin, workspaceId, recordId, { title: song.title, stage: 'idea' });
        if (!added.ok) return fail(added.error);
        record = added.value;
        const fresh = record.songs.find((s) => !before.has(s.id));
        if (fresh) songIds.set(song.key, fresh.id);
      }
      const idOf = (song: { key: string; songId: string | null }) => song.songId ?? songIds.get(song.key) ?? null;

      for (const change of plan.stageChanges) {
        const songId = idOf(change.song);
        if (!songId) continue;
        const moved = await updateSong(admin, workspaceId, recordId, songId, { stage: change.to });
        if (!moved.ok) return fail(moved.error);
        record = moved.value;
      }

      const writeCtx = { workspaceId, userId: ctx.user.id, canUseContacts: target.canUseContacts };
      for (const session of plan.sessions) {
        const saved = await saveSession(admin, writeCtx, recordId, null, {
          date: session.date,
          dateHint: session.dateHint,
          status: session.happened ? 'happened' : 'planned',
          note: session.note,
          people: session.people.map((p) => ({ personId: p.personId, name: p.name, role: p.role })),
          songIds: session.songs.map(idOf).filter((id): id is string => Boolean(id)),
        });
        if (!saved.ok) return fail(saved.error);
        record = saved.value;
      }

      const parts = [
        plan.sessions.length ? `${plan.sessions.length} session(s)` : '',
        plan.newSongs.length ? `${plan.newSongs.length} new song(s)` : '',
        plan.stageChanges.length ? `${plan.stageChanges.length} stage change(s)` : '',
      ].filter(Boolean);
      // The next jobs, offered as chips under the reply (mock screen 6). From
      // the project's own suggestion list, never invented; jobs already added
      // are left out. No offer when the list is empty or the read fails.
      // The Add has already saved, so the offer never fails it: any trouble
      // reading the project's tasks just means no chips.
      let offer: ProjectOffer | null = null;
      try {
        const taskRows = await admin
          .from('tasks')
          .select('title')
          .eq('workspace_id', workspaceId)
          .eq('record_id', recordId);
        if (!taskRows.error) {
          offer = buildProjectOffer({
            recordId,
            recordTitle: record.title,
            suggestions: suggestProjectTasks({
              status: record.status,
              songs: record.songs,
              existingTitles: ((taskRows.data ?? []) as Array<{ title: string | null }>).map((row) => String(row.title || '')),
              limit: 2,
            }),
          });
        }
      } catch {
        offer = null;
      }
      return {
        ok: true,
        summary: `Added to ${record.title} (${target.artistName}): ${parts.join(', ')}. It is on the record page under ${target.artistName} in Catalogue.${doneLine(target.record, record)}${offer ? ' The next jobs for it are offered just below.' : ''}`,
        data: { recordId, artistId: target.artistId, sessions: plan.sessions.length, newSongs: plan.newSongs.length, stageChanges: plan.stageChanges.length },
        ...(offer ? { clientAction: { type: 'offer_project_tasks' as const, offer } } : {}),
      };
    },
  },
  {
    name: 'get_project',
    kind: 'read',
    level: 'read',
    description:
      'Read a project (music still being made, before its rollout): its stage, songs, open and done tasks, and the jobs it suggests next. Call this before suggesting work on a project, and suggest only from its "suggested" list. Leave recordId out to use the only open project.',
    inputSchema: {
      type: 'object',
      properties: {
        recordId: { type: 'string', description: 'The project. Leave out when there is only one.' },
      },
    },
    execute: async (ctx, args) => {
      const open = await listRecordsInMaking(ctx.adminClient, {
        workspaceIds: ctx.workspaceIds,
        artistScopeByWorkspaceId: ctx.artistScopeByWorkspaceId,
        releaseScopeByWorkspaceId: ctx.releaseScopeByWorkspaceId,
      });
      if (!open) return fail('Could not read the projects. Try again.');
      const wanted = argString(args, 'recordId');
      const target = wanted ? open.find((r) => r.id === wanted) : open.length === 1 ? open[0] : undefined;
      if (!target) {
        if (!wanted && open.length > 1) {
          return fail(`There are ${open.length} open projects. Ask which one: ${open.map((r) => `${r.title} (${r.artistName}, recordId ${r.id})`).join('; ')}.`);
        }
        return fail('That project was not found, or it already has its rollout.');
      }
      const read = await readRecord(ctx.adminClient, target.workspaceId, target.id);
      if (!read.ok) return fail(read.error);
      const record = read.value;
      const taskRows = await ctx.adminClient
        .from('tasks')
        .select('id,title,status,due_date')
        .eq('record_id', record.id)
        .order('position', { ascending: true });
      const tasks = ((taskRows.data ?? []) as Array<{ id: string; title: string; status: string; due_date: string | null }>).map(
        (t) => ({ id: t.id, title: t.title, done: isTaskClosed(t.status), dueDate: t.due_date ? t.due_date.slice(0, 10) : null })
      );
      const suggested = suggestProjectTasks({
        status: record.status,
        songs: record.songs,
        existingTitles: tasks.map((t) => t.title),
        limit: 6,
      });
      const openTasks = tasks.filter((t) => !t.done);
      return {
        ok: true,
        summary: `${record.title} (${target.artistName}) is at the ${record.status === 'idea' ? 'Idea' : 'Making'} stage with ${record.songs.length} song(s), ${openTasks.length} open task(s) and ${suggested.length} suggested job(s). To add one, call create_task with recordId ${record.id} after the user says yes.`,
        data: {
          recordId: record.id,
          artistId: target.artistId,
          title: record.title,
          stage: record.status,
          idea: record.idea,
          songs: record.songs.map((s) => ({ title: s.title, stage: s.stage })),
          tasks,
          suggested: suggested.map((s) => ({ title: s.title, description: s.description })),
        },
      };
    },
  },
];
