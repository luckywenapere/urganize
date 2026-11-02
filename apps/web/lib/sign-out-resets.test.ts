import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  SIGN_OUT_RESET_ORDER,
  registerSignOutReset,
  runSignOutResets,
  type SignOutResetId,
} from './sign-out-resets';

const WEB = join(__dirname, '..');
const read = (...parts: string[]) => readFileSync(join(WEB, ...parts), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Each per-account store and the id it must register under. A store that
// holds one account's data and is missing here survives a same-tab account
// switch, which is the bug the old static resets in auth-store prevented.
const REGISTRANTS: Record<SignOutResetId, string> = {
  'scene-data': 'stores/useSceneDataStore.ts',
  'press-kits': 'stores/usePressKitsStore.ts',
  'press-kit-detail': 'lib/press-kit-detail-cache.ts',
  'artist-roster': 'stores/useArtistRosterStore.ts',
  relationships: 'stores/useRelationshipsStore.ts',
  opportunities: 'stores/useOpportunitiesStore.ts',
  'spend-access': 'stores/useSpendAccessStore.ts',
  'chappi-history': 'stores/useChappiHistoryStore.ts',
  chappi: 'stores/useChappiStore.ts',
  releases: 'stores/useReleaseStore.ts',
  tasks: 'stores/useTaskStore.ts',
  activity: 'stores/useActivityStore.ts',
  home: 'stores/useHomeStore.ts',
  'swipe-nav': 'stores/useSwipeNavStore.ts',
  'sessions-view': 'stores/useSessionsViewStore.ts',
  'tab-memory': 'stores/useTabMemoryStore.ts',
  'needs-you': 'stores/useNeedsYouStore.ts',
};

describe('sign-out reset registry', () => {
  it('every id in the order is registered by its store', () => {
    for (const id of SIGN_OUT_RESET_ORDER) {
      const file = REGISTRANTS[id];
      expect(file, id).toBeTruthy();
      expect(stripComments(read(file)), file).toContain(`registerSignOutReset('${id}'`);
    }
  });

  it('runs chat history before the transcript it watches', () => {
    expect(SIGN_OUT_RESET_ORDER.indexOf('chappi-history')).toBeLessThan(
      SIGN_OUT_RESET_ORDER.indexOf('chappi')
    );
  });

  it('runs registered resets in order and keeps going past one that throws', () => {
    const calls: string[] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerSignOutReset('chappi', () => calls.push('chappi'));
    registerSignOutReset('chappi-history', () => {
      calls.push('chappi-history');
      throw new Error('boom');
    });
    registerSignOutReset('home', () => calls.push('home'));
    runSignOutResets();
    expect(calls).toEqual(['chappi-history', 'chappi', 'home']);
    errorSpy.mockRestore();
  });

  it('keeps auth-store free of value imports from stores (the shared bundle)', () => {
    const auth = stripComments(read('lib/auth-store.ts'));
    expect(auth).not.toMatch(/from ['"]@\/stores\//);
    expect(auth).toContain('runSignOutResets();');
  });

  it('still clears browser-storage copies by key on every sign-out', () => {
    const auth = read('lib/auth-store.ts');
    const signedOut = auth.slice(auth.indexOf("event === 'SIGNED_OUT'"), auth.indexOf("event === 'SIGNED_IN'"));
    for (const call of [
      'localStorage.removeItem(SCENE_CACHE_KEY)',
      'clearChatCache();',
      'resetSceneMemory();',
      'resetCatalogIntent();',
      'clearDeferredFirstShare();',
      'clearFirstSession();',
      'void clearAppCaches();',
    ]) {
      expect(signedOut, call).toContain(call);
    }
  });

  it('keeps the registry free of imports (it is on the shared chain)', () => {
    expect(stripComments(read('lib/sign-out-resets.ts'))).not.toMatch(/^import /m);
  });
});

describe('Needs you store', () => {
  it('forgets its notices on sign-out', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/client', () => ({ supabase: {} }));
    const { useNeedsYouStore } = await import('@/stores/useNeedsYouStore');
    const { runSignOutResets: run } = await import('./sign-out-resets');
    useNeedsYouStore.setState({ items: [{ id: 'n1', read: false } as never], loaded: true });
    run();
    expect(useNeedsYouStore.getState().items).toEqual([]);
    expect(useNeedsYouStore.getState().loaded).toBe(false);
  });
});
