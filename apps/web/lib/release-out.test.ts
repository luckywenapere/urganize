import { describe, expect, it } from 'vitest';
import { editorialDueLine, releaseDayHasPassed } from './release-out';

const NOW = new Date(2026, 9, 21, 12, 0, 0); // Oct 21 2026, local

describe('releaseDayHasPassed', () => {
  it('is true for a past day and for release day itself', () => {
    expect(releaseDayHasPassed('2026-09-09', NOW)).toBe(true);
    expect(releaseDayHasPassed('2026-10-21', NOW)).toBe(true);
  });
  it('is false for a day ahead, no date, or junk', () => {
    expect(releaseDayHasPassed('2026-12-04', NOW)).toBe(false);
    expect(releaseDayHasPassed(null, NOW)).toBe(false);
    expect(releaseDayHasPassed('soon', NOW)).toBe(false);
  });
});

describe('editorialDueLine', () => {
  it('asks for the 7 day lead while the date is ahead', () => {
    expect(editorialDueLine('2026-12-04', NOW)).toBe('Do it at least 7 days before Dec 4');
  });
  it('states the rule alone with no date', () => {
    expect(editorialDueLine(null, NOW)).toBe('Do it at least 7 days before release day');
  });
  it('reads as history once release day has passed, with no lead-time ask', () => {
    const line = editorialDueLine('2026-09-09', NOW);
    expect(line).toBe('Out on Sep 9, 2026. This window has closed.');
    expect(line).not.toMatch(/at least/);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Distribute and Pitch wiring', () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
  it('Distribute reads a passed release day as history and drops the bare Y avatar', () => {
    const trm = read('components', 'releases', 'trm', 'TrmDistribute.tsx');
    expect(trm).toContain('releaseDayHasPassed(data.releaseDate)');
    expect(trm.indexOf('releaseDayHasPassed(data.releaseDate)')).toBeLessThan(trm.indexOf('before it can go.'));
    expect(read('components', 'releases', 'trm', 'TrmParts.tsx')).toMatch(/if \(owner\.isYou\) return null;/);
  });
  it('the Pitch tab uses the shared due line', () => {
    expect(read('components', 'pitching', 'EditorialPitchSection.tsx')).toContain("from '@/lib/release-out'");
  });
});
