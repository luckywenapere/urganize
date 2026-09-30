import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  sidebarTotalWidth,
} from './sidebar-width';
import {
  DEFAULT_RAIL_WIDTH,
  MAX_RAIL_WIDTH,
  MIN_RAIL_WIDTH,
  RAIL_GUTTER,
  RAIL_MENU_ONLY_WIDTH,
  clampRailWidth,
  isRailResizable,
  parsePersistedRailWidth,
  railColumnTotal,
  railColumnWidth,
  railWidthFromDrag,
  resolveRailBounds,
} from './rail-width';

/** What the side menu takes at its shipped width, imported rather than
 *  written out so the two modules cannot drift on the arithmetic. */
const CARD = sidebarTotalWidth(DEFAULT_SIDEBAR_WIDTH, false);

const wide = resolveRailBounds(2560, 0);

describe('resolveRailBounds', () => {
  it('leaves the centre column enough room to still be a workspace', () => {
    // The rail is a flex SIBLING of <main>, not an overlay, so every pixel it
    // takes comes out of the release view. The cap is what stops somebody
    // dragging the workspace into a gutter.
    const bounds = resolveRailBounds(1280, CARD);
    expect(bounds.resizable).toBe(true);
    expect(bounds.max).toBeLessThan(1280 - 560);
    expect(bounds.min).toBe(MIN_RAIL_WIDTH);
  });

  it('shrinks as the side menu is dragged wider', () => {
    // THE COUPLING THIS PARAMETER EXISTS FOR. The menu is draggable, so a
    // constant reservation under-reserves the moment somebody widens it — and
    // the pixels it under-reserves come straight out of MAIN_MINIMUM, which is
    // the container-query degradation both modules exist to prevent.
    const narrow = resolveRailBounds(1440, sidebarTotalWidth(DEFAULT_SIDEBAR_WIDTH, false));
    const dragged = resolveRailBounds(1440, sidebarTotalWidth(MAX_SIDEBAR_WIDTH, false));
    expect(dragged.max).toBeLessThan(narrow.max);
    expect(narrow.max - dragged.max).toBe(MAX_SIDEBAR_WIDTH - DEFAULT_SIDEBAR_WIDTH);
  });

  it('gets room back when the side menu is collapsed', () => {
    // Collapsing is the user's own fix for a squeezed centre column, so it has
    // to actually raise the rail's ceiling rather than only shrink the card.
    const expanded = resolveRailBounds(1440, sidebarTotalWidth(DEFAULT_SIDEBAR_WIDTH, false));
    const collapsed = resolveRailBounds(1440, sidebarTotalWidth(DEFAULT_SIDEBAR_WIDTH, true));
    expect(collapsed.max).toBeGreaterThan(expanded.max);
  });

  it('gives back the identity card’s room when it is not there', () => {
    const withCard = resolveRailBounds(1440, CARD);
    const without = resolveRailBounds(1440, 0);
    expect(without.max).toBeGreaterThan(withCard.max);
  });

  it('caps an enormous monitor rather than offering an enormous chat', () => {
    // A 1200px conversation column is not better than a 720px one, it is
    // only wider. Same reasoning the absolute cap has everywhere else here.
    expect(resolveRailBounds(3440, CARD).max).toBe(MAX_RAIL_WIDTH);
    expect(resolveRailBounds(2560, 0).max).toBe(MAX_RAIL_WIDTH);
  });

  it('refuses to resize below lg, where the rail does not render at all', () => {
    for (const viewport of [320, 375, 768, 1023]) {
      expect(resolveRailBounds(viewport, 0).resizable).toBe(false);
    }
  });

  it('disables resizing rather than offering a handle that cannot move', () => {
    // A viewport too small to satisfy both the minimum rail and the minimum
    // centre column. min wins and the handle is withheld.
    const bounds = resolveRailBounds(1024, CARD);
    expect(bounds.resizable).toBe(false);
    expect(bounds.max).toBe(bounds.min);
  });

  it('never returns a max below the min', () => {
    for (let viewport = 300; viewport <= 3000; viewport += 37) {
      for (const card of [CARD, 0]) {
        const bounds = resolveRailBounds(viewport, card);
        expect(bounds.max).toBeGreaterThanOrEqual(bounds.min);
      }
    }
  });

  it('survives a nonsense viewport', () => {
    for (const viewport of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const bounds = resolveRailBounds(viewport, CARD);
      expect(bounds.min).toBe(MIN_RAIL_WIDTH);
      expect(Number.isFinite(bounds.max)).toBe(true);
      expect(bounds.max).toBeGreaterThanOrEqual(bounds.min);
    }
  });
});

describe('clampRailWidth', () => {
  it('holds the ends', () => {
    expect(clampRailWidth(10, wide)).toBe(wide.min);
    expect(clampRailWidth(99999, wide)).toBe(wide.max);
  });

  it('rounds to whole pixels, so sub-pixel jitter is not a state change', () => {
    expect(clampRailWidth(420.4, wide)).toBe(420);
    expect(clampRailWidth(420.6, wide)).toBe(421);
  });

  it('falls back to the default on a value that is not a number', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(clampRailWidth(bad, wide)).toBe(DEFAULT_RAIL_WIDTH);
    }
  });

  it('clamps a stored width that today’s viewport cannot honour', () => {
    // Sized on a big monitor, reopened on a laptop. Never render a width the
    // current layout cannot pay for.
    const laptop = resolveRailBounds(1280, CARD);
    expect(clampRailWidth(700, laptop)).toBe(laptop.max);
  });
});

describe('parsePersistedRailWidth', () => {
  it('takes a plain number inside the absolute range', () => {
    expect(parsePersistedRailWidth(420)).toBe(420);
    expect(parsePersistedRailWidth(MIN_RAIL_WIDTH)).toBe(MIN_RAIL_WIDTH);
    expect(parsePersistedRailWidth(MAX_RAIL_WIDTH)).toBe(MAX_RAIL_WIDTH);
  });

  it('rejects everything else, so a corrupt value falls back to the default', () => {
    for (const bad of [
      '420',
      '420px',
      null,
      undefined,
      {},
      [],
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      0,
      MIN_RAIL_WIDTH - 1,
      MAX_RAIL_WIDTH + 1,
      true,
    ]) {
      expect(parsePersistedRailWidth(bad)).toBeNull();
    }
  });

  it('rounds a float rather than rejecting it', () => {
    expect(parsePersistedRailWidth(420.7)).toBe(421);
  });
});

describe('railWidthFromDrag', () => {
  it('widens when the pointer moves LEFT, because the handle is the left edge', () => {
    // The rail is the right column. Dragging toward the centre of the screen
    // makes it bigger. Getting this backwards is the most obvious way for the
    // whole feature to feel broken.
    expect(railWidthFromDrag(400, 1000, 900, wide)).toBe(500);
  });

  it('narrows when the pointer moves right', () => {
    expect(railWidthFromDrag(400, 1000, 1060, wide)).toBe(340);
  });

  it('clamps at both stops rather than overshooting', () => {
    expect(railWidthFromDrag(400, 1000, -5000, wide)).toBe(wide.max);
    expect(railWidthFromDrag(400, 1000, 5000, wide)).toBe(wide.min);
  });

  it('returns the starting width when nothing moved', () => {
    expect(railWidthFromDrag(420, 1000, 1000, wide)).toBe(420);
  });

  it('is stable against a nonsense coordinate', () => {
    expect(railWidthFromDrag(420, Number.NaN, 1000, wide)).toBe(420);
    expect(railWidthFromDrag(420, 1000, Number.NaN, wide)).toBe(420);
  });
});

describe('isRailResizable', () => {
  it('matches the lg breakpoint the rail itself renders at', () => {
    expect(isRailResizable(1023)).toBe(false);
    expect(isRailResizable(1024)).toBe(true);
  });
});

describe('railColumnWidth', () => {
  // The right-hand column now holds TWO cards: the rollout menu on top and the
  // UrgAns chat under it. Its width is whichever is wider, and the chat is the
  // wide one — so "how wide is the column" has to be ONE answer, because the
  // side menu, the drag bounds and <main> all reserve room for it.
  it('is the chat width whenever the chat is open, menu or no menu', () => {
    expect(railColumnWidth({ chatOpen: true, menuPresent: true, chatWidth: 420 })).toBe(420);
    expect(railColumnWidth({ chatOpen: true, menuPresent: false, chatWidth: 420 })).toBe(420);
  });

  it('shrinks to the menu-only width when the chat is closed but a menu is showing', () => {
    expect(railColumnWidth({ chatOpen: false, menuPresent: true, chatWidth: 420 })).toBe(
      RAIL_MENU_ONLY_WIDTH
    );
  });

  it('is nothing at all when the chat is closed and there is no menu', () => {
    // A closed chat on a page with no rollout open must reserve zero pixels,
    // exactly as the old `w-0` closed rail did — otherwise every page without a
    // rollout would grow an empty gutter.
    expect(railColumnWidth({ chatOpen: false, menuPresent: false, chatWidth: 420 })).toBe(0);
  });

  it('ignores the stored chat width while the chat is closed', () => {
    // A width the user dragged to is kept for when the chat reopens; it must
    // not leak into the menu-only column.
    for (const chatWidth of [MIN_RAIL_WIDTH, DEFAULT_RAIL_WIDTH, MAX_RAIL_WIDTH]) {
      expect(railColumnWidth({ chatOpen: false, menuPresent: true, chatWidth })).toBe(
        RAIL_MENU_ONLY_WIDTH
      );
    }
  });
});

describe('RAIL_MENU_ONLY_WIDTH', () => {
  it('is narrower than the narrowest chat, because it is not a chat width', () => {
    // The menu-only column is never handed to clampRailWidth / resolveRailBounds:
    // those are the CHAT's bounds. If this ever reached MIN_RAIL_WIDTH the two
    // states would be indistinguishable and the drag handle's "chat is open"
    // condition would be the only thing telling them apart.
    expect(RAIL_MENU_ONLY_WIDTH).toBeLessThan(MIN_RAIL_WIDTH);
  });

  it('is a whole number, so the column never sits on a half pixel', () => {
    expect(Number.isInteger(RAIL_MENU_ONLY_WIDTH)).toBe(true);
  });
});

describe('railColumnTotal', () => {
  it('adds the rail’s own mr-8 to a column that is on screen', () => {
    expect(railColumnTotal(RAIL_MENU_ONLY_WIDTH)).toBe(RAIL_MENU_ONLY_WIDTH + RAIL_GUTTER);
    expect(railColumnTotal(420)).toBe(420 + RAIL_GUTTER);
  });

  it('adds NOTHING for a column that is not there', () => {
    // The gutter belongs to the column. A closed, menu-less rail used to be
    // `mr-0 w-0`; reserving 32px for it would shift every page by a gutter.
    expect(railColumnTotal(0)).toBe(0);
  });

  it('treats nonsense as an absent column rather than a NaN reservation', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, -420]) {
      expect(railColumnTotal(bad)).toBe(0);
    }
  });

  it('agrees with railColumnWidth for the three states', () => {
    const open = railColumnTotal(railColumnWidth({ chatOpen: true, menuPresent: true, chatWidth: 420 }));
    const menu = railColumnTotal(railColumnWidth({ chatOpen: false, menuPresent: true, chatWidth: 420 }));
    const none = railColumnTotal(railColumnWidth({ chatOpen: false, menuPresent: false, chatWidth: 420 }));
    expect([open, menu, none]).toEqual([452, 240, 0]);
  });
});
