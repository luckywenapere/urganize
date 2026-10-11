import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearWelcomeIntent, markWelcomeIntent, readWelcomeIntent, welcomePath } from './welcome-intent';

// vitest runs node here, which has no sessionStorage, so these drive a
// Map-backed stub, the same way pitch-intent.test.ts does.

const TOKEN = 'a'.repeat(32);

const install = (impl?: Partial<Storage>) => {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    ...impl,
  } as Storage;
  vi.stubGlobal('window', { sessionStorage: store });
  return map;
};

beforeEach(() => install());
afterEach(() => vi.unstubAllGlobals());

describe('welcome intent', () => {
  it('remembers a link and reads it back without clearing it', () => {
    markWelcomeIntent(TOKEN);
    expect(readWelcomeIntent()).toBe(TOKEN);
    expect(readWelcomeIntent()).toBe(TOKEN);
  });

  it('clears when asked', () => {
    markWelcomeIntent(TOKEN);
    clearWelcomeIntent();
    expect(readWelcomeIntent()).toBeNull();
  });

  it('refuses to store, or to return, something that is not a plausible token', () => {
    markWelcomeIntent('../admin');
    expect(readWelcomeIntent()).toBeNull();
    const map = install();
    map.set('urganize.welcome.token', '<script>');
    expect(readWelcomeIntent()).toBeNull();
  });

  it('fails toward no intent when storage throws', () => {
    install({
      setItem: () => {
        throw new Error('full');
      },
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => markWelcomeIntent(TOKEN)).not.toThrow();
    expect(readWelcomeIntent()).toBeNull();
  });

  it('builds the page path', () => {
    expect(welcomePath(TOKEN)).toBe(`/welcome/${TOKEN}`);
  });
});
