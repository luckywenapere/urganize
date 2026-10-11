import { describe, expect, it } from 'vitest';
import { findHelpCopyProblems } from '@/lib/help-copy';
import {
  APPLICANT_LABEL,
  EMPTY_GRANT_PROFILE,
  GRANT_PROFILE_COPY,
  GRANT_PROFILE_COUNTRIES,
  grantProfileFromRow,
  isGrantProfileReady,
  parseGrantProfile,
  toTeamGrantProfile,
} from './grant-profile';

describe('parseGrantProfile', () => {
  it('keeps a full, valid profile', () => {
    const parsed = parseGrantProfile({
      country: 'nigeria',
      stage: 'emerging',
      applicantTypes: ['individual', 'organisation'],
      genres: ['afrobeats', 'amapiano'],
      needs: ['recording', 'touring'],
    });
    expect(parsed).toEqual({
      value: {
        country: 'nigeria',
        stage: 'emerging',
        applicantTypes: ['individual', 'organisation'],
        genres: ['afrobeats', 'amapiano'],
        needs: ['recording', 'touring'],
      },
    });
  });

  it('accepts a blank country or stage as not set', () => {
    const parsed = parseGrantProfile({ country: null, stage: '', applicantTypes: ['individual'], genres: [], needs: [] });
    expect(parsed).toEqual({ value: { ...EMPTY_GRANT_PROFILE } });
  });

  it('refuses a country outside the list, and regions are not countries', () => {
    expect('error' in parseGrantProfile({ country: 'atlantis', applicantTypes: ['individual'] })).toBe(true);
    expect('error' in parseGrantProfile({ country: 'africa', applicantTypes: ['individual'] })).toBe(true);
    expect(GRANT_PROFILE_COUNTRIES).not.toContain('africa');
    expect(GRANT_PROFILE_COUNTRIES).not.toContain('europe');
  });

  it('refuses an unknown stage, genre, need or applicant type', () => {
    expect('error' in parseGrantProfile({ stage: 'superstar', applicantTypes: ['individual'] })).toBe(true);
    expect('error' in parseGrantProfile({ genres: ['polka'], applicantTypes: ['individual'] })).toBe(true);
    expect('error' in parseGrantProfile({ needs: ['yacht'], applicantTypes: ['individual'] })).toBe(true);
    expect('error' in parseGrantProfile({ applicantTypes: ['robot'] })).toBe(true);
  });

  it('needs at least one applicant type', () => {
    expect('error' in parseGrantProfile({ applicantTypes: [] })).toBe(true);
    expect('error' in parseGrantProfile({})).toBe(true);
  });

  it('caps genres at 3 and needs at 5, and drops repeats', () => {
    expect('error' in parseGrantProfile({ applicantTypes: ['individual'], genres: ['pop', 'rock', 'jazz', 'folk'] })).toBe(true);
    expect(
      'error' in parseGrantProfile({ applicantTypes: ['individual'], needs: ['recording', 'touring', 'travel', 'video', 'marketing', 'equipment'] })
    ).toBe(true);
    const parsed = parseGrantProfile({ applicantTypes: ['individual', 'individual'], genres: ['pop', 'pop'] });
    expect(parsed).toEqual({ value: { ...EMPTY_GRANT_PROFILE, genres: ['pop'] } });
  });

  it('ignores keys it does not know, so no free text gets in', () => {
    const parsed = parseGrantProfile({ applicantTypes: ['individual'], artistName: 'Someone', email: 'a@b.c' });
    expect(parsed).toEqual({ value: { ...EMPTY_GRANT_PROFILE } });
  });

  it('refuses a body that is not an object', () => {
    expect('error' in parseGrantProfile(null)).toBe(true);
    expect('error' in parseGrantProfile([])).toBe(true);
  });
});

describe('grantProfileFromRow', () => {
  it('reads a stored row and drops anything the vocabulary no longer has', () => {
    expect(
      grantProfileFromRow({
        country: 'ghana',
        stage: 'retired',
        applicant_types: ['organisation', 'robot'],
        genres: ['highlife', 'polka'],
        needs: ['touring'],
      })
    ).toEqual({ country: 'ghana', stage: null, applicantTypes: ['organisation'], genres: ['highlife'], needs: ['touring'] });
  });

  it('gives the empty profile for no row', () => {
    expect(grantProfileFromRow(null)).toEqual(EMPTY_GRANT_PROFILE);
  });
});

describe('isGrantProfileReady / toTeamGrantProfile', () => {
  it('is ready only with a country', () => {
    expect(isGrantProfileReady(EMPTY_GRANT_PROFILE)).toBe(false);
    expect(isGrantProfileReady({ ...EMPTY_GRANT_PROFILE, country: 'nigeria' })).toBe(true);
  });

  it('turns a profile into what the matcher reads', () => {
    expect(
      toTeamGrantProfile({ country: 'kenya', stage: 'emerging', applicantTypes: ['individual'], genres: ['gospel'], needs: ['video'] })
    ).toEqual({ countries: ['kenya'], stages: ['emerging'], applicantTypes: ['individual'], genres: ['gospel'], needs: ['video'] });
    expect(toTeamGrantProfile(EMPTY_GRANT_PROFILE)).toEqual({
      countries: [],
      stages: [],
      applicantTypes: ['individual'],
      genres: [],
      needs: [],
    });
  });
});

describe('copy', () => {
  it('passes the help copy rules', () => {
    for (const text of [GRANT_PROFILE_COPY.description, GRANT_PROFILE_COPY.missingCountry]) {
      expect(findHelpCopyProblems(text)).toEqual([]);
    }
    for (const label of Object.values(APPLICANT_LABEL)) expect(label.length).toBeLessThanOrEqual(40);
  });
});
