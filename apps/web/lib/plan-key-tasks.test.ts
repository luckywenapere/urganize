import { describe, expect, it } from 'vitest';

import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import {
  DEFAULT_KEY_TASK_COUNT,
  MAX_DELTA_KEY,
  MAX_SHORT_LIST,
  MIN_KEY_TASK_COUNT,
  applyDeltaToDraft,
  buildDraftFromTemplate,
  buildPlannerMessages,
  finalizeKeyTasks,
  parseDraftDoc,
  parsePlannerAiDelta,
  sanitizePlannerDelta,
  toPromptTasks,
  type DraftTask,
  type PlannerAiDelta,
  type ReleasePlanIntake,
} from './release-planning';
import { buildTaskRowsFromDraft } from './release-planning-server';
import { selectKeyTaskIds } from './plan-focus';

// Key tasks (URG-258): the planner marks the few tasks a plan opens on, and
// every approved task carries an explicit metadata.planner.key.

const OWNER = '11111111-1111-1111-1111-111111111111';

const intake: ReleasePlanIntake = {
  version: 2,
  release_type: 'single',
  artist_name: 'Tola',
  date_mode: 'fixed',
  release_date: '2026-12-04',
  ready_today: ['master'],
  goal: 'new_listeners',
  budget: 'under_100k',
};

const emptyDelta = (): PlannerAiDelta => ({
  exclude_scopes: [],
  drops: [],
  adjust_offsets: [],
  role_assignments: [],
  rewrite_why: [],
  focus: [],
  key: [],
  add_tasks: [],
  warnings: [],
  rationale: '',
});

const base = () =>
  buildDraftFromTemplate({
    template: SINGLE_RELEASE_TEMPLATE,
    intake,
    ownerUserId: OWNER,
    generatedAt: '2026-10-14T09:00:00Z',
  });

const approve = (doc: ReturnType<typeof base>) =>
  buildTaskRowsFromDraft({
    doc,
    draftId: 'd',
    releaseId: 'r',
    releaseDate: '2026-12-04',
    workspaceId: 'w',
    ownerUserId: OWNER,
    assignableUserIds: new Set([OWNER]),
    approvedAtMs: Date.parse('2026-10-14T09:00:00Z'),
  }).rows;

const planner = (row: { metadata: Record<string, unknown> }) =>
  row.metadata.planner as Record<string, unknown>;

function draftTask(over: Partial<DraftTask> & { id: string }): DraftTask {
  return {
    template_task_id: over.id,
    origin: 'template',
    title: over.id,
    why: '',
    phase: 'setup',
    offset_days: 0,
    duration_days: 1,
    role: null,
    assignee_user_id: null,
    optional: false,
    task_type: 'task',
    tags: [],
    depends_on: [],
    removed: false,
    removed_by: null,
    removed_reason: null,
    change_reason: null,
    assignee_basis: null,
    edited: false,
    ...over,
  };
}

describe('the model marks key tasks', () => {
  it('parses key as ids, bare or wrapped, and treats a missing list as empty', () => {
    const parsed = parsePlannerAiDelta(
      JSON.stringify({ ...emptyDelta(), key: ['a', { id: 'b' }, 3, ' '] })
    );
    expect(parsed?.key).toEqual(['a', 'b']);
    const { key: _drop, ...withoutKey } = emptyDelta();
    expect(parsePlannerAiDelta(JSON.stringify(withoutKey))?.key).toEqual([]);
  });

  it('refuses unknown ids, dropped ids and anything past the cap, item by item', () => {
    const doc = base();
    const ids = doc.tasks.map((task) => task.id);
    const optional = doc.tasks.find((task) => task.optional)!.id;
    const { delta, rejected } = sanitizePlannerDelta(
      {
        ...emptyDelta(),
        drops: [{ id: optional, reason: 'Not needed.' }],
        key: ['ghost', optional, ...ids.filter((id) => id !== optional).slice(0, MAX_DELTA_KEY + 2)],
      },
      {
        tasks: doc.tasks.map((task) => ({ id: task.id, optional: task.optional, tags: task.tags })),
        memberUserIds: [OWNER],
        excludedScopes: [],
        budget: 'under_100k',
      }
    );
    expect(delta.key).toHaveLength(MAX_DELTA_KEY);
    expect(delta.key).not.toContain('ghost');
    expect(delta.key).not.toContain(optional);
    expect(rejected.filter((line) => line.startsWith('key'))).toHaveLength(4);
  });

  it('asks for key tasks in the prompt', () => {
    const doc = base();
    const messages = buildPlannerMessages({
      release: { title: 'Song', artistName: 'Tola', releaseDate: '2026-12-04' },
      intake,
      tasks: toPromptTasks(doc.tasks),
      members: [],
      todayYmd: '2026-10-14',
    });
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toContain('"key"');
    expect(system).toContain('suggestion they can add with one tap');
  });
});

describe('approved plans carry an explicit key flag on every task', () => {
  it('marks what UrgAns listed, plus its focus tasks, and nothing else past the target', () => {
    const doc = base();
    const open = doc.tasks.filter((task) => !task.removed);
    const keyIds = open.slice(10, 16).map((task) => task.id);
    const focusId = open[30].id;
    const next = applyDeltaToDraft(doc, {
      ...emptyDelta(),
      key: keyIds,
      focus: [{ id: focusId, reason: 'The spine of the goal.' }],
    });
    const parsed = parseDraftDoc(next);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.doc.tasks.filter((task) => task.key).map((task) => task.id)).toEqual(keyIds);

    const rows = approve(parsed.doc);
    const keyed = rows.filter((row) => planner(row).key === true).map((row) => planner(row).draft_task_id);
    expect(new Set(keyed)).toEqual(new Set([...keyIds, focusId]));
    expect(rows.every((row) => typeof planner(row).key === 'boolean')).toBe(true);
  });

  it('with no model, a single opens on a short list of the soonest open work', () => {
    const rows = approve(base());
    expect(rows.length).toBeGreaterThan(40);
    const keyed = rows.filter((row) => planner(row).key === true);
    expect(keyed).toHaveLength(DEFAULT_KEY_TASK_COUNT);
    expect(keyed.every((row) => row.status !== 'done')).toBe(true);
  });

  it('the client shows exactly the keyed tasks of a fresh plan', () => {
    const rows = approve(base());
    const tasks = rows.map((row) => ({
      id: row.id,
      releaseId: row.release_id,
      status: row.status as 'todo' | 'done',
      priority: row.priority as 'none' | 'high',
      dueDate: row.due_date,
      position: row.position,
      autoGenerated: true,
      planKey: planner(row).key as boolean,
    }));
    const shown = selectKeyTaskIds(tasks);
    const keyed = tasks.filter((t) => t.planKey).map((t) => t.id);
    for (const id of keyed) expect(shown.has(id)).toBe(true);
    // done (ready-today) rows keep their flag false and stay behind Show all
    expect(shown.size).toBeLessThanOrEqual(MAX_SHORT_LIST);
  });
});

describe('finalizeKeyTasks', () => {
  it('tops a thin model list up to the minimum, required work first', () => {
    const tasks = [
      draftTask({ id: 'k', key: true, offset_days: 10 }),
      draftTask({ id: 'opt', optional: true, offset_days: -50 }),
      ...Array.from({ length: 10 }, (_, i) => draftTask({ id: `r${i}`, offset_days: -40 + i })),
    ];
    const keys = finalizeKeyTasks(tasks);
    expect(keys.size).toBe(MIN_KEY_TASK_COUNT);
    expect(keys.has('k')).toBe(true);
    expect(keys.has('opt')).toBe(false);
    expect(keys.has('r0')).toBe(true);
  });

  it('never gives a top-up slot to a task already done, or to a removed one', () => {
    const tasks = [
      draftTask({ id: 'done', offset_days: -60 }),
      draftTask({ id: 'gone', offset_days: -59, removed: true }),
      ...Array.from({ length: 10 }, (_, i) => draftTask({ id: `r${i}`, offset_days: i })),
    ];
    const keys = finalizeKeyTasks(tasks, (task) => task.id === 'done');
    expect(keys.has('done')).toBe(false);
    expect(keys.has('gone')).toBe(false);
    expect(keys.size).toBe(DEFAULT_KEY_TASK_COUNT);
  });

  it('caps at the maximum however many the model marked', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => draftTask({ id: `t${i}`, key: true, focus: i < 3 }));
    expect(finalizeKeyTasks(tasks).size).toBe(MAX_SHORT_LIST);
  });
});
