import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The chat history sync engine (stores/useChappiHistoryStore.ts), driven for
// real against an in-memory server that answers with the SAME rules the route
// does (applySync / parseSyncBody from conversation-history.ts). Only the IO
// edges are fake: the session, fetch, timers and localStorage.
//
// The cases worth most are the ones that decide whether somebody loses words:
// another tab being ahead, a chat deleted on another device, an answer that
// arrives after its chat left the screen, and sign-out.

vi.hoisted(() => {
  // Both stores read the flags at module scope, so they must be on before the
  // static imports below evaluate.
  vi.stubEnv('NEXT_PUBLIC_FEATURE_CHAPPI', 'true');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_HISTORY', 'true');
});

const getSessionMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getSession: () => getSessionMock() } },
}));

import type { ChappiMessage } from '@/lib/chappi/types';
import { useChappiStore } from '@/stores/useChappiStore';
import {
  appendToChat,
  resetChappiHistory,
  selectChatSaveNotice,
  startChappiHistory,
  useChappiHistoryStore,
} from '@/stores/useChappiHistoryStore';
import { CHAT_CACHE_KEY, writeChatCache } from './conversation-cache';
import {
  applySync,
  parseSyncBody,
  type StoredChatMessage,
} from './conversation-history';

const USER = 'user-1';
const NOW = new Date('2026-09-24T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const SAVE_DELAY = 700; // past the 600ms debounce
const PHONE_CHAT = '22222222-2222-4222-8222-222222222222';
const CACHED_CHAT = '33333333-3333-4333-8333-333333333333';

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
type Call = { method: string; url: string; body: unknown; headers: Record<string, string> };
type Row = {
  ownerUserId: string;
  title: string;
  revision: number;
  messages: StoredChatMessage[];
  lastMessageAt: string;
  createdAt: string;
};
type Override = (call: Call) => FakeResponse | 'throw' | 'land-then-throw' | null;

function respond(status: number, body: unknown): FakeResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function summaryOf(id: string, row: Row) {
  return {
    id,
    title: row.title,
    messageCount: row.messages.length,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
  };
}

/** The server, reduced to its rules. */
function createFakeServer() {
  const rows = new Map<string, Row>();
  const calls: Call[] = [];
  let override: Override | null = null;

  function handle(call: Call): FakeResponse {
    const path = call.url.split('?')[0];
    const id = path.replace('/api/urgans/conversations', '').replace(/^\//, '');
    if (!id) {
      const chats = [...rows.entries()]
        .map(([rowId, row]) => summaryOf(rowId, row))
        .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
      return respond(200, { chats, nextCursor: null });
    }
    const row = rows.get(id) ?? null;
    if (call.method === 'GET') {
      if (!row) return respond(404, { error: 'Chat not found.' });
      return respond(200, {
        chat: { ...summaryOf(id, row), revision: row.revision, messages: row.messages },
      });
    }
    if (call.method === 'DELETE') {
      rows.delete(id);
      return respond(200, { success: true });
    }
    const parsed = parseSyncBody(call.body);
    if (!parsed.ok) return respond(parsed.status, { error: parsed.error });
    const decision = applySync(row, parsed.body, USER);
    const nowIso = new Date().toISOString();
    switch (decision.kind) {
      case 'not_found':
        return respond(404, { error: 'Chat not found.' });
      case 'too_large':
        return respond(413, { error: 'This chat is too long to save. Start a new chat.' });
      case 'invalid':
        return respond(400, { error: decision.error });
      case 'conflict':
        return respond(409, {
          error: 'This chat changed somewhere else.',
          revision: decision.revision,
          messageIds: decision.messageIds,
        });
      case 'insert':
      case 'update': {
        const revision = decision.kind === 'insert' ? 1 : decision.nextRevision;
        rows.set(id, {
          ownerUserId: USER,
          title: decision.title,
          revision,
          messages: decision.messages,
          lastMessageAt: nowIso,
          createdAt: row?.createdAt ?? nowIso,
        });
        return respond(200, {
          revision,
          messageIds: decision.messages.map((message) => message.id),
          title: decision.title,
          lastMessageAt: nowIso,
        });
      }
    }
  }

  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<FakeResponse> => {
    const call: Call = {
      method: (init?.method ?? 'GET').toUpperCase(),
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: { ...((init?.headers as Record<string, string>) ?? {}) },
    };
    calls.push(call);
    const forced = override?.(call) ?? null;
    if (forced === 'throw') throw new TypeError('Failed to fetch');
    if (forced === 'land-then-throw') {
      handle(call);
      throw new TypeError('Failed to fetch');
    }
    return forced ?? handle(call);
  });

  return {
    rows,
    calls,
    fetch: fetchMock,
    puts: () => calls.filter((call) => call.method === 'PUT'),
    setOverride: (next: Override | null) => {
      override = next;
    },
  };
}

function installLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  };
  return store;
}

function message(id: string, role: 'user' | 'assistant', content = `${role} ${id}`): ChappiMessage {
  return { id, role, content };
}

function say(...messages: ChappiMessage[]) {
  for (const item of messages) useChappiStore.getState().appendMessage(item);
}

/** Runs due timers and lets every promise chain behind them finish. */
async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
  for (let round = 0; round < 6; round += 1) {
    for (let tick = 0; tick < 25; tick += 1) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
}

function currentId(): string {
  const id = useChappiStore.getState().conversationId;
  if (!id) throw new Error('no chat on screen');
  return id;
}

function idsOf(messages: ReadonlyArray<{ id: string }> | undefined) {
  return (messages ?? []).map((item) => item.id);
}

let server: ReturnType<typeof createFakeServer>;
let storage: Map<string, string>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  storage = installLocalStorage();
  server = createFakeServer();
  globalThis.fetch = server.fetch as unknown as typeof fetch;
  getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token' } } });
  resetChappiHistory();
  useChappiStore.getState().resetForSignOut();
});

afterEach(() => {
  resetChappiHistory();
  useChappiStore.getState().resetForSignOut();
  vi.useRealTimers();
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
  vi.unstubAllEnvs();
});

describe('saving a chat', () => {
  it('saves once after the debounce and remembers what the server holds', async () => {
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user', 'Plan the EP'), message('a1', 'assistant', 'On it.'));
    await settle(SAVE_DELAY);

    const id = currentId();
    expect(server.puts()).toHaveLength(1);
    expect(server.puts()[0].body).toMatchObject({ baseRevision: 0, keepCount: 0 });
    expect(idsOf(server.rows.get(id)?.messages)).toEqual(['u1', 'a1']);
    expect(useChappiHistoryStore.getState().sync[id]).toEqual({
      revision: 1,
      serverIds: ['u1', 'a1'],
      status: 'saved',
    });
    expect(useChappiHistoryStore.getState().summaries[0]).toMatchObject({
      id,
      title: 'Plan the EP',
      messageCount: 2,
    });
  });

  it('sends only what the server does not have yet', async () => {
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'), message('a1', 'assistant'));
    await settle(SAVE_DELAY);
    say(message('u2', 'user'));
    await settle(SAVE_DELAY);

    expect(server.puts()[1].body).toMatchObject({ baseRevision: 1, keepCount: 2 });
    expect(idsOf((server.puts()[1].body as { append: StoredChatMessage[] }).append)).toEqual(['u2']);
  });

  it('keeps background saves from ever redirecting to the upgrade page', async () => {
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'));
    await settle(SAVE_DELAY);
    expect(server.puts()[0].headers['x-urganize-prefetch']).toBeDefined();
  });

  it('retries a failed save, and only says so after the second failure', async () => {
    let failures = 2;
    server.setOverride((call) => (call.method === 'PUT' && failures-- > 0 ? 'throw' : null));
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'));
    const id = currentId();

    await settle(SAVE_DELAY);
    expect(selectChatSaveNotice(useChappiHistoryStore.getState(), id)).toBeNull();
    await settle(2_000);
    expect(selectChatSaveNotice(useChappiHistoryStore.getState(), id)).toBe('retrying');
    await settle(5_000);
    expect(selectChatSaveNotice(useChappiHistoryStore.getState(), id)).toBeNull();
    expect(idsOf(server.rows.get(id)?.messages)).toEqual(['u1']);
  });

  it('stops for the session on a locked or read-only team, without retrying', async () => {
    server.setOverride((call) =>
      call.method === 'PUT' ? respond(403, { error: 'Your team is read only.' }) : null
    );
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'));
    await settle(SAVE_DELAY);
    say(message('u2', 'user'));
    await settle(60_000);

    expect(server.puts()).toHaveLength(1);
    expect(useChappiHistoryStore.getState().savingBlocked).toBe(true);
    expect(selectChatSaveNotice(useChappiHistoryStore.getState(), currentId())).toBe('blocked');
  });

  it('never forks into a loop when the server has the feature switched off', async () => {
    server.setOverride(() => respond(404, { error: 'Not found.' }));
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'));
    const id = currentId();
    await settle(SAVE_DELAY);
    await settle(60_000);

    expect(server.puts()).toHaveLength(1);
    expect(currentId()).toBe(id);
    expect(selectChatSaveNotice(useChappiHistoryStore.getState(), id)).toBe('blocked');
  });
});

describe('two places writing one chat', () => {
  it("never overwrites another tab's messages it could not load: the diverged transcript becomes its own chat", async () => {
    startChappiHistory(USER);
    await settle();
    // Our save lands, but the answer is lost on the way back.
    server.setOverride((call) => (call.method === 'PUT' ? 'land-then-throw' : null));
    say(message('u1', 'user'));
    const original = currentId();
    await settle(SAVE_DELAY);
    expect(useChappiHistoryStore.getState().sync[original]?.revision).toBe(0);

    // Another tab adds a message to the same chat.
    const row = server.rows.get(original)!;
    server.rows.set(original, { ...row, revision: 2, messages: [...row.messages, message('a2', 'assistant')] });

    // Our retry is refused (the server is ahead), and loading theirs fails.
    server.setOverride((call) => (call.method === 'GET' && call.url.includes(original) ? respond(500, {}) : null));
    await settle(2_100);

    // Something new is typed here. Saving it with the other tab's ids would
    // drop a2; instead the two versions separate.
    say(message('u3', 'user'));
    await settle(SAVE_DELAY);

    expect(idsOf(server.rows.get(original)?.messages)).toEqual(['u1', 'a2']);
    const forked = currentId();
    expect(forked).not.toBe(original);
    expect(idsOf(server.rows.get(forked)?.messages)).toEqual(['u1', 'u3']);
  });

  it('shows the other tab’s newer messages when this tab had nothing new', async () => {
    startChappiHistory(USER);
    await settle();
    server.setOverride((call) => (call.method === 'PUT' ? 'land-then-throw' : null));
    say(message('u1', 'user'));
    const id = currentId();
    await settle(SAVE_DELAY);
    server.setOverride(null);

    const row = server.rows.get(id)!;
    server.rows.set(id, { ...row, revision: 2, messages: [...row.messages, message('a2', 'assistant')] });
    await settle(2_100);

    expect(currentId()).toBe(id);
    expect(idsOf(useChappiStore.getState().messages)).toEqual(['u1', 'a2']);
    expect(useChappiHistoryStore.getState().sync[id]).toMatchObject({ revision: 2, status: 'saved' });
  });

  it('keeps a chat deleted on another device as a new chat, and late answers follow it', async () => {
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'), message('a1', 'assistant'));
    const original = currentId();
    await settle(SAVE_DELAY);

    server.rows.delete(original);
    say(message('u2', 'user'));
    await settle(SAVE_DELAY);

    const forked = currentId();
    expect(forked).not.toBe(original);
    expect(server.rows.has(original)).toBe(false);
    expect(idsOf(server.rows.get(forked)?.messages)).toEqual(['u1', 'a1', 'u2']);

    // An answer still addressed to the old id lands in the chat it belongs to.
    expect(appendToChat(original, message('a2', 'assistant'))).toBe(true);
    expect(idsOf(useChappiStore.getState().messages)).toEqual(['u1', 'a1', 'u2', 'a2']);
  });
});

describe('an answer after its chat left the screen', () => {
  it('is saved to its own chat, not shown in the new one', async () => {
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'));
    const original = currentId();
    await settle(SAVE_DELAY);

    useChappiStore.getState().reset(); // "New chat" while the answer is on its way
    expect(appendToChat(original, message('a1', 'assistant'))).toBe(true);
    await settle();

    expect(useChappiStore.getState().messages).toHaveLength(0);
    expect(idsOf(server.rows.get(original)?.messages)).toEqual(['u1', 'a1']);
    expect(
      useChappiHistoryStore.getState().summaries.find((summary) => summary.id === original)
    ).toMatchObject({ messageCount: 2 });
  });

  it('is dropped once its chat was deleted here', async () => {
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'));
    const id = currentId();
    await settle(SAVE_DELAY);

    await useChappiHistoryStore.getState().remove(id);
    expect(server.rows.has(id)).toBe(false);
    expect(useChappiStore.getState().conversationId).toBeNull();
    expect(useChappiHistoryStore.getState().summaries.some((summary) => summary.id === id)).toBe(false);
    expect(appendToChat(id, message('a1', 'assistant'))).toBe(false);

    await settle(60_000);
    expect(server.rows.has(id)).toBe(false);
  });
});

describe('sign-out', () => {
  it('stops saving and wipes the browser copy', async () => {
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'));
    await settle(SAVE_DELAY + 400);
    expect(storage.has(CHAT_CACHE_KEY)).toBe(true);

    resetChappiHistory();
    expect(storage.has(CHAT_CACHE_KEY)).toBe(false);

    say(message('u2', 'user'));
    await settle(60_000);
    expect(server.puts()).toHaveLength(1);
  });

  it('clears the previous account from the screen when another signs in without a sign-out', async () => {
    startChappiHistory(USER);
    await settle();
    say(message('u1', 'user'));
    await settle(SAVE_DELAY);

    startChappiHistory('user-2');
    expect(useChappiStore.getState().messages).toHaveLength(0);
    expect(useChappiHistoryStore.getState().summaries).toHaveLength(0);
  });
});

describe('coming back', () => {
  function seedCachedChat(lastActivityAt: number, serverIds: string[]) {
    writeChatCache({
      userId: USER,
      current: {
        id: CACHED_CHAT,
        revision: 1,
        serverIds,
        messages: [
          { id: 'u1', role: 'user', content: 'Plan the EP' },
          { id: 'a1', role: 'assistant', content: 'On it.' },
        ],
        lastActivityAt,
      },
      summaries: [],
    });
    server.rows.set(CACHED_CHAT, {
      ownerUserId: USER,
      title: 'Plan the EP',
      revision: 1,
      messages: serverIds.map((id) => message(id, id.startsWith('u') ? 'user' : 'assistant')),
      lastMessageAt: new Date(lastActivityAt).toISOString(),
      createdAt: new Date(lastActivityAt).toISOString(),
    });
  }

  it('resumes a chat used in the last six hours, marked as restored', async () => {
    seedCachedChat(NOW.getTime() - HOUR, ['u1', 'a1']);
    startChappiHistory(USER);

    const chappi = useChappiStore.getState();
    expect(chappi.conversationId).toBe(CACHED_CHAT);
    expect(idsOf(chappi.messages)).toEqual(['u1', 'a1']);
    expect(chappi.restoredCount).toBe(2);
    await settle(SAVE_DELAY);
    expect(server.puts()).toHaveLength(0);
  });

  it('starts fresh after six hours, but still saves a tail a reload interrupted', async () => {
    seedCachedChat(NOW.getTime() - 7 * HOUR, ['u1']);
    startChappiHistory(USER);

    expect(useChappiStore.getState().messages).toHaveLength(0);
    await settle();
    expect(idsOf(server.rows.get(CACHED_CHAT)?.messages)).toEqual(['u1', 'a1']);
  });

  it('opens a chat continued on another device', async () => {
    server.rows.set(PHONE_CHAT, {
      ownerUserId: USER,
      title: 'From the phone',
      revision: 3,
      messages: [message('p1', 'user'), message('p2', 'assistant')],
      lastMessageAt: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
      createdAt: new Date(NOW.getTime() - HOUR).toISOString(),
    });
    startChappiHistory(USER);
    await settle();

    const chappi = useChappiStore.getState();
    expect(chappi.conversationId).toBe(PHONE_CHAT);
    expect(idsOf(chappi.messages)).toEqual(['p1', 'p2']);
    expect(chappi.restoredCount).toBe(2);
  });

  it('never replaces a chat the user has already started', async () => {
    server.rows.set(PHONE_CHAT, {
      ownerUserId: USER,
      title: 'From the phone',
      revision: 3,
      messages: [message('p1', 'user')],
      lastMessageAt: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
      createdAt: new Date(NOW.getTime() - HOUR).toISOString(),
    });
    startChappiHistory(USER);
    say(message('u1', 'user'));
    await settle();

    expect(currentId()).not.toBe(PHONE_CHAT);
    expect(idsOf(useChappiStore.getState().messages)).toEqual(['u1']);
  });
});
