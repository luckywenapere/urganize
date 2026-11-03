import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_BIO_ALLOWED_FIELDS,
  DIRECTORY_BIO_MAX_CHARS,
  buildDirectoryBioContext,
  buildDirectoryBioMessages,
  clampAtWord,
  decideBioApply,
  parseDirectoryBioAiResponse,
  parseDirectoryBioOutput,
} from './directory-bio';
import { PERSON_BIO_MAX_CHARS } from './person-profile';
import type { KitFacts } from './profile-kit';

const base = {
  displayName: 'Tunde Ade',
  claimedRoles: ['mix_engineer', 'producer'] as const,
  delivered: [{ role: 'mix_engineer' as const, delivered: 4 }, { role: 'producer' as const, delivered: 0 }],
  city: 'Lagos',
  country: 'Nigeria',
  existingBio: '',
  kit: null as KitFacts | null,
};

describe('parseDirectoryBioOutput', () => {
  it('keeps only the bio field', () => {
    const out = parseDirectoryBioOutput({ bio: ' Hi. ', city: 'Paris', genre: 'jazz', quote: '"x"' });
    expect(out).toEqual({ bio: 'Hi.' });
    expect(DIRECTORY_BIO_ALLOWED_FIELDS).toEqual(['bio']);
  });

  it('throws on nothing usable, so the run is recorded as failed', () => {
    expect(() => parseDirectoryBioOutput({ bio: '   ' })).toThrow();
    expect(() => parseDirectoryBioOutput({ city: 'x' })).toThrow();
    expect(() => parseDirectoryBioOutput('a string')).toThrow();
    expect(() => parseDirectoryBioOutput([])).toThrow();
    expect(() => parseDirectoryBioOutput({ bio: 12 })).toThrow();
  });

  it('never exceeds the length the profile editor allows', () => {
    expect(DIRECTORY_BIO_MAX_CHARS).toBe(PERSON_BIO_MAX_CHARS);
    const long = 'word '.repeat(400);
    const out = parseDirectoryBioOutput({ bio: long });
    expect(out.bio.length).toBeLessThanOrEqual(PERSON_BIO_MAX_CHARS);
  });
});

describe('clampAtWord', () => {
  it('cuts at a word, never mid word, and leaves short text alone', () => {
    expect(clampAtWord('short', 600)).toBe('short');
    const clamped = clampAtWord('alpha beta gamma delta', 12);
    expect(clamped).toBe('alpha beta');
    expect('alpha beta gamma delta'.startsWith(clamped)).toBe(true);
  });

  it('hard cuts a single word longer than the limit', () => {
    expect(clampAtWord('x'.repeat(50), 10)).toHaveLength(10);
  });
});

describe('parseDirectoryBioAiResponse', () => {
  it('parses a JSON string answer', () => {
    expect(parseDirectoryBioAiResponse('{"bio":"Hello."}')).toEqual({ bio: 'Hello.' });
  });

  it('answers null for a response that is not JSON, per the provider contract', () => {
    expect(parseDirectoryBioAiResponse('not json')).toBeNull();
  });

  it('still throws when JSON parses but holds nothing usable', () => {
    expect(() => parseDirectoryBioAiResponse('{"x":1}')).toThrow();
  });
});

describe('buildDirectoryBioContext', () => {
  it('carries verified counts only for roles with a delivered record', () => {
    const ctx = buildDirectoryBioContext(base);
    expect(ctx.verified).toEqual(['mix engineer: 4 rollouts delivered']);
    expect(ctx.claimedOnly).toEqual(['producer']);
  });

  it('says one rollout, not one rollouts', () => {
    const ctx = buildDirectoryBioContext({ ...base, delivered: [{ role: 'mix_engineer', delivered: 1 }] });
    expect(ctx.verified).toEqual(['mix engineer: 1 rollout delivered']);
  });

  it('includes the kit descriptor, genre, city and published bio for an artist', () => {
    const ctx = buildDirectoryBioContext({
      ...base,
      kit: {
        artistId: 'a',
        artistName: 'Dorian',
        slug: 'dorian',
        descriptor: 'Lagos alt-pop',
        homeCity: 'Lagos, Nigeria',
        genre: 'Alt-pop',
        bios: { short: 'Short.', medium: 'Medium.', long: '' },
        links: [],
        photoUrl: null,
      },
    });
    expect(ctx.kit).toEqual({
      artistName: 'Dorian',
      descriptor: 'Lagos alt-pop',
      genre: 'Alt-pop',
      homeCity: 'Lagos, Nigeria',
      bio: 'Medium.',
    });
  });

  it('carries no email, phone or link, so none can leave the product', () => {
    const ctx = buildDirectoryBioContext({
      ...base,
      kit: {
        artistId: 'a',
        artistName: 'Dorian',
        slug: 'dorian',
        descriptor: '',
        homeCity: '',
        genre: '',
        bios: { short: '', medium: '', long: '' },
        links: [{ label: 'Site', url: 'https://x.example' }],
        photoUrl: 'https://signed.example/p.jpg',
      },
    });
    const text = JSON.stringify(ctx);
    expect(text).not.toContain('@');
    expect(text).not.toContain('https://');
  });
});

describe('buildDirectoryBioMessages', () => {
  it('tells the model to use only the facts and carries the house copy rules', () => {
    const messages = buildDirectoryBioMessages(buildDirectoryBioContext(base), '');
    const system = messages.find((m) => m.role === 'system')!.content;
    expect(system).toMatch(/ONLY the facts/);
    expect(system).toContain('Do not use em dashes');
    expect(system).toMatch(/Reply with JSON only/);
    expect(system).toMatch(/third person/i);
  });

  it('lists the verified work and the claimed-only roles apart', () => {
    const user = buildDirectoryBioMessages(buildDirectoryBioContext(base), '').find((m) => m.role === 'user')!.content;
    expect(user).toContain('mix engineer: 4 rollouts delivered');
    expect(user).toMatch(/Says they also work as: producer/);
    expect(user).toContain('Based in: Lagos, Nigeria');
  });

  it('includes the notes only when there are some', () => {
    const none = buildDirectoryBioMessages(buildDirectoryBioContext(base), '   ').find((m) => m.role === 'user')!.content;
    expect(none).not.toMatch(/wants said/i);
    const some = buildDirectoryBioMessages(buildDirectoryBioContext(base), 'Mixed the Ojuelegba EP').find(
      (m) => m.role === 'user'
    )!.content;
    expect(some).toContain('Mixed the Ojuelegba EP');
  });

  it('asks for a bio the length the editor allows', () => {
    const user = buildDirectoryBioMessages(buildDirectoryBioContext(base), '').find((m) => m.role === 'user')!.content;
    expect(user).toContain(String(PERSON_BIO_MAX_CHARS));
  });
});

describe('decideBioApply', () => {
  it('lets a draft land when the bio has not moved', () => {
    expect(decideBioApply({ bioWhenDrafted: 'Old.', currentBio: 'Old.' })).toEqual({ ok: true });
    expect(decideBioApply({ bioWhenDrafted: '', currentBio: '' })).toEqual({ ok: true });
    expect(decideBioApply({ bioWhenDrafted: ' Old. ', currentBio: 'Old.' })).toEqual({ ok: true });
  });

  it('refuses when the person edited their bio in between', () => {
    const decision = decideBioApply({ bioWhenDrafted: 'Old.', currentBio: 'Old, edited.' });
    expect(decision.ok).toBe(false);
    expect('error' in decision && decision.error).toMatch(/changed while AI was drafting/);
    expect(decideBioApply({ bioWhenDrafted: '', currentBio: 'Typed meanwhile.' }).ok).toBe(false);
  });
});
