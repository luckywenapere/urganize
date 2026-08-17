import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recallScene, rememberScene, resetSceneMemory } from './scene-memory';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

let storage: ReturnType<typeof createMemoryStorage>;

function stubSession(userId: string) {
  storage.setItem('urganize-auth', JSON.stringify({ state: { user: { id: userId } } }));
}

beforeEach(() => {
  storage = createMemoryStorage();
  vi.stubGlobal('window', { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recallScene', () => {
  it('is null for a release with nothing remembered', () => {
    stubSession('user-1');
    expect(recallScene('release-1')).toBeNull();
  });

  it('is null with no session (logged out, or nothing to key by)', () => {
    expect(recallScene('release-1')).toBeNull();
  });

  it('is null for an empty release id', () => {
    stubSession('user-1');
    expect(recallScene('')).toBeNull();
  });
});

describe('rememberScene / recallScene round trip', () => {
  it('recalls what was remembered for the same session', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    expect(recallScene('release-1')).toBe('metadata');
  });

  it('keeps each release independent', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-2', 'calendar');
    expect(recallScene('release-1')).toBe('metadata');
    expect(recallScene('release-2')).toBe('calendar');
  });

  it('overwrites a release\'s prior memory with its latest scene', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-1', 'song');
    expect(recallScene('release-1')).toBe('song');
  });

  it('remembering null (Activities) clears any existing entry', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-1', null);
    expect(recallScene('release-1')).toBeNull();
  });

  it('remembering null for a release with nothing stored is a no-op', () => {
    stubSession('user-1');
    rememberScene('release-1', null);
    expect(recallScene('release-1')).toBeNull();
  });

  it('does not persist anything with no active session', () => {
    rememberScene('release-1', 'metadata');
    expect(storage.getItem('urganize.cache.scene-memory')).toBeNull();
  });

  it('ignores an empty release id', () => {
    stubSession('user-1');
    rememberScene('', 'metadata');
    expect(storage.getItem('urganize.cache.scene-memory')).toBeNull();
  });
});

describe('session isolation', () => {
  // One active session's memory occupies the single urganize.cache.* slot at
  // a time — the same "current session wins, a mismatch just misses"
  // contract every other urganize.cache.* key in this codebase follows
  // (stores/useSceneDataStore.ts, useReleaseStore.ts, etc.). Concurrently
  // remembering two different accounts' scenes in one tab was never a
  // requirement; only "a different session never sees a stale one's
  // memory" is.
  it('a different session (userId mismatch) sees no memory', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');

    stubSession('user-2');
    expect(recallScene('release-1')).toBeNull();
  });

  it('a later session writing under its own id does not corrupt reads for that id', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');

    stubSession('user-2');
    rememberScene('release-1', 'calendar');
    expect(recallScene('release-1')).toBe('calendar');
  });
});

describe('resetSceneMemory', () => {
  it('wipes every release\'s remembered scene', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-2', 'calendar');

    resetSceneMemory();

    expect(recallScene('release-1')).toBeNull();
    expect(recallScene('release-2')).toBeNull();
  });

  it('a fresh login after reset starts at Activities, even for the same account', () => {
    stubSession('user-1');
    rememberScene('release-1', 'metadata');

    resetSceneMemory();
    stubSession('user-1');

    expect(recallScene('release-1')).toBeNull();
  });

  it('is a no-op when nothing was ever stored', () => {
    expect(() => resetSceneMemory()).not.toThrow();
  });
});

describe('no window (server-side / logged out before hydration)', () => {
  it('recallScene returns null without throwing', () => {
    vi.stubGlobal('window', undefined);
    expect(recallScene('release-1')).toBeNull();
  });

  it('rememberScene does not throw', () => {
    vi.stubGlobal('window', undefined);
    expect(() => rememberScene('release-1', 'metadata')).not.toThrow();
  });

  it('resetSceneMemory does not throw', () => {
    vi.stubGlobal('window', undefined);
    expect(() => resetSceneMemory()).not.toThrow();
  });
});
