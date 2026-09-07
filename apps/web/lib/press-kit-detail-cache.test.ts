import { beforeEach, describe, expect, it } from 'vitest';

import {
  KIT_DETAIL_CACHE_TTL_MS,
  clearKitDetailCache,
  readCachedKitDetail,
  writeCachedKitDetail,
} from './press-kit-detail-cache';
import type { PressKitDetailSnapshot } from './press-kit-detail-cache';

const snapshot = (over: Partial<PressKitDetailSnapshot> = {}): PressKitDetailSnapshot => ({
  kit: null,
  artistName: 'Dorian',
  sections: [],
  assets: [],
  aiAvailable: false,
  ...over,
});

describe('press kit detail cache', () => {
  beforeEach(() => clearKitDetailCache());

  it('hands back what was written', () => {
    writeCachedKitDetail('kit-1', snapshot(), 1_000);
    expect(readCachedKitDetail('kit-1', 1_000)?.artistName).toBe('Dorian');
  });

  it('answers null for a kit it has never seen', () => {
    expect(readCachedKitDetail('kit-unknown', 1_000)).toBeNull();
  });

  it('keeps kits apart', () => {
    writeCachedKitDetail('kit-1', snapshot({ artistName: 'One' }), 0);
    writeCachedKitDetail('kit-2', snapshot({ artistName: 'Two' }), 0);
    expect(readCachedKitDetail('kit-1', 0)?.artistName).toBe('One');
    expect(readCachedKitDetail('kit-2', 0)?.artistName).toBe('Two');
  });

  it('serves an entry right up to the TTL', () => {
    writeCachedKitDetail('kit-1', snapshot(), 0);
    expect(readCachedKitDetail('kit-1', KIT_DETAIL_CACHE_TTL_MS)).not.toBeNull();
  });

  it('expires one past the TTL, because the photo URLs inside it do', () => {
    writeCachedKitDetail('kit-1', snapshot(), 0);
    expect(readCachedKitDetail('kit-1', KIT_DETAIL_CACHE_TTL_MS + 1)).toBeNull();
  });

  it('drops an expired entry rather than leaving it to be re-read', () => {
    writeCachedKitDetail('kit-1', snapshot(), 0);
    readCachedKitDetail('kit-1', KIT_DETAIL_CACHE_TTL_MS + 1);
    // Even asked again at a time the entry would have been fresh for, it is
    // gone: an expired read evicts.
    expect(readCachedKitDetail('kit-1', 0)).toBeNull();
  });

  it('treats a clock that went backwards as expired rather than fresh forever', () => {
    writeCachedKitDetail('kit-1', snapshot(), 10_000);
    expect(readCachedKitDetail('kit-1', 0)).toBeNull();
  });

  it('a later write replaces the earlier one and restarts the clock', () => {
    writeCachedKitDetail('kit-1', snapshot({ artistName: 'Old' }), 0);
    writeCachedKitDetail('kit-1', snapshot({ artistName: 'New' }), 200_000);
    expect(readCachedKitDetail('kit-1', 200_000)?.artistName).toBe('New');
  });

  it('clears everything on sign-out', () => {
    writeCachedKitDetail('kit-1', snapshot(), 0);
    clearKitDetailCache();
    expect(readCachedKitDetail('kit-1', 0)).toBeNull();
  });

  it('stays well inside the signed URL lifetime it is caching', () => {
    // A URL handed to us can already be 80% through its one hour life (the
    // server re-signs at that point), so the worst case remaining validity is
    // twelve minutes. The TTL has to be comfortably under that.
    const worstCaseRemainingMs = 3600 * 1000 * 0.2;
    expect(KIT_DETAIL_CACHE_TTL_MS).toBeLessThan(worstCaseRemainingMs / 2);
  });
});
