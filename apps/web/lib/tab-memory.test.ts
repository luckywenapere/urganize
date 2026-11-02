import { describe, expect, it } from 'vitest';
import { nextHomeMemory, type TabMemoryPlace } from './tab-memory';

const home: TabMemoryPlace = { path: '/dashboard', onTab: true, area: 'artists' };
const rollout: TabMemoryPlace = { path: '/dashboard?release=r1&scene=brief', onTab: false, area: 'artists' };
const sessions: TabMemoryPlace = { path: '/dashboard/sessions', onTab: true, area: 'sessions' };
const assistant: TabMemoryPlace = { path: '/dashboard/urgans', onTab: true, area: 'urgans' };

describe('nextHomeMemory', () => {
  it('remembers a rollout opened over Home', () => {
    expect(nextHomeMemory(null, home, rollout)).toBe(rollout.path);
  });

  it('keeps it while you are on other tabs', () => {
    expect(nextHomeMemory(rollout.path, rollout, sessions)).toBe(rollout.path);
    expect(nextHomeMemory(rollout.path, sessions, assistant)).toBe(rollout.path);
    expect(nextHomeMemory(rollout.path, assistant, home)).toBe(rollout.path);
  });

  it('forgets it when you go back to the list from the rollout itself', () => {
    expect(nextHomeMemory(rollout.path, rollout, home)).toBeNull();
  });

  it('follows you to the next page you open over Home', () => {
    const artist = { path: '/dashboard/a1', onTab: false, area: 'artists' };
    expect(nextHomeMemory(rollout.path, home, artist)).toBe('/dashboard/a1');
  });

  it('ignores pages that belong to no tab', () => {
    const settings = { path: '/dashboard/opportunities', onTab: false, area: null };
    expect(nextHomeMemory(rollout.path, sessions, settings)).toBe(rollout.path);
  });
});

describe('sign-out clears the remembered places', () => {
  it('names both keys, and the auth store removes them by key', async () => {
    const { readFileSync } = await import('node:fs');
    const { TAB_MEMORY_STORAGE_KEYS } = await import('./tab-memory');
    expect(TAB_MEMORY_STORAGE_KEYS).toEqual(['urganize.tab-memory.home', 'urganize.tab-memory.rollout-chat']);
    expect(readFileSync('lib/auth-store.ts', 'utf8')).toContain('for (const key of TAB_MEMORY_STORAGE_KEYS) window.sessionStorage.removeItem(key);');
  });
});
