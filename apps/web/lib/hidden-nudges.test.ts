import { describe, expect, it } from 'vitest';
import { hiddenValue, isHiddenValue } from './hidden-nudges';

describe('hidden nudges', () => {
  const now = Date.UTC(2026, 9, 31);

  it('hides for good when no days are given', () => {
    expect(isHiddenValue(hiddenValue(now), now + 1e12)).toBe(true);
  });

  it('comes back after its days', () => {
    const raw = hiddenValue(now, 30);
    expect(isHiddenValue(raw, now + 29 * 86_400_000)).toBe(true);
    expect(isHiddenValue(raw, now + 30 * 86_400_000)).toBe(false);
  });

  it('shows when nothing or junk is stored', () => {
    expect(isHiddenValue(null, now)).toBe(false);
    expect(isHiddenValue('not json', now)).toBe(false);
    expect(isHiddenValue('{"until":"soon"}', now)).toBe(false);
  });
});
