import { describe, expect, it } from 'vitest';
import { MAIN_MINIMUM } from './layout-columns';
import {
  COLLAPSED_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSE_AT,
  SIDEBAR_GUTTERS,
  clampSidebarWidth,
  isSidebarResizable,
  parsePersistedSidebarWidth,
  resolveSidebarBounds,
  sidebarIsOnScreen,
  sidebarStateFromDrag,
  sidebarStateFromStep,
  sidebarTotalWidth,
} from './sidebar-width';
import type { SidebarState } from './sidebar-width';

const wide = resolveSidebarBounds(2560, 0);

describe('resolveSidebarBounds', () => {
  it('leaves the centre column enough room to still be a workspace', () => {
    // The card is a flex SIBLING of <main>, not an overlay, so every pixel it
    // takes comes out of the release view.
    const bounds = resolveSidebarBounds(1280, 0);
    expect(bounds.resizable).toBe(true);
    expect(bounds.max).toBeLessThanOrEqual(1280 - MAIN_MINIMUM);
    expect(bounds.min).toBe(MIN_SIDEBAR_WIDTH);
  });

  it('gives back the rail’s room when the rail is closed', () => {
    const withRail = resolveSidebarBounds(1440, 452);
    const without = resolveSidebarBounds(1440, 0);
    expect(without.max).toBeGreaterThan(withRail.max);
  });

  it('caps an enormous monitor rather than offering an enormous nav', () => {
    expect(resolveSidebarBounds(3440, 452).max).toBe(MAX_SIDEBAR_WIDTH);
    expect(resolveSidebarBounds(2560, 0).max).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('refuses to resize below lg, where the card does not render at all', () => {
    for (const viewport of [320, 375, 768, 1023]) {
      expect(resolveSidebarBounds(viewport, 0).resizable).toBe(false);
    }
  });

  it('disables resizing rather than offering a handle that cannot move', () => {
    // lg exactly, with an open rail at its widest: there is no room left for
    // the menu to move into, so the handle is withheld.
    const bounds = resolveSidebarBounds(1024, 452);
    expect(bounds.resizable).toBe(false);
    expect(bounds.max).toBe(bounds.min);
  });

  it('never returns a max below the min', () => {
    for (let viewport = 300; viewport <= 3000; viewport += 37) {
      for (const rail of [0, 352, 452, 752]) {
        const bounds = resolveSidebarBounds(viewport, rail);
        expect(bounds.max).toBeGreaterThanOrEqual(bounds.min);
      }
    }
  });

  it('survives a nonsense viewport or rail width', () => {
    for (const viewport of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const bounds = resolveSidebarBounds(viewport, 0);
      expect(bounds.min).toBe(MIN_SIDEBAR_WIDTH);
      expect(Number.isFinite(bounds.max)).toBe(true);
      expect(bounds.max).toBeGreaterThanOrEqual(bounds.min);
    }
    for (const rail of [Number.NaN, Number.POSITIVE_INFINITY, -500]) {
      const bounds = resolveSidebarBounds(1440, rail);
      expect(Number.isFinite(bounds.max)).toBe(true);
      expect(bounds.max).toBeGreaterThanOrEqual(bounds.min);
    }
  });

  it('leaves the default width reachable at lg with the rail closed', () => {
    // The card ships at DEFAULT_SIDEBAR_WIDTH, so the smallest viewport it
    // renders on has to be able to honour it — otherwise every laptop would
    // silently shrink the menu on first load.
    expect(resolveSidebarBounds(1024, 0).max).toBeGreaterThanOrEqual(DEFAULT_SIDEBAR_WIDTH);
  });
});

describe('sidebarTotalWidth', () => {
  it('counts BOTH gutters, not just the one before main', () => {
    // The card carries ml-8 AND mr-8 and both are real horizontal space. The
    // rail's old constant counted one of them and was 32px short.
    expect(sidebarTotalWidth(DEFAULT_SIDEBAR_WIDTH, false)).toBe(
      DEFAULT_SIDEBAR_WIDTH + SIDEBAR_GUTTERS
    );
    expect(SIDEBAR_GUTTERS).toBe(64);
  });

  it('reports the collapsed rail’s width whatever the stored width says', () => {
    // A collapsed card really is 64px wide, so this is what makes collapsing
    // the menu raise the rail's own ceiling.
    expect(sidebarTotalWidth(400, true)).toBe(COLLAPSED_SIDEBAR_WIDTH + SIDEBAR_GUTTERS);
    expect(sidebarTotalWidth(400, true)).toBeLessThan(sidebarTotalWidth(400, false));
  });

  it('falls back to the default on a value that is not a number', () => {
    expect(sidebarTotalWidth(Number.NaN, false)).toBe(DEFAULT_SIDEBAR_WIDTH + SIDEBAR_GUTTERS);
  });
});

describe('clampSidebarWidth', () => {
  it('holds the ends', () => {
    expect(clampSidebarWidth(10, wide)).toBe(wide.min);
    expect(clampSidebarWidth(99999, wide)).toBe(wide.max);
  });

  it('rounds to whole pixels, so sub-pixel jitter is not a state change', () => {
    expect(clampSidebarWidth(240.4, wide)).toBe(240);
    expect(clampSidebarWidth(240.6, wide)).toBe(241);
  });

  it('falls back to the default on a value that is not a number', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(clampSidebarWidth(bad, wide)).toBe(DEFAULT_SIDEBAR_WIDTH);
    }
  });

  it('clamps a stored width that today’s viewport cannot honour', () => {
    // Sized on a big monitor, reopened on a laptop with the rail open at its
    // narrowest. There is still a real range here, so this is a genuine clamp
    // rather than the locked fallback.
    const laptop = resolveSidebarBounds(1280, 352);
    expect(laptop.resizable).toBe(true);
    expect(laptop.max).toBeLessThan(MAX_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(MAX_SIDEBAR_WIDTH, laptop)).toBe(laptop.max);
  });
});

describe('parsePersistedSidebarWidth', () => {
  it('takes a plain number inside the absolute range', () => {
    expect(parsePersistedSidebarWidth(240)).toBe(240);
    expect(parsePersistedSidebarWidth(MIN_SIDEBAR_WIDTH)).toBe(MIN_SIDEBAR_WIDTH);
    expect(parsePersistedSidebarWidth(MAX_SIDEBAR_WIDTH)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('rejects everything else, so a corrupt value falls back to the default', () => {
    for (const bad of [
      '240',
      '240px',
      null,
      undefined,
      {},
      [],
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      0,
      // The collapsed rail's width is NOT a valid stored width: collapsed is
      // its own persisted flag, so a 64 here is a corrupt value.
      COLLAPSED_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH - 1,
      MAX_SIDEBAR_WIDTH + 1,
      true,
    ]) {
      expect(parsePersistedSidebarWidth(bad)).toBeNull();
    }
  });

  it('rounds a float rather than rejecting it', () => {
    expect(parsePersistedSidebarWidth(240.7)).toBe(241);
  });
});

/** The drag's starting state, spelled out at each call site so the assertions
 *  read as "from expanded at 240" / "from the collapsed rail". */
const from = (width: number): SidebarState => ({ collapsed: false, width });
const fromCollapsed: SidebarState = { collapsed: true };

/** Narrow the union without repeating the assertion in every test. */
function expandedWidth(state: SidebarState): number {
  if (state.collapsed) throw new Error('expected an expanded state, got the collapsed rail');
  return state.width;
}

describe('SIDEBAR_COLLAPSE_AT', () => {
  it('sits between the rail and the minimum, so collapsing takes a real overshoot', () => {
    // At the minimum it would fire for anyone who simply drags the card as
    // narrow as it goes; at the rail's own width there would be no travel left
    // to cross it in.
    expect(SIDEBAR_COLLAPSE_AT).toBeGreaterThan(COLLAPSED_SIDEBAR_WIDTH);
    expect(SIDEBAR_COLLAPSE_AT).toBeLessThan(MIN_SIDEBAR_WIDTH);
  });
});

describe('sidebarStateFromDrag', () => {
  it('widens when the pointer moves RIGHT, because the handle is the right edge', () => {
    // The menu is the LEFT column, so this is the opposite sign from the
    // rail's drag. Getting it backwards is the most obvious way for the whole
    // control to feel broken.
    expect(sidebarStateFromDrag(from(240), 300, 400, wide)).toEqual({
      collapsed: false,
      width: 340,
    });
  });

  it('narrows when the pointer moves left', () => {
    expect(sidebarStateFromDrag(from(340), 400, 300, wide)).toEqual({
      collapsed: false,
      width: 240,
    });
  });

  it('clamps at the max rather than overshooting', () => {
    expect(expandedWidth(sidebarStateFromDrag(from(240), 300, 5000, wide))).toBe(wide.max);
  });

  it('collapses once the drag crosses below the threshold', () => {
    // The founder's ask (2026-09-09): keep dragging and it becomes the icon
    // rail, rather than the handle stopping dead at the minimum.
    const past = 300 - (240 - SIDEBAR_COLLAPSE_AT) - 1;
    expect(sidebarStateFromDrag(from(240), 300, past, wide)).toEqual({ collapsed: true });
    expect(sidebarStateFromDrag(from(240), 300, -5000, wide)).toEqual({ collapsed: true });
  });

  it('holds at the minimum through the overshoot instead of rendering a narrower card', () => {
    // MIN_SIDEBAR_WIDTH's own reasoning still stands: an expanded card
    // narrower than that is a worse version of the rail it is about to become,
    // so the card sits pinned at its minimum and then snaps.
    const between = 300 - (240 - MIN_SIDEBAR_WIDTH) - 10;
    const state = sidebarStateFromDrag(from(240), 300, between, wide);
    expect(state.collapsed).toBe(false);
    expect(expandedWidth(state)).toBe(MIN_SIDEBAR_WIDTH);
  });

  it('comes back out of the rail at the minimum, across the same one threshold', () => {
    // One boundary in both directions: cross it going left and the card
    // collapses, cross it going right and it returns at MIN_SIDEBAR_WIDTH.
    const out = 300 + (SIDEBAR_COLLAPSE_AT - COLLAPSED_SIDEBAR_WIDTH);
    expect(sidebarStateFromDrag(fromCollapsed, 300, out, wide)).toEqual({
      collapsed: false,
      width: MIN_SIDEBAR_WIDTH,
    });
  });

  it('stays collapsed until that threshold is crossed', () => {
    expect(sidebarStateFromDrag(fromCollapsed, 300, 310, wide)).toEqual({ collapsed: true });
    expect(sidebarStateFromDrag(fromCollapsed, 300, 200, wide)).toEqual({ collapsed: true });
  });

  it('carries NO width when it collapses, so the stored one cannot be overwritten', () => {
    // The width the user chose has to survive a collapse — expanding restores
    // it rather than the default. A collapsed outcome that carried a width is
    // how that gets clobbered, so the shape refuses to.
    const state = sidebarStateFromDrag(from(400), 300, 0, wide);
    expect(state.collapsed).toBe(true);
    expect('width' in state).toBe(false);
  });

  it('returns the starting state unchanged on a nonsense coordinate', () => {
    // The collapsed case is the one that matters: clamping the rail's 64 would
    // land on the minimum and silently expand a card nobody touched.
    expect(sidebarStateFromDrag(fromCollapsed, Number.NaN, 300, wide)).toEqual(fromCollapsed);
    expect(sidebarStateFromDrag(fromCollapsed, 300, Number.NaN, wide)).toEqual(fromCollapsed);
    expect(sidebarStateFromDrag(from(240), 300, Number.NaN, wide)).toEqual(from(240));
  });

  it('returns the starting width when nothing moved', () => {
    expect(sidebarStateFromDrag(from(240), 300, 300, wide)).toEqual(from(240));
  });

  it('runs opposite to the rail, which is the whole reason it has its own module', () => {
    expect(expandedWidth(sidebarStateFromDrag(from(240), 300, 400, wide))).toBeGreaterThan(240);
    expect(expandedWidth(sidebarStateFromDrag(from(240), 300, 280, wide))).toBeLessThan(240);
  });
});

describe('sidebarStateFromStep', () => {
  it('widens and narrows by the step', () => {
    expect(sidebarStateFromStep(from(240), 16, wide)).toEqual({ collapsed: false, width: 256 });
    expect(sidebarStateFromStep(from(240), -16, wide)).toEqual({ collapsed: false, width: 224 });
  });

  it('collapses one step narrower than the minimum, rather than doing nothing', () => {
    // The keyboard twin of the drag crossing the threshold. Without it the
    // gesture would be reachable with a pointer and not without one.
    expect(sidebarStateFromStep(from(MIN_SIDEBAR_WIDTH), -16, wide)).toEqual({ collapsed: true });
  });

  it('widens out of the rail to the minimum', () => {
    expect(sidebarStateFromStep(fromCollapsed, 16, wide)).toEqual({
      collapsed: false,
      width: MIN_SIDEBAR_WIDTH,
    });
  });

  it('does nothing when narrowing the rail, because nothing is narrower', () => {
    expect(sidebarStateFromStep(fromCollapsed, -16, wide)).toEqual(fromCollapsed);
  });

  it('clamps at the max', () => {
    expect(expandedWidth(sidebarStateFromStep(from(wide.max), 64, wide))).toBe(wide.max);
  });

  it('carries no width when it collapses', () => {
    const state = sidebarStateFromStep(from(MIN_SIDEBAR_WIDTH), -64, wide);
    expect(state.collapsed).toBe(true);
    expect('width' in state).toBe(false);
  });
});

describe('isSidebarResizable', () => {
  it('matches the lg breakpoint the card itself renders at', () => {
    expect(isSidebarResizable(1023)).toBe(false);
    expect(isSidebarResizable(1024)).toBe(true);
  });
});

describe('sidebarIsOnScreen', () => {
  // The card's own className is `hidden lg:block`, or `hidden xl:block` while the
  // right-hand column is competing for the row and the card is expanded. This
  // says the same thing in a place a test can reach, so the write-back that
  // corrects a stored width only ever runs for a card somebody can see.
  const states = [
    { competing: false, collapsed: false },
    { competing: false, collapsed: true },
    { competing: true, collapsed: false },
    { competing: true, collapsed: true },
  ];

  it('is never on screen below lg, whatever else is true', () => {
    for (const state of states) expect(sidebarIsOnScreen(1023, state)).toBe(false);
  });

  it('is on screen from lg while nothing is competing for the row', () => {
    expect(sidebarIsOnScreen(1024, { competing: false, collapsed: false })).toBe(true);
  });

  it('steps aside until xl while the right-hand column is on screen', () => {
    const competing = { competing: true, collapsed: false };
    expect(sidebarIsOnScreen(1024, competing)).toBe(false);
    expect(sidebarIsOnScreen(1279, competing)).toBe(false);
    expect(sidebarIsOnScreen(1280, competing)).toBe(true);
  });

  it('lets a collapsed card sit beside the column from lg', () => {
    expect(sidebarIsOnScreen(1024, { competing: true, collapsed: true })).toBe(true);
  });

  it('is off screen for a viewport that has not been measured', () => {
    for (const state of states) {
      expect(sidebarIsOnScreen(0, state)).toBe(false);
      expect(sidebarIsOnScreen(Number.NaN, state)).toBe(false);
    }
  });
});
