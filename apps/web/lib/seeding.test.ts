import { describe, expect, it } from 'vitest';
import {
  SEED_BATCH_MAX,
  SEED_LINK_TTL_DAYS,
  buildSeedMessages,
  checkSeedBatch,
  checkSeedRow,
  claimInviteState,
  claimLinkExpiry,
  claimUrl,
  firstNameOf,
  isPlausibleClaimToken,
  parseClaimBody,
  parseSeedList,
  publishProblems,
  seedState,
  summarizeSeeding,
  whatsappHref,
} from './seeding';

const NOW = new Date('2026-10-11T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('parseSeedList', () => {
  it('sorts fields by what they look like, in any order', () => {
    const rows = parseSeedList('Ada Obi, manages three Lagos artists, ada@x.com, 0803 123 4567');
    expect(rows).toEqual([
      { name: 'Ada Obi', email: 'ada@x.com', phone: '0803 123 4567', notes: 'manages three Lagos artists' },
    ]);
  });

  it('reads tabs and pipes as well as commas, and skips blank lines', () => {
    const rows = parseSeedList('Tunde\ttunde@x.com\n\nBisi | 08031234567 | roster of 5\r\n');
    expect(rows.map((r) => r.name)).toEqual(['Tunde', 'Bisi']);
    expect(rows[1]).toMatchObject({ phone: '08031234567', notes: 'roster of 5' });
  });

  it('takes the first email and first phone and keeps the rest as notes', () => {
    const [row] = parseSeedList('Ada, a@x.com, b@x.com, 08031234567, 08099999999');
    expect(row).toMatchObject({ email: 'a@x.com', phone: '08031234567', notes: 'b@x.com, 08099999999' });
  });
});

describe('checkSeedRow', () => {
  it('needs a name and a way to reach them', () => {
    expect(checkSeedRow({ name: '', email: 'a@x.com' })).toEqual({ ok: false, error: 'Add a name.' });
    expect(checkSeedRow({ name: 'Ada' })).toEqual({ ok: false, error: 'Add an email or a phone number.' });
  });

  it('normalises email and phone so the same person written two ways matches', () => {
    const result = checkSeedRow({ name: ' Ada ', email: ' ADA@X.com ', phone: '0803 123 4567' });
    expect(result).toEqual({
      ok: true,
      data: { name: 'Ada', email: 'ada@x.com', phone: '+2348031234567', notes: '', bioStarter: null },
    });
  });

  it('refuses a contact that is typed but wrong, instead of dropping it', () => {
    expect(checkSeedRow({ name: 'Ada', email: 'not-an-email' })).toMatchObject({ ok: false });
    expect(checkSeedRow({ name: 'Ada', email: 'a@x.com', phone: '12' })).toMatchObject({ ok: false });
  });

  it('holds the length limits', () => {
    expect(checkSeedRow({ name: 'x'.repeat(81), email: 'a@x.com' })).toMatchObject({ ok: false });
    expect(checkSeedRow({ name: 'A', email: 'a@x.com', notes: 'x'.repeat(1001) })).toMatchObject({ ok: false });
    expect(checkSeedRow({ name: 'A', email: 'a@x.com', bioStarter: 'x'.repeat(601) })).toMatchObject({ ok: false });
  });
});

describe('checkSeedBatch', () => {
  const row = { name: 'Ada', email: 'a@x.com' };

  it('refuses nothing, and more than the cap', () => {
    expect(checkSeedBatch([])).toMatchObject({ ok: false });
    expect(checkSeedBatch('nope')).toMatchObject({ ok: false });
    expect(checkSeedBatch(Array.from({ length: SEED_BATCH_MAX + 1 }, () => row))).toMatchObject({ ok: false });
    expect(checkSeedBatch(Array.from({ length: SEED_BATCH_MAX }, () => row))).toMatchObject({ ok: true });
  });

  it('names the line that is wrong', () => {
    const result = checkSeedBatch([row, { name: 'Bisi' }]);
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain('Line 2');
  });
});

describe('states and the weekly numbers', () => {
  it('reports the furthest point reached', () => {
    expect(seedState({ invitedAt: 'x', openedAt: null, publishedAt: null })).toBe('invited');
    expect(seedState({ invitedAt: 'x', openedAt: 'y', publishedAt: null })).toBe('opened');
    expect(seedState({ invitedAt: 'x', openedAt: 'y', publishedAt: 'z' })).toBe('published');
    // Published without an opened date still reads as published.
    expect(seedState({ invitedAt: 'x', openedAt: null, publishedAt: 'z' })).toBe('published');
  });

  it('counts each stage as "at least this far" and splits out the last 7 days', () => {
    const rows = [
      { invitedAt: daysAgo(1), openedAt: null, publishedAt: null },
      { invitedAt: daysAgo(10), openedAt: daysAgo(2), publishedAt: null },
      { invitedAt: daysAgo(20), openedAt: daysAgo(15), publishedAt: daysAgo(3) },
    ];
    expect(summarizeSeeding(rows, NOW)).toEqual({
      total: 3,
      opened: 2,
      published: 1,
      invitedThisWeek: 1,
      openedThisWeek: 1,
      publishedThisWeek: 1,
    });
  });

  it('counts a published row as opened even if the open was never recorded', () => {
    const summary = summarizeSeeding([{ invitedAt: daysAgo(5), openedAt: null, publishedAt: daysAgo(1) }], NOW);
    expect(summary.opened).toBe(1);
  });

  it('ignores a date in the future or one that is not a date', () => {
    const summary = summarizeSeeding(
      [{ invitedAt: new Date(NOW.getTime() + 1000).toISOString(), openedAt: 'garbage', publishedAt: null }],
      NOW
    );
    expect(summary.invitedThisWeek).toBe(0);
    expect(summary.openedThisWeek).toBe(0);
  });
});

describe('the claim link', () => {
  const invite = { usedAt: null, revokedAt: null, expiresAt: daysAgo(-5) };

  it('is usable until used, replaced or expired, and says the most specific thing', () => {
    expect(claimInviteState(invite, NOW)).toBe('ok');
    expect(claimInviteState({ ...invite, usedAt: daysAgo(1) }, NOW)).toBe('used');
    expect(claimInviteState({ ...invite, revokedAt: daysAgo(1) }, NOW)).toBe('revoked');
    expect(claimInviteState({ ...invite, expiresAt: daysAgo(1) }, NOW)).toBe('expired');
    // Used outranks revoked, and both outrank expired.
    expect(claimInviteState({ usedAt: 'a', revokedAt: 'b', expiresAt: daysAgo(1) }, NOW)).toBe('used');
    expect(claimInviteState({ usedAt: null, revokedAt: 'b', expiresAt: daysAgo(1) }, NOW)).toBe('revoked');
  });

  it('treats an unreadable expiry as expired, never as forever', () => {
    expect(claimInviteState({ ...invite, expiresAt: 'soon' }, NOW)).toBe('expired');
  });

  it('expires a link a fixed number of days out', () => {
    const expiry = Date.parse(claimLinkExpiry(NOW));
    expect(expiry - NOW.getTime()).toBe(SEED_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
  });

  it('builds the page address and checks the shape of a token', () => {
    expect(claimUrl('https://app.urganize.app/', 'abc')).toBe('https://app.urganize.app/welcome/abc');
    expect(isPlausibleClaimToken('a'.repeat(32))).toBe(true);
    expect(isPlausibleClaimToken('short')).toBe(false);
    expect(isPlausibleClaimToken('has spaces and are not url safe!!')).toBe(false);
    expect(isPlausibleClaimToken(undefined)).toBe(false);
  });
});

describe('parseClaimBody: publishing is theirs alone', () => {
  it('keeps everything private unless publish is exactly true', () => {
    for (const publish of [undefined, false, 'true', 1, 'yes']) {
      const parsed = parseClaimBody({ displayName: 'Ada', publish, publishTo: 'public' });
      expect(parsed).toMatchObject({ publish: false, visibility: 'private' });
    }
  });

  it('ignores a visibility or handle slipped into the fields', () => {
    const parsed = parseClaimBody({ displayName: 'Ada', visibility: 'public', slug: 'mine', publish: false });
    expect(parsed).toMatchObject({ publish: false, visibility: 'private' });
    expect((parsed as { input: Record<string, unknown> }).input.visibility).toBeUndefined();
    expect((parsed as { input: Record<string, unknown> }).input.slug).toBeUndefined();
  });

  it('needs an explicit choice of who can see it before it lists anyone', () => {
    expect(parseClaimBody({ displayName: 'Ada', publish: true })).toMatchObject({ error: expect.any(String) });
    expect(parseClaimBody({ displayName: 'Ada', publish: true, publishTo: 'private' })).toMatchObject({
      error: expect.any(String),
    });
    expect(parseClaimBody({ displayName: 'Ada', publish: true, publishTo: 'directory' })).toMatchObject({
      publish: true,
      visibility: 'directory',
    });
    expect(parseClaimBody({ displayName: 'Ada', publish: true, publishTo: 'public' })).toMatchObject({
      visibility: 'public',
    });
  });

  it('passes bad profile fields through the same parser as the editor', () => {
    expect(parseClaimBody({ roles: ['not_a_role'] })).toMatchObject({ error: expect.any(String) });
    expect(parseClaimBody({ bio: 'x'.repeat(601) })).toMatchObject({ error: expect.any(String) });
  });

  it('needs a name and one role before anything can be published', () => {
    expect(publishProblems({ displayName: 'Ada', roles: ['manager'] })).toEqual([]);
    expect(publishProblems({ displayName: ' ', roles: ['manager'] })).toHaveLength(1);
    expect(publishProblems({ displayName: 'Ada', roles: [] })).toHaveLength(1);
  });
});

describe('the message', () => {
  const messages = buildSeedMessages({ name: 'Ada Obi', url: 'https://app.urganize.app/welcome/tok' });

  it('carries the link and is signed Oyin', () => {
    expect(messages.whatsapp).toContain('https://app.urganize.app/welcome/tok');
    expect(messages.emailBody).toContain('https://app.urganize.app/welcome/tok');
    expect(messages.emailBody.trim().endsWith('Oyin')).toBe(true);
    expect(messages.whatsapp).toContain('Hi Ada,');
  });

  it('says nothing is public until they publish', () => {
    expect(messages.whatsapp).toMatch(/only you can see it/i);
    expect(messages.emailBody).toMatch(/nothing goes public/i);
  });

  it('keeps to the house copy rules: no em dash, workspace, ship, or Lucky', () => {
    const all = `${messages.whatsapp} ${messages.emailSubject} ${messages.emailBody}`;
    expect(all).not.toMatch(/—|workspace|\bship|Lucky/i);
  });

  it('greets without a name rather than saying "Hi undefined"', () => {
    expect(buildSeedMessages({ name: '', url: 'u' }).whatsapp.startsWith('Hi,')).toBe(true);
    expect(firstNameOf('  Ada   Obi ')).toBe('Ada');
  });
});

describe('whatsappHref', () => {
  it('uses digits only and encodes the message', () => {
    expect(whatsappHref('+2348031234567', 'Hi there & hello')).toBe(
      'https://wa.me/2348031234567?text=Hi%20there%20%26%20hello'
    );
  });

  it('offers nothing without a usable number', () => {
    expect(whatsappHref(null, 'x')).toBeNull();
    expect(whatsappHref('123', 'x')).toBeNull();
    expect(whatsappHref('1'.repeat(16), 'x')).toBeNull();
  });
});
