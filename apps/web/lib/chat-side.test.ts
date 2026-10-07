import { describe, expect, it } from 'vitest';
import { DEFAULT_CHAT_SIDE, isChatSideMode, toggleChatSide } from './chat-side';

describe('chat side column', () => {
  it('starts on today', () => {
    expect(DEFAULT_CHAT_SIDE).toBe('today');
  });
  it('validates stored values', () => {
    expect(isChatSideMode('history')).toBe(true);
    expect(isChatSideMode('closed')).toBe(true);
    expect(isChatSideMode('left')).toBe(false);
    expect(isChatSideMode(null)).toBe(false);
  });
  it('toggles a showing mode closed and opens a different one', () => {
    expect(toggleChatSide('today', 'today')).toBe('closed');
    expect(toggleChatSide('closed', 'today')).toBe('today');
    expect(toggleChatSide('today', 'history')).toBe('history');
    expect(toggleChatSide('history', 'history')).toBe('closed');
  });
});
