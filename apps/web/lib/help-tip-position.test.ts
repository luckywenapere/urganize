import { describe, expect, it } from 'vitest';
import {
  HELP_TIP_GAP,
  HELP_TIP_VIEWPORT_MARGIN,
  placeHelpTip,
  type HelpTipRect,
} from './help-tip-position';

/**
 * The panel is fixed-position and portaled to the document body, so nothing in
 * the layout positions it and this function is the whole placement decision.
 *
 * It has to be a pure function in `lib/` for the ordinary reason: vitest here
 * runs in a node environment with no jsdom, so a decision made inside the
 * component is a decision no test can reach.
 */

const VIEWPORT = { width: 1280, height: 800 };

/** A trigger in the middle of the viewport, with room on every side. */
function trigger(over: Partial<HelpTipRect> = {}): HelpTipRect {
  return { top: 400, left: 600, width: 16, height: 16, ...over };
}

const PANEL = { width: 260, height: 72 };

describe('placeHelpTip', () => {
  describe('preferring below', () => {
    it('sits under the trigger when there is room', () => {
      const placed = placeHelpTip({ trigger: trigger(), panel: PANEL, viewport: VIEWPORT, prefer: 'bottom' });
      expect(placed.placement).toBe('bottom');
      expect(placed.top).toBe(400 + 16 + HELP_TIP_GAP);
    });

    it('flips above when the panel would fall off the bottom', () => {
      // A trigger near the foot of the screen — the common case for a field at
      // the end of a long form, and for the mobile dock.
      const placed = placeHelpTip({
        trigger: trigger({ top: 760 }),
        panel: PANEL,
        viewport: VIEWPORT,
        prefer: 'bottom',
      });
      expect(placed.placement).toBe('top');
      expect(placed.top).toBe(760 - HELP_TIP_GAP - PANEL.height);
    });

    it('lines its left edge up with the trigger', () => {
      const placed = placeHelpTip({ trigger: trigger(), panel: PANEL, viewport: VIEWPORT, prefer: 'bottom' });
      expect(placed.left).toBe(600);
    });
  });

  describe('preferring the side, which is what the side menu wants', () => {
    it('sits to the right of the trigger when there is room', () => {
      const placed = placeHelpTip({ trigger: trigger({ left: 200 }), panel: PANEL, viewport: VIEWPORT, prefer: 'right' });
      expect(placed.placement).toBe('right');
      expect(placed.left).toBe(200 + 16 + HELP_TIP_GAP);
    });

    it('centres itself on the trigger rather than aligning to its top', () => {
      const placed = placeHelpTip({ trigger: trigger({ left: 200 }), panel: PANEL, viewport: VIEWPORT, prefer: 'right' });
      // Trigger centre is 408; panel centre should meet it.
      expect(placed.top + PANEL.height / 2).toBe(408);
    });

    it('flips to the left when the right edge is too close', () => {
      const placed = placeHelpTip({
        trigger: trigger({ left: 1200 }),
        panel: PANEL,
        viewport: VIEWPORT,
        prefer: 'right',
      });
      expect(placed.placement).toBe('left');
      expect(placed.left).toBe(1200 - HELP_TIP_GAP - PANEL.width);
    });

    it('falls back to below when neither side fits', () => {
      // A trigger mid-screen on a 375px phone: 150 + 16 + 8 + 260 runs past the
      // right margin, and flipping left lands at -118. The fallback is what
      // makes this responsive with no media query and no viewport read in the
      // component.
      //
      // Note a phone does NOT always land here, which is worth knowing before
      // anyone "fixes" side placement to be desktop-only: a trigger near either
      // edge of a 375px screen still has room on one side, and gets it.
      const placed = placeHelpTip({
        trigger: trigger({ top: 300, left: 150 }),
        panel: PANEL,
        viewport: { width: 375, height: 812 },
        prefer: 'right',
      });
      expect(placed.placement).toBe('bottom');
    });

    it('still takes a side near a narrow screen edge, where there is room for one', () => {
      const placed = placeHelpTip({
        trigger: trigger({ top: 300, left: 20 }),
        panel: PANEL,
        viewport: { width: 375, height: 812 },
        prefer: 'right',
      });
      expect(placed.placement).toBe('right');
    });
  });

  describe('staying on screen', () => {
    it('clamps a panel that would run off the left', () => {
      const placed = placeHelpTip({ trigger: trigger({ left: 4 }), panel: PANEL, viewport: VIEWPORT, prefer: 'bottom' });
      expect(placed.left).toBe(HELP_TIP_VIEWPORT_MARGIN);
    });

    it('clamps a panel that would run off the right', () => {
      const placed = placeHelpTip({
        trigger: trigger({ left: 1270 }),
        panel: PANEL,
        viewport: VIEWPORT,
        prefer: 'bottom',
      });
      expect(placed.left).toBe(VIEWPORT.width - PANEL.width - HELP_TIP_VIEWPORT_MARGIN);
    });

    it('clamps vertically for a side placement near the top', () => {
      const placed = placeHelpTip({
        trigger: trigger({ top: 2, left: 200 }),
        panel: PANEL,
        viewport: VIEWPORT,
        prefer: 'right',
      });
      expect(placed.top).toBe(HELP_TIP_VIEWPORT_MARGIN);
    });

    it('never returns a negative coordinate, even when the panel is taller than the viewport', () => {
      // Degrades to the margin rather than to a number that puts the text off
      // the top of the screen where nobody can scroll to it.
      const placed = placeHelpTip({
        trigger: trigger({ top: 10, left: 10 }),
        panel: { width: 900, height: 900 },
        viewport: { width: 375, height: 400 },
        prefer: 'right',
      });
      expect(placed.top).toBeGreaterThanOrEqual(0);
      expect(placed.left).toBeGreaterThanOrEqual(0);
    });
  });

  it('rounds to whole pixels, so text is not rendered on a half pixel', () => {
    const placed = placeHelpTip({
      trigger: trigger({ top: 400, height: 17, left: 200 }),
      panel: { width: 260, height: 71 },
      viewport: VIEWPORT,
      prefer: 'right',
    });
    expect(Number.isInteger(placed.top)).toBe(true);
    expect(Number.isInteger(placed.left)).toBe(true);
  });
});
