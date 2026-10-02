import { describe, expect, it } from 'vitest';
import {
  buildFillMessages,
  findGaps,
  hasAnyGap,
  parseFillResponse,
  planFillApply,
  type FillContext,
  type FillTarget,
} from './release-epk-fill';

const ALL: FillTarget = {
  descriptor: true,
  short: true,
  medium: true,
  long: true,
  hook: true,
  story: true,
};
const NONE: FillTarget = {
  descriptor: false,
  short: false,
  medium: false,
  long: false,
  hook: false,
  story: false,
};

const context: FillContext = {
  artistName: 'Dorian',
  genres: 'afrobeats',
  homeCity: 'Lagos',
  descriptor: '',
  existingBios: { short: '', medium: '', long: '' },
  release: {
    title: 'Midnight',
    releaseType: 'single',
    releaseDate: '2026-11-01',
    description: 'A late night record.',
    genre: 'Afrobeats',
  },
  credits: [{ name: 'TB Beats', role: 'producer' }],
  existingStory: '',
};

describe('findGaps', () => {
  const base = {
    kitExists: true,
    header: {},
    bios: {},
    latestRelease: { releaseId: 'r1' },
    releaseId: 'r1',
    story: '',
  };

  it('finds every gap in a fresh kit', () => {
    expect(findGaps(base)).toEqual(ALL);
  });

  it('never marks something a person wrote', () => {
    const gaps = findGaps({
      ...base,
      header: { descriptor: 'Written' },
      bios: { short: 'x', medium: 'y', long: 'z' },
      story: 'Mine',
    });
    expect(gaps).toEqual({ ...NONE, hook: true });
  });

  it('skips the hook when the kit points at a different release', () => {
    expect(findGaps({ ...base, latestRelease: { releaseId: 'other' } }).hook).toBe(false);
  });

  it('fills only the story when there is no kit', () => {
    expect(findGaps({ ...base, kitExists: false })).toEqual({ ...NONE, story: true });
  });

  it('hasAnyGap', () => {
    expect(hasAnyGap(NONE)).toBe(false);
    expect(hasAnyGap({ ...NONE, story: true })).toBe(true);
  });
});

describe('buildFillMessages', () => {
  it('asks only for the empty fields', () => {
    const [, user] = buildFillMessages({ ...NONE, short: true, story: true }, context, '');
    expect(user.content).toContain('"short": string');
    expect(user.content).toContain('"story": string');
    expect(user.content).not.toContain('"long"');
    expect(user.content).not.toContain('"hook"');
  });

  it('carries no email address or phone number', () => {
    const msgs = buildFillMessages(ALL, context, 'keep it low key');
    expect(JSON.stringify(msgs)).not.toContain('@');
  });

  it('refuses to build an empty request', () => {
    expect(() => buildFillMessages(NONE, context, '')).toThrow();
  });
});

describe('parseFillResponse', () => {
  it('keeps what was asked for and drops the rest', () => {
    const out = parseFillResponse(
      { ...NONE, short: true, story: true },
      JSON.stringify({ short: 'S', story: 'T', homeCity: 'Abuja', long: 'L' })
    );
    expect(out).toEqual({ kit: { bios: { short: 'S' } }, story: 'T' });
  });

  it('returns null for junk and for nothing usable', () => {
    expect(parseFillResponse(ALL, 'not json')).toBeNull();
    expect(parseFillResponse(ALL, '[]')).toBeNull();
    expect(parseFillResponse({ ...NONE, short: true }, JSON.stringify({ long: 'L' }))).toBeNull();
  });
});

describe('planFillApply', () => {
  const draft = {
    kit: { header: { descriptor: 'D' }, bios: { short: 'S', long: 'L' } },
    story: 'Story',
  };

  it('fills empty fields and counts them', () => {
    const plan = planFillApply(draft, { header: {}, bios: {}, latestRelease: {}, story: '' });
    expect(plan.filled).toBe(4);
    expect(plan.skipped).toBe(0);
    expect(plan.sections.header).toEqual({ descriptor: 'D' });
    expect(plan.sections.bios).toEqual({ short: 'S', long: 'L' });
    expect(plan.story).toBe('Story');
  });

  it('never overwrites a field filled since the draft was made', () => {
    const plan = planFillApply(draft, {
      header: { descriptor: 'A person wrote this' },
      bios: { short: 'Mine' },
      latestRelease: {},
      story: 'Already here',
    });
    expect(plan.sections.header).toBeUndefined();
    expect(plan.sections.bios).toEqual({ short: 'Mine', long: 'L' });
    expect(plan.story).toBeNull();
    expect(plan.filled).toBe(1);
    expect(plan.skipped).toBe(3);
  });

  it('keeps the fields it did not touch', () => {
    const plan = planFillApply(draft, {
      header: { descriptor: '', homeCity: 'Lagos' },
      bios: {},
      latestRelease: {},
      story: '',
    });
    expect(plan.sections.header).toEqual({ descriptor: 'D', homeCity: 'Lagos' });
  });
});
