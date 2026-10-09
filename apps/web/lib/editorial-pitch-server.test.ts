/* eslint-disable @typescript-eslint/no-explicit-any -- The in-memory database stands in for Supabase rows, whose shape is whatever each test needs. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('./push-server', () => ({
  sendPushToUsers: vi.fn(async () => undefined),
}));

import { sendPushToUsers } from './push-server';
import {
  BACKFILL_METADATA_KEY,
  PITCH_REMINDER_TYPE_BY_TIER,
  ensureEditorialPitchTask,
  loadPitchBlocker,
  pitchBlockedBy,
  readPitchTaskMeta,
  readTemplateOrigin,
  runEditorialPitchReminderSweep,
  savePitchFields,
  skipEditorialPitch,
  withPitchTaskMeta,
} from './editorial-pitch-server';
import { PITCH_BLOCKED_COPY } from './editorial-pitch';

// ---------------------------------------------------------------------------
// An in-memory stand-in for the Supabase client, covering the few query shapes
// these functions use. Updates bump `updated_at` the way the real trigger does,
// so the claim race can be tested.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
type Db = Record<string, Row[]>;

function pathValue(row: Row, column: string): unknown {
  if (!column.includes('->')) return row[column];
  const parts = column.split(/->>|->/);
  let value: any = row;
  for (const part of parts) value = value == null ? undefined : value[part];
  return value;
}

function makeClient(db: Db, options: { failInsertOn?: string } = {}) {
  let clock = 0;
  const inserts: Array<{ table: string; row: Row }> = [];
  const updates: Array<{ table: string; patch: Row }> = [];

  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let op: 'select' | 'update' | 'insert' = 'select';
      let patch: Row = {};
      let insertRow: Row | null = null;

      const run = () => {
        const rows = db[table] ?? (db[table] = []);
        if (op === 'insert') {
          if (options.failInsertOn === table) return { data: null, error: { message: 'insert refused' } };
          const row = { id: `new-${inserts.length + 1}`, ...insertRow! };
          rows.push(row);
          inserts.push({ table, row });
          return { data: [row], error: null };
        }
        const matched = rows.filter((row) => filters.every((filter) => filter(row)));
        if (op === 'update') {
          for (const row of matched) {
            Object.assign(row, patch);
            row.updated_at = `t${++clock}`;
          }
          updates.push({ table, patch });
          return { data: matched, error: null };
        }
        return { data: matched, error: null };
      };

      const chain: Record<string, any> = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => pathValue(row, column) === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(pathValue(row, column)));
          return chain;
        },
        not: (column: string, operator: string, value: unknown) => {
          if (operator === 'in') {
            const list = String(value).replace(/[()]/g, '').split(',');
            filters.push((row) => !list.includes(String(pathValue(row, column))));
          } else if (operator === 'is' && value === null) {
            filters.push((row) => pathValue(row, column) != null);
          }
          return chain;
        },
        limit: () => chain,
        update: (next: Row) => {
          op = 'update';
          patch = next;
          return chain;
        },
        insert: (row: Row) => {
          op = 'insert';
          insertRow = row;
          return chain;
        },
        maybeSingle: () => {
          const result = run();
          const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
          return Promise.resolve({ data, error: result.error });
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(run()).then(resolve, reject),
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  return { client, inserts, updates };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Noon in Lagos on 2026-10-10. */
const NOW = new Date('2026-10-10T11:00:00Z');

const step = (templateId: string, taskId: string) => ({
  template: { template_id: templateId, task_id: taskId },
});

function plan(over: { releaseDate?: string | null; releaseMeta?: Row; status?: string } = {}) {
  const db: Db = {
    releases: [
      {
        id: 'rel-1',
        title: 'Midnight',
        owner_user_id: 'owner-1',
        release_date: over.releaseDate === undefined ? '2026-12-31' : over.releaseDate,
        status: over.status ?? 'draft',
        metadata: over.releaseMeta ?? {},
        updated_at: 't0',
      },
    ],
    tasks: [
      {
        id: 'upload',
        release_id: 'rel-1',
        workspace_id: 'ws-1',
        status: 'todo',
        title: 'Upload track and metadata to distributor',
        position: 10,
        dependencies: [],
        metadata: step('single_v0.3', 'w6_upload_to_distributor'),
      },
      {
        id: 'cover',
        release_id: 'rel-1',
        workspace_id: 'ws-1',
        status: 'todo',
        title: 'Upload cover art',
        position: 11,
        dependencies: [],
        metadata: step('single_v0.3', 'w6_upload_cover_art'),
      },
      {
        id: 'master',
        release_id: 'rel-1',
        workspace_id: 'ws-1',
        status: 'done',
        title: 'Lock the master',
        position: 3,
        dependencies: [],
        metadata: step('single_v0.3', 'w8_lock_master'),
      },
    ],
    notifications: [],
  };
  return db;
}

function legacyTask(status = 'todo') {
  return {
    id: 'old-pitch',
    release_id: 'rel-1',
    workspace_id: 'ws-1',
    status,
    title: 'Submit Spotify for Artists pitch',
    position: 12,
    dependencies: [],
    assigned_to_user_id: 'marketing-1',
    metadata: {
      keep: 'me',
      template: { ...step('single_v0.3', 'w6_spotify_for_artists_pitch').template, role: 'marketing_lead' },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Pure readers
// ---------------------------------------------------------------------------

describe('readTemplateOrigin', () => {
  it('reads the playbook and the step, tolerating the old key', () => {
    expect(readTemplateOrigin({ template: { template_id: 'a', task_id: 'b' } })).toEqual({
      templateId: 'a',
      taskId: 'b',
    });
    expect(readTemplateOrigin({ template: { template_task_id: 'c' } }).taskId).toBe('c');
  });

  it('gives nulls for anything else', () => {
    expect(readTemplateOrigin(null)).toEqual({ templateId: null, taskId: null });
    expect(readTemplateOrigin({ template: 'x' })).toEqual({ templateId: null, taskId: null });
  });
});

describe('the saved pitch block', () => {
  it('reads fields and the skip record, and defaults to empty', () => {
    expect(readPitchTaskMeta(null).fields.genre).toBe('');
    const meta = readPitchTaskMeta({
      editorial_pitch: { fields: { genre: 'Soul' }, skipped_at: '2026-10-10T00:00:00Z', skipped_by: 'u1' },
    });
    expect(meta.fields.genre).toBe('Soul');
    expect(meta.skippedAt).toBe('2026-10-10T00:00:00Z');
    expect(meta.skippedBy).toBe('u1');
  });

  it('merges a patch without losing other metadata or earlier pitch keys', () => {
    const merged = withPitchTaskMeta(
      { template: { task_id: 'editorial_pitch' }, editorial_pitch: { skipped_at: 'x' } },
      { fields: { genre: 'Soul' } }
    ) as any;
    expect(merged.template.task_id).toBe('editorial_pitch');
    expect(merged.editorial_pitch.skipped_at).toBe('x');
    expect(merged.editorial_pitch.fields.genre).toBe('Soul');
  });
});

describe('pitchBlockedBy', () => {
  const order = (status: string) => ({
    id: 'o',
    status,
    metadata: step('single_v0.3', 'w6_upload_to_distributor'),
  });
  const other = { id: 'x', status: 'todo', metadata: step('single_v0.3', 'w6_upload_cover_art') };

  it('blocks the pitch while the distribution order is open', () => {
    expect(pitchBlockedBy('editorial_pitch', [order('todo')])).toBe(PITCH_BLOCKED_COPY);
    expect(pitchBlockedBy('editorial_pitch', [order('in_progress')])).toBe(PITCH_BLOCKED_COPY);
  });

  it('lets it through once the order is done', () => {
    expect(pitchBlockedBy('editorial_pitch', [order('done')])).toBeNull();
  });

  it('ignores open steps that are not the order, and other tasks entirely', () => {
    expect(pitchBlockedBy('editorial_pitch', [other])).toBeNull();
    expect(pitchBlockedBy('w6_upload_cover_art', [order('todo')])).toBeNull();
    expect(pitchBlockedBy(null, [order('todo')])).toBeNull();
  });
});

describe('loadPitchBlocker', () => {
  it('reads the dependency rows and blocks while the order is open', async () => {
    const db = plan();
    const { client } = makeClient(db);
    const blocker = await loadPitchBlocker(client, {
      metadata: step('single_v0.3', 'editorial_pitch'),
      dependencies: ['upload'],
    });
    expect(blocker).toBe(PITCH_BLOCKED_COPY);

    db.tasks[0].status = 'done';
    expect(
      await loadPitchBlocker(client, {
        metadata: step('single_v0.3', 'editorial_pitch'),
        dependencies: ['upload'],
      })
    ).toBeNull();
  });

  it('never queries for a task that is not the pitch', async () => {
    const { client } = makeClient(plan());
    expect(
      await loadPitchBlocker(client, { metadata: step('single_v0.3', 'w6_upload_cover_art'), dependencies: ['upload'] })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Saving and skipping
// ---------------------------------------------------------------------------

describe('savePitchFields and skipEditorialPitch', () => {
  it('saves the fields onto the task without touching its other metadata', async () => {
    const db = plan();
    db.tasks.push({
      id: 'pitch',
      release_id: 'rel-1',
      status: 'todo',
      metadata: { ...step('single_v0.3', 'editorial_pitch'), keep: 1 },
    });
    const { client } = makeClient(db);
    const ok = await savePitchFields(client, 'pitch', { genre: 'Soul', moods: '', instruments: '', description: 'Hi' });
    expect(ok).toBe(true);
    const saved = db.tasks.find((t) => t.id === 'pitch')!.metadata;
    expect(saved.keep).toBe(1);
    expect(saved.template.task_id).toBe('editorial_pitch');
    expect(saved.editorial_pitch.fields.genre).toBe('Soul');
  });

  it('skip cancels the task and records who and when, as a flag rather than a status', async () => {
    const db = plan();
    db.tasks.push({ id: 'pitch', status: 'todo', metadata: step('single_v0.3', 'editorial_pitch') });
    const { client } = makeClient(db);
    expect(await skipEditorialPitch(client, 'pitch', 'user-9', NOW)).toBe(true);
    const row = db.tasks.find((t) => t.id === 'pitch')!;
    expect(row.status).toBe('cancelled');
    expect(row.metadata.editorial_pitch.skipped_at).toBe(NOW.toISOString());
    expect(row.metadata.editorial_pitch.skipped_by).toBe('user-9');
  });

  it('will not skip a pitch that is already done', async () => {
    const db = plan();
    db.tasks.push({ id: 'pitch', status: 'done', metadata: step('single_v0.3', 'editorial_pitch') });
    const { client } = makeClient(db);
    expect(await skipEditorialPitch(client, 'pitch', 'user-9', NOW)).toBe(false);
    expect(db.tasks.find((t) => t.id === 'pitch')!.status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// The once-only backfill
// ---------------------------------------------------------------------------

describe('ensureEditorialPitchTask', () => {
  it('adds the pitch once, 28 days before release day, waiting on the upload', async () => {
    const db = plan({ releaseDate: '2026-12-31' });
    const { client, inserts } = makeClient(db);

    const result = await ensureEditorialPitchTask(client, 'rel-1', NOW);

    expect(result.outcome).toBe('added');
    expect(inserts).toHaveLength(1);
    const row = inserts[0].row;
    expect(row.title).toBe('Pitch to Spotify editorial');
    expect(row.due_date).toBe('2026-12-03T00:00:00.000Z');
    expect(row.dependencies).toEqual(['upload']);
    expect(row.release_id).toBe('rel-1');
    expect(row.workspace_id).toBe('ws-1');
    expect(row.assigned_to_user_id).toBe('owner-1');
    expect(row.auto_generated).toBe(true);
    expect(row.position).toBe(12);
    expect(row.metadata.template.task_id).toBe('editorial_pitch');
    expect(row.metadata.template.template_id).toBe('single_v0.3');
    expect(row.metadata.template.compressed_runway).toBe(false);
    expect(db.releases[0].metadata[BACKFILL_METADATA_KEY]).toMatchObject({ outcome: 'added' });
  });

  it('never adds it twice: a second call and a deleted task both leave things alone', async () => {
    const db = plan();
    const { client, inserts } = makeClient(db);
    await ensureEditorialPitchTask(client, 'rel-1', NOW);
    expect((await ensureEditorialPitchTask(client, 'rel-1', NOW)).outcome).toBe('skipped');

    // The team deletes the new task; opening the rollout again must not bring it back.
    db.tasks = db.tasks.filter((task) => task.metadata?.template?.task_id !== 'editorial_pitch');
    expect((await ensureEditorialPitchTask(client, 'rel-1', NOW)).outcome).toBe('skipped');
    expect(inserts).toHaveLength(1);
  });

  it('two tabs opening at once add exactly one task', async () => {
    const db = plan();
    const { client, inserts } = makeClient(db);
    const [a, b] = await Promise.all([
      ensureEditorialPitchTask(client, 'rel-1', NOW),
      ensureEditorialPitchTask(client, 'rel-1', NOW),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(['added', 'skipped']);
    expect(inserts).toHaveLength(1);
  });

  it('the 7 day boundary: 8 days out adds it, 7 days out does not', async () => {
    const eightDays = plan({ releaseDate: '2026-10-18' });
    expect((await ensureEditorialPitchTask(makeClient(eightDays).client, 'rel-1', NOW)).outcome).toBe('added');

    const sevenDays = plan({ releaseDate: '2026-10-17' });
    const { client, inserts } = makeClient(sevenDays);
    expect((await ensureEditorialPitchTask(client, 'rel-1', NOW)).outcome).toBe('skipped');
    expect(inserts).toHaveLength(0);
    // Nothing was recorded, so a later, further-out date still gets the task.
    expect(BACKFILL_METADATA_KEY in sevenDays.releases[0].metadata).toBe(false);
  });

  it('with release day inside 28 days the due date is today, not in the past', async () => {
    const db = plan({ releaseDate: '2026-10-30' });
    const { client, inserts } = makeClient(db);
    await ensureEditorialPitchTask(client, 'rel-1', NOW);
    expect(inserts[0].row.due_date).toBe('2026-10-10T00:00:00.000Z');
    // Due before the moment of instantiation, so it lands in "Catch up", not "Overdue".
    expect(inserts[0].row.metadata.template.compressed_runway).toBe(true);
  });

  it('converts an open old pitch in place instead of adding a second one', async () => {
    const db = plan();
    db.tasks.push(legacyTask('in_progress'));
    const { client, inserts } = makeClient(db);

    const result = await ensureEditorialPitchTask(client, 'rel-1', NOW);

    expect(result).toEqual({ outcome: 'converted', taskId: 'old-pitch' });
    expect(inserts).toHaveLength(0);
    const row = db.tasks.find((t) => t.id === 'old-pitch')!;
    expect(row.title).toBe('Pitch to Spotify editorial');
    expect(row.status).toBe('in_progress');
    expect(row.assigned_to_user_id).toBe('marketing-1');
    expect(row.dependencies).toEqual(['upload']);
    expect(row.due_date).toBe('2026-12-03T00:00:00.000Z');
    expect(row.metadata.keep).toBe('me');
    expect(row.metadata.template.task_id).toBe('editorial_pitch');
    expect(row.metadata.template.tags).toEqual(['editorial', 'distribution']);
  });

  it('adds nothing when the old pitch is done, or was cancelled by the team', async () => {
    for (const status of ['done', 'cancelled']) {
      const db = plan();
      db.tasks.push(legacyTask(status));
      const { client, inserts } = makeClient(db);
      expect((await ensureEditorialPitchTask(client, 'rel-1', NOW)).outcome).toBe('already_pitched');
      expect(inserts).toHaveLength(0);
    }
  });

  it('records but changes nothing when the new task is already there', async () => {
    const db = plan();
    db.tasks.push({ id: 'pitch', release_id: 'rel-1', workspace_id: 'ws-1', status: 'todo', metadata: step('single_v0.3', 'editorial_pitch') });
    const { client, inserts } = makeClient(db);
    expect((await ensureEditorialPitchTask(client, 'rel-1', NOW)).outcome).toBe('present');
    expect(inserts).toHaveLength(0);
    expect(db.releases[0].metadata[BACKFILL_METADATA_KEY]).toMatchObject({ outcome: 'present' });
  });

  it('leaves alone anything it should not touch, recording nothing', async () => {
    const cases: Array<[string, Db]> = [
      ['no release day', plan({ releaseDate: null })],
      ['a test rollout', plan({ releaseMeta: { test_release: true } })],
      ['an archived rollout', plan({ status: 'archived' })],
      ['a rollout waiting to be planned', plan({ releaseMeta: { planner_pending: true } })],
      ['a rollout waiting on its template', plan({ releaseMeta: { template_pending: true } })],
    ];
    for (const [label, db] of cases) {
      const { client, inserts } = makeClient(db);
      const result = await ensureEditorialPitchTask(client, 'rel-1', NOW);
      expect(result.outcome, label).toBe('skipped');
      expect(inserts, label).toHaveLength(0);
      expect(BACKFILL_METADATA_KEY in db.releases[0].metadata, label).toBe(false);
    }
  });

  it('leaves a rollout with no plan, or a hand-built plan, alone', async () => {
    const empty = plan();
    empty.tasks = [];
    expect((await ensureEditorialPitchTask(makeClient(empty).client, 'rel-1', NOW)).outcome).toBe('skipped');

    const manual = plan();
    manual.tasks = [{ id: 't', release_id: 'rel-1', workspace_id: 'ws-1', status: 'todo', metadata: {} }];
    expect((await ensureEditorialPitchTask(makeClient(manual).client, 'rel-1', NOW)).outcome).toBe('skipped');
  });

  it('gives the claim back when the insert fails, so the next open tries again', async () => {
    const db = plan();
    const { client } = makeClient(db, { failInsertOn: 'tasks' });
    const result = await ensureEditorialPitchTask(client, 'rel-1', NOW);
    expect(result.outcome).toBe('skipped');
    expect(BACKFILL_METADATA_KEY in db.releases[0].metadata).toBe(false);
  });

  it('keeps the other keys on the release metadata', async () => {
    const db = plan({ releaseMeta: { something: 'else' } });
    await ensureEditorialPitchTask(makeClient(db).client, 'rel-1', NOW);
    expect(db.releases[0].metadata.something).toBe('else');
  });

  it('for an EP the pitch also waits on the lead single numbers', async () => {
    const db = plan({ releaseDate: '2026-12-31' });
    db.tasks = [
      { id: 'ep-upload', release_id: 'rel-1', workspace_id: 'ws-1', status: 'todo', position: 1, metadata: step('ep_v0.1', 'w5_upload_ep_to_distributor') },
      { id: 'numbers', release_id: 'rel-1', workspace_id: 'ws-1', status: 'todo', position: 2, metadata: step('ep_v0.1', 'w6_single_first_numbers') },
    ];
    const { client, inserts } = makeClient(db);
    await ensureEditorialPitchTask(client, 'rel-1', NOW);
    expect(inserts[0].row.dependencies.sort()).toEqual(['ep-upload', 'numbers']);
    expect(inserts[0].row.metadata.template.template_id).toBe('ep_v0.1');
  });
});

// ---------------------------------------------------------------------------
// The reminder sweep
// ---------------------------------------------------------------------------

describe('runEditorialPitchReminderSweep', () => {
  function sweepDb(releaseDate: string, extra: { taskStatus?: string; assignee?: string | null; releaseMeta?: Row } = {}) {
    return {
      releases: [
        {
          id: 'rel-1',
          title: 'Midnight',
          owner_user_id: 'owner-1',
          release_date: releaseDate,
          status: 'draft',
          metadata: extra.releaseMeta ?? {},
        },
      ],
      tasks: [
        {
          id: 'pitch',
          release_id: 'rel-1',
          status: extra.taskStatus ?? 'todo',
          assigned_to_user_id: extra.assignee === undefined ? 'owner-1' : extra.assignee,
          metadata: step('single_v0.3', 'editorial_pitch'),
        },
        {
          id: 'not-the-pitch',
          release_id: 'rel-1',
          status: 'todo',
          assigned_to_user_id: 'owner-1',
          metadata: step('single_v0.3', 'w6_upload_cover_art'),
        },
      ],
      notifications: [],
    } as Db;
  }

  it('sends the 28, 14 and 8 day reminders on their days, with the right copy', async () => {
    const cases: Array<[string, 28 | 14 | 8, string]> = [
      ['2026-11-07', 28, 'Your Spotify pitch for Midnight is due in 21 days.'],
      ['2026-10-24', 14, 'Your Spotify pitch for Midnight is due in 7 days.'],
      ['2026-10-18', 8, 'Your Spotify pitch for Midnight is due in 1 day.'],
    ];
    for (const [date, tier, copy] of cases) {
      vi.mocked(sendPushToUsers).mockClear();
      const db = sweepDb(date);
      const { client, inserts } = makeClient(db);
      const result = await runEditorialPitchReminderSweep(client, NOW);
      expect(result.sent, date).toBe(1);
      expect(inserts[0].row).toMatchObject({
        user_id: 'owner-1',
        type: PITCH_REMINDER_TYPE_BY_TIER[tier],
        task_id: 'pitch',
      });
      expect(vi.mocked(sendPushToUsers).mock.calls[0][2]).toMatchObject({
        body: copy,
        url: '/dashboard?release=rel-1',
      });
    }
  });

  it('sends each reminder exactly once, even after it has been read', async () => {
    const db = sweepDb('2026-11-07');
    const { client, inserts } = makeClient(db);
    await runEditorialPitchReminderSweep(client, NOW);
    (db.notifications[0] as Row).read = true;
    const second = await runEditorialPitchReminderSweep(client, NOW);
    expect(second.sent).toBe(0);
    expect(inserts).toHaveLength(1);
  });

  it('a missed cron day still gets its reminder on the next one', async () => {
    // 27 days out: the 28 day reminder was missed yesterday.
    const db = sweepDb('2026-11-06');
    const { client } = makeClient(db);
    expect((await runEditorialPitchReminderSweep(client, NOW)).sent).toBe(1);
  });

  it('stops when the task is done or cancelled', async () => {
    for (const taskStatus of ['done', 'cancelled']) {
      const { client, inserts } = makeClient(sweepDb('2026-11-07', { taskStatus }));
      expect((await runEditorialPitchReminderSweep(client, NOW)).sent, taskStatus).toBe(0);
      expect(inserts).toHaveLength(0);
    }
  });

  it('stays quiet once the window has closed, and outside the 28 days', async () => {
    for (const date of ['2026-10-17', '2026-10-12', '2026-10-05', '2026-12-31']) {
      const { client, inserts } = makeClient(sweepDb(date));
      expect((await runEditorialPitchReminderSweep(client, NOW)).sent, date).toBe(0);
      expect(inserts, date).toHaveLength(0);
    }
  });

  it('falls back to the release owner when nobody is assigned', async () => {
    const { client, inserts } = makeClient(sweepDb('2026-11-07', { assignee: null }));
    await runEditorialPitchReminderSweep(client, NOW);
    expect(inserts[0].row.user_id).toBe('owner-1');
  });

  it('sends nothing for a test rollout', async () => {
    const { client } = makeClient(sweepDb('2026-11-07', { releaseMeta: { test_release: true } }));
    expect((await runEditorialPitchReminderSweep(client, NOW)).sent).toBe(0);
  });

  it('never throws and sends no push when the reminder row cannot be written', async () => {
    const { client } = makeClient(sweepDb('2026-11-07'), { failInsertOn: 'notifications' });
    const result = await runEditorialPitchReminderSweep(client, NOW);
    expect(result.sent).toBe(0);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});
