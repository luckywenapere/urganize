import { describe, expect, it } from 'vitest';
import { NAV_TIP_OPEN_DELAY_MS, NAV_TIP_WARM_WINDOW_MS, navTipDelay } from './nav-tip-timing';

const base = { now: 10_000, lastClosedAt: null, tipOpen: false, viaKeyboard: false };

describe('navTipDelay', () => {
  it('waits half a second on a first hover', () => {
    expect(NAV_TIP_OPEN_DELAY_MS).toBe(500);
    expect(navTipDelay(base)).toBe(NAV_TIP_OPEN_DELAY_MS);
  });

  it('shows at once for keyboard focus', () => {
    expect(navTipDelay({ ...base, viaKeyboard: true })).toBe(0);
  });

  it('shows at once when moving from one open tip to the next item', () => {
    expect(navTipDelay({ ...base, tipOpen: true })).toBe(0);
  });

  it('shows at once just after a tip closed, inside the warm window', () => {
    expect(navTipDelay({ ...base, lastClosedAt: base.now - (NAV_TIP_WARM_WINDOW_MS - 1) })).toBe(0);
  });

  it('waits again once the warm window has passed', () => {
    expect(navTipDelay({ ...base, lastClosedAt: base.now - NAV_TIP_WARM_WINDOW_MS })).toBe(NAV_TIP_OPEN_DELAY_MS);
  });

  it('ignores a close time in the future rather than skipping the wait', () => {
    expect(navTipDelay({ ...base, lastClosedAt: base.now + 50 })).toBe(NAV_TIP_OPEN_DELAY_MS);
  });
});

describe('touch: press and hold', () => {
  it('uses the platform long-press and linger times', async () => {
    const m = await import('./nav-tip-timing');
    expect(m.NAV_TIP_LONG_PRESS_MS).toBe(500);
    expect(m.NAV_TIP_TOUCH_LINGER_MS).toBe(1500);
  });

  it('treats a small wobble as a hold and a longer move as a scroll', async () => {
    const { touchMovedTooFar, NAV_TIP_MOVE_TOLERANCE_PX } = await import('./nav-tip-timing');
    expect(touchMovedTooFar(3, 4)).toBe(false);
    expect(touchMovedTooFar(NAV_TIP_MOVE_TOLERANCE_PX, 0)).toBe(false);
    expect(touchMovedTooFar(0, NAV_TIP_MOVE_TOLERANCE_PX + 1)).toBe(true);
  });
});
