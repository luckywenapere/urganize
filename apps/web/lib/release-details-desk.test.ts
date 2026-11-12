import { describe, expect, it } from 'vitest';
import {
  creditAnswerLine,
  DETAILS_FIELDS,
  detailsProgress,
  missingRequiredDetails,
  REQUIRED_DETAILS,
  splitsChecks,
  type DetailsForm,
} from './release-details-desk';

const full: DetailsForm = {
  genre: 'Afrobeats',
  subgenre: 'Afropop',
  language: 'English',
  featuredArtists: 'Tobi Wav',
  isrc: 'NGA0K2600013',
  upc: '198012345678',
  iswc: 'T-000.000.000-0',
  labelName: 'Ayo Kalu Music',
  pLine: '2026 Ayo Kalu Music',
  cLine: '2026 Ayo Kalu Music',
  explicit: false,
};

describe('missingRequiredDetails', () => {
  it('asks only for what the store check refuses an order over', () => {
    expect(Object.keys(REQUIRED_DETAILS).sort()).toEqual(['explicit', 'genre', 'language']);
  });

  it('marks an empty or blank genre and language, and an unanswered explicit', () => {
    expect(missingRequiredDetails({ ...full, genre: '  ', language: '', explicit: null })).toEqual(['genre', 'language', 'explicit']);
  });

  it('treats No as an answer', () => {
    expect(missingRequiredDetails({ ...full, explicit: false })).toEqual([]);
  });

  it('never marks an optional box', () => {
    expect(missingRequiredDetails({ ...full, iswc: '', isrc: '', upc: '' })).toEqual([]);
  });
});

describe('detailsProgress', () => {
  it('counts every box and the explicit answer', () => {
    expect(DETAILS_FIELDS).toHaveLength(11);
    expect(detailsProgress(full)).toEqual({ filled: 11, total: 11, line: 'Everything is filled in.' });
  });

  it('names the last box left', () => {
    expect(detailsProgress({ ...full, iswc: '' })).toEqual({ filled: 10, total: 11, line: 'ISWC is the last one.' });
  });

  it('puts a required box ahead of an optional one', () => {
    expect(detailsProgress({ ...full, iswc: '', language: '' }).line).toBe('Language is next. Stores need it.');
  });

  it('says plainly what is next when only optional boxes are left', () => {
    expect(detailsProgress({ ...full, iswc: '', cLine: '' }).line).toBe('ISWC is next.');
  });
});

describe('creditAnswerLine', () => {
  it('reads roles, then each share', () => {
    expect(creditAnswerLine(['Songwriter', 'Producer'], { songwriterSplit: 50, masterSplit: 25 })).toBe(
      'Songwriter, Producer · 50% writing · 25% recording'
    );
  });

  it('leaves out a share nobody gave', () => {
    expect(creditAnswerLine(['Producer'], { songwriterSplit: null, masterSplit: 33.33 })).toBe('Producer · 33.3% recording');
  });
});

describe('splitsChecks', () => {
  it('says the shares add up when they make 100', () => {
    expect(
      splitsChecks([
        { roles: [], songwriterSplit: 50, masterSplit: null },
        { roles: [], songwriterSplit: 25, masterSplit: null },
        { roles: [], songwriterSplit: 25, masterSplit: null },
      ])
    ).toEqual([{ label: 'Writing shares add up', value: '100%', off: false }]);
  });

  it('flags a kind that is off, and skips a kind nobody answered', () => {
    expect(
      splitsChecks([
        { roles: [], songwriterSplit: 60, masterSplit: 40 },
        { roles: [], songwriterSplit: 30, masterSplit: null },
      ])
    ).toEqual([
      { label: 'Writing shares add up', value: '90%', off: true },
      { label: 'Recording shares add up', value: '40%', off: true },
    ]);
    expect(splitsChecks([{ roles: [], songwriterSplit: null, masterSplit: null }])).toEqual([]);
  });

  it('reads 28.6 + 35.7 + 35.7 as 100', () => {
    expect(
      splitsChecks([
        { roles: [], songwriterSplit: 28.6, masterSplit: null },
        { roles: [], songwriterSplit: 35.7, masterSplit: null },
        { roles: [], songwriterSplit: 35.7, masterSplit: null },
      ])[0].off
    ).toBe(false);
  });
});
