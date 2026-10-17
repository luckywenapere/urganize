import { describe, expect, it } from 'vitest';
import { barNeverCollapsesOn, nextBarCollapsed } from './bar-collapse';

const long = { scrollHeight: 2000, clientHeight: 800 };

describe('nextBarCollapsed', () => {
  it('folds on a real scroll down', () => {
    expect(nextBarCollapsed({ top: 300, previous: 200, ...long })).toBe(true);
  });

  it('stays folded on a scroll up that stops short of the top', () => {
    expect(nextBarCollapsed({ top: 200, previous: 300, ...long })).toBeNull();
    expect(nextBarCollapsed({ top: 30, previous: 900, ...long })).toBeNull();
  });

  it('ignores a wobble smaller than a step', () => {
    expect(nextBarCollapsed({ top: 310, previous: 300, ...long })).toBeNull();
  });

  it('is always open at the very top', () => {
    expect(nextBarCollapsed({ top: 10, previous: 400, ...long })).toBe(false);
  });

  it('never reacts on a page that cannot scroll, however far it is dragged', () => {
    const short = { scrollHeight: 820, clientHeight: 800 };
    expect(nextBarCollapsed({ top: 300, previous: 0, ...short })).toBeNull();
    expect(nextBarCollapsed({ top: 100, previous: 0, scrollHeight: 800, clientHeight: 800 })).toBeNull();
  });

  it('ignores a rubber-band stretch past either end', () => {
    expect(nextBarCollapsed({ top: -40, previous: 10, ...long })).toBeNull();
    expect(nextBarCollapsed({ top: 1290, previous: 1100, ...long })).toBeNull();
  });
});

describe('barNeverCollapsesOn', () => {
  it('holds the bar open in UrgAns only', () => {
    expect(barNeverCollapsesOn('/dashboard/urgans')).toBe(true);
    expect(barNeverCollapsesOn('/dashboard/urgans/abc')).toBe(true);
    expect(barNeverCollapsesOn('/dashboard/home')).toBe(false);
    expect(barNeverCollapsesOn('/dashboard')).toBe(false);
  });
});
