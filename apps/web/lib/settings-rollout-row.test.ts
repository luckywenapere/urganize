import { describe, expect, it } from 'vitest';
import { formatRolloutCreatedLabel } from './settings-rollout-row';

describe('formatRolloutCreatedLabel', () => {
  it('shows the date and the time, so two same-day rollouts differ', () => {
    const a = formatRolloutCreatedLabel('2026-10-09T19:14:00Z', 'en-GB', 'UTC');
    const b = formatRolloutCreatedLabel('2026-10-09T19:41:00Z', 'en-GB', 'UTC');
    expect(a).toMatch(/^Created /);
    expect(a).toContain('9 Oct 2026');
    expect(a).toContain('19:14');
    expect(a).not.toBe(b);
  });

  it('is empty, never "Invalid Date", when the timestamp is missing or bad', () => {
    expect(formatRolloutCreatedLabel('')).toBe('');
    expect(formatRolloutCreatedLabel(null)).toBe('');
    expect(formatRolloutCreatedLabel(undefined)).toBe('');
    expect(formatRolloutCreatedLabel('not a date')).toBe('');
  });
});
