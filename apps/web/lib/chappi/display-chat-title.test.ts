import { describe, expect, it } from 'vitest';
import { CHAT_TITLE_FALLBACK, displayChatTitle } from './conversation-history';

describe('displayChatTitle', () => {
  it('shows a conversation with no title as a new session', () => {
    expect(displayChatTitle('')).toBe('New session');
    expect(displayChatTitle(null)).toBe('New session');
    expect(displayChatTitle(undefined)).toBe('New session');
    expect(displayChatTitle('   ')).toBe('New session');
  });

  it('shows the stored marker as a new session too', () => {
    expect(displayChatTitle(CHAT_TITLE_FALLBACK)).toBe('New session');
  });

  it('leaves a real title alone', () => {
    expect(displayChatTitle('Ohema cover ideas')).toBe('Ohema cover ideas');
  });

  it('keeps the stored marker unchanged, because saved chats compare against it', () => {
    expect(CHAT_TITLE_FALLBACK).toBe('New chat');
  });
});
