/**
 * The shared helpers every tool family is built on. Small, but two of them
 * decide whether a switched-off feature reads as switched off or as missing,
 * and whether a model's "25" counts as a number.
 */

import { describe, expect, it } from 'vitest';
import { argNumber, argStringArray, isFlagGateOff, type InternalApiResponse } from './shared';

const response = (status: number, error?: string): InternalApiResponse => ({
  ok: status < 400,
  status,
  body: error === undefined ? {} : { error },
});

describe('isFlagGateOff', () => {
  it('recognises both spellings a flag gate uses', () => {
    // Newer route groups write the full stop; thirteen older handlers do not.
    expect(isFlagGateOff(response(404, 'Not found.'))).toBe(true);
    expect(isFlagGateOff(response(404, 'Not found'))).toBe(true);
  });

  it('leaves an ownership miss alone, so it reaches the model intact', () => {
    // The whole reason this is narrow: these must NOT be reported to the user
    // as "that feature is not switched on".
    expect(isFlagGateOff(response(404, 'Release not found.'))).toBe(false);
    expect(isFlagGateOff(response(404, 'Show not found.'))).toBe(false);
    expect(isFlagGateOff(response(404, 'Note not found.'))).toBe(false);
    expect(isFlagGateOff(response(404, 'Pack not found.'))).toBe(false);
  });

  it('is about 404 only', () => {
    expect(isFlagGateOff(response(403, 'Not found.'))).toBe(false);
    expect(isFlagGateOff(response(500, 'Not found.'))).toBe(false);
    expect(isFlagGateOff(response(404))).toBe(false);
  });
});

describe('argNumber', () => {
  it('reads a number', () => {
    expect(argNumber({ n: 25 }, 'n')).toBe(25);
    expect(argNumber({ n: 0 }, 'n')).toBe(0);
  });

  it('reads a numeric string, because a model will send one for a number field', () => {
    expect(argNumber({ n: '25' }, 'n')).toBe(25);
    expect(argNumber({ n: ' 25 ' }, 'n')).toBe(25);
  });

  it('answers undefined for anything unusable, so a caller can tell it from a real 0', () => {
    expect(argNumber({}, 'n')).toBeUndefined();
    expect(argNumber({ n: 'twenty five' }, 'n')).toBeUndefined();
    expect(argNumber({ n: null }, 'n')).toBeUndefined();
    expect(argNumber({ n: '' }, 'n')).toBeUndefined();
    expect(argNumber({ n: Number.NaN }, 'n')).toBeUndefined();
    expect(argNumber({ n: Number.POSITIVE_INFINITY }, 'n')).toBeUndefined();
  });
});

describe('argStringArray', () => {
  it('reads and trims the usable entries', () => {
    expect(argStringArray({ ids: ['a', ' b ', 'c'] }, 'ids')).toEqual(['a', 'b', 'c']);
  });

  it('drops blanks and non-strings rather than passing them on', () => {
    expect(argStringArray({ ids: ['a', '', '   ', 7, null, 'b'] }, 'ids')).toEqual(['a', 'b']);
  });

  it('answers an empty array for anything that is not an array', () => {
    expect(argStringArray({}, 'ids')).toEqual([]);
    expect(argStringArray({ ids: 'a,b' }, 'ids')).toEqual([]);
  });
});
