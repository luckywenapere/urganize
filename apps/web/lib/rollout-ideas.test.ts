import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CHIME_IN_RECIPIENTS,
  MAX_IDEA_INVITES,
  addPendingInvite,
  parseIdeaInviteEmail,
  notesToReview,
  reviewBaseline,
  ideaReviewTitle,
  isIdeaReviewPromptEnabled,
  type IdeaNote,
  chimeInAskLine,
  chimeInAskRecipients,
  chimeInShareText,
  chimedInLine,
  ideaNoteRecipients,
  ideasPathFor,
  ideasToExtraNotes,
  isRolloutArtist,
  isRolloutIdeasEnabled,
  planReadyLine,
  rolloutIdeasPath,
  safeInviteNextPath,
  withInviteNext,
} from './rollout-ideas';
import { MAX_EXTRA_NOTES_LENGTH } from './release-planning';

describe('the flag ships on', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is on unless exactly "false"', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_ROLLOUT_IDEAS', '');
    expect(isRolloutIdeasEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_ROLLOUT_IDEAS', 'true');
    expect(isRolloutIdeasEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_ROLLOUT_IDEAS', 'false');
    expect(isRolloutIdeasEnabled()).toBe(false);
  });
});

describe('ideasPathFor (routing by persona)', () => {
  it('sends a solo artist with nobody else to the solo path', () => {
    expect(ideasPathFor({ isOwner: true, persona: 'independent_artist', teammateCount: 0 })).toBe('solo');
    expect(ideasPathFor({ isOwner: true, persona: 'producer_beatmaker', teammateCount: 0 })).toBe('solo');
  });

  it('sends a solo artist who already has people to the manager path', () => {
    expect(ideasPathFor({ isOwner: true, persona: 'independent_artist', teammateCount: 1 })).toBe('manager');
  });

  it('sends managers, artist teams, labels, other and unanswered to the manager path', () => {
    for (const persona of ['music_manager', 'artist_team', 'label_ar', 'other', null, undefined] as const) {
      expect(ideasPathFor({ isOwner: true, persona, teammateCount: 0 })).toBe('manager');
    }
  });

  it('anyone who does not own the rollout chimes in', () => {
    expect(ideasPathFor({ isOwner: false, persona: 'music_manager', teammateCount: 3 })).toBe('chime_in');
    expect(ideasPathFor({ isOwner: false, persona: 'independent_artist', teammateCount: 0 })).toBe('chime_in');
  });
});

describe('ideasToExtraNotes', () => {
  it('joins notes as "Name: text" lines, oldest first, one line each', () => {
    expect(
      ideasToExtraNotes([
        { authorName: 'Ada Obi', content: 'Tease the hook on TikTok\nfirst' },
        { authorName: 'Dorian', content: '  Shoot the video in Lagos  ' },
      ])
    ).toBe('Ada Obi: Tease the hook on TikTok first\nDorian: Shoot the video in Lagos');
  });

  it('skips empty notes and names a nameless author', () => {
    expect(ideasToExtraNotes([{ authorName: '', content: 'A' }, { authorName: 'B', content: '   ' }])).toBe('Team: A');
  });

  it('never goes past the planner cap, and cuts the last line at a word', () => {
    const long = Array.from({ length: 40 }, (_, i) => ({
      authorName: `Person ${i}`,
      content: 'word '.repeat(30),
    }));
    const out = ideasToExtraNotes(long);
    expect(out.length).toBeLessThanOrEqual(MAX_EXTRA_NOTES_LENGTH);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('Person 0: word')).toBe(true);
  });

  it('respects a smaller cap', () => {
    const out = ideasToExtraNotes([{ authorName: 'A', content: 'x'.repeat(500) }], 100);
    expect(out.length).toBeLessThanOrEqual(100);
  });

  it('is empty with no notes', () => {
    expect(ideasToExtraNotes([])).toBe('');
  });
});

describe('invite redirect validation', () => {
  it('accepts the rollout path and other dashboard paths', () => {
    expect(safeInviteNextPath('/dashboard?release=abc')).toBe('/dashboard?release=abc');
    expect(safeInviteNextPath('/dashboard')).toBe('/dashboard');
    expect(safeInviteNextPath('/dashboard/home')).toBe('/dashboard/home');
  });

  it('refuses anything that could leave the app or the dashboard', () => {
    for (const bad of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      'javascript:alert(1)',
      '/admin',
      '/dashboardx',
      '',
      null,
      undefined,
      42,
      `/dashboard?x=${'a'.repeat(400)}`,
    ]) {
      expect(safeInviteNextPath(bad), String(bad)).toBeNull();
    }
  });

  it('the rollout path itself passes the check', () => {
    expect(safeInviteNextPath(rolloutIdeasPath('r 1/2'))).toBe('/dashboard?release=r%201%2F2');
  });

  it('adds next to a join link and to the older token link', () => {
    expect(withInviteNext('https://app.urganize.app/join/ABCDEFGH1234', 'r1')).toBe(
      'https://app.urganize.app/join/ABCDEFGH1234?next=%2Fdashboard%3Frelease%3Dr1'
    );
    const tokenLink = new URL(withInviteNext('https://app.urganize.app/invite/accept?token=wl.x.y', 'r1'));
    expect(tokenLink.searchParams.get('token')).toBe('wl.x.y');
    expect(safeInviteNextPath(tokenLink.searchParams.get('next'))).toBe('/dashboard?release=r1');
  });

  it('leaves an unparseable link alone', () => {
    expect(withInviteNext('not a url', 'r1')).toBe('not a url');
  });
});

describe('copy lines', () => {
  it('reads plainly', () => {
    expect(chimeInAskLine('Oyin', 'Ohema')).toBe('Oyin wants you to chime in on Ohema');
    expect(chimedInLine('Ada', 'Ohema')).toBe('Ada chimed in on Ohema');
    expect(planReadyLine('Ohema')).toBe('Your plan for Ohema is ready');
    expect(chimeInShareText({ senderName: 'Oyin', releaseTitle: 'Ohema', link: 'https://x.y/join/a' })).toBe(
      'Oyin wants you to chime in on Ohema\nhttps://x.y/join/a'
    );
    expect(chimeInAskLine('', '')).toBe('Your teammate wants you to chime in on a rollout');
  });
});

describe('recipients', () => {
  it('a note pushes everyone but the author and emails the owner', () => {
    expect(ideaNoteRecipients({ peopleIds: ['owner', 'a', 'b', 'a'], ownerId: 'owner', authorId: 'a' })).toEqual({
      pushIds: ['owner', 'b'],
      emailOwner: true,
    });
  });

  it('the owner writing a note is never told about it', () => {
    expect(ideaNoteRecipients({ peopleIds: ['owner', 'a'], ownerId: 'owner', authorId: 'owner' })).toEqual({
      pushIds: ['a'],
      emailOwner: false,
    });
  });

  it('an ask only reaches people on the rollout, never the asker, each once', () => {
    expect(
      chimeInAskRecipients({
        requested: ['a', 'stranger', 'me', 'a', 'b', 7, ''],
        allowedIds: ['a', 'b', 'me'],
        askerId: 'me',
      })
    ).toEqual(['a', 'b']);
    expect(chimeInAskRecipients({ requested: 'a', allowedIds: ['a'], askerId: 'me' })).toEqual([]);
  });

  it('an ask is capped', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `u${i}`);
    expect(chimeInAskRecipients({ requested: ids, allowedIds: ids, askerId: 'me' })).toHaveLength(
      MAX_CHIME_IN_RECIPIENTS
    );
  });
});

describe('isRolloutArtist', () => {
  it('ticks an artist account named for the rollout artist', () => {
    expect(isRolloutArtist({ role: 'artist', artistName: 'Dorian ' }, 'dorian')).toBe(true);
    expect(isRolloutArtist({ role: 'artist', artistName: null, name: 'Dorian' }, 'Dorian')).toBe(true);
  });

  it('never guesses', () => {
    expect(isRolloutArtist({ role: 'manager', artistName: 'Dorian' }, 'Dorian')).toBe(false);
    expect(isRolloutArtist({ role: 'artist', artistName: 'Someone' }, 'Dorian')).toBe(false);
    expect(isRolloutArtist({ role: 'artist', artistName: '' }, '')).toBe(false);
  });
});

describe('the email-invite flag ships off', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is on only when exactly "true"', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_IDEA_EMAIL_INVITES', '');
    expect((await import('./rollout-ideas')).isIdeaEmailInvitesEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_IDEA_EMAIL_INVITES', 'false');
    expect((await import('./rollout-ideas')).isIdeaEmailInvitesEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_IDEA_EMAIL_INVITES', 'true');
    expect((await import('./rollout-ideas')).isIdeaEmailInvitesEnabled()).toBe(true);
  });
});

describe('parseIdeaInviteEmail', () => {
  it('lowercases and trims a real address', () => {
    expect(parseIdeaInviteEmail('  Dorian@Example.COM ')).toBe('dorian@example.com');
  });
  it('refuses anything that is not an address', () => {
    expect(parseIdeaInviteEmail('Dorian')).toBeNull();
    expect(parseIdeaInviteEmail('a@b')).toBeNull();
    expect(parseIdeaInviteEmail('a b@c.com')).toBeNull();
    expect(parseIdeaInviteEmail(undefined)).toBeNull();
    expect(parseIdeaInviteEmail('x'.repeat(250) + '@c.com')).toBeNull();
  });
});

describe('addPendingInvite', () => {
  it('adds a new address with its role', () => {
    const result = addPendingInvite([], 'a@b.com', 'artist');
    expect(result).toEqual({ ok: true, list: [{ email: 'a@b.com', role: 'artist' }] });
  });
  it('refuses a bad address, a repeat and a full list', () => {
    expect(addPendingInvite([], 'nope', 'artist')).toMatchObject({ ok: false, reason: 'invalid' });
    const one = [{ email: 'a@b.com', role: 'artist' as const }];
    expect(addPendingInvite(one, 'A@B.com', 'team-member')).toMatchObject({ ok: false, reason: 'duplicate' });
    const full = Array.from({ length: MAX_IDEA_INVITES }, (_, i) => ({ email: `p${i}@b.com`, role: 'team-member' as const }));
    expect(addPendingInvite(full, 'new@b.com', 'team-member')).toMatchObject({ ok: false, reason: 'full' });
  });
});

describe('the review-prompt flag ships off', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is on only when exactly "true"', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_IDEA_REVIEW_PROMPT', '');
    expect((await import('./rollout-ideas')).isIdeaReviewPromptEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_IDEA_REVIEW_PROMPT', 'true');
    expect((await import('./rollout-ideas')).isIdeaReviewPromptEnabled()).toBe(true);
  });
});

describe('ideas waiting for the owner to review', () => {
  const note = (over: Partial<IdeaNote> & { id: string }): IdeaNote => ({
    userId: 'u1',
    authorName: 'Dorian Okoye',
    authorInitials: 'DO',
    content: 'A video on the roof',
    createdAt: '2026-10-26T10:00:00.000Z',
    isOwn: false,
    ...over,
  });

  it('keeps only other people\'s notes newer than the last review', () => {
    const notes = [
      note({ id: 'a', createdAt: '2026-10-26T09:00:00.000Z' }),
      note({ id: 'b', createdAt: '2026-10-26T11:00:00.000Z' }),
      note({ id: 'c', createdAt: '2026-10-26T12:00:00.000Z', isOwn: true }),
    ];
    expect(notesToReview(notes, '2026-10-26T10:00:00.000Z').map((n) => n.id)).toEqual(['b']);
  });

  it('shows nothing when there is no baseline yet, and never throws on a bad date', () => {
    expect(notesToReview([note({ id: 'a' })], null)).toEqual([]);
    expect(notesToReview([note({ id: 'a' })], 'not a date')).toEqual([]);
    expect(notesToReview([note({ id: 'a', createdAt: 'oops' })], '2026-10-26T10:00:00.000Z')).toEqual([]);
  });

  it('starts the baseline at the newest note, or now when there are none', () => {
    const notes = [note({ id: 'a', createdAt: '2026-10-26T09:00:00.000Z' }), note({ id: 'b', createdAt: '2026-10-26T11:00:00.000Z' })];
    expect(reviewBaseline(notes, new Date('2026-10-27T00:00:00.000Z'))).toBe('2026-10-26T11:00:00.000Z');
    expect(reviewBaseline([], new Date('2026-10-27T00:00:00.000Z'))).toBe('2026-10-27T00:00:00.000Z');
  });

  it('words the prompt for one person and for several', () => {
    expect(ideaReviewTitle([note({ id: 'a' })])).toBe('Dorian added an idea');
    expect(ideaReviewTitle([note({ id: 'a' }), note({ id: 'b', authorName: 'Tobi A' })])).toBe('2 new ideas');
  });
});
