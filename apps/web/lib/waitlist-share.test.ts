import { describe, expect, it } from 'vitest';
import {
  FRIENDS_NEEDED,
  SHARE_CODE_LENGTH,
  SHARE_COPY,
  buildShareMessage,
  buildShareUrl,
  formatPlace,
  friendsRemaining,
  hasEnoughFriends,
  initialsOf,
  looksLikeShareCode,
  makeShareCode,
  normalizeShareCode,
} from './waitlist-share';

describe('waitlist share rules', () => {
  it('lets someone in at exactly three friends', () => {
    expect(FRIENDS_NEEDED).toBe(3);
    expect(hasEnoughFriends(2)).toBe(false);
    expect(hasEnoughFriends(3)).toBe(true);
    expect(friendsRemaining(1)).toBe(2);
    expect(friendsRemaining(9)).toBe(0);
  });

  it('makes codes that pass the shape check, with no look-alike characters', () => {
    for (let n = 0; n < 50; n += 1) {
      const code = makeShareCode((i) => (n * 7 + i * 13) % 256);
      expect(code).toHaveLength(SHARE_CODE_LENGTH);
      expect(looksLikeShareCode(code)).toBe(true);
    }
  });

  it('rejects junk codes and accepts lower case', () => {
    expect(looksLikeShareCode('abc')).toBe(false);
    expect(looksLikeShareCode('ABCD0EFG')).toBe(false);
    expect(looksLikeShareCode(undefined)).toBe(false);
    expect(looksLikeShareCode('abcdefgh')).toBe(true);
    expect(normalizeShareCode(' abcdefgh ')).toBe('ABCDEFGH');
  });

  it('builds the link, message and labels', () => {
    const url = buildShareUrl('https://app.urganize.app/', 'ABCDEFGH');
    expect(url).toBe('https://app.urganize.app/r/ABCDEFGH');
    expect(buildShareMessage(url)).toContain(url);
    expect(buildShareMessage(url)).not.toMatch(/—|start free|sign up|get started/i);
    expect(SHARE_COPY.progress(1)).toBe('1 of 3 joined. Each friend who joins moves you up.');
    expect(SHARE_COPY.progress(7)).toBe('3 of 3 joined. Each friend who joins moves you up.');
    expect(formatPlace(9266)).toBe('# 9,266');
    expect(initialsOf('Oyin Wenapere')).toBe('OW');
    expect(initialsOf('')).toBe('·');
  });
});
