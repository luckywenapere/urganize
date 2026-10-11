import { describe, expect, it } from 'vitest';
import {
  GRANT_COUNTRIES,
  GRANT_FACT_KEYS,
  GRANT_GENRES,
  GRANT_NEEDS,
  GRANT_STAGES,
  buildGrantQueries,
  readGrantFacts,
} from './query-builder';

// What leaves the building. A search goes to an outside vendor, so a query may
// describe a KIND of artist and never a person. These tests build queries from
// a payload stuffed with exactly the things that must never be sent.

const PERSONAL_PAYLOAD = {
  genre: 'afrobeats',
  country: 'nigeria',
  stage: 'emerging',
  need: 'recording',
  year: 2027,
  name: 'Dorian Okafor',
  artistName: 'Dorian',
  email: 'dorian@example.com',
  releaseTitle: 'Midnight EP (unannounced)',
  label: 'Sound Wave Records',
  team: 'Lagos Mgmt Team',
  amount: 2_500_000,
  currency: 'NGN',
  chat: 'I owe my producer money and need a grant to pay him back',
  phone: '+2348012345678',
  notes: 'secret plan',
};

describe('the allowlist', () => {
  it('names exactly five facts', () => {
    expect([...GRANT_FACT_KEYS]).toEqual(['genre', 'country', 'stage', 'need', 'year']);
  });

  it('keeps only the allowed facts from a payload full of personal data', () => {
    const facts = readGrantFacts(PERSONAL_PAYLOAD);
    expect(Object.keys(facts).sort()).toEqual(['country', 'genre', 'need', 'stage', 'year']);
    expect(JSON.stringify(facts)).not.toMatch(/dorian|okafor|example\.com|midnight|sound wave|lagos mgmt|2500000|producer|\+234|secret/i);
  });

  it('never lets a name, email or title reach a query', () => {
    const built = buildGrantQueries(PERSONAL_PAYLOAD);
    if ('error' in built) throw new Error(built.error);
    const sent = built.queries.join('\n');
    expect(sent).not.toMatch(/dorian|okafor|example\.com|midnight|sound wave|lagos mgmt|producer|secret/i);
    expect(sent).not.toContain('@');
    expect(sent).not.toMatch(/\d{7,}/);
  });

  it('drops a value that is not in the fixed vocabulary, even when it looks harmless', () => {
    const facts = readGrantFacts({ genre: "Dorian's secret EP", country: 'Nigeria', need: 'pay my landlord John', stage: 'famous-ish' });
    expect(facts).toEqual({ country: 'nigeria' });
  });

  it('accepts a vocabulary value in any case with stray spaces', () => {
    expect(readGrantFacts({ genre: '  Afrobeats ', country: 'NIGERIA' })).toEqual({ genre: 'afrobeats', country: 'nigeria' });
  });

  it('accepts a pan-African search', () => {
    expect(readGrantFacts({ country: 'Africa' })).toEqual({ country: 'africa' });
  });

  it('ignores values that are not text', () => {
    expect(readGrantFacts({ genre: 42, country: ['nigeria'], stage: { a: 1 }, need: null })).toEqual({});
    expect(readGrantFacts(null)).toEqual({});
    expect(readGrantFacts('afrobeats')).toEqual({});
  });

  it('only reads a sensible year', () => {
    expect(readGrantFacts({ country: 'ghana', year: 2027 })).toEqual({ country: 'ghana', year: 2027 });
    for (const bad of [1999, 3000, 2026.5, '2026', 'soon', NaN, null]) {
      expect(readGrantFacts({ country: 'ghana', year: bad })).toEqual({ country: 'ghana' });
    }
  });

  it('keeps every vocabulary free of anything that could hold a person', () => {
    for (const word of [...GRANT_GENRES, ...GRANT_COUNTRIES, ...GRANT_STAGES, ...GRANT_NEEDS]) {
      expect(word).toMatch(/^[a-z][a-z -]*$/);
    }
  });
});

describe('building the queries', () => {
  it('asks for a genre or a country', () => {
    expect(buildGrantQueries({})).toEqual({ error: 'Add a genre or a country.' });
    expect(buildGrantQueries({ need: 'recording', year: 2027 })).toEqual({ error: 'Add a genre or a country.' });
    expect(buildGrantQueries({ stage: 'emerging' })).toEqual({ error: 'Add a genre or a country.' });
  });

  it('returns a few different queries that name the country and the year', () => {
    const built = buildGrantQueries({ genre: 'afrobeats', country: 'nigeria', stage: 'emerging', need: 'recording', year: 2027 });
    if ('error' in built) throw new Error(built.error);
    expect(built.queries.length).toBeGreaterThanOrEqual(2);
    expect(new Set(built.queries).size).toBe(built.queries.length);
    for (const query of built.queries) {
      expect(query).toMatch(/nigeria/i);
      expect(query).toContain('2027');
      expect(query.length).toBeLessThanOrEqual(160);
      expect(query).not.toMatch(/undefined|null|\[object/);
    }
  });

  it('caps how many queries it makes', () => {
    const built = buildGrantQueries({ genre: 'afrobeats', country: 'nigeria', stage: 'emerging', need: 'recording', year: 2027 }, { max: 2 });
    if ('error' in built) throw new Error(built.error);
    expect(built.queries.length).toBe(2);
    const wide = buildGrantQueries({ genre: 'afrobeats', country: 'nigeria', stage: 'emerging', need: 'recording', year: 2027 }, { max: 99 });
    if ('error' in wide) throw new Error(wide.error);
    expect(wide.queries.length).toBeLessThanOrEqual(6);
  });

  it('works with only a genre', () => {
    const built = buildGrantQueries({ genre: 'gospel' });
    if ('error' in built) throw new Error(built.error);
    expect(built.queries.length).toBeGreaterThanOrEqual(1);
    for (const query of built.queries) expect(query).toMatch(/gospel/i);
  });

  it('echoes back only the facts it used', () => {
    const built = buildGrantQueries(PERSONAL_PAYLOAD);
    if ('error' in built) throw new Error(built.error);
    expect(Object.keys(built.facts).sort()).toEqual(['country', 'genre', 'need', 'stage', 'year']);
  });
});
