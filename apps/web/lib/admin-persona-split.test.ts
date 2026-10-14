import { describe, expect, it } from 'vitest';
import { buildPersonaSplit, isInternalEmail } from './admin-persona-split';

const internal = new Set(['founder@gmail.com']);

describe('who counts as one of us', () => {
  it('matches the list, our domain and plus-aliases of a listed address', () => {
    expect(isInternalEmail('Founder@gmail.com', internal)).toBe(true);
    expect(isInternalEmail('founder+flowtest1@gmail.com', internal)).toBe(true);
    expect(isInternalEmail('anyone@urganize.app', internal)).toBe(true);
    expect(isInternalEmail('manager@gmail.com', internal)).toBe(false);
    expect(isInternalEmail(null, internal)).toBe(false);
  });
});

describe('the persona split', () => {
  const rows = [
    { email: 'a@x.com', role: 'artist-manager', onboarding_persona: 'music_manager' },
    { email: 'b@x.com', role: 'artist', onboarding_persona: 'independent_artist' },
    { email: 'c@x.com', role: 'artist', onboarding_persona: 'independent_artist' },
    { email: 'd@x.com', role: 'manager', onboarding_persona: 'label_ar' },
    { email: 'e@x.com', role: 'artist-manager', onboarding_persona: null },
    { email: 'f@x.com', role: 'artist-manager', onboarding_persona: 'producer_beatmaker' },
    { email: 'founder+t@gmail.com', role: 'artist-manager', onboarding_persona: 'label_ar' },
    { email: 'cur@x.com', role: 'curator', onboarding_persona: null },
  ];
  const split = buildPersonaSplit(rows, internal);

  it('counts outside accounts only, and says how many of ours it left out', () => {
    expect(split.accounts).toBe(6);
    expect(split.answered).toBe(5);
    expect(split.internalLeftOut).toBe(1);
  });

  it('reads the persona, never the fallback role', () => {
    const byPersona = Object.fromEntries(split.byPersona.map((entry) => [entry.persona, entry.count]));
    expect(byPersona).toEqual({
      music_manager: 1,
      label_ar: 1,
      independent_artist: 2,
      artist_team: 0,
      other: 0,
      producer_beatmaker: 1,
    });
  });

  it('lists the offered answers first, in their usual order', () => {
    expect(split.byPersona.slice(0, 5).map((entry) => entry.label)).toEqual([
      'Artist manager',
      'Label',
      'Solo artist',
      'Artist team',
      'Other',
    ]);
  });
});
