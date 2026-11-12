import { describe, expect, it } from 'vitest';
import {
  ROLLOUT_CHATS_SHOWN,
  assistantHref,
  orderRolloutChats,
  readAssistantRollout,
  sessionsRedirectHref,
  shownRolloutChats,
} from './assistant-chats';

type Row = { id: string; last: string | null; releaseDate: string | null };
const row = (id: string, last: string | null, releaseDate: string | null = null): Row => ({ id, last, releaseDate });

describe('orderRolloutChats', () => {
  it('puts chats with messages first, newest on top, then the rest by release date', () => {
    const ordered = orderRolloutChats([
      row('quiet-late', null, '2026-12-20'),
      row('old-chat', '2026-11-01T10:00:00Z'),
      row('quiet-soon', null, '2026-11-20'),
      row('new-chat', '2026-11-10T10:00:00Z'),
      row('quiet-undated', null, null),
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual([
      'new-chat',
      'old-chat',
      'quiet-soon',
      'quiet-late',
      'quiet-undated',
    ]);
  });

  it('does not change the list it was given', () => {
    const input = [row('a', null, '2026-12-01'), row('b', '2026-11-01T10:00:00Z')];
    orderRolloutChats(input);
    expect(input.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});

describe('shownRolloutChats', () => {
  const many = Array.from({ length: ROLLOUT_CHATS_SHOWN + 4 }, (_, index) => row(`r${index}`, null));

  it('shows the first few until Show all is pressed', () => {
    const shown = shownRolloutChats(many, { expanded: false, openId: null });
    expect(shown.map((entry) => entry.id)).toEqual(many.slice(0, ROLLOUT_CHATS_SHOWN).map((entry) => entry.id));
    expect(shownRolloutChats(many, { expanded: true, openId: null })).toHaveLength(many.length);
  });

  it('keeps the open chat in view even when it is below the fold', () => {
    const openId = many[many.length - 1].id;
    const shown = shownRolloutChats(many, { expanded: false, openId });
    expect(shown).toHaveLength(ROLLOUT_CHATS_SHOWN + 1);
    expect(shown[shown.length - 1].id).toBe(openId);
  });

  it('shows a short list whole', () => {
    expect(shownRolloutChats(many.slice(0, 2), { expanded: false, openId: null })).toHaveLength(2);
  });
});

describe('the Rollouts address on a computer', () => {
  it('opens the Assistant on the rollout named in the address first', () => {
    expect(sessionsRedirectHref({ search: '?release=abc', openReleaseId: 'other' })).toBe('/dashboard/urgans?rollout=abc');
  });

  it('then on the rollout chat that was open', () => {
    expect(sessionsRedirectHref({ search: '', openReleaseId: 'r-1' })).toBe('/dashboard/urgans?rollout=r-1');
  });

  it('otherwise on the general chat', () => {
    expect(sessionsRedirectHref({ search: '', openReleaseId: null })).toBe('/dashboard/urgans');
    expect(sessionsRedirectHref({ search: '?release=', openReleaseId: null })).toBe('/dashboard/urgans');
  });

  it('round-trips through the Assistant address', () => {
    expect(assistantHref('a b')).toBe('/dashboard/urgans?rollout=a%20b');
    expect(readAssistantRollout('?rollout=a%20b')).toBe('a b');
    expect(readAssistantRollout('?rollout=')).toBeNull();
    expect(readAssistantRollout('')).toBeNull();
    expect(assistantHref(null)).toBe('/dashboard/urgans');
  });
});
