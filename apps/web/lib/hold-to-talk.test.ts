import { describe, expect, it } from 'vitest';
import { CANCEL_SLIDE_PX, formatHoldElapsed, holdToTalkPlaceholder, slidToCancel } from './hold-to-talk';

describe('hold to talk', () => {
  it('says Type for an empty chat and Reply once it has messages, on a phone with a mic', () => {
    expect(holdToTalkPlaceholder({ phone: true, micReady: true, hasMessages: false })).toBe('Type or hold to talk');
    expect(holdToTalkPlaceholder({ phone: true, micReady: true, hasMessages: true })).toBe('Reply or hold to talk');
  });

  it('keeps the box text on a computer or with no mic, so it never promises a missing mic', () => {
    expect(holdToTalkPlaceholder({ phone: false, micReady: true, hasMessages: false })).toBeNull();
    expect(holdToTalkPlaceholder({ phone: true, micReady: false, hasMessages: true })).toBeNull();
  });

  it('cancels only after a long enough slide left', () => {
    expect(slidToCancel(300, 300 - CANCEL_SLIDE_PX + 1)).toBe(false);
    expect(slidToCancel(300, 300 - CANCEL_SLIDE_PX)).toBe(true);
    expect(slidToCancel(300, 400)).toBe(false);
  });

  it('reads the timer as minutes and seconds', () => {
    expect(formatHoldElapsed(4)).toBe('0:04');
    expect(formatHoldElapsed(75)).toBe('1:15');
  });
});
