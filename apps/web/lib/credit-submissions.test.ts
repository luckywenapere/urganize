import { describe, expect, it } from 'vitest';
import {
  SPLIT_PRECISION_MESSAGE,
  SPLIT_REQUIRED_MESSAGES,
  checkSplitValue,
  findSubmissionIdByEmail,
  normalizeEmailKey,
  requiredSplits,
  validateSubmissionSplits,
} from './credit-submissions';
import type { ReleaseCreditRole } from '@/types/credits';

describe('normalizeEmailKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmailKey('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('treats null, undefined and blank alike', () => {
    expect(normalizeEmailKey(null)).toBe('');
    expect(normalizeEmailKey(undefined)).toBe('');
    expect(normalizeEmailKey('   ')).toBe('');
  });
});

describe('findSubmissionIdByEmail', () => {
  const rows = [
    { id: 'row-1', email: 'ada@example.com' },
    { id: 'row-2', email: 'Grace@Example.com' },
    { id: 'row-3', email: null },
  ];

  it('finds an exact match', () => {
    expect(findSubmissionIdByEmail(rows, 'ada@example.com')).toBe('row-1');
  });

  it('matches regardless of case', () => {
    expect(findSubmissionIdByEmail(rows, 'GRACE@EXAMPLE.COM')).toBe('row-2');
  });

  it('ignores surrounding whitespace on the incoming email', () => {
    expect(findSubmissionIdByEmail(rows, '  ada@example.com  ')).toBe('row-1');
  });

  it('returns null when nobody matches', () => {
    expect(findSubmissionIdByEmail(rows, 'linus@example.com')).toBeNull();
  });

  it('never matches a row that has no email', () => {
    expect(findSubmissionIdByEmail([{ id: 'row-3', email: null }], 'ada@example.com')).toBeNull();
    expect(findSubmissionIdByEmail([{ id: 'row-4', email: '  ' }], 'ada@example.com')).toBeNull();
  });

  it('returns null for a blank query even when a blank-email row exists', () => {
    // A missing email must never read as an identity several people share.
    expect(findSubmissionIdByEmail([{ id: 'row-3', email: null }], '')).toBeNull();
    expect(findSubmissionIdByEmail([{ id: 'row-4', email: '' }], '   ')).toBeNull();
  });

  it('does not treat underscores as wildcards', () => {
    // The reason matching happens in JS instead of through PostgREST .ilike().
    const underscored = [{ id: 'row-9', email: 'john_doe@example.com' }];
    expect(findSubmissionIdByEmail(underscored, 'johnXdoe@example.com')).toBeNull();
    expect(findSubmissionIdByEmail(underscored, 'john_doe@example.com')).toBe('row-9');
  });

  it('returns the first match when duplicates somehow survive', () => {
    const dupes = [
      { id: 'older', email: 'ada@example.com' },
      { id: 'newer', email: 'ADA@example.com' },
    ];
    expect(findSubmissionIdByEmail(dupes, 'ada@example.com')).toBe('older');
  });
});

describe('requiredSplits', () => {
  it('requires a writing share for every writing role', () => {
    for (const role of ['songwriter', 'composer', 'lyricist'] as ReleaseCreditRole[]) {
      expect(requiredSplits([role])).toEqual({ songwriter: true, master: false });
    }
  });

  it('requires a recording share for a producer', () => {
    expect(requiredSplits(['producer'])).toEqual({ songwriter: false, master: true });
  });

  it('requires both when someone wrote and produced', () => {
    expect(requiredSplits(['songwriter', 'producer'])).toEqual({ songwriter: true, master: true });
  });

  it('requires nothing of the credit-only roles', () => {
    const creditOnly: ReleaseCreditRole[] = [
      'featured_artist',
      'vocalist',
      'musician',
      'engineer',
      'mixing_engineer',
      'mastering_engineer',
      'other',
    ];
    for (const role of creditOnly) {
      expect(requiredSplits([role])).toEqual({ songwriter: false, master: false });
    }
    expect(requiredSplits(creditOnly)).toEqual({ songwriter: false, master: false });
  });

  it('requires nothing when no role is picked', () => {
    expect(requiredSplits([])).toEqual({ songwriter: false, master: false });
  });
});

describe('checkSplitValue', () => {
  it('accepts a blank as "not answered"', () => {
    expect(checkSplitValue('')).toEqual({ value: null });
    expect(checkSplitValue(null)).toEqual({ value: null });
    expect(checkSplitValue(undefined)).toEqual({ value: null });
  });

  it('accepts whole numbers and one decimal place', () => {
    expect(checkSplitValue(50)).toEqual({ value: 50 });
    expect(checkSplitValue(33.3)).toEqual({ value: 33.3 });
    expect(checkSplitValue('12.5')).toEqual({ value: 12.5 });
    expect(checkSplitValue(0)).toEqual({ value: 0 });
    expect(checkSplitValue(100)).toEqual({ value: 100 });
  });

  it('rejects a second decimal place rather than rounding it away', () => {
    // Silently turning 33.33 into 33.3 would change a number a publisher gave
    // them, so this reports instead.
    expect(checkSplitValue(33.33).error).toBe(SPLIT_PRECISION_MESSAGE);
    expect(checkSplitValue('0.25').error).toBe(SPLIT_PRECISION_MESSAGE);
  });

  it('rejects values outside 0 to 100', () => {
    expect(checkSplitValue(-1).error).toContain('between 0 and 100');
    expect(checkSplitValue(101).error).toContain('between 0 and 100');
  });

  it('rejects anything that is not a number', () => {
    expect(checkSplitValue('half').error).toContain('between 0 and 100');
    expect(checkSplitValue(Number.NaN).error).toContain('between 0 and 100');
    expect(checkSplitValue(Infinity).error).toContain('between 0 and 100');
  });
});

describe('validateSubmissionSplits', () => {
  it('passes a writer who gave their share', () => {
    expect(
      validateSubmissionSplits({ roles: ['songwriter'], songwriterSplit: 50, masterSplit: null })
    ).toEqual({ ok: true, songwriterSplit: 50, masterSplit: null });
  });

  it('refuses a writer who left the writing share blank', () => {
    expect(
      validateSubmissionSplits({ roles: ['lyricist'], songwriterSplit: '', masterSplit: null })
    ).toEqual({ ok: false, error: SPLIT_REQUIRED_MESSAGES.songwriter });
  });

  it('refuses a producer who left the recording share blank', () => {
    expect(
      validateSubmissionSplits({ roles: ['producer'], songwriterSplit: null, masterSplit: null })
    ).toEqual({ ok: false, error: SPLIT_REQUIRED_MESSAGES.master });
  });

  it('lets an engineer through with no numbers at all', () => {
    expect(
      validateSubmissionSplits({ roles: ['engineer'], songwriterSplit: null, masterSplit: '' })
    ).toEqual({ ok: true, songwriterSplit: null, masterSplit: null });
  });

  it('reports a malformed number before a missing one', () => {
    // A value that is present but wrong is the more specific problem.
    const result = validateSubmissionSplits({
      roles: ['producer'],
      songwriterSplit: 101,
      masterSplit: null,
    });
    expect(result).toEqual({ ok: false, error: 'Shares must be a number between 0 and 100.' });
  });

  it('keeps a zero share, which is a real answer', () => {
    expect(
      validateSubmissionSplits({ roles: ['songwriter'], songwriterSplit: 0, masterSplit: null })
    ).toEqual({ ok: true, songwriterSplit: 0, masterSplit: null });
  });

  it('accepts a writing share from someone not required to give one', () => {
    expect(
      validateSubmissionSplits({ roles: ['vocalist'], songwriterSplit: 10, masterSplit: null })
    ).toEqual({ ok: true, songwriterSplit: 10, masterSplit: null });
  });
});
