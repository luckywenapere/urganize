import { describe, expect, it } from 'vitest';
import { shouldActivateRow } from './row-activation';

const row = {};
const checkbox = {};

describe('shouldActivateRow', () => {
  it('activates on Enter and Space when the row itself has focus', () => {
    expect(shouldActivateRow({ key: 'Enter', target: row, currentTarget: row })).toBe(true);
    expect(shouldActivateRow({ key: ' ', target: row, currentTarget: row })).toBe(true);
  });

  it('leaves the key alone when it came from a button inside the row', () => {
    expect(shouldActivateRow({ key: 'Enter', target: checkbox, currentTarget: row })).toBe(false);
    expect(shouldActivateRow({ key: ' ', target: checkbox, currentTarget: row })).toBe(false);
  });

  it('ignores every other key', () => {
    expect(shouldActivateRow({ key: 'Tab', target: row, currentTarget: row })).toBe(false);
    expect(shouldActivateRow({ key: 'a', target: row, currentTarget: row })).toBe(false);
  });
});
