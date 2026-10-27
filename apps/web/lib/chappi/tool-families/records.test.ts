import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// add_to_record end to end: the REAL runner, registry and tool, with only the
// model gateway, dispatch and the server layer mocked. Proves the message in
// mock screen 4 becomes a card and nothing else, and that the approved Add
// writes only through lib/next-records-server.ts.

const executeToolCall = vi.fn();
vi.mock('../dispatch', () => ({
  executeToolCall: (...args: unknown[]) => executeToolCall(...args),
  resolveChappiContext: vi.fn(),
}));

vi.mock('../config', () => ({
  getChappiModelConfig: () => ({ apiKey: 'test-key', model: 'test-model', baseURL: 'https://gateway.test/v1' }),
  isChappiEnabled: () => true,
  isChappiModelConfigured: () => true,
}));

vi.mock('@/app/api/relationships/_shared', () => ({ isRelationshipsEnabled: () => true }));

const server = vi.hoisted(() => ({
  listRecordsInMaking: vi.fn(),
  readRecord: vi.fn(),
  findTeamArtist: vi.fn(),
  isReadOnlyOnTeam: vi.fn(),
  createRecord: vi.fn(),
  addSong: vi.fn(),
  updateSong: vi.fn(),
  saveSession: vi.fn(),
}));
vi.mock('@/lib/next-records-server', () => server);

const listRelationships = vi.hoisted(() => vi.fn());
vi.mock('@/lib/relationships-server', () => ({ listRelationships }));

import { runChappiAgent } from '../runner';
import { getChappiTool, type ChappiToolContext } from '../tools';
import type { NextRecord } from '@/lib/next-records';

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

const RECORD: NextRecord = {
  id: 'rec-1',
  artistId: 'art-1',
  title: 'Untitled EP',
  kind: 'ep',
  idea: '',
  status: 'making',
  releaseId: null,
  createdAt: '2026-10-20T10:00:00Z',
  songs: [
    { id: 's1', title: 'Wahala Free', stage: 'recording', position: 0 },
    { id: 's2', title: 'Pressure', stage: 'recording', position: 1 },
    { id: 's3', title: 'Ojuju', stage: 'idea', position: 2 },
  ],
  sessions: [],
};

// "session with tolu friday, doing wahala free and the new one. dami doing
// the final mix on pressure next week"
const ARGS = {
  sessions: [
    { when: 'friday', people: [{ name: 'tolu' }], songs: ['wahala free', ''] },
    { when: 'next week', people: [{ name: 'dami' }], songs: ['pressure'] },
  ],
  songs: [{ title: 'pressure', stage: 'mixing' }],
};

const inMaking = (id: string, title: string, artistName: string) => ({
  id,
  title,
  artistId: `art-${id}`,
  artistName,
  workspaceId: 'ws-1',
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body } as unknown as Response;
}

function modelCalls(name: string, args: Record<string, unknown>) {
  let called = false;
  return () => {
    if (called) return { choices: [{ message: { content: 'Have a look and tap Add.' } }] };
    called = true;
    return {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ id: 'call-1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
          },
        },
      ],
    };
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T10:00:00Z')); // Tuesday in Lagos
  for (const fn of Object.values(server)) fn.mockReset();
  listRelationships.mockReset();
  executeToolCall.mockReset();
  server.listRecordsInMaking.mockResolvedValue([inMaking('rec-1', 'Untitled EP', 'Kemi Ade')]);
  server.readRecord.mockResolvedValue({ ok: true, value: RECORD });
  server.isReadOnlyOnTeam.mockResolvedValue(false);
  listRelationships.mockResolvedValue({
    ok: true,
    relationships: [{ personId: 'p-tolu', label: 'Tolu Bello', role: 'Producer' }],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('add_to_record through the runner', () => {
  it('turns the message into a card and saves nothing', async () => {
    const next = modelCalls('add_to_record', ARGS);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/chat/completions')) return jsonResponse(next());
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const result = await runChappiAgent({
      ctx,
      system: 'system',
      messages: [{ id: 'm1', role: 'user', content: 'session with tolu friday, doing wahala free and the new one. dami doing the final mix on pressure next week' }],
    });

    expect(executeToolCall).not.toHaveBeenCalled();
    for (const write of [server.createRecord, server.addSong, server.updateSong, server.saveSession]) {
      expect(write).not.toHaveBeenCalled();
    }
    expect(result.pendingConfirmation?.toolName).toBe('add_to_record');
    expect(result.pendingConfirmation?.confirmLabel).toBe('Add');
    expect(result.pendingConfirmation?.title).toBe("Here's what I'll add to Untitled EP (Kemi Ade):");
    expect(result.pendingConfirmation?.detail?.split('\n')).toEqual([
      'Session: Fri 30 Oct · Tolu Bello',
      'Songs in it: Wahala Free, Untitled 4',
      'Session: Next week · Dami (new contact)',
      'Songs in it: Pressure',
      'Pressure: Recording to Mixing',
      'New song at Idea: Untitled 4',
    ]);
  });
});

describe('add_to_record, the approved Add', () => {
  const tool = getChappiTool('add_to_record')!;

  it('writes through the server layer: new song, stage, then sessions with people', async () => {
    const withNew: NextRecord = {
      ...RECORD,
      songs: [...RECORD.songs, { id: 's4', title: 'Untitled 4', stage: 'idea', position: 3 }],
    };
    server.addSong.mockResolvedValue({ ok: true, value: withNew });
    server.updateSong.mockResolvedValue({ ok: true, value: withNew });
    server.saveSession.mockResolvedValue({ ok: true, value: withNew });

    const result = await tool.execute(ctx, ARGS);
    expect(result.ok).toBe(true);

    expect(server.addSong).toHaveBeenCalledWith(ctx.adminClient, 'ws-1', 'rec-1', { title: 'Untitled 4', stage: 'idea' });
    expect(server.updateSong).toHaveBeenCalledWith(ctx.adminClient, 'ws-1', 'rec-1', 's2', { stage: 'mixing' });
    const writeCtx = { workspaceId: 'ws-1', userId: 'user-1', canUseContacts: true };
    expect(server.saveSession).toHaveBeenNthCalledWith(1, ctx.adminClient, writeCtx, 'rec-1', null, {
      date: '2026-10-30',
      dateHint: '',
      status: 'planned',
      note: '',
      people: [{ personId: 'p-tolu', name: 'Tolu Bello', role: 'Producer' }],
      songIds: ['s1', 's4'],
    });
    expect(server.saveSession).toHaveBeenNthCalledWith(2, ctx.adminClient, writeCtx, 'rec-1', null, {
      date: null,
      dateHint: 'next week',
      status: 'planned',
      note: '',
      people: [{ personId: null, name: 'Dami', role: '' }],
      songIds: ['s2'],
    });
    expect(server.createRecord).not.toHaveBeenCalled();
  });

  it('asks which record when there are several and none was named', async () => {
    server.listRecordsInMaking.mockResolvedValue([
      inMaking('rec-1', 'Untitled EP', 'Kemi Ade'),
      inMaking('rec-2', 'Lagos Nights', 'Bayo'),
    ]);
    const outcome = await tool.confirm!(ctx, ARGS);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.summary).toMatch(/Ask the user which one/);
    expect(outcome.ok === false && outcome.summary).toMatch(/recordId rec-2/);
  });

  it('refuses a view-only teammate', async () => {
    server.isReadOnlyOnTeam.mockResolvedValue(true);
    const outcome = await tool.confirm!(ctx, ARGS);
    expect(outcome).toEqual({ ok: false, summary: expect.stringMatching(/view-only/) });
    const result = await tool.execute(ctx, ARGS);
    expect(result.ok).toBe(false);
    expect(server.saveSession).not.toHaveBeenCalled();
  });

  it('keeps names plain for a teammate scoped to one artist', async () => {
    const scoped = { ...ctx, artistScopeByWorkspaceId: { 'ws-1': 'art-1' } };
    const outcome = await tool.confirm!(scoped, ARGS);
    expect(listRelationships).not.toHaveBeenCalled();
    expect(outcome.ok && outcome.detail).toMatch(/Session: Fri 30 Oct · tolu\n/);
  });

  it('starts an untitled record for an artist with none', async () => {
    server.listRecordsInMaking.mockResolvedValue([]);
    server.findTeamArtist.mockResolvedValue({ id: 'art-9', name: 'Kemi Ade' });
    const outcome = await tool.confirm!(ctx, { artistId: 'art-9', songs: [{ title: 'first one' }] });
    expect(outcome.ok && outcome.detail).toBe('New record: Untitled\nNew song at Idea: First One');
  });

  it('asks for the artist when no record is in the making', async () => {
    server.listRecordsInMaking.mockResolvedValue([]);
    const outcome = await tool.confirm!(ctx, ARGS);
    expect(outcome.ok === false && outcome.summary).toMatch(/Ask which artist/);
  });
});
