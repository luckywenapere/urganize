import { beforeEach, describe, expect, it, vi } from 'vitest';

// The whole createReleasePlan pipeline against a fake database and a fake
// model: the backbone is built and saved whatever the model does, and the
// model's fitted delta lands item by item (2026-10-11, the hybrid first plan).

const aiState = vi.hoisted(() => ({
  configured: true,
  result: null as unknown,
  error: null as Error | null,
  lastMessages: null as Array<{ role: string; content: string }> | null,
}));

vi.mock('./ai/provider', () => ({
  isAiConfigured: () => aiState.configured,
}));

vi.mock('./ai/routed', () => ({
  generateRoutedStructuredOutput: vi.fn(async (params: { messages: Array<{ role: string; content: string }> }) => {
    aiState.lastMessages = params.messages;
    if (aiState.error) throw aiState.error;
    return aiState.result;
  }),
}));

vi.mock('./task-owners-server', () => ({
  loadPastAssignments: vi.fn(async () => []),
}));

const built = vi.hoisted(() => ({ doc: null as unknown }));

vi.mock('./release-planning-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./release-planning-server')>();
  return {
    ...actual,
    instantiateDraftPlan: vi.fn(async (params: { doc: unknown }) => {
      built.doc = params.doc;
      return { tasksCreated: 1, taskIds: ['t1'], warnings: [] };
    }),
  };
});

import { createReleasePlan } from './release-planning-actions-server';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import type { PlannerAiDelta, ReleasePlanDraftDoc, ReleasePlanIntake } from './release-planning';

const OWNER = '11111111-1111-1111-1111-111111111111';

type Result = { data?: unknown; error?: unknown; count?: number };

/** A chainable stand-in for the Supabase client: every builder method returns
 *  the builder, and awaiting it (or maybeSingle/single) answers per table. */
function fakeAdmin(profile: Record<string, unknown> | null) {
  const writes: Array<{ table: string; op: string; payload?: unknown }> = [];
  const from = (table: string) => {
    let op = 'select';
    let payload: unknown;
    const answer = (): Result => {
      if (table === 'tasks') return { count: 0, error: null };
      if (table === 'profiles') return { data: profile, error: null };
      if (table === 'release_plan_drafts' && op === 'select') return { data: null, error: null };
      if (table === 'release_plan_drafts' && op === 'insert') return { data: { id: 'plan-1' }, error: null };
      return { data: [], error: null };
    };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
      builder[method] = () => builder;
    }
    builder.update = (value: unknown) => {
      op = 'update';
      payload = value;
      writes.push({ table, op, payload });
      return builder;
    };
    builder.insert = (value: unknown) => {
      op = 'insert';
      payload = value;
      writes.push({ table, op, payload });
      return builder;
    };
    builder.maybeSingle = async () => answer();
    builder.single = async () => answer();
    builder.then = (resolve: (value: Result) => unknown) => resolve(answer());
    return builder;
  };
  return { client: { from } as never, writes };
}

const intake: ReleasePlanIntake = {
  version: 2,
  release_type: 'single',
  artist_name: 'Tola',
  date_mode: 'fixed',
  release_date: '2026-12-04',
  ready_today: ['master'],
  goal: 'new_listeners',
  budget: 'none',
};

const run = (admin: ReturnType<typeof fakeAdmin>, overrides: Partial<Parameters<typeof createReleasePlan>[1]> = {}) =>
  createReleasePlan(admin.client, {
    release: {
      id: 'release-1',
      owner_user_id: OWNER,
      title: 'Love Me JeJe',
      artist_name: 'Tola',
      release_date: '2026-12-04',
      release_type: 'single',
      release_context: null,
      metadata: {},
    } as never,
    actor: { id: OWNER, email: 'oyin@example.com' },
    intake,
    todayYmd: '2026-10-11',
    template: SINGLE_RELEASE_TEMPLATE,
    fallbackToSingle: false,
    loadTeam: async () => ({ ok: true, workspaceId: 'ws-1', members: [] }),
    ...overrides,
  });

const delta = (overrides: Partial<PlannerAiDelta> = {}): PlannerAiDelta => ({
  exclude_scopes: [],
  drops: [],
  adjust_offsets: [],
  role_assignments: [],
  rewrite_why: [],
  focus: [],
  add_tasks: [],
  warnings: [],
  rationale: 'Fitted to new listeners on no budget.',
  ...overrides,
});

beforeEach(() => {
  aiState.configured = true;
  aiState.result = null;
  aiState.error = null;
  aiState.lastMessages = null;
  built.doc = null;
});

describe('createReleasePlan: the deterministic backbone always lands', () => {
  it('builds and saves the backbone when the model errors, recording the failure', async () => {
    aiState.error = Object.assign(new Error('Gateway 502'), { status: 502 });
    const admin = fakeAdmin(null);
    const result = await run(admin);
    expect(result.ok).toBe(true);
    const doc = built.doc as ReleasePlanDraftDoc;
    expect(doc.ai.applied).toBe(false);
    expect(doc.ai.failure).not.toBeNull();
    // Backbone guarantees: no budget took paid work out, nothing was added.
    expect(doc.applied_exclusions.map((entry) => entry.scope)).toContain('paid_ads');
    expect(doc.tasks.some((task) => task.origin === 'ai')).toBe(false);
    expect(doc.tasks.filter((task) => !task.removed).length).toBeGreaterThan(30);
    expect(admin.writes.some((w) => w.table === 'release_plan_drafts' && w.op === 'insert')).toBe(true);
  });

  it('a FIRST plan with typed notes is still built when the model errors', async () => {
    aiState.error = new Error('timed out');
    const result = await run(fakeAdmin(null), {
      intake: { ...intake, extra_notes: 'No press please.' },
      firstPlan: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.warnings.join(' ')).toMatch(/could not read your notes/);
  });

  it('a later plan with typed notes is refused when the model errors, as before', async () => {
    aiState.error = new Error('timed out');
    const result = await run(fakeAdmin(null), { intake: { ...intake, extra_notes: 'No press please.' } });
    expect(result.ok).toBe(false);
    expect(built.doc).toBeNull();
  });

  it('builds the backbone with no model configured', async () => {
    aiState.configured = false;
    const result = await run(fakeAdmin(null));
    expect(result.ok).toBe(true);
    expect((built.doc as ReleasePlanDraftDoc).ai.failure).toBe('not_configured');
  });
});

describe('createReleasePlan: the AI layer fits the plan', () => {
  it('feeds the model the onboarding answers from the profile', async () => {
    aiState.result = delta();
    await run(
      fakeAdmin({
        onboarding_where_stuck: ['keeping_team_aligned'],
        onboarding_planning_preference: 'ai_recommendations',
      })
    );
    const user = aiState.lastMessages?.find((m) => m.role === 'user')?.content ?? '';
    expect(user).toContain('Where their rollouts usually fall apart: Keeping the team aligned');
    expect(user).toContain('How they like to plan: Give me AI recommendations');
  });

  it('applies valid items, drops invalid ones individually, and never adds paid work on no budget', async () => {
    const template = SINGLE_RELEASE_TEMPLATE.tasks;
    const required = template.find((task) => !task.optional && !(task.tags ?? []).includes('release_day'))!;
    const keepTask = template.find((task) => (task.tags ?? []).includes('release_day'))!;
    aiState.result = delta({
      drops: [
        { id: keepTask.id, reason: 'Trying to drop release day.' },
        { id: 'invented', reason: 'Not real.' },
      ],
      focus: [{ id: required.id, reason: 'Matters most.' }],
      add_tasks: [
        { title: 'Host a fan listening call', why: 'Fans bring new listeners.', offset_days: -10, role: 'artist', tags: ['event'] },
        { title: 'Run Instagram ads', why: 'Paid reach.', offset_days: -10, role: 'marketing_lead', tags: ['paid'] },
      ],
    });
    const result = await run(fakeAdmin(null));
    expect(result.ok).toBe(true);
    const doc = built.doc as ReleasePlanDraftDoc;
    expect(doc.ai.applied).toBe(true);
    expect(doc.ai.rejected_items).toBe(3);
    expect(doc.tasks.find((task) => task.id === keepTask.id)?.removed).toBe(false);
    expect(doc.tasks.find((task) => task.id === required.id)?.focus).toBe(true);
    const added = doc.tasks.filter((task) => task.origin === 'ai');
    expect(added.map((task) => task.title)).toEqual(['Host a fan listening call']);
  });
});
