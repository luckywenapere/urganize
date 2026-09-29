import { describe, expect, it } from 'vitest';

import { buildDraftFromTemplate, type ReleasePlanIntake } from './release-planning';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import { buildTaskRowsFromDraft, PlanApprovalError } from './release-planning-server';

// Approval is the one irreversible step in the planner: after it, real rows
// exist. These cover the arithmetic and the translations that happen there.

const OWNER = '11111111-1111-1111-1111-111111111111';
const TEAMMATE = '22222222-2222-2222-2222-222222222222';
const DEPARTED = '33333333-3333-3333-3333-333333333333';

const RELEASE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WORKSPACE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DRAFT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const RELEASE_DATE = '2026-10-02';
// Well before the earliest task in the plan, so nothing counts as catch-up
// unless a test deliberately makes it so.
const APPROVED_AT = Date.parse('2026-08-01T09:00:00.000Z');

const intake: ReleasePlanIntake = {
  version: 2,
  release_type: 'single',
  artist_name: 'Tola',
  date_mode: 'fixed',
  release_date: RELEASE_DATE,
  ready_today: ['master'],
  goal: 'playlist_adds',
  budget: 'under_100k',
};

const buildDoc = () =>
  buildDraftFromTemplate({
    template: SINGLE_RELEASE_TEMPLATE,
    intake,
    ownerUserId: OWNER,
    generatedAt: '2026-07-30T09:00:00.000Z',
  });

const build = (
  doc: ReturnType<typeof buildDoc>,
  overrides: Partial<Parameters<typeof buildTaskRowsFromDraft>[0]> = {}
) =>
  buildTaskRowsFromDraft({
    doc,
    draftId: DRAFT_ID,
    releaseId: RELEASE_ID,
    releaseDate: RELEASE_DATE,
    workspaceId: WORKSPACE_ID,
    ownerUserId: OWNER,
    assignableUserIds: new Set([OWNER, TEAMMATE]),
    approvedAtMs: APPROVED_AT,
    ...overrides,
  });

describe('buildTaskRowsFromDraft', () => {
  it('produces one row per task that survived the draft', () => {
    const { rows } = build(buildDoc());
    expect(rows).toHaveLength(SINGLE_RELEASE_TEMPLATE.tasks.length);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.release_id).toBe(RELEASE_ID);
      expect(row.workspace_id).toBe(WORKSPACE_ID);
      expect(row.auto_generated).toBe(true);
      // The fixture's own intake answers "master" is ready today, which
      // completes exactly w8_lock_master (see the "marking finished work
      // done" tests below) — every other row is still open work.
      const draftTaskId = (row.metadata.planner as { draft_task_id: string }).draft_task_id;
      expect(row.status, draftTaskId).toBe(draftTaskId === 'w8_lock_master' ? 'done' : 'todo');
      expect(row.state).toBe('planning');
    }
  });

  it('skips soft-removed tasks', () => {
    const doc = buildDoc();
    const removedId = doc.tasks.find((task) => task.optional)?.id as string;
    const withRemoval = {
      ...doc,
      tasks: doc.tasks.map((task) =>
        task.id === removedId ? { ...task, removed: true, removed_by: 'ai' as const } : task
      ),
    };

    const { rows } = build(withRemoval);
    expect(rows).toHaveLength(doc.tasks.length - 1);
    expect(
      rows.some((row) => (row.metadata.planner as { draft_task_id: string }).draft_task_id === removedId)
    ).toBe(false);
  });

  it('dates every task from its offset against the release date', () => {
    const doc = buildDoc();
    const { rows } = build(doc);

    const byDraftId = new Map(
      rows.map((row) => [(row.metadata.planner as { draft_task_id: string }).draft_task_id, row])
    );
    for (const task of doc.tasks) {
      const row = byDraftId.get(task.id);
      expect(row).toBeDefined();
      expect((row as { due_date: string }).due_date.slice(0, 10)).toBe(
        new Date(Date.parse(`${RELEASE_DATE}T00:00:00.000Z`) + task.offset_days * 86_400_000)
          .toISOString()
          .slice(0, 10)
      );
    }
  });

  it('orders rows chronologically', () => {
    const { rows } = build(buildDoc());
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].due_date >= rows[i - 1].due_date).toBe(true);
      expect(rows[i].position).toBe(i);
    }
  });

  it('translates dependency ids into the new task UUIDs', () => {
    const doc = buildDoc();
    const { rows } = build(doc);

    const uuidByDraftId = new Map(
      rows.map((row) => [(row.metadata.planner as { draft_task_id: string }).draft_task_id, row.id])
    );
    const dependent = doc.tasks.find((task) => task.depends_on.length > 0);
    expect(dependent).toBeDefined();

    const row = rows.find(
      (r) => (r.metadata.planner as { draft_task_id: string }).draft_task_id === dependent!.id
    );
    expect(row?.dependencies).toEqual(
      dependent!.depends_on.map((dep) => uuidByDraftId.get(dep))
    );
    expect(row?.dependencies.every(Boolean)).toBe(true);
  });

  it('prunes dependency edges that point at a dropped task', () => {
    const doc = buildDoc();
    const dependent = doc.tasks.find((task) => task.depends_on.length > 0);
    const blockerId = dependent!.depends_on[0];

    // Force the blocker out of the plan the way a manager deleting it would,
    // then confirm the dependent task does not keep pointing at a ghost.
    const withRemoval = {
      ...doc,
      tasks: doc.tasks.map((task) =>
        task.id === blockerId ? { ...task, removed: true, removed_by: 'user' as const } : task
      ),
    };

    const { rows } = build(withRemoval);
    const row = rows.find(
      (r) => (r.metadata.planner as { draft_task_id: string }).draft_task_id === dependent!.id
    );
    expect(row?.dependencies).not.toContain(blockerId);
    expect(row?.dependencies).toHaveLength(dependent!.depends_on.length - 1);
  });

  it('marks tasks already past as catch-up rather than overdue', () => {
    const doc = buildDoc();
    // Approve a week before release day: the eight-week runway is long gone.
    const { rows } = build(doc, { approvedAtMs: Date.parse('2026-09-25T09:00:00.000Z') });

    const past = rows.filter((row) => Date.parse(row.due_date) < Date.parse('2026-09-25T09:00:00.000Z'));
    const future = rows.filter(
      (row) => Date.parse(row.due_date) >= Date.parse('2026-09-25T09:00:00.000Z')
    );
    expect(past.length).toBeGreaterThan(0);
    expect(future.length).toBeGreaterThan(0);

    for (const row of past) {
      expect((row.metadata.template as { compressed_runway: boolean }).compressed_runway).toBe(true);
    }
    for (const row of future) {
      expect((row.metadata.template as { compressed_runway: boolean }).compressed_runway).toBe(false);
    }
  });

  it('keeps full template provenance on playbook tasks', () => {
    const doc = buildDoc();
    const { rows } = build(doc);
    const row = rows[0];
    const template = row.metadata.template as Record<string, unknown>;

    expect(template.template_id).toBe(SINGLE_RELEASE_TEMPLATE.id);
    expect(template.template_version).toBe(SINGLE_RELEASE_TEMPLATE.version);
    expect(typeof template.task_id).toBe('string');
    expect(template.task_type).toBeDefined();
    expect(Array.isArray(template.tags)).toBe(true);

    const planner = row.metadata.planner as Record<string, unknown>;
    expect(planner.draft_id).toBe(DRAFT_ID);
    expect(planner.origin).toBe('template');
  });

  it('carries the event milestone marker through so milestones still render', () => {
    const doc = buildDoc();
    const milestone = doc.tasks.find((task) => task.task_type === 'event_milestone');
    expect(milestone).toBeDefined();

    const { rows } = build(doc);
    const row = rows.find(
      (r) => (r.metadata.planner as { draft_task_id: string }).draft_task_id === milestone!.id
    );
    expect((row?.metadata.template as { task_type: string }).task_type).toBe('event_milestone');
  });

  it('gives a manager-added task only the two classification keys, not fake provenance', () => {
    const doc = buildDoc();
    const withUserTask = {
      ...doc,
      tasks: [
        ...doc.tasks,
        {
          ...doc.tasks[0],
          id: 'user_abc',
          template_task_id: null,
          origin: 'user' as const,
          title: 'Call the plugger',
          why: 'They asked for a heads up.',
          offset_days: -20,
          depends_on: [],
          edited: true,
        },
      ],
    };

    const { rows } = build(withUserTask);
    const row = rows.find(
      (r) => (r.metadata.planner as { draft_task_id: string }).draft_task_id === 'user_abc'
    );
    expect(row).toBeDefined();
    expect(Object.keys(row!.metadata.template as object).sort()).toEqual([
      'compressed_runway',
      'task_type',
    ]);
    expect((row!.metadata.planner as { origin: string }).origin).toBe('user');
    expect(row!.title).toBe('Call the plugger');
    expect(row!.description).toBe('They asked for a heads up.');
  });

  it('falls back to the owner when an assignee has left the team, and says so', () => {
    const doc = buildDoc();
    const targetId = doc.tasks[0].id;
    const withStaleAssignee = {
      ...doc,
      tasks: doc.tasks.map((task) =>
        task.id === targetId ? { ...task, assignee_user_id: DEPARTED } : task
      ),
    };

    const { rows, warnings } = build(withStaleAssignee);
    const row = rows.find(
      (r) => (r.metadata.planner as { draft_task_id: string }).draft_task_id === targetId
    );
    expect(row?.assigned_to_user_id).toBe(OWNER);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('no longer on the team');
  });

  it('keeps a valid teammate assignment untouched and warns about nothing', () => {
    const doc = buildDoc();
    const targetId = doc.tasks[0].id;
    const assigned = {
      ...doc,
      tasks: doc.tasks.map((task) =>
        task.id === targetId ? { ...task, assignee_user_id: TEAMMATE } : task
      ),
    };

    const { rows, warnings } = build(assigned);
    const row = rows.find(
      (r) => (r.metadata.planner as { draft_task_id: string }).draft_task_id === targetId
    );
    expect(row?.assigned_to_user_id).toBe(TEAMMATE);
    expect(warnings).toEqual([]);
  });

  it('refuses a release date it cannot parse', () => {
    expect(() => build(buildDoc(), { releaseDate: '02/10/2026' })).toThrow(PlanApprovalError);
  });

  it('refuses a plan with nothing left in it', () => {
    const doc = buildDoc();
    const allRemoved = {
      ...doc,
      tasks: doc.tasks.map((task) => ({ ...task, removed: true, removed_by: 'user' as const })),
    };
    expect(() => build(allRemoved)).toThrow(PlanApprovalError);
  });

  describe('marking finished work done (ready_today)', () => {
    const rowFor = (rows: ReturnType<typeof buildTaskRowsFromDraft>['rows'], draftTaskId: string) =>
      rows.find(
        (row) => (row.metadata.planner as { draft_task_id: string }).draft_task_id === draftTaskId
      );

    it('marks the brief/draft/approval trio done when artwork is already ready, and nothing else', () => {
      const doc = buildDraftFromTemplate({
        template: SINGLE_RELEASE_TEMPLATE,
        intake: { ...intake, ready_today: ['artwork'] },
        ownerUserId: OWNER,
        generatedAt: '2026-07-30T09:00:00.000Z',
      });
      const { rows } = build(doc);

      const doneIds = ['w7_brief_designer', 'w6_cover_art_first_draft', 'w5_cover_art_final_approved'];
      for (const id of doneIds) {
        expect(rowFor(rows, id)?.status, id).toBe('done');
      }
      // The upload steps are a different kind of ready — having the art does
      // not mean it has been sent to the distributor yet.
      expect(rowFor(rows, 'w6_upload_cover_art')?.status).toBe('todo');
      expect(rowFor(rows, 'w8_lock_master')?.status).toBe('todo');
    });

    it('marks nothing done when nothing is ready', () => {
      const doc = buildDraftFromTemplate({
        template: SINGLE_RELEASE_TEMPLATE,
        intake: { ...intake, ready_today: ['none'] },
        ownerUserId: OWNER,
        generatedAt: '2026-07-30T09:00:00.000Z',
      });
      const { rows } = build(doc);
      expect(rows.every((row) => row.status === 'todo')).toBe(true);
    });

    it('never marks a manager-added task done, even if its id happened to match a completed one', () => {
      const doc = buildDoc();
      // Swap the real template row out for a manager-added one carrying the
      // SAME id — the guard in buildTaskRowsFromDraft checks task.origin,
      // not just whether the id is in the ready-completion map, so this
      // must stay 'todo' despite ready_today including 'master'.
      const withUserTaskInstead = {
        ...doc,
        tasks: doc.tasks.map((task) =>
          task.id === 'w8_lock_master'
            ? { ...task, template_task_id: null, origin: 'user' as const }
            : task
        ),
      };
      const { rows } = build(withUserTaskInstead);
      const row = rowFor(rows, 'w8_lock_master');
      expect(row?.status).toBe('todo');
    });
  });
});
