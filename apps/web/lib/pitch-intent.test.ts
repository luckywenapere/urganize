import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPitchIntent,
  markPitchIntent,
  readPitchIntent,
  resolvePostSignupDestination,
  scopedPitchingPath,
  takePitchIntent,
} from './pitch-intent';

/**
 * vitest runs node here, which has no sessionStorage, so these drive a
 * Map-backed stub. The point of the suite is the two rules that are easy to
 * lose: a value read back out of a store the person can edit is re-validated,
 * and a store that throws costs the intent rather than the page.
 */

const install = (impl?: Partial<Storage>) => {
  const map = new Map<string, string>();
  const store: Storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    ...impl,
  } as Storage;
  vi.stubGlobal('window', { sessionStorage: store });
  return map;
};

beforeEach(() => install());
afterEach(() => vi.unstubAllGlobals());

describe('markPitchIntent', () => {
  it('remembers a curator a reader came from', () => {
    markPitchIntent('soundrise');
    expect(readPitchIntent()).toBe('soundrise');
  });

  it('normalizes what it stores', () => {
    markPitchIntent('  SoundRise  ');
    expect(readPitchIntent()).toBe('soundrise');
  });

  it('refuses a slug the database could never have issued', () => {
    for (const bad of ['has space', 'dot.dot', '-lead', 'a', '', 'UPPER CASE!']) {
      clearPitchIntent();
      markPitchIntent(bad);
      expect(readPitchIntent()).toBeNull();
    }
  });

  it('does not throw when the store refuses to write', () => {
    install({
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    });
    expect(() => markPitchIntent('soundrise')).not.toThrow();
    expect(readPitchIntent()).toBeNull();
  });
});

describe('readPitchIntent', () => {
  it('re-validates a value somebody edited by hand', () => {
    const map = install();
    map.set('urganize.pitch.curator', '../../dashboard');
    expect(readPitchIntent()).toBeNull();
  });

  it('answers null rather than throwing when the store is unreadable', () => {
    install({
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readPitchIntent()).toBeNull();
  });
});

describe('takePitchIntent', () => {
  it('consumes the intent so it cannot fire twice', () => {
    markPitchIntent('soundrise');
    expect(takePitchIntent()).toBe('soundrise');
    expect(readPitchIntent()).toBeNull();
    expect(takePitchIntent()).toBeNull();
  });
});

describe('scopedPitchingPath', () => {
  it('points at the composer for one curator', () => {
    expect(scopedPitchingPath('soundrise')).toBe('/dashboard/pitching?curator=soundrise');
  });
});

describe('resolvePostSignupDestination', () => {
  const base = {
    cardTrialEnabled: false,
    cardTrialPath: '/start-trial',
    pitchCuratorSlug: null as string | null,
    homePath: '/dashboard/urgans',
  };

  it('sends a new artist to the curator they came from', () => {
    expect(resolvePostSignupDestination({ ...base, pitchCuratorSlug: 'soundrise' })).toBe(
      '/dashboard/pitching?curator=soundrise'
    );
  });

  it('lands on the ordinary home when nobody sent them', () => {
    expect(resolvePostSignupDestination(base)).toBe('/dashboard/urgans');
  });

  it('puts the card trial ahead of a pitch intent, because money outranks it', () => {
    expect(
      resolvePostSignupDestination({
        ...base,
        cardTrialEnabled: true,
        pitchCuratorSlug: 'soundrise',
      })
    ).toBe('/start-trial');
  });

  it('ignores a slug that could not have come from us', () => {
    expect(resolvePostSignupDestination({ ...base, pitchCuratorSlug: '../admin' })).toBe(
      '/dashboard/urgans'
    );
    expect(resolvePostSignupDestination({ ...base, pitchCuratorSlug: '' })).toBe('/dashboard/urgans');
  });

  it('sends somebody Wena invited back to the link they came from, ahead of a pitch', () => {
    const token = 'a'.repeat(32);
    expect(resolvePostSignupDestination({ ...base, welcomeToken: token })).toBe(`/welcome/${token}`);
    expect(
      resolvePostSignupDestination({ ...base, welcomeToken: token, pitchCuratorSlug: 'soundrise' })
    ).toBe(`/welcome/${token}`);
  });

  it('still puts the card trial ahead of a seeding link', () => {
    expect(
      resolvePostSignupDestination({ ...base, cardTrialEnabled: true, welcomeToken: 'a'.repeat(32) })
    ).toBe('/start-trial');
  });

  it('ignores a seeding token that could not have come from us', () => {
    expect(resolvePostSignupDestination({ ...base, welcomeToken: '../admin' })).toBe('/dashboard/urgans');
    expect(resolvePostSignupDestination({ ...base, welcomeToken: null })).toBe('/dashboard/urgans');
  });
});
