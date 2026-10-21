import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pitchWindowState, reminderTierFor } from './editorial-pitch';
import { editorialDueLine, releaseDayHasPassed, showEditorialPitch } from './release-out';

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

describe('Spotify editorial after release day is history only', () => {
  it('shows while the day is ahead or unknown and hides from release day on', () => {
    expect(showEditorialPitch('2026-12-04', NOW)).toBe(true);
    expect(showEditorialPitch(null, NOW)).toBe(true);
    expect(showEditorialPitch('2026-10-21', NOW)).toBe(false);
    expect(showEditorialPitch('2026-09-09', NOW)).toBe(false);
  });

  it('nothing else promotes it once the day is behind us', () => {
    // Banner needs the window to be 'closed' (0 to 7 days out), never 'past'.
    expect(pitchWindowState(-1)).toBe('past');
    // Next move needs 'open'; reminders stop at 7 days out and never fire later.
    expect(pitchWindowState(-30)).not.toBe('open');
    expect(reminderTierFor(-1)).toBeNull();
    expect(reminderTierFor(0)).toBeNull();
    expect(reminderTierFor(5)).toBeNull();
  });

  it('the Pitch tab, the activity pop-up and the all-rollouts list read the rule', () => {
    expect(readFileSync('components/pitching/PitchScene.tsx', 'utf8')).toMatch(
      /showEditorialPitch\(release\.releaseDate\) \?\s*\(\s*<EditorialPitchSection/
    );
    expect(readFileSync('components/tasks/TaskDetailView.tsx', 'utf8')).toContain(
      'isEditorialPitchTask(task.templateTaskId) && showEditorialPitch(releaseDateForPhase)'
    );
    expect(readFileSync('components/pitching/EditorialPitchSection.tsx', 'utf8')).toContain(
      'body.rows.filter((row) => showEditorialPitch(row.releaseDate))'
    );
  });

  it('the banner and next-move gates stay tied to the window state', () => {
    expect(readFileSync('components/workspace/WorkspaceView.tsx', 'utf8')).toContain(
      "pitchWindowState(daysToRelease(scopedReleaseSlim.releaseDate, new Date())) === 'closed'"
    );
    expect(readFileSync('lib/next-moves.ts', 'utf8')).toContain("pitchWindowState(days) === 'open'");
  });

  it('Distribute stays as the record: Out on <date>, no Send or Move after release day', () => {
    const src = readFileSync('components/releases/trm/TrmDistribute.tsx', 'utf8');
    expect(src).toContain('releaseDayHasPassed(data.releaseDate)');
    expect(src).toContain('`Out on ${formatShortDay(data.releaseDate)}.`');
  });
});
