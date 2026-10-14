import { describe, expect, it } from 'vitest';
import { MENU_VIEWPORT_MARGIN, menuMaxHeight, menuShift, placeUnderAnchor } from './menu-position';

describe('menuShift', () => {
  it('leaves a menu that already fits alone', () => {
    expect(menuShift({ left: 20, width: 200 }, 390)).toEqual({ shift: 0, maxWidth: null });
  });

  it('pulls the rollout plan filters back from the right edge of a phone', () => {
    // The reported bug: a 192px panel aligned to the left edge of a button at
    // x=294 on a 390px iPhone ran to x=486.
    const { shift, maxWidth } = menuShift({ left: 294, width: 192 }, 390);
    expect(maxWidth).toBeNull();
    expect(294 + shift + 192).toBe(390 - MENU_VIEWPORT_MARGIN);
  });

  it('pushes a right-aligned menu back from the left edge', () => {
    const { shift } = menuShift({ left: -66, width: 192 }, 375);
    expect(-66 + shift).toBe(MENU_VIEWPORT_MARGIN);
  });

  it('caps a menu wider than the screen and pins it to the left margin', () => {
    const { shift, maxWidth } = menuShift({ left: 40, width: 400 }, 320);
    expect(maxWidth).toBe(320 - MENU_VIEWPORT_MARGIN * 2);
    expect(40 + shift).toBe(MENU_VIEWPORT_MARGIN);
  });

  it('honours a custom margin', () => {
    expect(menuShift({ left: 300, width: 100 }, 400, 16).shift).toBe(-16);
  });
});

describe('menuMaxHeight', () => {
  it('is null when the menu fits', () => {
    expect(menuMaxHeight({ top: 80, height: 400 }, 900)).toBeNull();
  });

  it('caps a tall menu to the room under its top', () => {
    expect(menuMaxHeight({ top: 72, height: 700 }, 700)).toBe(700 - MENU_VIEWPORT_MARGIN - 72);
  });

  it('leaves a menu alone when the room left is too small to scroll in', () => {
    expect(menuMaxHeight({ top: 640, height: 300 }, 700)).toBeNull();
  });

  it('leaves a menu that opens upward to its own placement', () => {
    expect(menuMaxHeight({ top: -40, height: 300 }, 700)).toBeNull();
  });
});

describe('placeUnderAnchor', () => {
  const viewport = { width: 1440, height: 900 };
  const anchor = { left: 600, top: 100, width: 36, height: 36 };
  const panel = { width: 288, height: 260 };

  it('aligns to the start edge below the button', () => {
    expect(placeUnderAnchor({ anchor, panel, viewport, align: 'start' })).toEqual({
      left: 600,
      top: 144,
      placement: 'bottom',
    });
  });

  it('aligns to the end edge', () => {
    expect(placeUnderAnchor({ anchor, panel, viewport, align: 'end' }).left).toBe(636 - 288);
  });

  it('clamps inside the screen on both sides', () => {
    expect(placeUnderAnchor({ anchor: { ...anchor, left: 1420 }, panel, viewport, align: 'start' }).left).toBe(
      1440 - MENU_VIEWPORT_MARGIN - 288
    );
    expect(placeUnderAnchor({ anchor: { ...anchor, left: 20 }, panel, viewport, align: 'end' }).left).toBe(
      MENU_VIEWPORT_MARGIN
    );
  });

  it('flips above the button when there is no room below', () => {
    const placed = placeUnderAnchor({ anchor: { ...anchor, top: 800 }, panel, viewport, align: 'end' });
    expect(placed.placement).toBe('top');
    expect(placed.top).toBe(800 - 8 - 260);
  });

  it('stays below when neither side has room but below has more', () => {
    const placed = placeUnderAnchor({
      anchor: { ...anchor, top: 200 },
      panel: { width: 288, height: 900 },
      viewport,
      align: 'start',
    });
    expect(placed.placement).toBe('bottom');
  });
});
