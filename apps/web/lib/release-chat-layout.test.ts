import { describe, expect, it } from 'vitest';
import {
  RELEASE_CHAT_FALLBACK_HEIGHT,
  RELEASE_CHAT_KEYBOARD_Z,
  isReleaseChatKeyboardMode,
  releaseChatLayout,
} from './release-chat-layout';

const phoneKeyboard = {
  isPhone: true,
  keyboardOpen: true,
  offsetTopPx: 0,
  viewportHeightPx: 420,
  flowHeightPx: 560,
};

describe('releaseChatLayout', () => {
  it('stays in the page on a computer, even with a keyboard (iPad at lg+)', () => {
    const layout = releaseChatLayout({ ...phoneKeyboard, isPhone: false });
    expect(layout.mode).toBe('flow');
    expect(layout.slot).toEqual({ height: 560 });
    expect(layout.box.position).toBeUndefined();
  });

  it('stays in the page on a phone with the keyboard down', () => {
    const layout = releaseChatLayout({ ...phoneKeyboard, keyboardOpen: false });
    expect(layout.mode).toBe('flow');
    expect(layout.box).toEqual({ height: '100%' });
  });

  it('falls back to the CSS height before the first measurement', () => {
    const layout = releaseChatLayout({ ...phoneKeyboard, keyboardOpen: false, flowHeightPx: null });
    expect(layout.slot.height).toBe(RELEASE_CHAT_FALLBACK_HEIGHT);
  });

  it('pins to exactly the visible region on a phone with the keyboard up', () => {
    const layout = releaseChatLayout(phoneKeyboard);
    expect(layout.mode).toBe('keyboard');
    expect(layout.box).toMatchObject({
      position: 'fixed',
      left: 0,
      right: 0,
      top: 'calc(0px + env(safe-area-inset-top, 0px))',
      height: 'calc(420px - env(safe-area-inset-top, 0px))',
      zIndex: RELEASE_CHAT_KEYBOARD_Z,
    });
    // The slot keeps the page's height, so nothing behind it reflows.
    expect(layout.slot).toEqual({ height: 560 });
  });

  it('follows an iOS pan of the visible region (offsetTop)', () => {
    const layout = releaseChatLayout({ ...phoneKeyboard, offsetTopPx: 137.6, viewportHeightPx: 401.4 });
    expect(layout.box.top).toBe('calc(138px + env(safe-area-inset-top, 0px))');
    expect(layout.box.height).toBe('calc(401px - env(safe-area-inset-top, 0px))');
  });

  it('never pins before the viewport has been measured', () => {
    expect(isReleaseChatKeyboardMode({ isPhone: true, keyboardOpen: true, viewportHeightPx: 0 })).toBe(false);
    expect(releaseChatLayout({ ...phoneKeyboard, viewportHeightPx: 0 }).mode).toBe('flow');
  });

  it('clamps a negative offset (iOS overscroll) to the top of the screen', () => {
    expect(releaseChatLayout({ ...phoneKeyboard, offsetTopPx: -12 }).box.top).toBe(
      'calc(0px + env(safe-area-inset-top, 0px))'
    );
  });
});
