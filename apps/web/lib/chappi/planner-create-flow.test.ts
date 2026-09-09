import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pins generate_release_plan's create-then-generate flow — the fix for the
// interview dead end where the model, having no way to create a release, aimed
// the plan at an EXISTING release and was refused ("This release already has a
// rollout plan"), leaving the user with seven answered questions and nothing
// created. With no releaseId the tool now creates the release itself
// (mirroring PlannerIntakeModal's chip/note path) and generates against it.
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

// A draft body just big enough for summarizeDraft to count.
const DRAFT_RESPONSE = {
  draft: {
    id: 'draft-1',
    status: 'draft',
    doc: {
      tasks: [{ phase: 'setup' }, { phase: 'pre_release' }, { phase: 'release_week' }],
      ai: {},
    },
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

  it('creates the release, then generates the plan against the new id', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/api/releases')) {
        return jsonResponse({ releaseId: 'rel-new' });
      }
      if (String(url).endsWith('/api/releases/rel-new/plan/generate')) {
        return jsonResponse(DRAFT_RESPONSE);
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
    // Deliberately absent: omitting `plan` (with the flag guaranteed on) makes
    // the release plannerPending, so a failed generate still leaves a release
    // the workspace routes into the planner.
    expect('plan' in createBody).toBe(false);

    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/^Created the rollout and drafted 3 activities/);
    expect((result.data as { releaseId: string }).releaseId).toBe('rel-new');
    expect(result.clientAction).toEqual({
      type: 'navigate',
      href: '/dashboard?release=rel-new&scene=plan',
    });
  });

  it('hands the new releaseId back when the generate fails after the create', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/api/releases')) {
        return jsonResponse({ releaseId: 'rel-new' });
      }
      return jsonResponse({ error: 'Could not save the plan draft.' }, 500);
    });

    const result = await generateReleasePlan.execute(ctx, { ...VALID_ANSWERS });

    expect(result.ok).toBe(false);
    // The model must retry WITH the id, never by minting a second release.
    expect(result.summary).toContain('rel-new');
    expect(result.summary).toContain('do not create another rollout');
    expect((result.data as { releaseId: string }).releaseId).toBe('rel-new');
  });

  it('relays the create failure without calling generate', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Artist name is required.' }, 400));

    const result = await generateReleasePlan.execute(ctx, { ...VALID_ANSWERS });

    expect(result.ok).toBe(false);
    expect(result.summary).toBe('Artist name is required.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('generate_release_plan with a releaseId', () => {
  it('generates against the given release without creating one', async () => {
    fetchMock.mockResolvedValue(jsonResponse(DRAFT_RESPONSE));

    const result = await generateReleasePlan.execute(ctx, {
      ...VALID_ANSWERS,
      releaseId: 'rel-existing',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/releases/rel-existing/plan/generate'
    );
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/^Drafted 3 activities/);
  });

  it('maps the tasks_exist 409 to guidance about planning a new release instead', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: 'This rollout already has a plan.', code: 'tasks_exist' },
        409
      )
    );

    const result = await generateReleasePlan.execute(ctx, {
      ...VALID_ANSWERS,
      releaseId: 'rel-existing',
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('already has its activities');
    expect(result.summary).toContain('without a releaseId');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
