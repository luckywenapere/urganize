import { describe, expect, it } from 'vitest';
import { SINGLE_RELEASE_TEMPLATE } from '@/lib/release-templates/single';
import { alignPlanToReleaseDate, toPlanDateTask } from './release-plan-dates-server';

// The table half of keeping a plan lined up with release day. The decisions
// are tested in plan-dates.test.ts; this checks they become the RIGHT writes:
// scoped to the one rollout, never touching a finished activity, one write per
// shared due date, and a failed write reported rather than thrown.

type Op = {
  table: string;
  kind: 'select' | 'update';
  payload?: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
};

type Answer = { data: unknown; error: unknown };

function fakeAdmin(respond: (op: Op) => Answer) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const start = (kind: Op['kind'], payload?: Record<string, unknown>) => {
        const op: Op = { table, kind, payload, filters: [] };
        ops.push(op);
        const answer = () => Promise.resolve(respond(op));
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            op.filters.push(['eq', column, value]);
            return builder;
          },
          neq(column: string, value: unknown) {
            op.filters.push(['neq', column, value]);
            return builder;
          },
          in(column: string, value: unknown) {
            op.filters.push(['in', column, value]);
            return builder;
          },
          then(resolve: (value: Answer) => unknown, reject?: (reason: unknown) => unknown) {
            return answer().then(resolve, reject);
          },
        };
        return builder;
      };
      return {
        select: () => start('select'),
        update: (payload: Record<string, unknown>) => start('update', payload),
      };
    },
  };
  return { client: client as never, ops };
}

const RELEASE = 'rel-1';
const MS_PER_DAY = 86_400_000;

/** Task rows exactly as the tasks table stores a single plan for `releaseDate`. */
function storedPlan(releaseDate: string) {
  const epoch = Date.parse(`${releaseDate}T00:00:00Z`);
  return SINGLE_RELEASE_TEMPLATE.tasks.map((task, index) => ({
    id: `t${index}`,
    due_date: new Date(epoch + task.offset_days * MS_PER_DAY).toISOString().replace('.000Z', '+00:00'),
    status: 'todo',
    auto_generated: true,
    metadata: { template: { template_id: SINGLE_RELEASE_TEMPLATE.id, task_id: task.id } },
  }));
}

function respondWith(rows: Record<string, unknown>[], failUpdates = false) {
  return (op: Op): Answer => {
    if (op.kind === 'select') return { data: rows, error: null };
    if (failUpdates) return { data: null, error: { message: 'boom' } };
    const ids = (op.filters.find(([kind]) => kind === 'in')?.[2] as string[]) ?? [];
    return { data: ids.map((id) => ({ id })), error: null };
  };
}

describe('alignPlanToReleaseDate', () => {
  it('moves the whole plan when release day moves, scoped to the one rollout', async () => {
    const rows = storedPlan('2026-10-30');
    const { client, ops } = fakeAdmin(respondWith(rows));

    const result = await alignPlanToReleaseDate(client, {
      releaseId: RELEASE,
      previousDate: '2026-10-30',
      nextDate: '2026-11-20',
    });

    expect(result).toMatchObject({ moved: rows.length, failed: 0, deltaDays: 21, anchor: 'previous' });
    const updates = ops.filter((op) => op.kind === 'update');
    expect(updates.length).toBe(new Set(rows.map((row) => row.due_date)).size);
    for (const update of updates) {
      expect(update.table).toBe('tasks');
      expect(update.filters).toContainEqual(['eq', 'release_id', RELEASE]);
      // A task finished while the move ran must not be dragged along.
      expect(update.filters).toContainEqual(['neq', 'status', 'done']);
      expect(Object.keys(update.payload ?? {}).sort()).toEqual(['due_date', 'updated_at']);
    }
  });

  it('reads the old release day off the plan when the rollout had none', async () => {
    const rows = storedPlan('2026-10-30');
    const { client } = fakeAdmin(respondWith(rows));

    const result = await alignPlanToReleaseDate(client, {
      releaseId: RELEASE,
      previousDate: null,
      nextDate: '2026-11-06',
    });

    expect(result).toMatchObject({ anchor: 'inferred', fromDate: '2026-10-30', deltaDays: 7 });
    expect(result.moved).toBe(rows.length);
  });

  it('putting back the date the plan was built for moves nothing', async () => {
    const { client, ops } = fakeAdmin(respondWith(storedPlan('2026-10-30')));

    const result = await alignPlanToReleaseDate(client, {
      releaseId: RELEASE,
      previousDate: null,
      nextDate: '2026-10-30',
    });

    expect(result.moved).toBe(0);
    expect(ops.filter((op) => op.kind === 'update')).toEqual([]);
  });

  it('does nothing when there is no plan to read a release day from', async () => {
    const { client, ops } = fakeAdmin(respondWith([]));

    const result = await alignPlanToReleaseDate(client, {
      releaseId: RELEASE,
      previousDate: null,
      nextDate: '2026-11-06',
    });

    expect(result).toMatchObject({ moved: 0, anchor: null });
    expect(ops.filter((op) => op.kind === 'update')).toEqual([]);
  });

  it('reports failed writes instead of throwing — the date is already saved', async () => {
    const rows = storedPlan('2026-10-30');
    const { client } = fakeAdmin(respondWith(rows, true));

    const result = await alignPlanToReleaseDate(client, {
      releaseId: RELEASE,
      previousDate: '2026-10-30',
      nextDate: '2026-11-20',
    });

    expect(result.moved).toBe(0);
    expect(result.failed).toBe(rows.length);
  });

  it('reports an unreadable plan as nothing moved, never as a crash', async () => {
    const { client } = fakeAdmin(() => ({ data: null, error: { message: 'down' } }));

    const result = await alignPlanToReleaseDate(client, {
      releaseId: RELEASE,
      previousDate: '2026-10-30',
      nextDate: '2026-11-20',
    });

    expect(result).toMatchObject({ moved: 0, failed: 0, loadFailed: true });
  });
});

describe('toPlanDateTask', () => {
  it('reads the playbook step from either metadata key', () => {
    expect(toPlanDateTask({ id: 'a', metadata: { template: { task_id: 'w8_lock_master' } } }).templateTaskId).toBe(
      'w8_lock_master'
    );
    expect(
      toPlanDateTask({ id: 'a', metadata: { template: { template_task_id: 'w8_lock_master' } } }).templateTaskId
    ).toBe('w8_lock_master');
  });

  it('treats anything but a literal true as not generated', () => {
    expect(toPlanDateTask({ id: 'a', auto_generated: 'true' }).autoGenerated).toBe(false);
    expect(toPlanDateTask({ id: 'a', auto_generated: true }).autoGenerated).toBe(true);
  });
});
