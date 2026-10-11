import { describe, expect, it } from 'vitest';
import {
  type GrantProgramme,
  type TeamGrantProfile,
  countryCodesFor,
  matchProgramme,
  pickSuggestions,
  teamWeekdaySlot,
} from './programmes';

const TODAY = '2026-10-11';

function programme(over: Partial<GrantProgramme> = {}): GrantProgramme {
  return {
    slug: 'example-fund',
    funder: 'Example Foundation',
    programme: 'Music Fund',
    url: 'https://example.org/fund',
    kind: 'grant',
    countries: ['NG'],
    applicantTypes: ['individual'],
    needs: [],
    genres: [],
    stages: [],
    amountMin: null,
    amountMax: 5000,
    currency: 'USD',
    status: 'open',
    opensOn: null,
    deadlineOn: '2026-11-30',
    lastClosedOn: null,
    recurring: true,
    summary: '',
    eligibility: '',
    sourceUrl: 'https://example.org/fund',
    checkedOn: TODAY,
    active: true,
    ...over,
  };
}

const nigerianArtist: TeamGrantProfile = {
  countries: ['nigeria'],
  genres: ['afrobeats'],
  stages: ['emerging'],
  needs: ['recording'],
  applicantTypes: ['individual'],
};

describe('countryCodesFor', () => {
  it('maps a country to its own code, its region and ANY', () => {
    expect(countryCodesFor('nigeria')).toEqual(new Set(['NG', 'AFRICA', 'SSA', 'ANY']));
  });

  it('keeps North Africa out of sub-Saharan Africa', () => {
    const egypt = countryCodesFor('egypt');
    expect(egypt.has('AFRICA')).toBe(true);
    expect(egypt.has('SSA')).toBe(false);
  });

  it('does not treat "africa" as any one country', () => {
    expect(countryCodesFor('africa')).toEqual(new Set(['AFRICA', 'ANY']));
  });

  it('maps europe to EU and the UK to GB, not EU', () => {
    expect(countryCodesFor('europe')).toEqual(new Set(['EU', 'ANY']));
    expect(countryCodesFor('united kingdom').has('EU')).toBe(false);
  });
});

describe('matchProgramme', () => {
  it('matches an open Nigerian grant for a Nigerian artist and says why', () => {
    const match = matchProgramme(programme(), nigerianArtist, TODAY);
    expect(match).not.toBeNull();
    expect(match?.why).toContain('Nigeria');
  });

  it('matches an Africa-wide programme for a Nigerian artist', () => {
    expect(matchProgramme(programme({ countries: ['AFRICA'] }), nigerianArtist, TODAY)?.why).toContain('Africa');
  });

  it('refuses a programme for another country', () => {
    expect(matchProgramme(programme({ countries: ['GB'] }), nigerianArtist, TODAY)).toBeNull();
  });

  it('refuses a team with no country unless the programme is open to anyone', () => {
    const noCountry = { ...nigerianArtist, countries: [] };
    expect(matchProgramme(programme(), noCountry, TODAY)).toBeNull();
    expect(matchProgramme(programme({ countries: ['ANY'] }), noCountry, TODAY)).not.toBeNull();
  });

  it('never suggests a loan or an investment, even an open one', () => {
    expect(matchProgramme(programme({ kind: 'loan' }), nigerianArtist, TODAY)).toBeNull();
    expect(matchProgramme(programme({ kind: 'investment' }), nigerianArtist, TODAY)).toBeNull();
  });

  it('suggests residencies, scholarships and prizes', () => {
    for (const kind of ['residency', 'scholarship', 'prize'] as const) {
      expect(matchProgramme(programme({ kind }), nigerianArtist, TODAY)).not.toBeNull();
    }
  });

  it('refuses anything not open, inactive, or past its deadline', () => {
    expect(matchProgramme(programme({ status: 'closed' }), nigerianArtist, TODAY)).toBeNull();
    expect(matchProgramme(programme({ status: 'upcoming' }), nigerianArtist, TODAY)).toBeNull();
    expect(matchProgramme(programme({ active: false }), nigerianArtist, TODAY)).toBeNull();
    expect(matchProgramme(programme({ deadlineOn: '2026-10-10' }), nigerianArtist, TODAY)).toBeNull();
  });

  it('refuses a deadline too close to act on, by default under 3 days away', () => {
    expect(matchProgramme(programme({ deadlineOn: '2026-10-12' }), nigerianArtist, TODAY)).toBeNull();
    expect(matchProgramme(programme({ deadlineOn: '2026-10-14' }), nigerianArtist, TODAY)).not.toBeNull();
  });

  it('accepts an open rolling programme with no deadline', () => {
    expect(matchProgramme(programme({ deadlineOn: null }), nigerianArtist, TODAY)).not.toBeNull();
  });

  it('refuses an organisations-only programme for an individual team', () => {
    expect(matchProgramme(programme({ applicantTypes: ['organisation'] }), nigerianArtist, TODAY)).toBeNull();
    const label = { ...nigerianArtist, applicantTypes: ['organisation' as const] };
    expect(matchProgramme(programme({ applicantTypes: ['organisation'] }), label, TODAY)).not.toBeNull();
  });

  it('treats an empty genre or stage list as any, and a set one as a filter', () => {
    expect(matchProgramme(programme({ genres: ['gospel'] }), nigerianArtist, TODAY)).toBeNull();
    expect(matchProgramme(programme({ stages: ['established'] }), nigerianArtist, TODAY)).toBeNull();
    const hit = matchProgramme(programme({ genres: ['afrobeats'], stages: ['emerging'] }), nigerianArtist, TODAY);
    expect(hit?.why).toContain('Afrobeats');
    expect(hit?.why).toContain('emerging');
  });

  it('a set genre list refuses a team whose genre is unknown', () => {
    const unknownGenre = { ...nigerianArtist, genres: [] };
    expect(matchProgramme(programme({ genres: ['afrobeats'] }), unknownGenre, TODAY)).toBeNull();
  });

  it('uses needs to explain and rank, never to refuse', () => {
    const recording = matchProgramme(programme({ needs: ['recording'] }), nigerianArtist, TODAY);
    const touring = matchProgramme(programme({ needs: ['touring'] }), nigerianArtist, TODAY);
    expect(recording?.why).toContain('recording');
    expect(touring).not.toBeNull();
    expect((recording?.score ?? 0) > (touring?.score ?? 0)).toBe(true);
  });

  it('keeps the reason within 200 characters', () => {
    const long = programme({ needs: ['recording', 'touring', 'travel', 'video', 'marketing', 'distribution'] });
    const team = { ...nigerianArtist, needs: [...long.needs] };
    expect(matchProgramme(long, team, TODAY)?.why.length).toBeLessThanOrEqual(200);
  });
});

describe('pickSuggestions', () => {
  it('skips programmes the team was already shown, in any state', () => {
    const picks = pickSuggestions([programme({ slug: 'a' }), programme({ slug: 'b' })], nigerianArtist, {
      today: TODAY,
      alreadySuggested: new Set(['a']),
    });
    expect(picks.map((pick) => pick.programme.slug)).toEqual(['b']);
  });

  it('puts the better fit first, then the sooner deadline, and caps the count', () => {
    const programmes = [
      programme({ slug: 'late', deadlineOn: '2026-12-30' }),
      programme({ slug: 'soon', deadlineOn: '2026-10-20' }),
      programme({ slug: 'rolling', deadlineOn: null }),
      programme({ slug: 'fit', needs: ['recording'], deadlineOn: '2026-12-31' }),
    ];
    const picks = pickSuggestions(programmes, nigerianArtist, { today: TODAY, alreadySuggested: new Set(), max: 3 });
    expect(picks.map((pick) => pick.programme.slug)).toEqual(['fit', 'soon', 'late']);
  });
});

describe('teamWeekdaySlot', () => {
  it('is stable for a team and lands on 0 to 6', () => {
    const id = '7c1f6a2e-3d4b-4a8e-9f00-123456789abc';
    expect(teamWeekdaySlot(id)).toBe(teamWeekdaySlot(id));
    expect(teamWeekdaySlot(id)).toBeGreaterThanOrEqual(0);
    expect(teamWeekdaySlot(id)).toBeLessThanOrEqual(6);
  });

  it('spreads teams across the week', () => {
    const slots = new Set(Array.from({ length: 200 }, (_, i) => teamWeekdaySlot(`team-${i}`)));
    expect(slots.size).toBe(7);
  });
});
