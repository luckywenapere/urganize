import { describe, expect, it } from 'vitest';
import {
  AT_TOP_PX,
  PULL_OPEN_PX,
  SCROLL_HIDE_PX,
  isPanelShown,
  shouldHideOnScroll,
  shouldRevealOnPull,
} from './pull-reveal';

describe('shouldRevealOnPull', () => {
  it('opens once a pull from the top is long enough', () => {
    expect(shouldRevealOnPull({ startedAtTop: true, startY: 100, currentY: 100 + PULL_OPEN_PX })).toBe(true);
  });
  it('ignores a short pull', () => {
    expect(shouldRevealOnPull({ startedAtTop: true, startY: 100, currentY: 100 + PULL_OPEN_PX - 1 })).toBe(false);
  });
  it('ignores a pull that did not start at the top', () => {
    expect(shouldRevealOnPull({ startedAtTop: false, startY: 100, currentY: 400 })).toBe(false);
  });
  it('ignores an upward drag', () => {
    expect(shouldRevealOnPull({ startedAtTop: true, startY: 400, currentY: 100 })).toBe(false);
  });
  it('treats the top as a couple of pixels, not exactly zero', () => {
    expect(AT_TOP_PX).toBeGreaterThan(0);
  });
});

describe('shouldHideOnScroll', () => {
  it('folds away after scrolling down past the threshold', () => {
    expect(shouldHideOnScroll({ scrollTop: SCROLL_HIDE_PX + 1, focused: false })).toBe(true);
  });
  it('stays while near the top', () => {
    expect(shouldHideOnScroll({ scrollTop: SCROLL_HIDE_PX, focused: false })).toBe(false);
  });
  it('never folds while the person is typing', () => {
    expect(shouldHideOnScroll({ scrollTop: 900, focused: true })).toBe(false);
  });
});

describe('isPanelShown', () => {
  it('is hidden on a phone by default', () => {
    expect(isPanelShown({ revealed: false, filtering: false, wide: false })).toBe(false);
  });
  it('shows when revealed', () => {
    expect(isPanelShown({ revealed: true, filtering: false, wide: false })).toBe(true);
  });
  it('stays visible while a search or filter is active', () => {
    expect(isPanelShown({ revealed: false, filtering: true, wide: false })).toBe(true);
  });
  it('always shows on a wide screen', () => {
    expect(isPanelShown({ revealed: false, filtering: false, wide: true })).toBe(true);
  });
});
