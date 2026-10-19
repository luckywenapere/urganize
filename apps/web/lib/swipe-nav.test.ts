import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RUBBER_BAND_PX,
  clampDrag,
  describeRole,
  initialsFor,
  lerpIndicator,
  lockDirection,
  readSwipeNavQuery,
  readUrgansLink,
  resolveSwipeNav,
  settleIndex,
  springAtRest,
  springStep,
  swipeAreaForPath,
  swipeTabForPath,
} from './swipe-nav';

describe('swipe navigation switch', () => {
  it('is on by default, with swipe_nav: false and the kill switch as the only ways off', () => {
    expect(resolveSwipeNav({ metadata: {} })).toBe(true);
    expect(resolveSwipeNav({ metadata: null })).toBe(true);
    expect(resolveSwipeNav({ metadata: undefined })).toBe(true);
    expect(resolveSwipeNav({ metadata: { swipe_nav: true } })).toBe(true);
    expect(resolveSwipeNav({ metadata: { swipe_nav: 'yes' } })).toBe(true);
    expect(resolveSwipeNav({ metadata: { swipe_nav: false } })).toBe(false);
    expect(resolveSwipeNav({ metadata: { swipe_nav: 'false' } })).toBe(false);
    expect(resolveSwipeNav({ allOff: true, metadata: { swipe_nav: true } })).toBe(false);
    expect(resolveSwipeNav({ allOff: false, metadata: {} })).toBe(true);
  });

  it('reads ?nav= as on, off or nothing', () => {
    expect(readSwipeNavQuery('swipe')).toBe(true);
    expect(readSwipeNavQuery('classic')).toBe(false);
    expect(readSwipeNavQuery('other')).toBeNull();
    expect(readSwipeNavQuery(null)).toBeNull();
  });
});

describe('tabs and areas', () => {
  it('knows the three tab routes and nothing else', () => {
    expect(swipeTabForPath('/dashboard/home')).toBe('home');
    expect(swipeTabForPath('/dashboard/urgans/')).toBe('urgans');
    expect(swipeTabForPath('/dashboard/artists')).toBe('artists');
    expect(swipeTabForPath('/dashboard/artists/abc')).toBeNull();
    expect(swipeTabForPath('/dashboard')).toBeNull();
  });

  it('lights Artists on catalogue screens and nothing on settings', () => {
    expect(swipeAreaForPath('/dashboard')).toBe('artists');
    expect(swipeAreaForPath('/dashboard/artists/abc')).toBe('artists');
    expect(swipeAreaForPath('/dashboard/releases/x')).toBe('artists');
    expect(swipeAreaForPath('/dashboard/opportunities')).toBeNull();
  });
});

describe('gestures', () => {
  it('waits 10px, then picks an axis with a 1.2 bias', () => {
    expect(lockDirection(5, 5)).toBe('undecided');
    expect(lockDirection(13, 10)).toBe('horizontal');
    expect(lockDirection(12, 10)).toBe('vertical');
    expect(lockDirection(0, -20)).toBe('vertical');
  });

  it('gives at most 24px past the first and last page', () => {
    expect(clampDrag(200, 0, 3)).toBe(RUBBER_BAND_PX);
    expect(clampDrag(-200, 2, 3)).toBe(-RUBBER_BAND_PX);
    expect(clampDrag(10, 0, 3)).toBe(5);
    expect(clampDrag(-150, 0, 3)).toBe(-150);
  });

  it('settles past half the width or on a fast flick, else snaps back', () => {
    const base = { count: 3, width: 390 };
    expect(settleIndex({ ...base, index: 0, dx: -200, velocity: 0 })).toBe(1);
    expect(settleIndex({ ...base, index: 0, dx: -100, velocity: 0 })).toBe(0);
    expect(settleIndex({ ...base, index: 0, dx: -40, velocity: -800 })).toBe(1);
    expect(settleIndex({ ...base, index: 1, dx: 60, velocity: 900 })).toBe(0);
    expect(settleIndex({ ...base, index: 2, dx: -300, velocity: -900 })).toBe(2);
  });
});

describe('the spring', () => {
  it('settles in about 350ms without visible overshoot', () => {
    let state = { position: 0, velocity: 0 };
    let t = 0;
    let max = 0;
    while (!springAtRest(state, 1) && t < 2) {
      state = springStep(state, 1, 1 / 120);
      t += 1 / 120;
      max = Math.max(max, state.position);
    }
    expect(t).toBeLessThan(0.6);
    expect(max).toBeLessThan(1.02);
  });

  it('lerps the underline between two tabs', () => {
    const rects = [
      { left: 0, width: 50 },
      { left: 70, width: 60 },
    ];
    expect(lerpIndicator(rects, 0)).toEqual({ left: 0, width: 50 });
    expect(lerpIndicator(rects, 0.5)).toEqual({ left: 35, width: 55 });
    expect(lerpIndicator(rects, 5)).toEqual({ left: 70, width: 60 });
  });
});

describe('links and labels', () => {
  it('reads sessions, messages and card links', () => {
    expect(readUrgansLink('?s=abc')).toEqual({ session: 'abc', message: null, fromCard: null });
    expect(readUrgansLink('?m=m1')).toEqual({ session: null, message: 'm1', fromCard: null });
    expect(readUrgansLink('?from=card:k1')).toEqual({ session: null, message: null, fromCard: 'k1' });
    expect(readUrgansLink('?from=other')).toEqual({ session: null, message: null, fromCard: null });
  });

  it('writes a short role and initials', () => {
    expect(describeRole('artist-manager')).toBe('Manager');
    expect(describeRole('something')).toBeNull();
    expect(initialsFor('Bisi Dada')).toBe('BD');
    expect(initialsFor('Oyin')).toBe('OY');
    expect(initialsFor('')).toBe('·');
  });
});

describe('flag isolation (guard)', () => {
  const web = join(__dirname, '..');
  const frame = readFileSync(join(web, 'components/app/WorkspaceFrame.tsx'), 'utf8');

  it('loads the swipe chrome lazily, so flag-off users download none of it', () => {
    expect(frame).toMatch(/dynamic\(\(\) =>\s*import\('@\/components\/shell\/swipe\/SwipeFrame'\)/);
    expect(frame).not.toMatch(/^import .*shell\/swipe\/SwipeFrame/m);
  });

  it('keeps the old chrome as the default branch', () => {
    expect(frame).toMatch(/if \(swipeNav && showWorkspaceChrome\)/);
    expect(frame).toMatch(/<BottomBar showHelp=\{showHelpMenu\} \/>/);
  });

  it('styles only under :root[data-swipe-nav] or swipe-only classes', () => {
    const css = readFileSync(join(web, 'app/globals.css'), 'utf8');
    const start = css.indexOf('── Swipe navigation (URG-380)');
    // The block ends where the next section header begins (later sections, like
    // the email confirmation screens, are not the swipe nav's).
    const next = css.indexOf('/* ── ', start);
    const block = css.slice(start, next === -1 ? undefined : next);
    const selectors = block
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('{')
      .map((part) => part.split('}').pop()!.trim())
      .filter((sel) => sel && !sel.startsWith('@') && !/^(from|to)$/.test(sel));
    for (const selector of selectors) {
      expect(selector).toMatch(/data-swipe-nav|\.swipe-/);
    }
  });
});
