import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFERRED_SHARE_MAX_MS,
  FIRST_SESSION_KEY,
  FIRST_SESSION_MAX_MS,
  FIRST_SESSION_TAB_KEY,
  OPEN_PLANNER_TTL_MS,
  clearDeferredShare,
  clearFirstSession,
  decideDeferredShareOffer,
  isFirstSession,
  isInFirstSession,
  markOnboardingPlannerHandoff,
  onboardingLandingPath,
  parseFirstSessionRecord,
  parseOnboardingPlannerHandoff,
  readFirstSessionRecord,
  readFirstSessionTabId,
  startFirstSession,
  takeOnboardingPlannerHandoff,
  type FirstSessionRecord,
} from './first-session';

type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function memory(overrides: Partial<Storage> = {}): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    ...overrides,
  };
}

function install(overrides: { session?: Partial<Storage>; local?: Partial<Storage> } = {}) {
  const session = memory(overrides.session);
  const local = memory(overrides.local);
  vi.stubGlobal('window', { sessionStorage: session, localStorage: local });
  return { session, local };
}

/** A new tab: localStorage survives, sessionStorage does not. */
function newTab(local: Storage) {
  const session = memory();
  vi.stubGlobal('window', { sessionStorage: session, localStorage: local });
  return session;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const record = (over: Partial<FirstSessionRecord> = {}): FirstSessionRecord => ({
  v: 1,
  startedAt: 1_000_000,
  tabId: 'tab-a',
  releaseId: 'rel-1',
  shareReleaseId: 'rel-1',
  ...over,
});

describe('isFirstSession (pure)', () => {
  it('is the first session only in the same tab and within the age cap', () => {
    const r = record();
    expect(isFirstSession(r, 'tab-a', r.startedAt + 1)).toBe(true);
    expect(isFirstSession(r, 'tab-b', r.startedAt + 1)).toBe(false);
    expect(isFirstSession(r, null, r.startedAt + 1)).toBe(false);
    expect(isFirstSession(r, 'tab-a', r.startedAt + FIRST_SESSION_MAX_MS)).toBe(false);
    expect(isFirstSession(null, 'tab-a', r.startedAt)).toBe(false);
    // A clock that went backwards is not trusted as "still first".
    expect(isFirstSession(r, 'tab-a', r.startedAt - 1)).toBe(false);
  });
});

describe('decideDeferredShareOffer (pure)', () => {
  const r = record();

  it('waits out the first session, then offers once on Home', () => {
    expect(decideDeferredShareOffer({ record: r, tabId: 'tab-a', now: r.startedAt + 60_000, onHome: true })).toBeNull();
    expect(decideDeferredShareOffer({ record: r, tabId: 'tab-b', now: r.startedAt + 60_000, onHome: true })).toBe('rel-1');
    expect(
      decideDeferredShareOffer({ record: r, tabId: 'tab-a', now: r.startedAt + FIRST_SESSION_MAX_MS, onHome: true })
    ).toBe('rel-1');
  });

  it('only on Home, only with something to offer, and not about a moment long gone', () => {
    expect(decideDeferredShareOffer({ record: r, tabId: 'tab-b', now: r.startedAt + 1, onHome: false })).toBeNull();
    expect(
      decideDeferredShareOffer({ record: record({ shareReleaseId: null }), tabId: 'tab-b', now: 2_000_000, onHome: true })
    ).toBeNull();
    expect(
      decideDeferredShareOffer({ record: r, tabId: 'tab-b', now: r.startedAt + DEFERRED_SHARE_MAX_MS + 1, onHome: true })
    ).toBeNull();
    expect(decideDeferredShareOffer({ record: null, tabId: 'tab-b', now: 1, onHome: true })).toBeNull();
  });
});

describe('parseFirstSessionRecord', () => {
  it('reads a good record and refuses a bad one', () => {
    expect(parseFirstSessionRecord(JSON.stringify(record()))).toEqual(record());
    expect(parseFirstSessionRecord(null)).toBeNull();
    expect(parseFirstSessionRecord('{not json')).toBeNull();
    expect(parseFirstSessionRecord(JSON.stringify({ ...record(), v: 2 }))).toBeNull();
    expect(parseFirstSessionRecord(JSON.stringify({ ...record(), tabId: '' }))).toBeNull();
    expect(parseFirstSessionRecord(JSON.stringify({ ...record(), startedAt: 'yesterday' }))).toBeNull();
    expect(parseFirstSessionRecord(JSON.stringify({ ...record(), shareReleaseId: 7 }))?.shareReleaseId).toBeNull();
  });
});

describe('the first session in storage', () => {
  it('is the first session in the onboarding tab, and not in a new tab', () => {
    const { local } = install();
    startFirstSession({ releaseId: 'rel-1', shareReleaseId: 'rel-1', now: 5_000 });
    expect(isInFirstSession(5_001)).toBe(true);
    expect(readFirstSessionRecord()?.releaseId).toBe('rel-1');
    newTab(local);
    expect(isInFirstSession(5_001)).toBe(false);
    expect(readFirstSessionTabId()).toBeNull();
  });

  it('ends after the age cap even in the same tab', () => {
    install();
    startFirstSession({ releaseId: 'rel-1', shareReleaseId: null, now: 5_000 });
    expect(isInFirstSession(5_000 + FIRST_SESSION_MAX_MS)).toBe(false);
  });

  it('drops the deferred share once offered and keeps the rest', () => {
    const { local } = install();
    startFirstSession({ releaseId: 'rel-1', shareReleaseId: 'rel-1', now: 5_000 });
    clearDeferredShare();
    const after = parseFirstSessionRecord(local.map.get(FIRST_SESSION_KEY) ?? null);
    expect(after?.shareReleaseId).toBeNull();
    expect(after?.releaseId).toBe('rel-1');
  });

  it('is cleared on sign-out', () => {
    const { local, session } = install();
    startFirstSession({ releaseId: 'rel-1', shareReleaseId: 'rel-1', now: 5_000 });
    clearFirstSession();
    expect(local.map.has(FIRST_SESSION_KEY)).toBe(false);
    expect(session.map.has(FIRST_SESSION_TAB_KEY)).toBe(false);
  });

  it('never throws on blocked storage, and reads blocked storage as not the first session', () => {
    const blocked: Partial<Storage> = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    install({ session: blocked, local: blocked });
    expect(() => startFirstSession({ releaseId: 'rel-1', shareReleaseId: 'rel-1' })).not.toThrow();
    expect(isInFirstSession()).toBe(false);
    expect(() => clearDeferredShare()).not.toThrow();
    expect(() => clearFirstSession()).not.toThrow();
  });

  it('does nothing without a window (server render)', () => {
    vi.stubGlobal('window', undefined);
    expect(isInFirstSession()).toBe(false);
    expect(readFirstSessionRecord()).toBeNull();
  });
});

describe('the onboarding → planner hand-off', () => {
  it('is taken once, and only by the rollout it names', () => {
    install();
    markOnboardingPlannerHandoff(
      { releaseId: 'rel-1', releaseType: 'single', releaseDate: '2026-12-04', artistName: 'Tems' },
      10_000
    );
    expect(takeOnboardingPlannerHandoff('rel-2', 10_001)).toBeNull();
    expect(takeOnboardingPlannerHandoff('rel-1', 10_001)).toEqual({
      releaseId: 'rel-1',
      releaseType: 'single',
      releaseDate: '2026-12-04',
      artistName: 'Tems',
      at: 10_000,
    });
    expect(takeOnboardingPlannerHandoff('rel-1', 10_002)).toBeNull();
  });

  it('expires, and drops fields it cannot use', () => {
    expect(parseOnboardingPlannerHandoff(JSON.stringify({ releaseId: 'r', at: 0 }), OPEN_PLANNER_TTL_MS + 1)).toBeNull();
    expect(
      parseOnboardingPlannerHandoff(
        JSON.stringify({ releaseId: 'r', at: 0, releaseType: 'music_video', releaseDate: 'soon', artistName: '  ' }),
        1
      )
    ).toEqual({ releaseId: 'r', at: 0 });
    expect(parseOnboardingPlannerHandoff('nope', 1)).toBeNull();
    expect(parseOnboardingPlannerHandoff(JSON.stringify({ at: 0 }), 1)).toBeNull();
  });
});

describe('onboardingLandingPath', () => {
  it('lands on the new rollout, or Home without one', () => {
    expect(onboardingLandingPath('rel-1', '/dashboard/home')).toBe('/dashboard?release=rel-1');
    expect(onboardingLandingPath(null, '/dashboard/home')).toBe('/dashboard/home');
    expect(onboardingLandingPath('a b&c', '/dashboard/home')).toBe('/dashboard?release=a%20b%26c');
  });
});
