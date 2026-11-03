import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pins generate_release_plan's create-then-build flow — the fix for the
// interview dead end where the model, having no way to create a release, aimed
// the plan at an EXISTING release and was refused ("This rollout already has a
// plan"), leaving the user with seven answered questions and nothing created.
// With no releaseId the tool now creates the release itself (mirroring
// PlannerIntakeModal's chip/note path) and builds the plan against it.
//
// Since 2026-09-15 the tool calls POST /plan directly — there is no separate
// generate/approve step, so a successful call means the activities already
// exist. NEXT_PUBLIC_FEATURE_URGANS_ACTIONS is deliberately left unstubbed
// (default off): recordChatActionRun short-circuits on that flag, so the
// chat-door log call inside execute() is a safe no-op here rather than
// something this file needs to mock.
//
// The tool is exercised directly — not through the runner — because everything
// under test lives in its execute(): the ordering (validate before create,
// flag-guard before create), the create body, and the failure relays.

import { CHAPPI_TOOLS, type ChappiToolContext } from './tools';

const generateReleasePlan = CHAPPI_TOOLS.find((tool) => tool.name === 'generate_release_plan');
if (!generateReleasePlan) throw new Error('generate_release_plan is not registered');

const ctx = {
  user: { id: 'user-1', email: 'manager@example.com' },
  adminClient: {} as never,
  workspaceIds: ['ws-1'],
  releaseOwnerIds: ['user-1'],
  artistScopeByOwnerId: {},
  artistScopeByWorkspaceId: {},
  releaseScopeByOwnerId: {},
  releaseScopeByWorkspaceId: {},
  origin: 'https://app.test',
  authToken: 'jwt',
} satisfies ChappiToolContext;

// The same complete-answers shape plan-intake-args.test.ts calls valid.
const VALID_ANSWERS = {
  release_type: 'single',
  artist_name: 'Tems',
  release_date: '2026-11-20',
  date_mode: 'fixed',
  ready_today: ['master', 'artwork'],
  goal: 'playlist_adds',
  budget: 'under_100k',
};

// A plan body just big enough for the summary/data mapping to read from.
const PLAN_RESPONSE = {
  plan: {
    tasksCreated: 3,
    taskIds: ['t1', 't2', 't3'],
    warnings: [],
    removed: [],
    appliedExclusions: [],
    rationale: 'Kept close to the playbook.',
    aiApplied: true,
    aiFailure: null,
    releaseDate: '2026-11-20',
  },
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // The flag is read at call time (not module scope), so stubEnv per test is
  // enough — no vi.resetModules() dance like intent-router.test.ts needs.
  vi.stubEnv('NEXT_PUBLIC_FEATURE_RELEASE_PLANNER', 'true');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('generate_release_plan without a releaseId', () => {
  it('refuses before creating anything when the planner flag is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELEASE_PLANNER', 'false');

    const result = await generateReleasePlan.execute(ctx, { ...VALID_ANSWERS });

    expect(result.ok).toBe(false);
    expect(result.summary).toBe("The rollout planner isn't enabled yet.");
    // The whole point of the guard's placement: nothing was created.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates the intake before creating anything', async () => {
    const result = await generateReleasePlan.execute(ctx, {
      ...VALID_ANSWERS,
      budget: 'a suitcase of cash',
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/^That answer doesn't work:/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates the release, then builds the plan against the new id', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/api/releases')) {
        return jsonResponse({ releaseId: 'rel-new' });
      }
      if (String(url).endsWith('/api/releases/rel-new/plan')) {
        return jsonResponse(PLAN_RESPONSE, 201);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await generateReleasePlan.execute(ctx, {
      ...VALID_ANSWERS,
      title: 'Midnight EP',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const createBody = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    expect(createBody.title).toBe('Midnight EP');
    expect(createBody.releaseType).toBe('single');
    expect(createBody.releaseDate).toBe('2026-11-20');
    expect(createBody.source).toBe('chappi');

    const planBody = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as Record<
      string,
      unknown
    >;
    expect(planBody).toHaveProperty('intake');

    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/^Created the rollout and built 3 activities/);
    expect((result.data as { releaseId: string }).releaseId).toBe('rel-new');
    // No scene: the plan lands straight in the activity list, there is nothing
    // left to review.
    expect(result.clientAction).toEqual({
      type: 'navigate',
      href: '/dashboard?release=rel-new',
    });
  });

  it('hands the new releaseId back when the build fails after the create', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/api/releases')) {
        return jsonResponse({ releaseId: 'rel-new' });
      }
      return jsonResponse({ error: 'Could not build the plan.' }, 500);
    });

    const result = await generateReleasePlan.execute(ctx, { ...VALID_ANSWERS });

    expect(result.ok).toBe(false);
    // The model must retry WITH the id, never by minting a second release.
    expect(result.summary).toContain('rel-new');
    expect(result.summary).toContain('do not create another rollout');
    expect((result.data as { releaseId: string }).releaseId).toBe('rel-new');
  });

  it('relays the create failure without calling the plan route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Artist name is required.' }, 400));

    const result = await generateReleasePlan.execute(ctx, { ...VALID_ANSWERS });

    expect(result.ok).toBe(false);
    expect(result.summary).toBe('Artist name is required.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('generate_release_plan with a releaseId', () => {
  it('builds against the given release without creating one', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PLAN_RESPONSE, 201));

    const result = await generateReleasePlan.execute(ctx, {
      ...VALID_ANSWERS,
      releaseId: 'rel-existing',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/releases/rel-existing/plan');
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/^Built 3 activities/);
  });

  it('maps the tasks_exist 409 to guidance about planning a new release instead', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'This rollout already has its plan.', code: 'tasks_exist' }, 409)
    );

    const result = await generateReleasePlan.execute(ctx, {
      ...VALID_ANSWERS,
      releaseId: 'rel-existing',
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('already has its plan');
    expect(result.summary).toContain('without a releaseId');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps missing_release_date to asking for a date rather than a raw error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Set a release date first.', code: 'missing_release_date' }, 400)
    );

    const result = await generateReleasePlan.execute(ctx, {
      ...VALID_ANSWERS,
      releaseId: 'rel-existing',
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/no release date/i);
    expect(result.summary).toMatch(/release_date/);
  });

  it('maps tailoring_unavailable to offering a retry, never a raw error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: 'AI could not read your notes just now.', code: 'tailoring_unavailable' },
        503
      )
    );

    const result = await generateReleasePlan.execute(ctx, {
      ...VALID_ANSWERS,
      releaseId: 'rel-existing',
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/try again/i);
  });
});
