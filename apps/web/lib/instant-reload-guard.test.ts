import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Instant reload (Nov 2, 2026): the saved account and roster paint before the
// network checks finish. These guards hold the two safety rules in place.
const read = (file: string) => readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('the early auth gate', () => {
  const source = read('lib/auth-store.ts');

  it('opens only for the same account the live session belongs to', () => {
    expect(source).toMatch(
      /saved\.isLoading && saved\.isAuthenticated && saved\.user && saved\.user\.id === session\.user\.id\) \{\s*set\(\{ isLoading: false \}\);/
    );
  });

  it('opens before the network checks, which still run after it', () => {
    const gate = source.indexOf('saved.user.id === session.user.id');
    const verify = source.indexOf('await supabase.auth.getUser()', gate);
    expect(gate).toBeGreaterThan(0);
    expect(verify).toBeGreaterThan(gate);
  });

  it('clears the saved roster on every sign-out, by key', () => {
    expect(source).toContain('window.localStorage.removeItem(ROSTER_CACHE_KEY);');
  });
});

describe('the saved roster', () => {
  const source = read('stores/useArtistRosterStore.ts');

  it('is only used for the account it was saved for', () => {
    expect(source).toContain('if (saved && saved.userId === userId) set({ artists: saved.artists, loaded: true });');
  });

  it('expires within a day, since its photo links do', () => {
    expect(source).toMatch(/ROSTER_CACHE_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000/);
  });
});

describe('the task view reuses its lists only for the same account', () => {
  const source = read('components/tasks/TaskUIEngine.tsx');

  it('checks the signed-in account before reusing', () => {
    expect(source).toMatch(/optionsUserIdRef\.current === userId &&\s*Date\.now\(\) - optionsLoadedAtRef\.current < OPTIONS_FRESH_MS/);
  });

  it('clears another account\'s lists before loading', () => {
    expect(source).toMatch(/if \(optionsUserIdRef\.current !== userId\) \{[\s\S]{0,200}setReleases\(\[\]\);\s*setMembers\(\[\]\);/);
  });
});
