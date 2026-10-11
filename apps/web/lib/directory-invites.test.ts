import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_INVITE_DAILY_LIMIT,
  checkDirectoryInviteInput,
  directoryInviteShareText,
  directoryInviteStatus,
  directoryInviteSummary,
  inviteLimitReached,
  roleWithArticle,
  whatsappShareHref,
} from './directory-invites';

describe('checkDirectoryInviteInput', () => {
  it('takes a name and a role, and an email only when given', () => {
    const result = checkDirectoryInviteInput({ name: '  Tobi   Ade ', role: 'mix_engineer' });
    expect(result).toEqual({ ok: true, data: { name: 'Tobi Ade', role: 'mix_engineer', email: null, send: false } });
  });

  it('normalises the email and keeps send only when it is literally true', () => {
    const sent = checkDirectoryInviteInput({ name: 'Ada', role: 'producer', email: ' Ada@Example.COM ', send: true });
    expect(sent.ok && sent.data).toMatchObject({ email: 'ada@example.com', send: true });
    const truthy = checkDirectoryInviteInput({ name: 'Ada', role: 'producer', email: 'ada@example.com', send: 'yes' });
    expect(truthy.ok && truthy.data.send).toBe(false);
  });

  it('refuses a missing name, an unknown role and a bad email', () => {
    expect(checkDirectoryInviteInput({ role: 'producer' })).toEqual({ ok: false, error: 'Add their name.' });
    expect(checkDirectoryInviteInput({ name: 'Ada', role: 'drummer' })).toEqual({ ok: false, error: 'Pick what they do.' });
    expect(checkDirectoryInviteInput({ name: 'Ada', role: 'producer', email: 'not-an-email' }).ok).toBe(false);
    expect(checkDirectoryInviteInput({ name: 'x'.repeat(81), role: 'producer' }).ok).toBe(false);
  });

  it('refuses send with no email rather than quietly making a link', () => {
    expect(checkDirectoryInviteInput({ name: 'Ada', role: 'producer', send: true })).toEqual({
      ok: false,
      error: 'Add their email, or get a link instead.',
    });
  });
});

describe('the daily limit', () => {
  it('allows up to the limit and refuses at it', () => {
    expect(DIRECTORY_INVITE_DAILY_LIMIT).toBe(20);
    expect(inviteLimitReached(0)).toBe(false);
    expect(inviteLimitReached(19)).toBe(false);
    expect(inviteLimitReached(20)).toBe(true);
  });
  it('refuses when the count cannot be read', () => {
    expect(inviteLimitReached(null)).toBe(true);
    expect(inviteLimitReached(Number.NaN)).toBe(true);
  });
});

describe('status', () => {
  const none = { openedAt: null, joinedAt: null, publishedAt: null };
  it('is the furthest point reached', () => {
    expect(directoryInviteStatus(none)).toBe('invited');
    expect(directoryInviteStatus({ ...none, openedAt: 'x' })).toBe('opened');
    expect(directoryInviteStatus({ ...none, joinedAt: 'x' })).toBe('joined');
    expect(directoryInviteStatus({ openedAt: 'x', joinedAt: 'x', publishedAt: 'x' })).toBe('listed');
  });
  it('counts listed people as joined in the summary', () => {
    expect(directoryInviteSummary(['invited', 'opened', 'joined', 'listed'])).toBe('4 invited · 2 joined');
  });
});

describe('copy', () => {
  it('uses the right article', () => {
    expect(roleWithArticle('producer')).toBe('a producer');
    expect(roleWithArticle('a_and_r')).toBe('an A&R');
    expect(roleWithArticle('pr')).toBe('a PR');
    expect(roleWithArticle('mix_engineer')).toBe('a mix engineer');
  });
  it('the share text says it is private first, and carries the link', () => {
    const text = directoryInviteShareText({ name: 'Tobi Ade', role: 'video_director', url: 'https://app.urganize.app/welcome/abc' });
    expect(text.startsWith('Hi Tobi,')).toBe(true);
    expect(text).toContain('as a video director');
    expect(text).toContain('Only you can see it until you publish it.');
    expect(text.endsWith('https://app.urganize.app/welcome/abc')).toBe(true);
  });
  it('the WhatsApp link carries the text, encoded', () => {
    expect(whatsappShareHref('a b&c')).toBe('https://wa.me/?text=a%20b%26c');
  });
});
