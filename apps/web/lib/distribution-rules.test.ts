import { describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_RULES,
  SKIPPABLE_WARNINGS,
  PITCH_WINDOW_WARNING_DAYS,
  checkDistributionFacts,
  type DistributionCheckContext,
  type DistributionFacts,
  type DistributionIssueCode,
} from './distribution-rules';

// 11:00 in Lagos on the 9th, so the pitch window counts Lagos days from here.
const today = new Date('2026-10-09T10:00:00.000Z');

const complete: DistributionFacts = {
  title: 'Lagos Nights',
  primaryArtist: 'Dorian',
  releaseDate: '2026-12-31',
  genre: 'Afrobeats',
  language: 'English',
  explicit: false,
  artwork: { mimeType: 'image/jpeg', width: 3000, height: 3000 },
  credits: [
    { roles: ['songwriter', 'producer'], songwriterSplit: 50, masterSplit: 100 },
    { roles: ['songwriter'], songwriterSplit: 50, masterSplit: null },
  ],
};

const run = (over: Partial<DistributionFacts> = {}, context: Partial<DistributionCheckContext> = {}) =>
  checkDistributionFacts({ ...complete, ...over }, { today, ...context });

/** Every issue the check raised for one code, errors and warnings together. */
const fired = (
  code: DistributionIssueCode,
  over: Partial<DistributionFacts> = {},
  context: Partial<DistributionCheckContext> = {}
) => {
  const result = run(over, context);
  return [...result.errors, ...result.warnings].filter((issue) => issue.code === code);
};

describe('a complete rollout', () => {
  it('raises nothing at all', () => {
    expect(run()).toEqual({ errors: [], warnings: [] });
  });
});

describe('the rules, one at a time (each has a failing case and a passing case)', () => {
  it('missing_title: a blank or placeholder title fails, a real one passes', () => {
    for (const title of ['', '   ', 'Untitled rollout', 'untitled release', ' Untitled Rollout ']) {
      expect(fired('missing_title', { title }), JSON.stringify(title)).toHaveLength(1);
    }
    expect(fired('missing_title', { title: 'Lagos Nights' })).toHaveLength(0);
    expect(fired('missing_title', { title: 'Untitled Love' })).toHaveLength(0);
  });

  it('missing_primary_artist: blank fails, a name passes', () => {
    expect(fired('missing_primary_artist', { primaryArtist: '' })).toHaveLength(1);
    expect(fired('missing_primary_artist', { primaryArtist: '   ' })).toHaveLength(1);
    expect(fired('missing_primary_artist', { primaryArtist: 'Dorian' })).toHaveLength(0);
  });

  it('missing_release_date: no day fails, a day passes', () => {
    expect(fired('missing_release_date', { releaseDate: null })).toHaveLength(1);
    expect(fired('missing_release_date', { releaseDate: '' })).toHaveLength(1);
    expect(fired('missing_release_date', { releaseDate: '2026-12-31' })).toHaveLength(0);
  });

  it('missing_genre: blank fails, a genre passes', () => {
    expect(fired('missing_genre', { genre: null })).toHaveLength(1);
    expect(fired('missing_genre', { genre: '  ' })).toHaveLength(1);
    expect(fired('missing_genre', { genre: 'Afrobeats' })).toHaveLength(0);
  });

  it('missing_language: blank fails, a language passes', () => {
    expect(fired('missing_language', { language: null })).toHaveLength(1);
    expect(fired('missing_language', { language: '' })).toHaveLength(1);
    expect(fired('missing_language', { language: 'Yoruba' })).toHaveLength(0);
  });

  it('missing_explicit_flag: only "never answered" fails; false is an answer', () => {
    expect(fired('missing_explicit_flag', { explicit: null })).toHaveLength(1);
    expect(fired('missing_explicit_flag', { explicit: false })).toHaveLength(0);
    expect(fired('missing_explicit_flag', { explicit: true })).toHaveLength(0);
  });

  it('missing_songwriter_credits: needs a writing credit; a producer alone is not one', () => {
    expect(fired('missing_songwriter_credits', { credits: [] })).toHaveLength(1);
    expect(
      fired('missing_songwriter_credits', {
        credits: [{ roles: ['producer', 'engineer'], songwriterSplit: null, masterSplit: 100 }],
      })
    ).toHaveLength(1);
    for (const role of ['songwriter', 'composer', 'lyricist']) {
      expect(
        fired('missing_songwriter_credits', {
          credits: [{ roles: [role], songwriterSplit: null, masterSplit: null }],
        }),
        role
      ).toHaveLength(0);
    }
  });

  it('artwork_missing: none fails, some passes', () => {
    expect(fired('artwork_missing', { artwork: null })).toHaveLength(1);
    expect(fired('artwork_missing')).toHaveLength(0);
  });

  it('artwork_not_square: different edges fail, equal edges pass, unknown edges say nothing', () => {
    const art = (width: number | null, height: number | null) => ({
      artwork: { mimeType: 'image/png', width, height },
    });
    expect(fired('artwork_not_square', art(3000, 2999))).toHaveLength(1);
    expect(fired('artwork_not_square', art(4000, 3000))).toHaveLength(1);
    expect(fired('artwork_not_square', art(3000, 3000))).toHaveLength(0);
    // Rounded the way the picker rounds, so 3000.4 against 3000 is square.
    expect(fired('artwork_not_square', art(3000.4, 3000))).toHaveLength(0);
    expect(fired('artwork_not_square', art(null, null))).toHaveLength(0);
    expect(fired('artwork_not_square', { artwork: null })).toHaveLength(0);
  });

  it('artwork_too_small: under 3000 on either edge fails, 3000 passes, unknown fails', () => {
    const art = (width: number | null, height: number | null) => ({
      artwork: { mimeType: 'image/png', width, height },
    });
    expect(fired('artwork_too_small', art(2999, 2999))).toHaveLength(1);
    expect(fired('artwork_too_small', art(3000, 2999))).toHaveLength(1);
    expect(fired('artwork_too_small', art(2999, 3000))).toHaveLength(1);
    expect(fired('artwork_too_small', art(3000, 3000))).toHaveLength(0);
    expect(fired('artwork_too_small', art(6000, 6000))).toHaveLength(0);
    // Sizes were not recorded before 2026-08-22: unknown blocks, because this
    // check gates an order. Uploading the artwork again records the size.
    expect(fired('artwork_too_small', art(null, null))).toHaveLength(1);
    expect(fired('artwork_too_small', art(3000, null))).toHaveLength(1);
    expect(fired('artwork_too_small', { artwork: null })).toHaveLength(0);
  });

  it('artwork_wrong_format: JPG and PNG pass, anything else fails', () => {
    const art = (mimeType: string | null) => ({ artwork: { mimeType, width: 3000, height: 3000 } });
    expect(fired('artwork_wrong_format', art('image/jpeg'))).toHaveLength(0);
    expect(fired('artwork_wrong_format', art('image/png'))).toHaveLength(0);
    expect(fired('artwork_wrong_format', art('IMAGE/PNG'))).toHaveLength(0);
    expect(fired('artwork_wrong_format', art('image/webp'))).toHaveLength(1);
    expect(fired('artwork_wrong_format', art('image/gif'))).toHaveLength(1);
    expect(fired('artwork_wrong_format', art(null))).toHaveLength(1);
    expect(fired('artwork_wrong_format', { artwork: null })).toHaveLength(0);
  });

  it('feat_in_title: feat, ft. and featuring warn, other words do not', () => {
    for (const title of [
      'Lagos Nights (feat. Tems)',
      'Lagos Nights ft. Tems',
      'Lagos Nights Featuring Tems',
      'LAGOS NIGHTS FEAT TEMS',
      'Lagos Nights (Ft Tems)',
    ]) {
      expect(fired('feat_in_title', { title }), title).toHaveLength(1);
    }
    for (const title of ['Feature Presentation', 'Left Alone', 'Often', 'Lagos Nights', 'Defeat']) {
      expect(fired('feat_in_title', { title }), title).toHaveLength(0);
    }
  });

  it('title_all_caps: over three capital letters warns, three or fewer or mixed case does not', () => {
    for (const title of ['LAGOS NIGHTS', 'ABCD', 'BLESS UP 2', 'LAGOS NIGHTS!']) {
      expect(fired('title_all_caps', { title }), title).toHaveLength(1);
    }
    for (const title of ['Lagos Nights', 'SOS', 'SOS!', 'ABC 123', '2026', 'Lagos NIGHTS', '東京']) {
      expect(fired('title_all_caps', { title }), title).toHaveLength(0);
    }
  });

  it('splits_not_100: a total off 100 warns, 100 or no answers does not', () => {
    const credits = (writing: Array<number | null>, master: Array<number | null> = []) =>
      writing.map((songwriterSplit, index) => ({
        roles: ['songwriter'],
        songwriterSplit,
        masterSplit: master[index] ?? null,
      }));

    const off = fired('splits_not_100', { credits: credits([50, 40]) });
    expect(off).toHaveLength(1);
    expect(off[0].message).toBe(
      'Splits on Lagos Nights (writing shares) add up to 90%. They should add up to 100%.'
    );

    expect(fired('splits_not_100', { credits: credits([50, 50]) })).toHaveLength(0);
    // Floats: these really do sum to 99.99999999999999 and 100.00000000000001,
    // and both must read as 100 (the old 33.3 + 33.3 + 33.4 sums to exactly 100,
    // so it never tested this).
    expect(28.4 + 35.8 + 35.8).not.toBe(100);
    expect(28.6 + 35.7 + 35.7).not.toBe(100);
    expect(fired('splits_not_100', { credits: credits([28.4, 35.8, 35.8]) })).toHaveLength(0);
    expect(fired('splits_not_100', { credits: credits([28.6, 35.7, 35.7]) })).toHaveLength(0);
    // Nobody has given a split yet: nothing to add up, so nothing to warn about.
    expect(fired('splits_not_100', { credits: credits([null, null]) })).toHaveLength(0);
    expect(fired('splits_not_100', { credits: [] })).toHaveLength(0);
    // Over 100 counts too, and a decimal keeps one place.
    expect(fired('splits_not_100', { credits: credits([60.5, 50]) })[0].message).toContain('add up to 110.5%');
  });

  it('splits_not_100: writing and master are checked separately, one warning each', () => {
    const both = fired('splits_not_100', {
      credits: [
        { roles: ['songwriter'], songwriterSplit: 50, masterSplit: 70 },
        { roles: ['producer'], songwriterSplit: 40, masterSplit: 20 },
      ],
    });
    expect(both.map((issue) => issue.message)).toEqual([
      'Splits on Lagos Nights (writing shares) add up to 90%. They should add up to 100%.',
      'Splits on Lagos Nights (master shares) add up to 90%. They should add up to 100%.',
    ]);
    // Writing fine, master off: only the master one.
    const masterOnly = fired('splits_not_100', {
      credits: [
        { roles: ['songwriter'], songwriterSplit: 100, masterSplit: 60 },
        { roles: ['producer'], songwriterSplit: null, masterSplit: 30 },
      ],
    });
    expect(masterOnly).toHaveLength(1);
    expect(masterOnly[0].message).toContain('(master shares)');
  });

  it('pitch_window_tight: warns from today up to 34 days out, not at 35, not after', () => {
    // Today is 2026-10-09 in Lagos.
    expect(PITCH_WINDOW_WARNING_DAYS).toBe(35);
    expect(fired('pitch_window_tight', { releaseDate: '2026-11-12' })).toHaveLength(1); // 34 days
    expect(fired('pitch_window_tight', { releaseDate: '2026-11-13' })).toHaveLength(0); // 35 days
    expect(fired('pitch_window_tight', { releaseDate: '2026-10-09' })).toHaveLength(1); // today
    expect(fired('pitch_window_tight', { releaseDate: '2026-10-08' })).toHaveLength(0); // passed
    expect(fired('pitch_window_tight', { releaseDate: null })).toHaveLength(0);
  });

  it('pitch_window_tight: a team that skipped it stops seeing it', () => {
    expect(fired('pitch_window_tight', { releaseDate: '2026-11-12', skippedWarnings: ['pitch_window_tight'] })).toHaveLength(0);
    // Only skippable codes count: a skip cannot hide another warning or an error.
    expect(fired('title_all_caps', { title: 'LAGOS NIGHTS', skippedWarnings: ['pitch_window_tight'] })).toHaveLength(1);
    expect(fired('missing_title', { title: '', skippedWarnings: ['missing_title'] })).toHaveLength(1);
  });

  it('release_date_tight: a team that chose to keep the date stops seeing it', () => {
    expect(fired('release_date_tight', { releaseDate: '2026-10-20', skippedWarnings: ['release_date_tight'] })).toHaveLength(0);
  });

  it('release_date_tight: a date inside three weeks, or one that has passed, gets a word', () => {
    expect(fired('release_date_tight', { releaseDate: '2026-10-20' })[0].message).toMatch(/14 working days/);
    expect(fired('release_date_tight', { releaseDate: '2026-09-01' })[0].message).toMatch(/passed/);
    expect(fired('release_date_tight', { releaseDate: '2026-12-31' })).toHaveLength(0);
    expect(fired('release_date_tight', { releaseDate: null })).toHaveLength(0);
  });
});

describe('levels, copy and order', () => {
  it('uses the brief’s level for every code in its table', () => {
    const errorCodes: DistributionIssueCode[] = [
      'missing_title',
      'missing_primary_artist',
      'missing_release_date',
      'missing_genre',
      'missing_explicit_flag',
      'missing_songwriter_credits',
      'artwork_missing',
      'artwork_not_square',
      'artwork_too_small',
      'artwork_wrong_format',
    ];
    const warningCodes: DistributionIssueCode[] = [
      'feat_in_title',
      'title_all_caps',
      'splits_not_100',
      'pitch_window_tight',
    ];
    const byCode = new Map(DISTRIBUTION_RULES.map((rule) => [rule.code, rule.level]));
    for (const code of errorCodes) expect(byCode.get(code), code).toBe('error');
    for (const code of warningCodes) expect(byCode.get(code), code).toBe('warning');
  });

  it('lets a team skip every warning and no error', () => {
    for (const rule of DISTRIBUTION_RULES) {
      expect(rule.code in SKIPPABLE_WARNINGS, rule.code).toBe(rule.level === 'warning');
    }
  });

  it('keeps every code in the list once', () => {
    const codes = DISTRIBUTION_RULES.map((rule) => rule.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('says what the brief says, word for word', () => {
    const worst = run(
      {
        title: 'LAGOS NIGHTS (FEAT. TEMS)',
        primaryArtist: '',
        releaseDate: '2026-10-20',
        genre: null,
        language: null,
        explicit: null,
        artwork: { mimeType: 'image/webp', width: 2000, height: 1000 },
        credits: [],
      },
    );
    const messages = Object.fromEntries(
      [...worst.errors, ...worst.warnings].map((issue) => [issue.code, issue.message])
    );
    expect(messages).toMatchObject({
      missing_primary_artist: 'Add the main artist.',
      missing_genre: 'Pick a genre.',
      missing_explicit_flag: 'Say if the release is explicit.',
      missing_songwriter_credits: 'Add songwriter credits to every track.',
      artwork_not_square: 'Artwork has to be square.',
      artwork_too_small: 'Artwork has to be at least 3000 x 3000 px.',
      artwork_wrong_format: 'Artwork has to be JPG or PNG.',
      feat_in_title: 'Put featured artists in the Featured artist field, not the title.',
      title_all_caps: 'Stores often reject titles in all caps.',
      pitch_window_tight: 'Release day is under 35 days away. That’s tight for a Spotify pitch.',
    });
    expect(fired('missing_title', { title: '' })[0].message).toBe('Add a release title.');
    expect(fired('missing_release_date', { releaseDate: null })[0].message).toBe('Set a release day.');
    expect(fired('artwork_missing', { artwork: null })[0].message).toBe('Add artwork.');
  });

  it('never uses an em dash, and never says workspace', () => {
    const worst = run(
      {
        title: 'LAGOS NIGHTS FEAT. TEMS',
        primaryArtist: '',
        releaseDate: '2026-10-10',
        genre: null,
        language: null,
        explicit: null,
        artwork: { mimeType: 'image/webp', width: 10, height: 20 },
        credits: [{ roles: ['producer'], songwriterSplit: 10, masterSplit: 10 }],
      },
    );
    for (const issue of [...worst.errors, ...worst.warnings]) {
      expect(issue.message, issue.message).not.toMatch(/[—–]/);
      expect(issue.message, issue.message).not.toMatch(/workspace/i);
    }
  });

  it('keeps errors and warnings apart, each in the order of the list', () => {
    const result = run({ title: 'BLESS UP FT. TEMS', genre: null, primaryArtist: '' });
    expect(result.errors.map((issue) => issue.code)).toEqual(['missing_primary_artist', 'missing_genre']);
    expect(result.warnings.map((issue) => issue.code)).toEqual(['feat_in_title', 'title_all_caps']);
  });

  it('points every issue at a field path', () => {
    const result = run({
      title: '',
      primaryArtist: '',
      releaseDate: null,
      genre: null,
      language: null,
      explicit: null,
      artwork: null,
      credits: [],
    });
    for (const issue of result.errors) expect(issue.fieldPath, issue.code).toBeTruthy();
  });
});
