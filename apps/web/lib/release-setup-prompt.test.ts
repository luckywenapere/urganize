import { describe, expect, it } from 'vitest';

import {
  SETUP_PROMPT_MAX_MARKED,
  hasBeenPrompted,
  isPromptedList,
  markPrompted,
  shouldArmSetupPrompt,
} from './release-setup-prompt';

describe('isPromptedList', () => {
  it('accepts an array of strings, including empty', () => {
    expect(isPromptedList([])).toBe(true);
    expect(isPromptedList(['a', 'b'])).toBe(true);
  });

  it('rejects everything else — a malformed stored value must not throw later', () => {
    expect(isPromptedList(null)).toBe(false);
    expect(isPromptedList(undefined)).toBe(false);
    expect(isPromptedList('a')).toBe(false);
    expect(isPromptedList([1, 'a'])).toBe(false);
    expect(isPromptedList({ 0: 'a' })).toBe(false);
  });
});

describe('hasBeenPrompted', () => {
  it('finds a marked release', () => {
    expect(hasBeenPrompted(['r1', 'r2'], 'r2')).toBe(true);
  });

  it('is false for an unmarked release and for malformed storage', () => {
    expect(hasBeenPrompted(['r1'], 'r2')).toBe(false);
    expect(hasBeenPrompted(null, 'r1')).toBe(false);
    expect(hasBeenPrompted('r1', 'r1')).toBe(false);
  });
});

describe('markPrompted', () => {
  it('appends newest last and never duplicates', () => {
    expect(markPrompted(['r1'], 'r2')).toEqual(['r1', 'r2']);
    expect(markPrompted(['r1', 'r2'], 'r1')).toEqual(['r2', 'r1']);
  });

  it('starts fresh from a malformed stored value', () => {
    expect(markPrompted(null, 'r1')).toEqual(['r1']);
    expect(markPrompted({ bad: true }, 'r1')).toEqual(['r1']);
  });

  it('caps the list, dropping the oldest', () => {
    const full = Array.from({ length: SETUP_PROMPT_MAX_MARKED }, (_, i) => `r${i}`);
    const next = markPrompted(full, 'new');
    expect(next).toHaveLength(SETUP_PROMPT_MAX_MARKED);
    expect(next[next.length - 1]).toBe('new');
    expect(next).not.toContain('r0');
    expect(next).toContain('r1');
  });
});

describe('shouldArmSetupPrompt', () => {
  const armed = {
    flagOn: true,
    releaseId: 'r1',
    templatePending: true,
    hasReleaseDate: false,
    alreadyPrompted: false,
  };

  it('arms only for a plan-waiting, dateless, un-nudged release with the flag on', () => {
    expect(shouldArmSetupPrompt(armed)).toBe(true);
  });

  it('never arms with the flag off', () => {
    expect(shouldArmSetupPrompt({ ...armed, flagOn: false })).toBe(false);
  });

  it('never arms without a scoped release', () => {
    expect(shouldArmSetupPrompt({ ...armed, releaseId: null })).toBe(false);
  });

  it('never arms once a date exists — there is nothing left to build', () => {
    expect(shouldArmSetupPrompt({ ...armed, hasReleaseDate: true })).toBe(false);
  });

  it('never arms for a release that is not plan-waiting (blank / already built)', () => {
    expect(shouldArmSetupPrompt({ ...armed, templatePending: false })).toBe(false);
  });

  it('never re-nags a release that was already prompted', () => {
    expect(shouldArmSetupPrompt({ ...armed, alreadyPrompted: true })).toBe(false);
  });
});
