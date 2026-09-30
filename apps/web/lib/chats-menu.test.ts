import { describe, expect, it } from 'vitest';
import { CHATS_MENU_PATH, chatsLiveInMenu, menuShowsChats } from './chats-menu';

describe('chatsLiveInMenu', () => {
  it('holds only when history is on, the menu is on and the menu is expanded', () => {
    expect(chatsLiveInMenu({ historyOn: true, menuOn: true, collapsed: false })).toBe(true);
  });

  it('gives the page its own toggle back when any one of the three fails', () => {
    expect(chatsLiveInMenu({ historyOn: false, menuOn: true, collapsed: false })).toBe(false);
    expect(chatsLiveInMenu({ historyOn: true, menuOn: false, collapsed: false })).toBe(false);
    // The 64px rail has no room for a list, so collapsing hands chats back to the page.
    expect(chatsLiveInMenu({ historyOn: true, menuOn: true, collapsed: true })).toBe(false);
  });
});

describe('menuShowsChats', () => {
  const on = { historyOn: true, collapsed: false };

  it('shows the list on the assistant page only', () => {
    expect(menuShowsChats({ pathname: CHATS_MENU_PATH, ...on })).toBe(true);
    expect(menuShowsChats({ pathname: '/dashboard', ...on })).toBe(false);
    expect(menuShowsChats({ pathname: '/settings', ...on })).toBe(false);
    expect(menuShowsChats({ pathname: null, ...on })).toBe(false);
  });

  it('does not treat a longer path as the assistant page', () => {
    expect(menuShowsChats({ pathname: `${CHATS_MENU_PATH}/x`, ...on })).toBe(false);
  });

  it('shows nothing while collapsed or with history off', () => {
    expect(menuShowsChats({ pathname: CHATS_MENU_PATH, historyOn: true, collapsed: true })).toBe(false);
    expect(menuShowsChats({ pathname: CHATS_MENU_PATH, historyOn: false, collapsed: false })).toBe(false);
  });
});
