import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TEST_RELEASE_DESCRIPTION,
  TEST_RELEASE_TITLE,
  buildTestReleaseDraft,
  isTestReleaseEnabled,
  readTestRelease,
  readTestReleaseAuto,
  readTestReleaseDismissed,
  writeTestRelease,
  writeTestReleaseByPerson,
  writeTestReleaseBySweep,
} from './test-release';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isTestReleaseEnabled', () => {
  // stubEnv AFTER import, no resetModules: the predicate reads process.env at
  // CALL time (the isReleasePlannerEnabled convention), and these two cases
  // together are what prove that — a module-load read would freeze one answer.
  it('is true only for the literal string "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_TEST_RELEASE', 'true');
    expect(isTestReleaseEnabled()).toBe(true);
  });

  it('is false when unset, "false", or any other spelling', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_TEST_RELEASE', '');
    expect(isTestReleaseEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_TEST_RELEASE', 'false');
    expect(isTestReleaseEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_TEST_RELEASE', 'TRUE');
    expect(isTestReleaseEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_TEST_RELEASE', '1');
    expect(isTestReleaseEnabled()).toBe(false);
  });
});

describe('readTestRelease', () => {
  it('is true only for a literal true under the key', () => {
    expect(readTestRelease({ test_release: true })).toBe(true);
  });

  it('is false for an absent key', () => {
    expect(readTestRelease({})).toBe(false);
    expect(readTestRelease({ template_pending: true })).toBe(false);
  });

  it('is false for missing or non-object metadata', () => {
    expect(readTestRelease(null)).toBe(false);
    expect(readTestRelease(undefined)).toBe(false);
  });

  it('is false for junk values under the key', () => {
    expect(readTestRelease({ test_release: 'true' })).toBe(false);
    expect(readTestRelease({ test_release: 1 })).toBe(false);
    expect(readTestRelease({ test_release: {} })).toBe(false);
    expect(readTestRelease({ test_release: [] })).toBe(false);
    expect(readTestRelease({ test_release: false })).toBe(false);
  });
});

describe('writeTestRelease', () => {
  it('marks a fresh metadata object', () => {
    expect(writeTestRelease(null, true)).toEqual({ test_release: true });
    expect(writeTestRelease(undefined, true)).toEqual({ test_release: true });
  });

  it('preserves every sibling key when marking', () => {
    // The reason the helper exists: `metadata` is one shared JSONB column, so
    // a write that returns { test_release: true } alone would silently drop
    // template_pending and anything else stored beside it.
    const result = writeTestRelease({ template_pending: true, x: 'y' }, true);
    expect(result).toEqual({ template_pending: true, x: 'y', test_release: true });
  });

  it('never mutates the input object', () => {
    const input: Record<string, unknown> = { planner_pending: true };
    writeTestRelease(input, true);
    expect(input).toEqual({ planner_pending: true });
  });

  it('clears by DELETING the key, not storing false', () => {
    const result = writeTestRelease({ test_release: true, planner_pending: true }, false);
    expect('test_release' in result).toBe(false);
    expect(result).toEqual({ planner_pending: true });
  });

  it('clearing an unmarked object is a no-op shape', () => {
    expect(writeTestRelease({ x: 'y' }, false)).toEqual({ x: 'y' });
    expect(writeTestRelease(null, false)).toEqual({});
  });
});

describe('buildTestReleaseDraft', () => {
  it('dates the release exactly 63 days out, in UTC', () => {
    const draft = buildTestReleaseDraft(new Date('2026-09-01T12:00:00Z'));
    expect(draft.releaseDate).toBe('2026-11-03');
  });

  it('rolls over a year boundary correctly', () => {
    const draft = buildTestReleaseDraft(new Date('2026-11-15T00:00:00Z'));
    expect(draft.releaseDate).toBe('2027-01-17');
  });

  it('always emits a well-formed date-only string', () => {
    expect(buildTestReleaseDraft().releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('always builds a single — the one design-partner reviewed playbook', () => {
    expect(buildTestReleaseDraft().releaseType).toBe('single');
  });

  it('carries the canned title and description', () => {
    const draft = buildTestReleaseDraft();
    expect(draft.title).toBe(TEST_RELEASE_TITLE);
    expect(draft.description).toBe(TEST_RELEASE_DESCRIPTION);
  });
});

describe('copy rules', () => {
  it('every exported user-facing string is non-empty and carries no em dash', () => {
    // House rule (billing-alert-templates precedent): customer-facing copy
    // never uses an em dash.
    for (const text of [TEST_RELEASE_TITLE, TEST_RELEASE_DESCRIPTION]) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toContain('—');
    }
  });

  it('the description names the exit', () => {
    expect(TEST_RELEASE_DESCRIPTION.toLowerCase()).toContain('delete');
  });
});

describe('marking by a person and by the sweep (#1442)', () => {
  it('a person marking a test sets the marker and clears any old answer', () => {
    const next = writeTestReleaseByPerson({ test_release_dismissed: true, planner_pending: true }, true);
    expect(readTestRelease(next)).toBe(true);
    expect(readTestReleaseDismissed(next)).toBe(false);
    expect(next.planner_pending).toBe(true);
  });

  it('a person saying it is real clears the marker and stops the sweep coming back', () => {
    const next = writeTestReleaseByPerson(writeTestReleaseBySweep({}), false);
    expect(readTestRelease(next)).toBe(false);
    expect(readTestReleaseAuto(next)).toBe(false);
    expect(readTestReleaseDismissed(next)).toBe(true);
  });

  it('the sweep sets the marker and says it did', () => {
    const next = writeTestReleaseBySweep({ share_offered: true });
    expect(readTestRelease(next)).toBe(true);
    expect(readTestReleaseAuto(next)).toBe(true);
    expect(next.share_offered).toBe(true);
  });
});
