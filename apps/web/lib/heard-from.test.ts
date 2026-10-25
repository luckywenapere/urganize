import { describe, expect, it } from 'vitest';
import { HEARD_FROM_LABELS, HEARD_FROM_OPTIONS, isHeardFromSource } from './heard-from';

describe('how they heard about Urganize', () => {
  it('offers the nine channels, Other last', () => {
    expect(HEARD_FROM_OPTIONS.map((option) => option.label)).toEqual([
      'Instagram',
      'X (Twitter)',
      'TikTok',
      'A friend or artist',
      'A manager or label',
      'WhatsApp',
      'Event',
      'Google',
      'Other',
    ]);
  });

  it('accepts only known values', () => {
    expect(isHeardFromSource('instagram')).toBe(true);
    expect(isHeardFromSource('Instagram')).toBe(false);
    expect(isHeardFromSource('')).toBe(false);
    expect(isHeardFromSource(null)).toBe(false);
    expect(HEARD_FROM_LABELS.get('x')).toBe('X (Twitter)');
  });
});
