import { describe, expect, it } from 'vitest';
import {
  FIRST_RELEASE_PROMPT_DELAY_MS,
  FIRST_RELEASE_PROMPT_KEY,
  decideFirstReleasePrompt,
  isFirstReleasePromptState,
} from './first-release-prompt';

const NOW = 1_700_000_000_000;
const DELAY = FIRST_RELEASE_PROMPT_DELAY_MS;

describe('decideFirstReleasePrompt', () => {
  it('arms when nothing is stored', () => {
    expect(decideFirstReleasePrompt(null, NOW)).toEqual({ action: 'arm' });
  });

  it('waits the full delay when armed just now', () => {
    expect(decideFirstReleasePrompt({ armedAt: NOW }, NOW)).toEqual({
      action: 'wait',
      remainingMs: DELAY,
    });
  });

  // The cross-navigation resume: /dashboard armed the countdown, the user
  // hopped to /dashboard/urgans 10s in, and the new mount picks up the
  // REMAINDER rather than restarting — that is the whole reason the state
  // lives in sessionStorage instead of a per-mount timer.
  it('waits only the remainder when armed earlier', () => {
    expect(decideFirstReleasePrompt({ armedAt: NOW - 10_000 }, NOW)).toEqual({
      action: 'wait',
      remainingMs: DELAY - 10_000,
    });
  });

  it('fires at exactly the delay boundary', () => {
    expect(decideFirstReleasePrompt({ armedAt: NOW - DELAY }, NOW)).toEqual({ action: 'fire' });
  });

  // Covers "the 30s elapsed while on /settings" (no surface mounted there):
  // returning to the workspace fires promptly instead of waiting again.
  it('fires immediately when the deadline passed long ago', () => {
    expect(decideFirstReleasePrompt({ armedAt: NOW - DELAY * 10 }, NOW)).toEqual({
      action: 'fire',
    });
  });

  // Once per session means ONCE — shownAt outranks a lapsed deadline and even
  // a nonsensical future armedAt.
  it('is done once shown, whatever the rest of the state looks like', () => {
    expect(decideFirstReleasePrompt({ armedAt: NOW - DELAY * 10, shownAt: NOW - DELAY }, NOW)).toEqual(
      { action: 'done' }
    );
    expect(decideFirstReleasePrompt({ armedAt: NOW + DELAY * 10, shownAt: NOW }, NOW)).toEqual({
      action: 'done',
    });
  });

  // Clock skew / hand-edited storage: a future armedAt must clamp to one full
  // delay, never trust the stored number — a bad clock cannot be allowed to
  // produce an hour-long ambush.
  it('never waits longer than the configured delay, even with a future armedAt', () => {
    const decision = decideFirstReleasePrompt({ armedAt: NOW + 60 * 60 * 1000 }, NOW);
    expect(decision).toEqual({ action: 'wait', remainingMs: DELAY });
  });
});

describe('isFirstReleasePromptState', () => {
  // The read-side half of "storage failure ⇒ never auto-open": junk parses to
  // null, and null means arm afresh rather than trusting garbage.
  it('rejects junk', () => {
    expect(isFirstReleasePromptState(null)).toBe(false);
    expect(isFirstReleasePromptState('armed')).toBe(false);
    expect(isFirstReleasePromptState(42)).toBe(false);
    expect(isFirstReleasePromptState({})).toBe(false);
    expect(isFirstReleasePromptState({ armedAt: 'yesterday' })).toBe(false);
    expect(isFirstReleasePromptState({ armedAt: Number.NaN })).toBe(false);
    expect(isFirstReleasePromptState({ armedAt: NOW, shownAt: 'now' })).toBe(false);
    expect(isFirstReleasePromptState({ armedAt: NOW, shownAt: Number.NaN })).toBe(false);
  });

  it('accepts the two real shapes', () => {
    expect(isFirstReleasePromptState({ armedAt: NOW })).toBe(true);
    expect(isFirstReleasePromptState({ armedAt: NOW, shownAt: NOW + 1 })).toBe(true);
  });
});

describe('FIRST_RELEASE_PROMPT_DELAY_MS', () => {
  // Records the intent behind the number: seconds, not milliseconds and not
  // minutes. Long enough to look at the empty workspace, short enough that
  // the offer still lands in the same sitting.
  it('holds a settle delay measured in tens of seconds', () => {
    expect(DELAY).toBeGreaterThanOrEqual(10_000);
    expect(DELAY).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe('FIRST_RELEASE_PROMPT_KEY', () => {
  it('stays under the urganize namespace every other persisted key uses', () => {
    expect(FIRST_RELEASE_PROMPT_KEY.startsWith('urganize.')).toBe(true);
  });
});
