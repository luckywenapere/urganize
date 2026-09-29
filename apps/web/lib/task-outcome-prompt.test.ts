import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAskAfterTasks } from './task-outcome-prompt';

type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** A real Map-backed store, so the round trips below exercise storage rather
 *  than a mock's expectations — the approach lib/catalog-intent.test.ts and
 *  lib/scene-memory.test.ts already use. */
function createMemoryStorage(overrides: Partial<Storage> = {}): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    ...overrides,
  };
}

let localStorage: Storage;

function install(overrides: Partial<Storage> = {}) {
  localStorage = createMemoryStorage(overrides);
  vi.stubGlobal('window', { localStorage });
}

beforeEach(() => {
  install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readAskAfterTasks', () => {
  it('is true during SSR, where there is no persisted auth store to read', () => {
    vi.unstubAllGlobals();
    expect(readAskAfterTasks()).toBe(true);
  });

  it('is true with no persisted session at all', () => {
    expect(readAskAfterTasks()).toBe(true);
  });

  it('is true when the persisted profile predates the column', () => {
    localStorage.setItem('urganize-auth', JSON.stringify({ state: { user: { id: 'user-1' } } }));
    expect(readAskAfterTasks()).toBe(true);
  });

  it('is true when the flag is explicitly on', () => {
    localStorage.setItem(
      'urganize-auth',
      JSON.stringify({ state: { user: { ask_after_tasks: true } } })
    );
    expect(readAskAfterTasks()).toBe(true);
  });

  it('is false only when the flag is explicitly off', () => {
    localStorage.setItem(
      'urganize-auth',
      JSON.stringify({ state: { user: { ask_after_tasks: false } } })
    );
    expect(readAskAfterTasks()).toBe(false);
  });

  it('is true when there is no signed-in user', () => {
    localStorage.setItem('urganize-auth', JSON.stringify({ state: { user: null } }));
    expect(readAskAfterTasks()).toBe(true);
  });

  it('ignores an unparseable value under the key', () => {
    localStorage.setItem('urganize-auth', 'not json {');
    expect(readAskAfterTasks()).toBe(true);
  });

  it('ignores a foreign shape under the key', () => {
    localStorage.setItem('urganize-auth', JSON.stringify({ state: 'unexpected' }));
    expect(readAskAfterTasks()).toBe(true);
  });

  it('is true when the store throws on read (a blocked store)', () => {
    install({
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(readAskAfterTasks()).toBe(true);
  });
});
