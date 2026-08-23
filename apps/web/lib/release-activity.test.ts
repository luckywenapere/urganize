import { describe, expect, it } from 'vitest';
import { RELEASE_STATUS_OPTIONS } from '@/types/releases';
import {
  ARCHIVED_STATUS,
  INACTIVE_RELEASE_STATUSES,
  RESTORED_STATUS,
  isReleaseActive,
  isValidReleaseStatusValue,
} from './release-activity';

describe('isReleaseActive', () => {
  it('counts every working status as active', () => {
    for (const status of ['draft', 'planning', 'in_progress', 'ready'] as const) {
      expect(isReleaseActive(status), status).toBe(true);
    }
  });

  it('stops counting a release once it is shipped or shelved', () => {
    expect(isReleaseActive('released')).toBe(false);
    expect(isReleaseActive('archived')).toBe(false);
  });

  // Exhaustive over the real union, so a new status added to the enum has to be
  // classified here deliberately rather than defaulting silently.
  it('classifies every status the type allows', () => {
    for (const status of RELEASE_STATUS_OPTIONS) {
      expect(typeof isReleaseActive(status), status).toBe('boolean');
    }
    const inactive = RELEASE_STATUS_OPTIONS.filter((s) => !isReleaseActive(s));
    expect(inactive).toEqual(['released', 'archived']);
  });

  // releases.status has NO database CHECK constraint, so an unexpected value is
  // possible rather than theoretical. Counting it as active is the safe way to
  // be wrong: the alternative silently frees a cap slot for a status nobody
  // understands.
  it('treats an unknown, empty or absent status as active', () => {
    for (const status of ['mystery', '', null, undefined]) {
      expect(isReleaseActive(status), String(status)).toBe(true);
    }
  });

  it('exports the inactive set for callers that need the list', () => {
    expect([...INACTIVE_RELEASE_STATUSES]).toEqual(['released', 'archived']);
  });
});

describe('archive toggle statuses', () => {
  it('archives to archived and restores to draft', () => {
    expect(ARCHIVED_STATUS).toBe('archived');
    expect(RESTORED_STATUS).toBe('draft');
  });

  it('makes archiving inactive and restoring active', () => {
    expect(isReleaseActive(ARCHIVED_STATUS)).toBe(false);
    expect(isReleaseActive(RESTORED_STATUS)).toBe(true);
  });

  it('uses statuses the column actually accepts', () => {
    expect(isValidReleaseStatusValue(ARCHIVED_STATUS)).toBe(true);
    expect(isValidReleaseStatusValue(RESTORED_STATUS)).toBe(true);
  });
});

describe('isValidReleaseStatusValue', () => {
  it('accepts every option and rejects anything else', () => {
    for (const status of RELEASE_STATUS_OPTIONS) {
      expect(isValidReleaseStatusValue(status), status).toBe(true);
    }
    for (const value of ['Archived', 'done', '', null, undefined, 7, {}]) {
      expect(isValidReleaseStatusValue(value), String(value)).toBe(false);
    }
  });
});
