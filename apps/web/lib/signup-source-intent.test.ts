import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureSignupSourceFromSearch,
  clearSignupSource,
  markSignupSource,
  readSignupSource,
  reportSignupSource,
} from './signup-source-intent';

// vitest runs node here, which has no localStorage, so these drive a
// Map-backed stub (the welcome-intent and pitch-intent tests' pattern).

const DAY = 24 * 60 * 60 * 1000;
let map: Map<string, string>;

const install = (impl?: Partial<Storage>) => {
  map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    ...impl,
  } as Storage;
  vi.stubGlobal('window', { localStorage: store });
};

beforeEach(() => install());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('signup source intent', () => {
  it('remembers what the profile CTA carried and reads it back', () => {
    captureSignupSourceFromSearch('?from=profile&slug=tobi-ade&cta=manager');
    expect(readSignupSource()).toEqual({ source: 'profile', slug: 'tobi-ade', cta: 'manager' });
  });

  it('ignores a page with no attribution, and a partner code', () => {
    captureSignupSourceFromSearch('?ref=SOUNDWAVE');
    expect(readSignupSource()).toBeNull();
    expect(map.size).toBe(0);
  });

  it('last link wins', () => {
    captureSignupSourceFromSearch('?from=profile&slug=tobi-ade&cta=manager');
    markSignupSource({ source: 'claim', slug: null, cta: null });
    expect(readSignupSource()).toEqual({ source: 'claim', slug: null, cta: null });
  });

  it('forgets after 30 days', () => {
    const now = Date.now();
    markSignupSource({ source: 'profile', slug: 'tobi', cta: null }, now - 31 * DAY);
    expect(readSignupSource(now)).toBeNull();
  });

  it('re-validates a hand-edited store', () => {
    map.set('urganize.signup-source', JSON.stringify({ source: 'profile', slug: '../../x', cta: 'boss', at: Date.now() }));
    expect(readSignupSource()).toEqual({ source: 'profile', slug: null, cta: null });
    map.set('urganize.signup-source', '{not json');
    expect(readSignupSource()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    install({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => captureSignupSourceFromSearch('?from=claim')).not.toThrow();
    expect(readSignupSource()).toBeNull();
    expect(() => clearSignupSource()).not.toThrow();
  });

  it('reports once and clears on an answer, keeps it when offline', async () => {
    markSignupSource({ source: 'profile', slug: 'tobi', cta: 'collaborator' });
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await reportSignupSource('token-123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/signup-source');
    expect(JSON.parse(init.body)).toEqual({ source: 'profile', slug: 'tobi', cta: 'collaborator' });
    expect(init.headers.Authorization).toBe('Bearer token-123');
    expect(readSignupSource()).toBeNull();

    markSignupSource({ source: 'claim', slug: null, cta: null });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await reportSignupSource('token-123');
    expect(readSignupSource()).toEqual({ source: 'claim', slug: null, cta: null });
  });

  it('does nothing without a session or a remembered source', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await reportSignupSource('token-123');
    markSignupSource({ source: 'claim', slug: null, cta: null });
    await reportSignupSource(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
