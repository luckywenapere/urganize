import { describe, expect, it } from 'vitest';

import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import { EP_RELEASE_TEMPLATE } from './release-templates/ep';
import { ALBUM_RELEASE_TEMPLATE } from './release-templates/album';
import {
  CORE_MAX_TASKS,
  CORE_MIN_TASKS,
  CORE_PHASE_MIN,
  CORE_PLAYBOOK_TASK_IDS,
  draftTaskRolloutPhase,
  listPlanSuggestions,
  markCoreTasks,
  pickStartHereTaskId,
  selectCoreTasks,
} from './plan-core';
import {
  buildDraftFromTemplate,
  buildPlannerMessages,
  isTaskPreCompletedByReady,
  parseDraftDoc,
  toPromptTasks,
  type DraftTask,
  type ReleasePlanDraftDoc,
  type ReleasePlanIntake,
} from './release-planning';
import { buildSuggestionTaskRow, buildTaskRowsFromDraft } from './release-planning-server';

// The smaller plan (URG-318): 12 to 15 core tasks across the three phases
// become activities; the rest of the plan is offered as one-tap suggestions.

const OWNER = '11111111-1111-1111-1111-111111111111';
const MATE = '22222222-2222-2222-2222-222222222222';
const NOW = Date.parse('2026-10-16T09:00:00Z');

const intake = (over: Partial<ReleasePlanIntake> = {}): ReleasePlanIntake => ({
  version: 2,
  release_type: 'single',
  artist_name: 'Tola',
  date_mode: 'fixed',
  release_date: '2026-12-04',
  ready_today: [],
  goal: 'new_listeners',
  budget: 'under_100k',
  ...over,
});

const draft = (over: Partial<ReleasePlanIntake> = {}, template = SINGLE_RELEASE_TEMPLATE) =>
  buildDraftFromTemplate({ template, intake: intake(over), ownerUserId: OWNER, generatedAt: '2026-10-16T09:00:00Z' });

const doneFor = (doc: ReleasePlanDraftDoc) => (task: DraftTask) =>
  task.origin === 'template' && isTaskPreCompletedByReady(task, doc.intake.ready_today, doc.template_id);

const rowsOf = (doc: ReleasePlanDraftDoc) =>
  buildTaskRowsFromDraft({
    doc,
    draftId: 'd',
    releaseId: 'r',
    releaseDate: '2026-12-04',
    workspaceId: 'w',
    ownerUserId: OWNER,
    assignableUserIds: new Set([OWNER, MATE]),
    approvedAtMs: NOW,
  }).rows;

const planner = (row: { metadata: Record<string, unknown> }) => row.metadata.planner as Record<string, unknown>;
const phaseOf = (row: { metadata: Record<string, unknown> }) => row.metadata.phase as string;

describe('the playbook core', () => {
  it.each([
    ['single_v0.3', SINGLE_RELEASE_TEMPLATE],
    ['ep_v0.1', EP_RELEASE_TEMPLATE],
    ['album_v0.1', ALBUM_RELEASE_TEMPLATE],
  ])('%s names only real template tasks', (id, template) => {
    expect(template.id).toBe(id);
    const ids = new Set(template.tasks.map((task) => task.id));
    for (const taskId of CORE_PLAYBOOK_TASK_IDS[id]) expect(ids.has(taskId)).toBe(true);
    expect(CORE_PLAYBOOK_TASK_IDS[id].length).toBeLessThanOrEqual(CORE_MAX_TASKS);
  });
});

describe('a new plan is small', () => {
  it.each([
    ['single', SINGLE_RELEASE_TEMPLATE],
    ['ep', EP_RELEASE_TEMPLATE],
    ['album', ALBUM_RELEASE_TEMPLATE],
  ] as const)('with no model, a %s becomes 12 activities across all three phases', (type, template) => {
    const doc = markCoreTasks(draft({ release_type: type }, template));
    const rows = rowsOf(doc);
    expect(rows).toHaveLength(CORE_MIN_TASKS);
    for (const phase of ['pre_release', 'release', 'post_release'] as const) {
      expect(rows.filter((row) => phaseOf(row) === phase).length).toBeGreaterThanOrEqual(CORE_PHASE_MIN[phase]);
    }
    expect(rows.every((row) => row.assigned_to_user_id)).toBe(true);
    expect(rows.every((row) => row.due_date)).toBe(true);
    expect(rows.every((row) => planner(row).core === true && planner(row).key === true)).toBe(true);
  });

  it('keeps what UrgAns picked, up to 15, and fills a phase it left short', () => {
    const base = draft();
    const pre = base.tasks.filter((t) => draftTaskRolloutPhase(t) === 'pre_release').slice(0, 16);
    const doc = markCoreTasks({ ...base, tasks: base.tasks.map((t) => (pre.includes(t) ? { ...t, key: true } : t)) });
    const rows = rowsOf(doc);
    expect(rows).toHaveLength(CORE_MAX_TASKS);
    expect(rows.filter((row) => phaseOf(row) === 'release').length).toBeGreaterThanOrEqual(CORE_PHASE_MIN.release);
    expect(rows.filter((row) => phaseOf(row) === 'post_release').length).toBeGreaterThanOrEqual(
      CORE_PHASE_MIN.post_release
    );
  });

  it('never makes a removed task core, and drops edges to tasks left as suggestions', () => {
    const base = draft();
    const gone = CORE_PLAYBOOK_TASK_IDS['single_v0.3'][0];
    const doc = markCoreTasks({ ...base, tasks: base.tasks.map((t) => (t.id === gone ? { ...t, removed: true } : t)) });
    const rows = rowsOf(doc);
    const ids = new Set(rows.map((row) => row.id));
    expect(rows.some((row) => planner(row).draft_task_id === gone)).toBe(false);
    for (const row of rows) for (const dep of row.dependencies) expect(ids.has(dep)).toBe(true);
  });

  it('lands "ready today" work done, outside the core count', () => {
    const base = draft({ ready_today: ['master'] });
    const doc = markCoreTasks(base, doneFor(base));
    const rows = rowsOf(doc);
    const open = rows.filter((row) => row.status !== 'done');
    expect(open).toHaveLength(CORE_MIN_TASKS);
    expect(rows.length).toBeGreaterThan(open.length);
  });

  it('survives a save and read of the plan document', () => {
    const doc = markCoreTasks(draft());
    const parsed = parseDraftDoc(JSON.parse(JSON.stringify(doc)));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.doc.core_only).toBe(true);
    expect(rowsOf(parsed.doc)).toHaveLength(CORE_MIN_TASKS);
  });

  it('leaves an older plan whole: no core_only, every live task becomes an activity', () => {
    const doc = draft();
    expect(rowsOf(doc).length).toBeGreaterThan(40);
    expect(listPlanSuggestions(doc, new Set())).toEqual([]);
  });

  it('asks UrgAns for a 12 to 15 task core across the phases', () => {
    const doc = draft();
    const messages = buildPlannerMessages({
      release: { title: 'Song', artistName: 'Tola', releaseDate: '2026-12-04' },
      intake: doc.intake,
      tasks: toPromptTasks(doc.tasks),
      members: [],
      todayYmd: '2026-10-16',
      fallbackToSingle: false,
      appliedExclusions: [],
      onboarding: null,
    });
    const system = messages.map((m) => m.content).join('\n');
    expect(system).toContain('12 to 15 tasks');
  });
});

describe('suggestions', () => {
  it('offers the rest of the plan by date, minus what is on the board or done', () => {
    const base = draft({ ready_today: ['master'] });
    const doc = markCoreTasks(base, doneFor(base));
    const live = doc.tasks.filter((t) => !t.removed);
    const all = listPlanSuggestions(doc, new Set(), doneFor(doc));
    expect(all.length).toBeGreaterThan(20);
    expect(all.every((s) => live.find((t) => t.id === s.id)?.key === false)).toBe(true);
    expect(all.some((s) => doneFor(doc)(doc.tasks.find((t) => t.id === s.id)!))).toBe(false);
    const offsets = all.map((s) => s.offsetDays);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);

    const taken = new Set([all[0].id]);
    expect(listPlanSuggestions(doc, taken, doneFor(doc)).some((s) => s.id === all[0].id)).toBe(false);
  });

  it('an added suggestion lands dated, owned, on the short list, depending only on board work', () => {
    const doc = markCoreTasks(draft());
    const suggestion = doc.tasks.find((t) => !t.removed && t.key === false && t.depends_on.length > 0)!;
    const board = new Map([[suggestion.depends_on[0], 'dep-uuid']]);
    const row = buildSuggestionTaskRow({
      doc,
      task: { ...suggestion, assignee_user_id: 'left-the-team' },
      draftId: 'd',
      releaseId: 'r',
      releaseDate: '2026-12-04',
      workspaceId: 'w',
      actorUserId: MATE,
      ownerUserId: OWNER,
      assignableUserIds: new Set([OWNER, MATE]),
      boardIdsByDraftTaskId: board,
      position: 12,
      nowMs: NOW,
    });
    expect(row.assigned_to_user_id).toBe(OWNER);
    expect(row.created_by).toBe(MATE);
    expect(row.dependencies).toEqual(['dep-uuid']);
    expect(row.due_date.slice(0, 10)).toBe(
      new Date(Date.parse('2026-12-04T00:00:00Z') + suggestion.offset_days * 86_400_000).toISOString().slice(0, 10)
    );
    expect(planner(row)).toMatchObject({ key: true, suggested: true, draft_task_id: suggestion.id });
  });
});

describe('Start here', () => {
  const task = (id: string, dueDate: string | null, status = 'todo', planCore = true) => ({ id, dueDate, status, planCore });

  it('is the earliest open task of a smaller plan', () => {
    expect(
      pickStartHereTaskId([
        task('b', '2026-10-20T00:00:00Z'),
        task('done', '2026-10-01T00:00:00Z', 'done'),
        task('a', '2026-10-05T00:00:00Z'),
        task('none', null),
      ])
    ).toBe('a');
  });

  it('is never shown on an older plan', () => {
    expect(pickStartHereTaskId([task('a', '2026-10-05T00:00:00Z', 'todo', false)])).toBeNull();
  });

  it('respects the selection order directly', () => {
    const doc = draft();
    expect(selectCoreTasks(doc.tasks, doc.template_id).size).toBe(CORE_MIN_TASKS);
  });
});
