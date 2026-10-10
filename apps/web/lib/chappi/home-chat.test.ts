import { describe, expect, it } from 'vitest';
import { homeChatIdFor, isHomeChatId, withoutHomeChat } from './home-chat';

describe('home chat id', () => {
  it('is the user id, and nothing without one', () => {
    expect(homeChatIdFor('u1')).toBe('u1');
    expect(homeChatIdFor(null)).toBeNull();
    expect(homeChatIdFor('')).toBeNull();
  });
  it('recognises only its own id', () => {
    expect(isHomeChatId('u1', 'u1')).toBe(true);
    expect(isHomeChatId('c2', 'u1')).toBe(false);
    expect(isHomeChatId('u1', null)).toBe(false);
  });
  it('leaves the home chat out of lists', () => {
    const chats = [{ id: 'u1' }, { id: 'c2' }];
    expect(withoutHomeChat(chats, 'u1')).toEqual([{ id: 'c2' }]);
    expect(withoutHomeChat(chats, null)).toEqual(chats);
  });
});
