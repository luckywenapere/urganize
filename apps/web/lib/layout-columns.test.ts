import { describe, expect, it } from 'vitest';
import {
  APP_FRAME_MAX_WIDTH,
  CALENDAR_GRID_MIN_WIDTH,
  MAIN_HORIZONTAL_PADDING,
  MAIN_MINIMUM,
  TIMELINE_GRID_MIN_WIDTH,
  appFrameWidth,
  appLayoutGutter,
  mainContentWidth,
} from './layout-columns';
import { DEFAULT_RAIL_WIDTH, RAIL_MENU_ONLY_WIDTH, railColumnTotal } from './rail-width';
import { DEFAULT_SIDEBAR_WIDTH, sidebarTotalWidth } from './sidebar-width';

/** The side menu at its shipped width, and gone. */
const CARD = sidebarTotalWidth(DEFAULT_SIDEBAR_WIDTH, false);

describe('appLayoutGutter', () => {
  it('follows .app-layout’s clamp(24px, 3vw, 56px)', () => {
    expect(appLayoutGutter(600)).toBe(24); // 3vw = 18 -> floor of 24
    expect(appLayoutGutter(1000)).toBe(30);
    expect(appLayoutGutter(1440)).toBeCloseTo(43.2, 5);
    expect(appLayoutGutter(3000)).toBe(56); // 3vw = 90 -> ceiling of 56
  });
});

describe('appFrameWidth', () => {
  it('is the viewport minus a gutter on each side below the frame’s cap', () => {
    // 1280: gutter 38.4 each side.
    expect(appFrameWidth(1280)).toBeCloseTo(1280 - 2 * 38.4, 5);
    expect(appFrameWidth(1024)).toBeCloseTo(1024 - 2 * 30.72, 5);
  });

  it('never exceeds AppShell’s max-w-[1440px], however wide the monitor', () => {
    expect(APP_FRAME_MAX_WIDTH).toBe(1440);
    for (const viewport of [1920, 2560, 3440, 5120]) {
      expect(appFrameWidth(viewport)).toBe(APP_FRAME_MAX_WIDTH);
    }
  });

  it('never returns a negative or non-finite width', () => {
    for (const viewport of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const width = appFrameWidth(viewport);
      expect(Number.isFinite(width)).toBe(true);
      expect(width).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('mainContentWidth', () => {
  it('is the frame minus both columns and <main>’s own side padding', () => {
    const viewport = 1440;
    expect(
      mainContentWidth({ viewportWidth: viewport, leftColumnTotal: CARD, rightColumnTotal: 452 })
    ).toBeCloseTo(appFrameWidth(viewport) - CARD - 452 - MAIN_HORIZONTAL_PADDING, 5);
  });

  it('uses lg:px-8 on each side for that padding', () => {
    expect(MAIN_HORIZONTAL_PADDING).toBe(64);
  });

  it('is never negative', () => {
    expect(
      mainContentWidth({ viewportWidth: 320, leftColumnTotal: CARD, rightColumnTotal: 900 })
    ).toBe(0);
  });
});

/**
 * THE WIDTH BUDGET. The right-hand column is a flex sibling of <main>, and two
 * release scenes swap layout on CONTAINER queries of the centre column, so a
 * column that is a little too wide silently turns a week grid into the phone
 * list. These pin the consequences of RAIL_MENU_ONLY_WIDTH rather than the
 * number itself: raising 208 to 240 "because the labels look cramped" fails
 * here and forces the trade to be made on purpose.
 */
describe('the right-hand column’s width budget', () => {
  const menuOnly = railColumnTotal(RAIL_MENU_ONLY_WIDTH);

  it('states the container thresholds it defends, in pixels', () => {
    // 45rem and 34rem — .cc-scene-container and .tl-scene-container in
    // globals.css. If those CSS numbers move, these constants must move with
    // them or the guard below protects a threshold that no longer exists.
    expect(CALENDAR_GRID_MIN_WIDTH).toBe(720);
    expect(TIMELINE_GRID_MIN_WIDTH).toBe(544);
    expect(MAIN_MINIMUM).toBeGreaterThan(TIMELINE_GRID_MIN_WIDTH);
  });

  it('keeps the content calendar’s month grid on a 1440px window with only the menu showing', () => {
    // The reason the menu-only column is 208px and not 256px: at 256 the month
    // grid flips to the agenda list at exactly this width.
    const width = mainContentWidth({
      viewportWidth: 1440,
      leftColumnTotal: CARD,
      rightColumnTotal: menuOnly,
    });
    expect(width).toBeGreaterThanOrEqual(CALENDAR_GRID_MIN_WIDTH);
  });

  it('keeps the timeline’s week grid on a 1280px window with the side menu open', () => {
    const width = mainContentWidth({
      viewportWidth: 1280,
      leftColumnTotal: CARD,
      rightColumnTotal: menuOnly,
    });
    expect(width).toBeGreaterThanOrEqual(TIMELINE_GRID_MIN_WIDTH);
  });

  it('keeps the timeline’s week grid on a 1024px window, where the side menu steps aside', () => {
    // Between lg and xl the identity card hides itself whenever the right
    // column is on screen, so there is one side column, not two.
    const width = mainContentWidth({
      viewportWidth: 1024,
      leftColumnTotal: 0,
      rightColumnTotal: menuOnly,
    });
    expect(width).toBeGreaterThanOrEqual(TIMELINE_GRID_MIN_WIDTH);
  });

  it('leaves the chat-open layout exactly where it is today', () => {
    // The chat width and the side menu are unchanged, so an account that never
    // touches the new menu sees the same centre column it saw before. 534 is
    // the figure the width review recorded for a 1440px window.
    const width = mainContentWidth({
      viewportWidth: 1440,
      leftColumnTotal: CARD,
      rightColumnTotal: railColumnTotal(DEFAULT_RAIL_WIDTH),
    });
    expect(Math.round(width)).toBe(534);
  });

  it('gives the menu-only column strictly more room than the chat column', () => {
    for (const viewport of [1024, 1280, 1440, 1920]) {
      const left = viewport >= 1280 ? CARD : 0;
      const withChat = mainContentWidth({
        viewportWidth: viewport,
        leftColumnTotal: left,
        rightColumnTotal: railColumnTotal(DEFAULT_RAIL_WIDTH),
      });
      const withMenu = mainContentWidth({
        viewportWidth: viewport,
        leftColumnTotal: left,
        rightColumnTotal: menuOnly,
      });
      expect(withMenu).toBeGreaterThan(withChat);
    }
  });
});
