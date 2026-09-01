import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isCatalogRequested,
  leaveReleaseForCatalog,
  markCatalogRequested,
  resetCatalogIntent,
} from './catalog-intent';
import { recallScene, rememberScene } from './scene-memory';

type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** A real Map-backed store, so the round trips below exercise storage rather
 * than a mock's expectations — the approach lib/scene-memory.test.ts uses. */
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

let sessionStorage: Storage;
let localStorage: Storage;

function install(overrides: Partial<Storage> = {}) {
  sessionStorage = createMemoryStorage(overrides);
  localStorage = createMemoryStorage();
  vi.stubGlobal('window', { sessionStorage, localStorage, location: { search: '' } });
}

/** Scene memory keys itself by the signed-in user, read straight off the auth
 * store's persisted blob — so leaveReleaseForCatalog's scene half needs both a
 * session and a scoped release before it can do anything observable. */
function stubScopedRelease(userId: string, releaseId: string) {
  localStorage.setItem('urganize-auth', JSON.stringify({ state: { user: { id: userId } } }));
  (window as unknown as { location: { search: string } }).location.search =
    `?release=${releaseId}`;
}

beforeEach(() => {
  install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isCatalogRequested', () => {
  it('is false in a fresh session — an undirected arrival still gets its auto-scope', () => {
    expect(isCatalogRequested()).toBe(false);
  });

  it('is true once the catalog has been asked for', () => {
    markCatalogRequested();
    expect(isCatalogRequested()).toBe(true);
  });

  it('stays true across repeated reads, so every later mount agrees', () => {
    markCatalogRequested();
    expect(isCatalogRequested()).toBe(true);
    expect(isCatalogRequested()).toBe(true);
  });

  it('is false during SSR, where there is no session store', () => {
    vi.unstubAllGlobals();
    expect(isCatalogRequested()).toBe(false);
  });

  it('ignores a foreign value under the key', () => {
    sessionStorage.setItem('urganize.catalog.requested', 'nope');
    expect(isCatalogRequested()).toBe(false);
  });
});

describe('isCatalogRequested with an unusable store', () => {
  // The fail direction, and the whole reason for the write probe: a store that
  // cannot be written is a store where no exit can EVER record intent, so the
  // auto-scope has to stand down or the catalog becomes unreachable for the
  // rest of the session.
  it('is true when writes throw but reads work (Safari private mode)', () => {
    install({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(isCatalogRequested()).toBe(true);
  });

  it('is true when reads throw', () => {
    install({
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(isCatalogRequested()).toBe(true);
  });

  it('leaves no probe key behind on a store that works', () => {
    isCatalogRequested();
    expect(sessionStorage.getItem('urganize.catalog.probe')).toBeNull();
  });
});

describe('markCatalogRequested', () => {
  it('never throws when the store is full', () => {
    install({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => markCatalogRequested()).not.toThrow();
  });

  it('never throws during SSR', () => {
    vi.unstubAllGlobals();
    expect(() => markCatalogRequested()).not.toThrow();
  });
});

describe('resetCatalogIntent', () => {
  it('returns a signed-out tab to a fresh arrival', () => {
    markCatalogRequested();
    resetCatalogIntent();
    expect(isCatalogRequested()).toBe(false);
  });

  it('never throws when nothing was recorded', () => {
    expect(() => resetCatalogIntent()).not.toThrow();
  });

  it('never throws when removal is blocked', () => {
    install({
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => resetCatalogIntent()).not.toThrow();
  });
});

describe('leaveReleaseForCatalog', () => {
  it('records the catalog intent', () => {
    leaveReleaseForCatalog();
    expect(isCatalogRequested()).toBe(true);
  });

  it('forgets the scoped release scene, so returning starts at Activities', () => {
    stubScopedRelease('user-1', 'release-1');
    rememberScene('release-1', 'metadata');
    expect(recallScene('release-1')).toBe('metadata');

    leaveReleaseForCatalog();

    expect(recallScene('release-1')).toBeNull();
  });

  it('does BOTH halves in one call — the reason it exists', () => {
    stubScopedRelease('user-1', 'release-1');
    rememberScene('release-1', 'calendar');

    leaveReleaseForCatalog();

    expect(isCatalogRequested()).toBe(true);
    expect(recallScene('release-1')).toBeNull();
  });

  // Tapping Home from Settings is the reported bug: there is no `?release=` to
  // forget, and the intent is the entire point of the call.
  it('still records the intent from a page with no release scoped', () => {
    leaveReleaseForCatalog();
    expect(isCatalogRequested()).toBe(true);
  });

  it('leaves another release scene alone', () => {
    stubScopedRelease('user-1', 'release-1');
    rememberScene('release-1', 'metadata');
    rememberScene('release-2', 'calendar');

    leaveReleaseForCatalog();

    expect(recallScene('release-1')).toBeNull();
    expect(recallScene('release-2')).toBe('calendar');
  });

  it('never throws during SSR', () => {
    vi.unstubAllGlobals();
    expect(() => leaveReleaseForCatalog()).not.toThrow();
  });
});
