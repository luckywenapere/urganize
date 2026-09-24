import { describe, expect, it } from 'vitest';
import { DEFAULT_RELEASE_TITLE } from '@/types/releases';
import {
  MAX_FAN_LINK_CHARS,
  MAX_SHARE_LINE_CHARS,
  SHARE_FORMAT_DIMENSIONS,
  SHARE_CHANNEL_FORMAT,
  SHARE_OUTWARD_STATIC_STRINGS,
  X_LINK_WEIGHT,
  X_MAX_POST_WEIGHT,
  buildDmMessage,
  buildInstagramCaption,
  buildShareCardSearch,
  buildShareHeadline,
  buildSnapchatCaption,
  buildStatusCaption,
  buildXIntentUrl,
  buildXPost,
  xPostWeight,
  defaultShareVoice,
  describeShareTiming,
  isEmbeddableCoverArt,
  normalizeFanLink,
  normalizeShareLine,
  parseShareCardQuery,
  releaseNoun,
  shareAnchorSize,
  shareDisplayTitle,
  shareEyebrow,
  shareImageFileName,
  shareTimingAnchor,
  shareTimingEyebrow,
  shareTitleSize,
  stripEmoji,
  type ShareAnswers,
  type ShareReleaseFacts,
} from './social-share';

const TODAY = '2026-09-23';

const facts = (over: Partial<ShareReleaseFacts> = {}): ShareReleaseFacts => ({
  title: 'Lagos Nights',
  artistName: 'Dorian',
  releaseType: 'single',
  releaseDate: '2026-10-03',
  ...over,
});

const answers = (over: Partial<ShareAnswers> = {}): ShareAnswers => ({
  voice: 'artist',
  dateMode: 'show',
  fanLink: '',
  extraLine: '',
  ...over,
});

describe('canvas sizes', () => {
  it('is a 4:5 Instagram post and a 9:16 status, the sizes each app shows full screen', () => {
    expect(SHARE_FORMAT_DIMENSIONS.post).toEqual({ width: 1080, height: 1350 });
    expect(SHARE_FORMAT_DIMENSIONS.status).toEqual({ width: 1080, height: 1920 });
  });
});

describe('defaultShareVoice', () => {
  it('speaks as the artist only when the account is an artist', () => {
    expect(defaultShareVoice('artist')).toBe('artist');
  });

  it('speaks as the team for every other role, and for an unknown one', () => {
    for (const role of ['manager', 'artist-manager', 'artist-team', 'team-member', 'viewer', '', null, undefined]) {
      expect(defaultShareVoice(role)).toBe('team');
    }
  });
});

describe('normalizeFanLink', () => {
  it('treats an empty or blank field as no link at all', () => {
    expect(normalizeFanLink('')).toEqual({ ok: true, value: '' });
    expect(normalizeFanLink('   ')).toEqual({ ok: true, value: '' });
  });

  it('keeps a full link as it was typed, query string included', () => {
    expect(normalizeFanLink(' https://hyperfollow.com/dorian/lagos?src=ig ')).toEqual({
      ok: true,
      value: 'https://hyperfollow.com/dorian/lagos?src=ig',
    });
    expect(normalizeFanLink('http://example.com/x')).toEqual({ ok: true, value: 'http://example.com/x' });
  });

  it('adds https:// when someone pastes a link without it', () => {
    expect(normalizeFanLink('distrokid.com/hyperfollow/dorian')).toEqual({
      ok: true,
      value: 'https://distrokid.com/hyperfollow/dorian',
    });
  });

  it('refuses anything that is not a web link', () => {
    for (const bad of ['javascript:alert(1)', 'mailto:a@b.com', 'ftp://files.example.com', 'data:text/html,hi']) {
      expect(normalizeFanLink(bad).ok).toBe(false);
    }
  });

  it('refuses words that are not links', () => {
    expect(normalizeFanLink('not a link').ok).toBe(false);
    expect(normalizeFanLink('lagos').ok).toBe(false);
    expect(normalizeFanLink('https://localhost').ok).toBe(false);
  });

  it('refuses a link longer than the field allows', () => {
    const long = `https://example.com/${'a'.repeat(MAX_FAN_LINK_CHARS)}`;
    expect(normalizeFanLink(long).ok).toBe(false);
  });

  it('says what to do in plain words when it refuses', () => {
    const result = normalizeFanLink('not a link');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/https:\/\//);
  });
});

describe('normalizeShareLine', () => {
  it('trims and collapses spaces and line breaks into one line', () => {
    expect(normalizeShareLine('  Featuring   Tems  ')).toBe('Featuring Tems');
    expect(normalizeShareLine('Produced by\n\nSarz')).toBe('Produced by Sarz');
  });
});

describe('describeShareTiming', () => {
  it('says coming soon when there is no date', () => {
    expect(describeShareTiming(null, 'show', TODAY)).toEqual({ kind: 'soon' });
  });

  it('says coming soon when the date is still a secret', () => {
    expect(describeShareTiming('2026-10-03', 'secret', TODAY)).toEqual({ kind: 'soon' });
  });

  it('names the day for an upcoming date, without the year when it is this year', () => {
    expect(describeShareTiming('2026-10-03', 'show', TODAY)).toEqual({
      kind: 'upcoming',
      label: 'October 3',
      shortLabel: 'OCT 3',
    });
  });

  it('adds the year when the date is in another year', () => {
    expect(describeShareTiming('2027-01-09', 'show', TODAY)).toEqual({
      kind: 'upcoming',
      label: 'January 9, 2027',
      shortLabel: 'JAN 9 2027',
    });
  });

  it('says out today on release day, and out now after it', () => {
    expect(describeShareTiming(TODAY, 'show', TODAY)).toEqual({ kind: 'today' });
    expect(describeShareTiming('2026-09-01', 'show', TODAY)).toEqual({ kind: 'out' });
  });

  it('never hides a date that has already arrived, even in secret mode', () => {
    expect(describeShareTiming(TODAY, 'secret', TODAY)).toEqual({ kind: 'today' });
    expect(describeShareTiming('2026-09-01', 'secret', TODAY)).toEqual({ kind: 'out' });
  });

  it('treats a malformed date as no date rather than guessing', () => {
    expect(describeShareTiming('not-a-date', 'show', TODAY)).toEqual({ kind: 'soon' });
    expect(describeShareTiming('2026-10-03', 'show', 'nope')).toEqual({
      kind: 'upcoming',
      label: 'October 3, 2026',
      shortLabel: 'OCT 3 2026',
    });
  });
});

describe('releaseNoun', () => {
  it('uses the word people use for each kind of release', () => {
    expect(releaseNoun('single')).toBe('single');
    expect(releaseNoun('ep')).toBe('EP');
    expect(releaseNoun('album')).toBe('album');
  });
});

describe('shareDisplayTitle', () => {
  it('drops our own placeholder title so it never reaches a fan', () => {
    expect(shareDisplayTitle(DEFAULT_RELEASE_TITLE)).toBeNull();
    expect(shareDisplayTitle('   ')).toBeNull();
    expect(shareDisplayTitle(' Lagos Nights ')).toBe('Lagos Nights');
  });
});

describe('buildShareHeadline', () => {
  it('speaks in the first person for the artist', () => {
    expect(buildShareHeadline(facts(), 'artist')).toBe('My new single “Lagos Nights”');
  });

  it('names the artist when the team is posting', () => {
    expect(buildShareHeadline(facts(), 'team')).toBe('Dorian’s new single “Lagos Nights”');
  });

  it('falls back to a plain phrase when the team has no artist name', () => {
    expect(buildShareHeadline(facts({ artistName: '  ' }), 'team')).toBe('The new single “Lagos Nights”');
  });

  it('follows the kind of release', () => {
    expect(buildShareHeadline(facts({ releaseType: 'ep', title: 'Night Shift' }), 'artist')).toBe(
      'My new EP “Night Shift”'
    );
    expect(buildShareHeadline(facts({ releaseType: 'album', title: 'Home' }), 'team')).toBe(
      'Dorian’s new album “Home”'
    );
  });

  it('leaves the title out when the rollout has not been named yet', () => {
    expect(buildShareHeadline(facts({ title: DEFAULT_RELEASE_TITLE }), 'artist')).toBe('My new single');
    expect(buildShareHeadline(facts({ title: '' }), 'team')).toBe('Dorian’s new single');
  });
});

describe('buildInstagramCaption', () => {
  it('is one plain sentence with nothing else to say', () => {
    expect(buildInstagramCaption(facts(), answers(), TODAY)).toBe(
      'My new single “Lagos Nights” is out October 3.'
    );
  });

  it('puts the extra line on its own line and finishes it with a full stop', () => {
    expect(buildInstagramCaption(facts(), answers({ extraLine: 'Featuring Tems' }), TODAY)).toBe(
      'My new single “Lagos Nights” is out October 3.\nFeaturing Tems.'
    );
  });

  it('leaves an extra line that already ends in punctuation alone', () => {
    expect(buildInstagramCaption(facts(), answers({ extraLine: 'Featuring Tems!' }), TODAY)).toContain(
      '\nFeaturing Tems!'
    );
  });

  it('points to the bio instead of pasting a link Instagram cannot open', () => {
    const caption = buildInstagramCaption(
      facts(),
      answers({ fanLink: 'https://hyperfollow.com/x' }),
      TODAY
    );
    expect(caption).toContain('Pre-save link in bio.');
    expect(caption).not.toContain('https://');
  });

  it('asks people to listen once it is out', () => {
    const caption = buildInstagramCaption(
      facts({ releaseDate: '2026-09-01' }),
      answers({ fanLink: 'https://hyperfollow.com/x' }),
      TODAY
    );
    expect(caption).toBe('My new single “Lagos Nights” is out now.\nListen at the link in bio.');
  });

  it('says coming soon when the date is a secret, and never leaks the date', () => {
    const caption = buildInstagramCaption(facts(), answers({ dateMode: 'secret' }), TODAY);
    expect(caption).toBe('My new single “Lagos Nights” is coming soon.');
    expect(caption).not.toMatch(/October/);
  });
});

describe('buildStatusCaption', () => {
  it('carries the link itself, because WhatsApp opens links in a status', () => {
    expect(
      buildStatusCaption(facts(), answers({ voice: 'team', fanLink: 'https://hyperfollow.com/x' }), TODAY)
    ).toBe('Dorian’s new single “Lagos Nights” is out October 3.\nhttps://hyperfollow.com/x');
  });

  it('is just the sentence when there is no link', () => {
    expect(buildStatusCaption(facts(), answers(), TODAY)).toBe(
      'My new single “Lagos Nights” is out October 3.'
    );
  });
});

describe('buildDmMessage', () => {
  it('reads like a message from a person, with the link on its own line', () => {
    expect(
      buildDmMessage(
        facts(),
        answers({ extraLine: 'Featuring Tems', fanLink: 'https://hyperfollow.com/x' }),
        TODAY
      )
    ).toBe(
      'Hey! My new single “Lagos Nights” is out October 3. Featuring Tems.\nPre-save it here: https://hyperfollow.com/x'
    );
  });

  it('says listen once it is out', () => {
    expect(
      buildDmMessage(facts({ releaseDate: TODAY }), answers({ fanLink: 'https://x.com/a' }), TODAY)
    ).toBe('Hey! My new single “Lagos Nights” is out today.\nListen here: https://x.com/a');
  });

  it('has no link line when there is no link', () => {
    expect(buildDmMessage(facts(), answers({ voice: 'team' }), TODAY)).toBe(
      'Hey! Dorian’s new single “Lagos Nights” is out October 3.'
    );
  });
});

describe('xPostWeight', () => {
  it('counts plain words one character each', () => {
    expect(xPostWeight('Out now.')).toBe(8);
  });

  it('counts every link as 23, however long it is', () => {
    expect(xPostWeight('https://hyperfollow.com/dorian/lagos-nights-and-a-very-long-slug')).toBe(X_LINK_WEIGHT);
    expect(xPostWeight('Listen here: https://a.co')).toBe('Listen here: '.length + X_LINK_WEIGHT);
  });

  it('counts the typographic quotes and apostrophes we write as one each', () => {
    expect(xPostWeight('Dorian’s “Lagos”')).toBe(16);
  });

  it('counts emoji and wide script as two each, the way X does', () => {
    expect(xPostWeight('🌙')).toBe(2);
    expect(xPostWeight('夜')).toBe(2);
  });
});

describe('buildXPost', () => {
  it('is the sentence alone when there is nothing else to say', () => {
    expect(buildXPost(facts(), answers(), TODAY)).toBe('My new single “Lagos Nights” is out October 3.');
  });

  it('carries the link, because X opens links in a post', () => {
    const post = buildXPost(facts(), answers({ fanLink: 'https://hyperfollow.com/x' }), TODAY);
    expect(post).toBe(
      'My new single “Lagos Nights” is out October 3.\nPre-save it here: https://hyperfollow.com/x'
    );
  });

  it('asks people to listen once it is out', () => {
    const post = buildXPost(
      facts({ releaseDate: '2026-09-01' }),
      answers({ fanLink: 'https://hyperfollow.com/x' }),
      TODAY
    );
    expect(post).toMatch(/is out now\.\nListen here: https:\/\/hyperfollow\.com\/x$/);
  });

  it('keeps the extra line when it fits', () => {
    const post = buildXPost(facts(), answers({ extraLine: 'Featuring Tems' }), TODAY);
    expect(post).toBe('My new single “Lagos Nights” is out October 3.\nFeaturing Tems.');
  });

  it('drops the extra line rather than run past 280, and never drops the link', () => {
    const long = facts({ title: 'L'.repeat(150) });
    const a = answers({ extraLine: 'x'.repeat(80), fanLink: 'https://hyperfollow.com/x' });
    const post = buildXPost(long, a, TODAY);
    expect(xPostWeight(post)).toBeLessThanOrEqual(X_MAX_POST_WEIGHT);
    expect(post).not.toContain('x'.repeat(80));
    expect(post).toContain('https://hyperfollow.com/x');
  });

  it('stays inside 280 across the ordinary cases, extra line and link included', () => {
    for (const releaseType of ['single', 'ep', 'album'] as const) {
      for (const voice of ['artist', 'team'] as const) {
        const post = buildXPost(
          facts({ releaseType, title: 'A Title Somebody Might Really Pick' }),
          answers({ voice, extraLine: 'y'.repeat(80), fanLink: `https://example.com/${'z'.repeat(400)}` }),
          TODAY
        );
        expect(xPostWeight(post)).toBeLessThanOrEqual(X_MAX_POST_WEIGHT);
      }
    }
  });
});

describe('buildXIntentUrl', () => {
  it('opens X with the post already written, spaces and line breaks included', () => {
    const url = buildXIntentUrl('Out now.\nListen here: https://a.co/x?y=1&z=2');
    expect(url.startsWith('https://x.com/intent/post?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Out now.\nListen here: https://a.co/x?y=1&z=2');
  });
});

describe('buildSnapchatCaption', () => {
  it('is the sentence alone: the link goes on with the link sticker, the extra line is on the image', () => {
    const caption = buildSnapchatCaption(
      facts(),
      answers({ fanLink: 'https://hyperfollow.com/x', extraLine: 'Featuring Tems' }),
      TODAY
    );
    expect(caption).toBe('My new single “Lagos Nights” is out October 3.');
  });
});

describe('outward copy rules', () => {
  // Captions, messages and images are read by FANS, not by the manager. They
  // must never carry our in-app word for the object, our old word for the team,
  // or the punctuation the brand bans. Checked across the whole input matrix
  // rather than one example, because a rule a single fixture passes is a rule
  // the next branch can break.
  const everyOutput = (): string[] => {
    const outputs: string[] = [...SHARE_OUTWARD_STATIC_STRINGS];
    for (const voice of ['artist', 'team'] as const) {
      for (const dateMode of ['show', 'secret'] as const) {
        for (const releaseDate of [null, '2026-10-03', TODAY, '2026-09-01', '2027-02-01']) {
          for (const releaseType of ['single', 'ep', 'album'] as const) {
            for (const fanLink of ['', 'https://hyperfollow.com/x']) {
              for (const extraLine of ['', 'Featuring Tems']) {
                const f = facts({ releaseDate, releaseType });
                const a = answers({ voice, dateMode, fanLink, extraLine });
                outputs.push(
                  buildInstagramCaption(f, a, TODAY),
                  buildStatusCaption(f, a, TODAY),
                  buildXPost(f, a, TODAY),
                  buildSnapchatCaption(f, a, TODAY),
                  buildDmMessage(f, a, TODAY)
                );
              }
            }
          }
        }
      }
    }
    return outputs;
  };

  it('never uses a dash the brand bans', () => {
    for (const output of everyOutput()) {
      expect(output).not.toMatch(/[–—]/);
    }
  });

  it('never says rollout or workspace to a fan', () => {
    for (const output of everyOutput()) {
      expect(output).not.toMatch(/rollout|workspace/i);
    }
  });

  it('keeps our name off the captions and messages; the mark lives on the image only', () => {
    const generated = everyOutput().slice(SHARE_OUTWARD_STATIC_STRINGS.length);
    for (const output of generated) {
      expect(output).not.toMatch(/urganize/i);
    }
  });

  it('never leaks a secret date anywhere', () => {
    for (const build of [
      buildInstagramCaption,
      buildStatusCaption,
      buildXPost,
      buildSnapchatCaption,
      buildDmMessage,
    ]) {
      expect(build(facts(), answers({ dateMode: 'secret' }), TODAY)).not.toMatch(/Oct/);
    }
    expect(shareTimingEyebrow(describeShareTiming('2026-10-03', 'secret', TODAY))).toBe('COMING SOON');
  });
});

describe('image copy', () => {
  it('labels the kind of release in the catalog voice', () => {
    expect(shareEyebrow('single')).toBe('NEW SINGLE');
    expect(shareEyebrow('ep')).toBe('NEW EP');
    expect(shareEyebrow('album')).toBe('NEW ALBUM');
  });

  it('states the timing short at the top and in full at the bottom', () => {
    const upcoming = describeShareTiming('2026-10-03', 'show', TODAY);
    expect(shareTimingEyebrow(upcoming)).toBe('OUT OCT 3');
    expect(shareTimingAnchor(upcoming)).toBe('Out October 3');
    expect(shareTimingEyebrow({ kind: 'today' })).toBe('OUT TODAY');
    expect(shareTimingAnchor({ kind: 'today' })).toBe('Out today');
    expect(shareTimingEyebrow({ kind: 'out' })).toBe('OUT NOW');
    expect(shareTimingAnchor({ kind: 'out' })).toBe('Out now');
    expect(shareTimingEyebrow({ kind: 'soon' })).toBe('COMING SOON');
    expect(shareTimingAnchor({ kind: 'soon' })).toBe('Coming soon');
  });

  it('strips emoji the poster fonts cannot draw, and keeps accented letters', () => {
    expect(stripEmoji('Lagos 🌙 Nights')).toBe('Lagos Nights');
    expect(stripEmoji('Fire ❤️‍🔥')).toBe('Fire');
    expect(stripEmoji('Ọlọ́run Mi')).toBe('Ọlọ́run Mi');
  });

  it('shrinks the headline as the title gets longer, and never below a readable size', () => {
    for (const format of ['post', 'status'] as const) {
      for (const hasCover of [false, true]) {
        const short = shareTitleSize('Free', format, hasCover);
        const medium = shareTitleSize('Lagos Nights Forever', format, hasCover);
        const long = shareTitleSize('A Very Long Title That Keeps On Going Past Forty', format, hasCover);
        expect(short).toBeGreaterThanOrEqual(medium);
        expect(medium).toBeGreaterThanOrEqual(long);
        expect(long).toBeGreaterThanOrEqual(48);
      }
    }
  });

  it('sizes a one-word title so the word fits across the poster', () => {
    // A word cannot wrap, so a long single-word title is the case that would
    // run off the edge. Checked at a deliberately wide 0.5em per character.
    for (const title of ['Unavailable', 'Ohema', 'Supercalifragilistic']) {
      for (const format of ['post', 'status'] as const) {
        const column = format === 'post' ? 904 : 888;
        expect(shareTitleSize(title, format, false) * 0.5 * title.length).toBeLessThanOrEqual(column);
        expect(shareTitleSize(title, format, false, 1.3) * 0.5 * title.length).toBeLessThanOrEqual(column);
      }
    }
  });

  it('grows a short headline when there is little else on the poster, within the same fit', () => {
    expect(shareTitleSize('Dorian', 'status', false, 1.3)).toBeGreaterThan(
      shareTitleSize('Dorian', 'status', false)
    );
  });

  it('sizes the date line so even the longest date stays on one line', () => {
    const longest = 'Out September 30, 2027';
    expect(shareAnchorSize(longest, 'status') * 0.5 * longest.length).toBeLessThanOrEqual(888);
    expect(shareAnchorSize(longest, 'post') * 0.5 * longest.length).toBeLessThanOrEqual(904);
    expect(shareAnchorSize('Coming soon', 'status')).toBeGreaterThan(shareAnchorSize(longest, 'status'));
  });
});

describe('shareImageFileName', () => {
  it('names the file after the title and where it is going', () => {
    expect(shareImageFileName('Lagos Nights', 'post')).toBe('lagos-nights-instagram-post.png');
    expect(shareImageFileName('Lagos Nights', 'status')).toBe('lagos-nights-whatsapp-status.png');
    expect(shareImageFileName('Lagos Nights', 'post', 'x')).toBe('lagos-nights-x-post.png');
    expect(shareImageFileName('Lagos Nights', 'status', 'snapchat')).toBe('lagos-nights-snapchat-story.png');
  });

  it('sends X the post and Snapchat the full-screen status', () => {
    expect(SHARE_CHANNEL_FORMAT).toEqual({
      instagram: 'post',
      whatsapp: 'status',
      x: 'post',
      snapchat: 'status',
    });
  });

  it('never produces a file that reads as broken', () => {
    expect(shareImageFileName('🌙', 'post')).toBe('new-music-instagram-post.png');
    expect(shareImageFileName(DEFAULT_RELEASE_TITLE, 'status')).toBe('new-music-whatsapp-status.png');
    const capped = shareImageFileName('a'.repeat(39) + ' bcd', 'post');
    expect(capped).not.toMatch(/--/);
  });
});

describe('share card query', () => {
  it('round trips what the sheet sends', () => {
    const search = buildShareCardSearch({
      format: 'post',
      dateMode: 'secret',
      extraLine: 'Featuring Tems',
      todayYmd: TODAY,
    });
    expect(parseShareCardQuery(new URLSearchParams(search))).toEqual({
      ok: true,
      value: { format: 'post', dateMode: 'secret', extraLine: 'Featuring Tems', todayYmd: TODAY },
    });
  });

  it('defaults to showing the date and no extra line', () => {
    expect(parseShareCardQuery(new URLSearchParams('format=status'))).toEqual({
      ok: true,
      value: { format: 'status', dateMode: 'show', extraLine: '', todayYmd: null },
    });
  });

  it('refuses a format it cannot draw', () => {
    expect(parseShareCardQuery(new URLSearchParams('')).ok).toBe(false);
    expect(parseShareCardQuery(new URLSearchParams('format=story')).ok).toBe(false);
  });

  it('refuses a date mode it does not know', () => {
    expect(parseShareCardQuery(new URLSearchParams('format=post&date=maybe')).ok).toBe(false);
  });

  it('refuses an extra line longer than the field allows', () => {
    const line = 'x'.repeat(MAX_SHARE_LINE_CHARS + 1);
    expect(parseShareCardQuery(new URLSearchParams({ format: 'post', line })).ok).toBe(false);
  });

  it('ignores a malformed today rather than failing the image', () => {
    const parsed = parseShareCardQuery(new URLSearchParams('format=post&today=2026-13-45'));
    expect(parsed.ok && parsed.value.todayYmd).toBeNull();
  });
});

describe('isEmbeddableCoverArt', () => {
  it('embeds a PNG or JPEG under the size cap', () => {
    expect(isEmbeddableCoverArt({ mimeType: 'image/png', fileSize: 2_000_000 })).toBe(true);
    expect(isEmbeddableCoverArt({ mimeType: 'image/jpeg', fileSize: 4_000_000 })).toBe(true);
    expect(isEmbeddableCoverArt({ mimeType: 'IMAGE/JPG', fileSize: 1 })).toBe(true);
  });

  it('skips formats the renderer cannot draw', () => {
    expect(isEmbeddableCoverArt({ mimeType: 'image/webp', fileSize: 10 })).toBe(false);
    expect(isEmbeddableCoverArt({ mimeType: null, fileSize: 10 })).toBe(false);
  });

  it('skips a file too big to render quickly', () => {
    expect(isEmbeddableCoverArt({ mimeType: 'image/png', fileSize: 60 * 1024 * 1024 })).toBe(false);
  });

  it('allows an unknown size and lets the download decide', () => {
    expect(isEmbeddableCoverArt({ mimeType: 'image/png', fileSize: 0 })).toBe(true);
  });
});
