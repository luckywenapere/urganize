import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { DEFAULT_LADDER } from '@/lib/ai/model-ladder';
import { StreamEventReader, URGANS_STREAM_HEADER, type UrgansStreamEvent } from '@/lib/chappi/stream-protocol';

// How /api/urgans streams a reply. Same seams as route-routing.test.ts: the
// runner is a mock (so the test controls what it streams and when it fails),
// everything the route does around it is real. What matters here is the
// contract with the client: opt-in on both sides, refusals still plain JSON, and
// the turn fully accounted for before the last event.

const runChappiAgent = vi.fn();
const closeConfirmedAction = vi.fn();
const executeToolCall = vi.fn();
const recordUrgansAction = vi.fn();

const allowance = vi.hoisted(() => ({
  value: { allowed: true, limit: null, current: 0, remaining: null } as Record<string, unknown>,
}));

vi.mock('@/app/api/_shared/auth', () => ({
  requireAuthenticatedAdmin: async () => ({
    user: { id: 'user-1', email: 'manager@example.com' },
    supabaseUrl: 'https://supabase.test',
    adminClient: {},
  }),
}));

vi.mock('@/lib/chappi/config', () => ({
  isChappiEnabled: () => true,
  isChappiModelConfigured: () => true,
}));

vi.mock('@/lib/chappi/dispatch', () => ({
  executeToolCall: (...args: unknown[]) => executeToolCall(...args),
  resolveChappiContext: async () => ({
    user: { id: 'user-1' },
    adminClient: {},
    workspaceIds: ['ws-1'],
    releaseOwnerIds: ['user-1'],
    artistScopeByOwnerId: {},
    artistScopeByWorkspaceId: {},
    origin: 'https://app.test',
    authToken: 'jwt',
  }),
}));

vi.mock('@/lib/chappi/runner', () => ({
  runChappiAgent: (...args: unknown[]) => runChappiAgent(...args),
  closeConfirmedAction: (...args: unknown[]) => closeConfirmedAction(...args),
}));

vi.mock('@/lib/chappi/system-prompt', () => ({
  buildChappiSystemPrompt: async () => ({ prompt: 'system prompt', briefSections: ['Roster'] }),
}));

vi.mock('@/lib/team-billing-server', () => ({
  getTeamAccessForUser: async () => ({
    primaryWorkspaceId: 'ws-1',
    ownerUserId: 'owner-1',
    tier: 'manager',
    state: 'paid',
  }),
}));

vi.mock('@/lib/urgans-usage-server', () => ({
  checkUrgansAllowance: async () => allowance.value,
  recordUrgansAction: (...args: unknown[]) => recordUrgansAction(...args),
}));

vi.mock('@/lib/seats-server', () => ({ recordLimitHit: vi.fn() }));

import { POST } from './route';

const post = (headers: Record<string, string> = {}, body: Record<string, unknown> = {}) =>
  new NextRequest('https://app.test/api/urgans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt', ...headers },
    body: JSON.stringify({ messages: [{ id: 'm1', role: 'user', content: 'hello' }], ...body }),
  });

const ASK = { [URGANS_STREAM_HEADER]: '1' };

// POST types as possibly undefined (its auth guard), as in the neighbouring route tests.
const run = async (request: NextRequest): Promise<Response> => (await POST(request))!;

async function readEvents(response: Response): Promise<UrgansStreamEvent[]> {
  const reader = new StreamEventReader();
  const events: UrgansStreamEvent[] = [];
  const body = response.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await body.read();
    if (done) break;
    events.push(...reader.feed(decoder.decode(value, { stream: true })));
  }
  events.push(...reader.flush());
  return events;
}

const finishedTurn = (over: Record<string, unknown> = {}) => ({
  reply: 'All done.',
  clientActions: [],
  pendingConfirmation: null,
  trace: undefined,
  usageCalls: [],
  ...over,
});

beforeEach(() => {
  runChappiAgent.mockReset();
  closeConfirmedAction.mockReset();
  executeToolCall.mockReset();
  recordUrgansAction.mockReset();
  allowance.value = { allowed: true, limit: null, current: 0, remaining: null };
  runChappiAgent.mockResolvedValue(finishedTurn());
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('who gets a stream', () => {
  it('nobody while the server switch is off, even when the client asks', async () => {
    const response = await run(post(ASK));

    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await response.json()).reply).toBe('All done.');
    // The runner was not handed anything to stream into.
    expect(runChappiAgent.mock.calls[0][0].onText).toBeUndefined();
  });

  it('nobody who does not ask, even with the server switch on', async () => {
    vi.stubEnv('URGANS_STREAM', 'on');

    const response = await run(post());

    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await response.json()).reply).toBe('All done.');
    expect(runChappiAgent.mock.calls[0][0].onText).toBeUndefined();
  });

  it('only the literal word on switches it on', async () => {
    vi.stubEnv('URGANS_STREAM', 'true');

    const response = await run(post(ASK));

    expect(response.headers.get('content-type')).toContain('application/json');
  });
});

describe('a streamed turn', () => {
  beforeEach(() => {
    vi.stubEnv('URGANS_STREAM', 'on');
  });

  it('sends the text as it is written, then the answer the route has always sent', async () => {
    runChappiAgent.mockImplementation(async (args: { onText: (d: string) => void }) => {
      args.onText('All ');
      args.onText('done.');
      return finishedTurn();
    });

    const response = await run(post(ASK));
    const events = await readEvents(response);

    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(response.headers.get('cache-control')).toContain('no-transform');
    expect(events).toEqual([
      { type: 'text', delta: 'All ' },
      { type: 'text', delta: 'done.' },
      {
        type: 'final',
        data: {
          mode: 'agent',
          reply: 'All done.',
          clientActions: [],
          pendingConfirmation: null,
          briefSections: ['Roster'],
        },
      },
    ]);
  });

  it('tells the screen to drop the preview when a new round starts after text was shown', async () => {
    runChappiAgent.mockImplementation(async (args: { onText: (d: string) => void; onAttempt: () => void }) => {
      args.onAttempt(); // first model call: nothing shown yet, so no reset
      args.onText('Let me check.');
      args.onAttempt(); // second call: the preview is stale
      args.onText('Found it.');
      return finishedTurn({ reply: 'Found it.' });
    });

    const events = await readEvents(await run(post(ASK)));

    expect(events.map((e) => e.type)).toEqual(['text', 'reset', 'text', 'final']);
  });

  it('does not send a reset when nothing was shown', async () => {
    runChappiAgent.mockImplementation(async (args: { onAttempt: () => void }) => {
      args.onAttempt();
      args.onAttempt();
      return finishedTurn();
    });

    const events = await readEvents(await run(post(ASK)));

    expect(events.map((e) => e.type)).toEqual(['final']);
  });

  it('has recorded the turn before it sends the last event', async () => {
    let recorded = false;
    recordUrgansAction.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      recorded = true;
    });
    const seenWhenFinal: boolean[] = [];

    const response = await run(post(ASK));
    const reader = new StreamEventReader();
    const body = response.body!.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await body.read();
      if (done) break;
      for (const event of reader.feed(decoder.decode(value, { stream: true }))) {
        if (event.type === 'final') seenWhenFinal.push(recorded);
      }
    }

    expect(seenWhenFinal).toEqual([true]);
  });

  it('answers a failure as the last event, in the same words as the plain route', async () => {
    runChappiAgent.mockImplementation(async (args: { onText: (d: string) => void }) => {
      args.onText('Starting');
      throw new Error('boom');
    });

    const events = await readEvents(await run(post(ASK)));
    const last = events[events.length - 1];

    expect(last.type).toBe('final');
    expect(last.type === 'final' && last.data.mode).toBe('error');
    // A failed turn is never counted or charged.
    expect(recordUrgansAction).not.toHaveBeenCalled();
  });

  it('still ends the stream when the client has gone away', async () => {
    runChappiAgent.mockResolvedValue(finishedTurn());

    const response = await run(post(ASK));
    await response.body!.cancel();

    // The turn finishes and is counted whether or not anyone is reading.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(recordUrgansAction).toHaveBeenCalledTimes(1);
  });
});

describe('refusals stay plain JSON', () => {
  beforeEach(() => {
    vi.stubEnv('URGANS_STREAM', 'on');
  });

  it('a team at its ceiling gets the 429 notice, not a stream', async () => {
    allowance.value = { allowed: false, key: 'urgans_monthly_actions', limit: 40, current: 40, remaining: 0, message: 'You have used your actions.' };

    const response = await run(post(ASK));

    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await response.json()).mode).toBe('deterministic');
    expect(runChappiAgent).not.toHaveBeenCalled();
  });

  it('an empty conversation is a 400', async () => {
    const response = await run(post(ASK, { messages: [] }));

    expect(response.status).toBe(400);
  });

  it('approving a card is never streamed', async () => {
    executeToolCall.mockResolvedValue({ ok: true, summary: 'Deleted.' });
    closeConfirmedAction.mockResolvedValue('Gone.');

    const response = await run(post(ASK, { confirmedAction: { toolName: 'delete_release', args: { releaseId: 'r1' } } }));

    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await response.json()).reply).toBe('Gone.');
  });
});

describe('the output cap of a routed turn', () => {
  beforeEach(() => {
    vi.stubEnv('AI_ROUTER', 'on');
  });

  it('is the streaming cap when the reply is streamed', async () => {
    vi.stubEnv('URGANS_STREAM', 'on');

    await readEvents(await run(post(ASK)));

    const { routing } = runChappiAgent.mock.calls[0][0];
    expect(routing.decision.streaming).toBe(true);
    expect(routing.decision.maxOutputTokens).toBe(DEFAULT_LADDER[routing.decision.tier as 'quick'].streamMaxOutputTokens);
  });

  it('stays the plain cap when the reply is not streamed, switch on or not', async () => {
    vi.stubEnv('URGANS_STREAM', 'on');
    await run(post());
    vi.unstubAllEnvs();
    vi.stubEnv('AI_ROUTER', 'on');
    await run(post(ASK));

    for (const call of runChappiAgent.mock.calls) {
      const { routing } = call[0];
      expect(routing.decision.streaming).toBeUndefined();
      expect(routing.decision.maxOutputTokens).toBe(DEFAULT_LADDER[routing.decision.tier as 'quick'].maxOutputTokens);
    }
    expect(runChappiAgent).toHaveBeenCalledTimes(2);
  });
});
