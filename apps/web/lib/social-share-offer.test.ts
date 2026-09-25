import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_RELEASE_TEST_SCAN,
  FIRST_SHARE_PENDING_TTL_MS,
  clearPendingFirstShare,
  decideFirstRelease,
  hasOfferedFirstShare,
  markFirstShareOffered,
  markPendingFirstShare,
  readPendingFirstShare,
  readSavedShareAnswers,
  saveShareAnswers,
  shouldOfferFirstShare,
} from './social-share-offer';
import type { ShareAnswers } from './social-share';

type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** A real Map-backed store, the lib/catalog-intent.test.ts approach, so the
 * round trips below exercise storage rather than a mock's expectations. */
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

function install(overrides: { session?: Partial<Storage>; local?: Partial<Storage> } = {}) {
  vi.stubGlobal('window', {
    sessionStorage: createMemoryStorage(overrides.session),
    localStorage: createMemoryStorage(overrides.local),
  });
}

const throwing: Partial<Storage> = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

const answers: ShareAnswers = {
  voice: 'team',
  dateMode: 'secret',
  fanLink: 'https://hyperfollow.com/x',
  extraLine: 'Featuring Tems',
};

beforeEach(() => install());
afterEach(() => vi.unstubAllGlobals());

describe('decideFirstRelease', () => {
  it('is the first when the person owned no rollouts before this one', () => {
    expect(decideFirstRelease({ isTest: false, priorCount: 0, priorTestFlags: [] })).toBe(true);
  });

  it('never counts a test rollout, which is practice and not an announcement', () => {
    expect(decideFirstRelease({ isTest: true, priorCount: 0, priorTestFlags: [] })).toBe(false);
  });

  it('is still the first when everything before it was a test rollout', () => {
    expect(decideFirstRelease({ isTest: false, priorCount: 2, priorTestFlags: [true, true] })).toBe(true);
  });

  it('is not the first when any earlier rollout was real', () => {
    expect(decideFirstRelease({ isTest: false, priorCount: 2, priorTestFlags: [true, false] })).toBe(false);
  });

  it('is not the first when there were more earlier rollouts than it looked at', () => {
    const scanned = Array.from({ length: FIRST_RELEASE_TEST_SCAN }, () => true);
    expect(
      decideFirstRelease({ isTest: false, priorCount: FIRST_RELEASE_TEST_SCAN + 1, priorTestFlags: scanned })
    ).toBe(false);
  });

  it('stays quiet when the earlier rollouts could not be read', () => {
    expect(decideFirstRelease({ isTest: false, priorCount: 1, priorTestFlags: null })).toBe(false);
  });
});

describe('shouldOfferFirstShare', () => {
  it('offers after the first real rollout, once', () => {
    expect(shouldOfferFirstShare({ enabled: true, firstRelease: true, alreadyOffered: false })).toBe(true);
  });

  it('never offers when the feature is off, it is not the first, or it already happened', () => {
    expect(shouldOfferFirstShare({ enabled: false, firstRelease: true, alreadyOffered: false })).toBe(false);
    expect(shouldOfferFirstShare({ enabled: true, firstRelease: false, alreadyOffered: false })).toBe(false);
    expect(shouldOfferFirstShare({ enabled: true, firstRelease: true, alreadyOffered: true })).toBe(false);
  });
});

describe('the once-per-person marker', () => {
  it('is per account, so a shared device still offers the next person theirs', () => {
    expect(hasOfferedFirstShare('user-a')).toBe(false);
    markFirstShareOffered('user-a');
    expect(hasOfferedFirstShare('user-a')).toBe(true);
    expect(hasOfferedFirstShare('user-b')).toBe(false);
  });

  it('treats an unreadable store as already offered, so a broken store never nags', () => {
    install({ local: throwing });
    expect(hasOfferedFirstShare('user-a')).toBe(true);
    expect(() => markFirstShareOffered('user-a')).not.toThrow();
  });
});

describe('the pending offer from onboarding', () => {
  it('round trips the rollout it was set for, and clears', () => {
    markPendingFirstShare('rel-1', 1_000);
    expect(readPendingFirstShare(1_000 + 5_000)).toBe('rel-1');
    clearPendingFirstShare();
    expect(readPendingFirstShare(1_000 + 5_000)).toBeNull();
  });

  it('expires, so a tab left open for a day does not pop it up out of nowhere', () => {
    markPendingFirstShare('rel-1', 1_000);
    expect(readPendingFirstShare(1_000 + FIRST_SHARE_PENDING_TTL_MS + 1)).toBeNull();
  });

  it('ignores junk and a blocked store instead of throwing', () => {
    (window as unknown as { sessionStorage: Storage }).sessionStorage.setItem(
      'urganize.share.pending-first',
      '{not json'
    );
    expect(readPendingFirstShare(1_000)).toBeNull();
    install({ session: throwing });
    expect(() => markPendingFirstShare('rel-1', 1_000)).not.toThrow();
    expect(readPendingFirstShare(1_000)).toBeNull();
  });
});

describe('remembered answers', () => {
  it('come back for the same person and the same rollout', () => {
    saveShareAnswers('user-a', 'rel-1', answers);
    expect(readSavedShareAnswers('user-a', 'rel-1')).toEqual(answers);
  });

  it('never leak to another person or another rollout', () => {
    saveShareAnswers('user-a', 'rel-1', answers);
    expect(readSavedShareAnswers('user-b', 'rel-1')).toBeNull();
    expect(readSavedShareAnswers('user-a', 'rel-2')).toBeNull();
  });

  it('keep only the most recent rollouts, so the record cannot grow forever', () => {
    for (let index = 0; index < 40; index++) {
      saveShareAnswers('user-a', `rel-${index}`, answers);
    }
    expect(readSavedShareAnswers('user-a', 'rel-39')).toEqual(answers);
    expect(readSavedShareAnswers('user-a', 'rel-0')).toBeNull();
  });

  it('replace the previous answers for a rollout rather than stacking', () => {
    saveShareAnswers('user-a', 'rel-1', answers);
    saveShareAnswers('user-a', 'rel-1', { ...answers, voice: 'artist' });
    expect(readSavedShareAnswers('user-a', 'rel-1')?.voice).toBe('artist');
  });

  it('refuse a record that is not answers', () => {
    (window as unknown as { localStorage: Storage }).localStorage.setItem(
      'urganize.share.answers',
      JSON.stringify({ version: 1, savedAt: Date.now(), value: { entries: [{ userId: 'user-a', releaseId: 'rel-1', answers: { voice: 'loud' } }] } })
    );
    expect(readSavedShareAnswers('user-a', 'rel-1')).toBeNull();
  });

  it('never throw when the store is blocked', () => {
    install({ local: throwing });
    expect(() => saveShareAnswers('user-a', 'rel-1', answers)).not.toThrow();
    expect(readSavedShareAnswers('user-a', 'rel-1')).toBeNull();
  });
});
