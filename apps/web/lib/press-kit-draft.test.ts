import { describe, expect, it } from 'vitest';

import {
  DRAFTABLE_SECTIONS,
  DRAFT_ALLOWED_FIELDS,
  buildDraftContext,
  buildDraftMessages,
  decideDraftApply,
  isDraftableSection,
  parseDraftAiResponse,
  parseDraftOutput,
} from './press-kit-draft';
import type { PressKitSection } from '@/types/press-kits';

const section = (
  key: PressKitSection['section'],
  content: Record<string, unknown> = {},
  over: Partial<PressKitSection> = {}
): PressKitSection => ({
  id: `section-${key}`,
  section: key,
  content,
  publishedContent: null,
  status: 'empty',
  source: 'autofill',
  position: 0,
  hidden: false,
  updatedBy: null,
  updatedAt: '2026-09-05T10:00:00.000Z',
  ...over,
});

describe('what UrgAns may draft', () => {
  it('drafts prose and never facts', () => {
    expect([...DRAFTABLE_SECTIONS].sort()).toEqual(['bios', 'header', 'latest_release']);
  });

  it('will not draft a number, a credit, a show or a link', () => {
    for (const key of ['numbers', 'credits', 'live', 'links', 'music', 'press'] as const) {
      expect(isDraftableSection(key)).toBe(false);
    }
  });

  it('will not draft the contact block, which is other people details', () => {
    expect(isDraftableSection('contact')).toBe(false);
  });

  it('names the fields it may write, and only prose ones', () => {
    expect(DRAFT_ALLOWED_FIELDS.header).toEqual(['descriptor']);
    expect(DRAFT_ALLOWED_FIELDS.bios).toEqual(['short', 'medium', 'long']);
    expect(DRAFT_ALLOWED_FIELDS.latest_release).toEqual(['hook']);
    // Every draftable section declares its fields, and nothing else does.
    expect(Object.keys(DRAFT_ALLOWED_FIELDS).sort()).toEqual([...DRAFTABLE_SECTIONS].sort());
  });
});

describe('parseDraftOutput', () => {
  it('takes the fields it asked for', () => {
    expect(parseDraftOutput('bios', { short: 'a', medium: 'b', long: 'c' })).toEqual({
      short: 'a',
      medium: 'b',
      long: 'c',
    });
  });

  it('DROPS a field it did not ask for, however plausible', () => {
    const parsed = parseDraftOutput('header', {
      descriptor: 'Afrobeats singer',
      // The model has no business inventing either of these: one is a fact
      // about a person, the other came from the release metadata.
      homeCity: 'Lagos',
      genreTags: 'Amapiano',
    });
    expect(parsed).toEqual({ descriptor: 'Afrobeats singer' });
  });

  it('only lets the hook through on the latest release', () => {
    const parsed = parseDraftOutput('latest_release', {
      hook: 'His first song back in Lagos.',
      title: 'A different title',
      releaseId: 'somebody-elses-release',
    });
    expect(parsed).toEqual({ hook: 'His first song back in Lagos.' });
  });

  it('refuses a section it never offered to draft', () => {
    expect(() => parseDraftOutput('numbers', { stats: [] })).toThrow();
  });

  it('refuses output that is not an object', () => {
    expect(() => parseDraftOutput('bios', null)).toThrow();
    expect(() => parseDraftOutput('bios', 'a bio' as never)).toThrow();
    expect(() => parseDraftOutput('bios', [] as never)).toThrow();
  });

  it('refuses output with nothing usable in it', () => {
    expect(() => parseDraftOutput('bios', { short: '   ' })).toThrow();
    expect(() => parseDraftOutput('bios', {})).toThrow();
  });

  it('drops a non-string value rather than writing it', () => {
    expect(parseDraftOutput('bios', { short: 'a', medium: 42 as never })).toEqual({ short: 'a' });
  });

  it('trims, because a model loves a leading newline', () => {
    expect(parseDraftOutput('bios', { short: '\n  A singer.  \n' })).toEqual({ short: 'A singer.' });
  });

  it('caps a runaway answer rather than storing it whole', () => {
    const parsed = parseDraftOutput('bios', { long: 'x'.repeat(20000) });
    expect((parsed.long as string).length).toBeLessThanOrEqual(4000);
  });
});

// generateStructuredAiOutput (lib/ai/provider.ts) always calls its `parse`
// callback with the model's raw STRING response, never a parsed object — so
// this is what press-kit-draft-section.ts's `parse:` callback actually gets
// handed, and it is the case the parseDraftOutput tests above never covered
// (they only ever pass already-parsed objects in, plus one case proving
// parseDraftOutput itself rejects a bare string). A real JSON string has to
// round-trip through parseDraftAiResponse the same way it round-trips
// through the real caller.
describe('parseDraftAiResponse', () => {
  it('round-trips a real JSON string the way generateStructuredAiOutput actually calls it', () => {
    const parsed = parseDraftAiResponse(
      'bios',
      JSON.stringify({ short: 'a', medium: 'b', long: 'c' })
    );
    expect(parsed).toEqual({ short: 'a', medium: 'b', long: 'c' });
  });

  it('still drops a field it did not ask for, once parsed', () => {
    const parsed = parseDraftAiResponse(
      'header',
      JSON.stringify({ descriptor: 'Afrobeats singer', homeCity: 'Lagos' })
    );
    expect(parsed).toEqual({ descriptor: 'Afrobeats singer' });
  });

  it('returns null, rather than throwing, when the string is not JSON at all', () => {
    // null is generateStructuredAiOutput's own signal for "invalid format" —
    // see GenerateStructuredAiOutputOptions['parse'] in lib/ai/provider.ts.
    expect(parseDraftAiResponse('bios', 'sorry, here is your bio!')).toBeNull();
    expect(parseDraftAiResponse('bios', '')).toBeNull();
  });

  it('still throws when the JSON parses but has nothing usable in it, same as parseDraftOutput', () => {
    expect(() => parseDraftAiResponse('bios', JSON.stringify({ short: '   ' }))).toThrow();
    expect(() => parseDraftAiResponse('bios', JSON.stringify({}))).toThrow();
  });

  it('still throws for a section UrgAns was never offered to draft', () => {
    expect(() => parseDraftAiResponse('numbers', JSON.stringify({ stats: [] }))).toThrow();
  });

  it('still throws when the JSON parses to an array or a scalar rather than an object', () => {
    expect(() => parseDraftAiResponse('bios', JSON.stringify(['a', 'b']))).toThrow();
    expect(() => parseDraftAiResponse('bios', JSON.stringify('a bio'))).toThrow();
    expect(() => parseDraftAiResponse('bios', JSON.stringify(null))).toThrow();
  });
});

describe('buildDraftContext', () => {
  const sections = [
    section('header', { genreTags: 'Afrobeats, alte', homeCity: 'Lagos' }),
    section('bios', { short: 'Already written.' }),
    section('latest_release', { releaseId: 'r1', title: 'Ojuelegba', releaseType: 'single', releaseDate: '2026-08-01' }),
    section('credits', { credits: [{ legalName: 'Ada Obi', roles: ['producer'] }] }),
    section('live', { shows: [{ title: 'Lagos', venueName: 'The Shrine' }] }),
    section('contact', { contacts: [{ name: 'Ada', role: 'Manager', email: 'ada@example.com' }] }),
  ];

  it('carries the facts a bio is written from', () => {
    const context = buildDraftContext('Dorian', sections);
    expect(context.artistName).toBe('Dorian');
    expect(context.genres).toBe('Afrobeats, alte');
    expect(context.homeCity).toBe('Lagos');
    expect(context.latestRelease?.title).toBe('Ojuelegba');
  });

  it('carries what the person already wrote, so a redraft can match its voice', () => {
    expect(buildDraftContext('Dorian', sections).existingBios.short).toBe('Already written.');
  });

  it('NEVER carries an email address into a prompt', () => {
    const serialized = JSON.stringify(buildDraftContext('Dorian', sections));
    expect(serialized).not.toContain('ada@example.com');
    expect(serialized).not.toContain('@');
  });
});

describe('buildDraftMessages', () => {
  const context = buildDraftContext('Dorian', [
    section('header', { genreTags: 'Afrobeats' }),
    section('bios'),
  ]);

  it('asks for one section and names the fields it wants back', () => {
    const messages = buildDraftMessages('bios', context, '');
    const text = messages.map((message) => message.content).join('\n');
    expect(text).toContain('short');
    expect(text).toContain('medium');
    expect(text).toContain('long');
  });

  it('tells the model not to invent a fact', () => {
    const text = buildDraftMessages('bios', context, '').map((m) => m.content).join('\n');
    expect(text.toLowerCase()).toContain('do not invent');
  });

  it('passes the manager notes through when there are some', () => {
    const text = buildDraftMessages('bios', context, 'He just finished a tour.')
      .map((m) => m.content)
      .join('\n');
    expect(text).toContain('He just finished a tour.');
  });

  it('never puts the banned word in a prompt that shapes customer copy', () => {
    const text = buildDraftMessages('bios', context, '').map((m) => m.content).join('\n');
    expect(text.toLowerCase()).not.toContain('workspace');
    expect(text).not.toContain('—');
  });
});

describe('decideDraftApply', () => {
  it('applies when the section has not moved since the draft', () => {
    expect(
      decideDraftApply({
        draftedUpdatedAt: '2026-09-05T10:00:00.000Z',
        currentUpdatedAt: '2026-09-05T10:00:00.000Z',
      }).ok
    ).toBe(true);
  });

  it('REFUSES when somebody edited the section while UrgAns was drafting', () => {
    const decision = decideDraftApply({
      draftedUpdatedAt: '2026-09-05T10:00:00.000Z',
      currentUpdatedAt: '2026-09-05T10:05:00.000Z',
    });
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error('expected a refusal');
    expect(decision.error).toContain('changed');
  });

  it('refuses rather than guessing when either timestamp is missing', () => {
    expect(decideDraftApply({ draftedUpdatedAt: '', currentUpdatedAt: 'x' }).ok).toBe(false);
    expect(decideDraftApply({ draftedUpdatedAt: 'x', currentUpdatedAt: '' }).ok).toBe(false);
  });
});
