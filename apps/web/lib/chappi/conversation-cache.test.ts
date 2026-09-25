import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CHAT_CACHE_KEY,
  clearChatCache,
  fitChatCachePayload,
  readChatCache,
  readResumableChatHint,
  writeChatCache,
} from './conversation-cache';
import { CHAT_RESUME_WINDOW_MS, type ChatCachePayload } from './conversation-history';

// The browser copy of UrgAns chat history. Two properties matter more than the
// round trip itself: a copy written for one account is never read back for
// another, and a transcript that does not fit is dropped WHOLE — a partial
// prefix would make the next save truncate the server copy to match it.

/** The credit-prefill.test.ts stub: persisted-state only touches these three
 *  methods behind a `typeof window` guard. */
function installLocalStorage(options: { throwOnSet?: boolean } = {}) {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      if (options.throwOnSet) throw new Error('QuotaExceededError');
      store.set(key, String(value));
    },
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return { localStorage, store };
}

const CHAT = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-09-24T12:00:00.000Z');

function payload(over: Partial<ChatCachePayload> = {}): ChatCachePayload {
  return {
    userId: 'user-1',
    current: {
      id: CHAT,
      revision: 2,
      serverIds: ['a'],
      messages: [
        { id: 'a', role: 'user', content: 'Plan the EP' },
        { id: 'b', role: 'assistant', content: 'On it.' },
      ],
      lastActivityAt: NOW - 60_000,
    },
    summaries: [
      {
        id: CHAT,
        title: 'Plan the EP',
        messageCount: 2,
        lastMessageAt: '2026-09-24T11:59:00.000Z',
        createdAt: '2026-09-24T11:00:00.000Z',
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  installLocalStorage();
});

afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('chat cache round trip', () => {
  it('reads back what it wrote, for the same account', () => {
    writeChatCache(payload());
    expect(readChatCache('user-1')).toEqual(payload());
  });

  it("never hands one account another account's chats", () => {
    writeChatCache(payload());
    expect(readChatCache('user-2')).toBeNull();
    expect(readChatCache('')).toBeNull();
  });

  it('clears on sign-out', () => {
    writeChatCache(payload());
    clearChatCache();
    expect(readChatCache('user-1')).toBeNull();
  });

  it('ignores anything under the key it did not write', () => {
    const { store } = installLocalStorage();
    store.set(CHAT_CACHE_KEY, JSON.stringify({ version: 1, savedAt: NOW, value: { userId: 'user-1' } }));
    expect(readChatCache('user-1')).toBeNull();
  });

  it('swallows a full quota rather than breaking the chat', () => {
    installLocalStorage({ throwOnSet: true });
    expect(() => writeChatCache(payload())).not.toThrow();
  });
});

describe('fitChatCachePayload', () => {
  it('keeps a payload that fits, capping the list', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
      title: `Chat ${index}`,
      messageCount: 1,
      lastMessageAt: '2026-09-24T10:00:00.000Z',
      createdAt: '2026-09-24T10:00:00.000Z',
    }));
    const fitted = fitChatCachePayload(payload({ summaries: many }));
    expect(fitted?.summaries).toHaveLength(30);
    expect(fitted?.current?.messages).toHaveLength(2);
  });

  it('drops an oversized transcript WHOLE and keeps its sync state', () => {
    const huge = Array.from({ length: 20 }, (_, index) => ({
      id: `m${index}`,
      role: 'assistant' as const,
      content: 'x'.repeat(10_000),
    }));
    const base = payload();
    const fitted = fitChatCachePayload({ ...base, current: { ...base.current!, messages: huge } });
    expect(fitted?.current?.messages).toBeNull();
    expect(fitted?.current?.revision).toBe(2);
    expect(fitted?.current?.serverIds).toEqual(['a']);
  });
});

describe('readResumableChatHint', () => {
  it('reports how long the chat about to resume is, for the skeleton', () => {
    writeChatCache(payload());
    expect(readResumableChatHint(NOW)).toBe(2);
  });

  it('reports nothing for a chat outside the resume window', () => {
    const base = payload();
    writeChatCache({
      ...base,
      current: { ...base.current!, lastActivityAt: NOW - CHAT_RESUME_WINDOW_MS - 1 },
    });
    expect(readResumableChatHint(NOW)).toBe(0);
  });

  it('reports nothing when there is no cached transcript', () => {
    expect(readResumableChatHint(NOW)).toBe(0);
    writeChatCache(payload({ current: null }));
    expect(readResumableChatHint(NOW)).toBe(0);
  });
});
