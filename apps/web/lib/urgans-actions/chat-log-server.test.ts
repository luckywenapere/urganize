import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The chat door's half of the action log. What is under test is the POLICY,
// not the database: which rows get written, what they say, and — the one that
// matters most — the two things this module deliberately does NOT do.
//
// resolveActionScope is mocked (it needs a live Supabase client), matching
// scope.test.ts's own reasoning: the question here is what chat-log-server
// does with the scope it is handed, not how the scope is resolved.

const resolveActionScope = vi.fn();

vi.mock('./server', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    resolveActionScope: (...args: unknown[]) => resolveActionScope(...args),
  };
});

import {
  markChatActionApplied,
  markChatActionDiscarded,
  recordChatActionRun,
} from './chat-log-server';

const ACTOR = { id: 'teammate-1', email: 'teammate@example.com' };
const RELEASE_ID = '11111111-1111-4111-8111-111111111111';
const KIT_ID = '22222222-2222-4222-8222-222222222222';

const scopeOk = (over: Partial<Record<string, unknown>> = {}) => ({
  ok: true,
  scope: {
    objectType: 'release',
    release: null,
    ownerUserId: 'owner-1',
    workspaceId: 'ws-1',
    tier: 'manager',
    ...over,
  },
});

/** Records every insert/update the module attempts, so a test can assert both
 *  what was written AND that nothing was written at all. */
type Attempt = { table: string; op: 'insert' | 'update'; payload: Record<string, unknown>; match: Record<string, unknown> };

function fakeAdmin(options: { insertError?: boolean; updateError?: boolean; throws?: boolean } = {}) {
  const attempts: Attempt[] = [];
  const client = {
    from(table: string) {
      if (options.throws) throw new Error('client exploded');
      return {
        insert(payload: Record<string, unknown>) {
          attempts.push({ table, op: 'insert', payload, match: {} });
          return {
            select: () => ({
              single: async () =>
                options.insertError
                  ? { data: null, error: { message: 'nope' } }
                  : { data: { id: 'action-1' }, error: null },
            }),
          };
        },
        update(payload: Record<string, unknown>) {
          // One attempt per update, not per .eq() — the module chains two of
          // them (id AND status) and `match` accumulates into the same object,
          // so pushing on every call would report one update as two.
          const match: Record<string, unknown> = {};
          attempts.push({ table, op: 'update', payload, match });
          const chain = {
            eq(column: string, value: unknown) {
              match[column] = value;
              return chain;
            },
            select: () => ({
              maybeSingle: async () =>
                options.updateError
                  ? { data: null, error: { message: 'nope' } }
                  : { data: { id: 'action-1' }, error: null },
            }),
          };
          return chain;
        },
      };
    },
  };
  return { client: client as never, attempts };
}

beforeEach(() => {
  resolveActionScope.mockReset();
  vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_ACTIONS', 'true');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_RELEASE_PLANNER', 'true');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('recordChatActionRun', () => {
  it('writes one row saying the chat door, in the drafted state', async () => {
    resolveActionScope.mockResolvedValue(scopeOk());
    const { client, attempts } = fakeAdmin();

    const actionId = await recordChatActionRun(client, {
      actionType: 'release.draft_plan',
      objectId: RELEASE_ID,
      actor: ACTOR,
    });

    expect(actionId).toBe('action-1');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].table).toBe('urgans_actions');
    expect(attempts[0].payload).toMatchObject({
      source: 'chat',
      status: 'drafted',
      action_type: 'release.draft_plan',
      object_type: 'release',
      object_id: RELEASE_ID,
    });
  });

  it('stamps the OWNER and their team, not the person who typed', async () => {
    // The same rule the button path follows, and the reason the chat helper
    // reuses resolveActionScope rather than reading anything itself: a
    // teammate drafting on someone else's release counts against that
    // release's team.
    resolveActionScope.mockResolvedValue(scopeOk());
    const { client, attempts } = fakeAdmin();

    await recordChatActionRun(client, {
      actionType: 'release.draft_plan',
      objectId: RELEASE_ID,
      actor: ACTOR,
    });

    expect(attempts[0].payload).toMatchObject({
      owner_user_id: 'owner-1',
      workspace_id: 'ws-1',
      plan_at_time: 'manager',
      actor_user_id: 'teammate-1',
    });
  });

  it('records the object type the scope resolved, so a kit is not filed as a release', async () => {
    resolveActionScope.mockResolvedValue(scopeOk({ objectType: 'press_kit' }));
    const { client, attempts } = fakeAdmin();

    await recordChatActionRun(client, {
      // 'presskit', not 'press_kit' — the registered action id has no
      // underscore there even though the OBJECT TYPE does. An existing wart,
      // and the reason this test names the real id rather than the readable
      // one somebody would guess.
      actionType: 'presskit.draft_section',
      objectId: KIT_ID,
      actor: ACTOR,
      status: 'applied',
    });

    expect(attempts[0].payload).toMatchObject({
      object_type: 'press_kit',
      status: 'applied',
    });
  });

  it('DOES NOT check the embedded-actions entitlement, so a Solo team is still logged', async () => {
    // This is the gate decision, pinned. The buttons are the paid surface;
    // asking UrgAns the same thing in chat stays available on every plan and
    // is metered by the ordinary chat allowance instead. If a later change
    // adds getEntitlement(..., 'urgans_embedded_actions') to this module,
    // this test is what should stop it.
    resolveActionScope.mockResolvedValue(scopeOk({ tier: 'solo' }));
    const { client, attempts } = fakeAdmin();

    const actionId = await recordChatActionRun(client, {
      actionType: 'release.draft_plan',
      objectId: RELEASE_ID,
      actor: ACTOR,
    });

    expect(actionId).toBe('action-1');
    expect(attempts[0].payload).toMatchObject({ plan_at_time: 'solo', source: 'chat' });
  });

  it('writes nothing at all when the embedded track is switched off', async () => {
    // The table does not exist until that migration is applied, and the flag
    // is what says it has been. Without this the chat would log an error
    // against a missing relation on every plan it drafted.
    vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_ACTIONS', 'false');
    const { client, attempts } = fakeAdmin();

    const actionId = await recordChatActionRun(client, {
      actionType: 'release.draft_plan',
      objectId: RELEASE_ID,
      actor: ACTOR,
    });

    expect(actionId).toBeNull();
    expect(attempts).toEqual([]);
    expect(resolveActionScope).not.toHaveBeenCalled();
  });

  it('writes nothing when the planner half of the flag pair is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELEASE_PLANNER', 'false');
    const { client, attempts } = fakeAdmin();
    // Given a scope it WOULD have logged, so a null here can only be the
    // flag. Without this the test passes even with the gate deleted, because
    // an unstubbed mock returns undefined and the throw is swallowed — green
    // for the wrong reason, which is how a gate stops being covered.
    resolveActionScope.mockResolvedValue(scopeOk());

    expect(
      await recordChatActionRun(client, {
        actionType: 'release.draft_plan',
        objectId: RELEASE_ID,
        actor: ACTOR,
      })
    ).toBeNull();
    expect(attempts).toEqual([]);
    expect(resolveActionScope).not.toHaveBeenCalled();
  });

  it('writes nothing when the caller cannot reach the object', async () => {
    resolveActionScope.mockResolvedValue({ ok: false, status: 404, error: 'Release not found.' });
    const { client, attempts } = fakeAdmin();

    expect(
      await recordChatActionRun(client, {
        actionType: 'release.draft_plan',
        objectId: RELEASE_ID,
        actor: ACTOR,
      })
    ).toBeNull();
    expect(attempts).toEqual([]);
  });

  it('returns null rather than throwing when the insert fails', async () => {
    resolveActionScope.mockResolvedValue(scopeOk());
    const { client } = fakeAdmin({ insertError: true });

    await expect(
      recordChatActionRun(client, {
        actionType: 'release.draft_plan',
        objectId: RELEASE_ID,
        actor: ACTOR,
      })
    ).resolves.toBeNull();
  });

  it('returns null rather than throwing when the client itself throws', async () => {
    // A lost log row costs a console entry. A thrown error costs the user the
    // answer they asked for, and the log is not worth that.
    resolveActionScope.mockResolvedValue(scopeOk());
    const { client } = fakeAdmin({ throws: true });

    await expect(
      recordChatActionRun(client, {
        actionType: 'release.draft_plan',
        objectId: RELEASE_ID,
        actor: ACTOR,
      })
    ).resolves.toBeNull();
  });

  it('refuses an unknown action type', async () => {
    const { client, attempts } = fakeAdmin();

    expect(
      await recordChatActionRun(client, {
        actionType: 'release.invent_something',
        objectId: RELEASE_ID,
        actor: ACTOR,
      })
    ).toBeNull();
    expect(attempts).toEqual([]);
    expect(resolveActionScope).not.toHaveBeenCalled();
  });
});

describe('settling a chat-logged run', () => {
  it('marks it applied, and only while it is still drafted', async () => {
    const { client, attempts } = fakeAdmin();

    expect(await markChatActionApplied(client, 'action-1', { taskCount: 62 })).toBe(true);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].op).toBe('update');
    expect(attempts[0].payload).toMatchObject({
      status: 'applied',
      applied_result: { taskCount: 62 },
    });
    // The conditional is what stops a second approve rewriting a settled row.
    expect(attempts[0].match).toMatchObject({ id: 'action-1', status: 'drafted' });
  });

  it('stamps applied_at so the console can show when', async () => {
    const { client, attempts } = fakeAdmin();
    await markChatActionApplied(client, 'action-1');
    expect(typeof attempts[0].payload.applied_at).toBe('string');
  });

  it('marks it discarded, also only while drafted', async () => {
    const { client, attempts } = fakeAdmin();

    expect(await markChatActionDiscarded(client, 'action-1')).toBe(true);
    expect(attempts[0].payload).toMatchObject({ status: 'discarded' });
    expect(attempts[0].match).toMatchObject({ id: 'action-1', status: 'drafted' });
  });

  it('does nothing when the track is switched off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_ACTIONS', 'false');
    const { client, attempts } = fakeAdmin();

    expect(await markChatActionApplied(client, 'action-1')).toBe(false);
    expect(await markChatActionDiscarded(client, 'action-1')).toBe(false);
    expect(attempts).toEqual([]);
  });

  it('does nothing without an action id, rather than updating every row', async () => {
    const { client, attempts } = fakeAdmin();

    expect(await markChatActionApplied(client, '')).toBe(false);
    expect(await markChatActionDiscarded(client, null)).toBe(false);
    expect(attempts).toEqual([]);
  });

  it('returns false rather than throwing when the update fails', async () => {
    const { client } = fakeAdmin({ updateError: true });
    await expect(markChatActionApplied(client, 'action-1')).resolves.toBe(false);
  });

  it('returns false rather than throwing when the client throws', async () => {
    const { client } = fakeAdmin({ throws: true });
    await expect(markChatActionDiscarded(client, 'action-1')).resolves.toBe(false);
  });
});
