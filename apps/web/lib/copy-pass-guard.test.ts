import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeRoleView, ROLE_VIEWS } from './role-views';
import { SONG_LINK_PLACEHOLDER, SONG_LINK_PLACEHOLDER_SHORT } from './pitching';
import { DEFAULT_RELEASE_TITLE, TITLE_SKIP_TIP, displayReleaseTitle } from '../types/releases';

// F-07: the copy fixes from the 2026-10-21 QA pass, held in place.
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('displayReleaseTitle', () => {
  it('shows the legacy placeholder as the current one', () => {
    expect(displayReleaseTitle('Untitled release')).toBe(DEFAULT_RELEASE_TITLE);
    expect(displayReleaseTitle('  untitled RELEASE ')).toBe(DEFAULT_RELEASE_TITLE);
    expect(displayReleaseTitle('')).toBe(DEFAULT_RELEASE_TITLE);
    expect(displayReleaseTitle(null)).toBe(DEFAULT_RELEASE_TITLE);
  });
  it('leaves a chosen name alone', () => {
    expect(displayReleaseTitle('Untitled release 2')).toBe('Untitled release 2');
    expect(displayReleaseTitle('Free')).toBe('Free');
  });
  it('is used where lists show a rollout name', () => {
    for (const file of [
      ['app', 'dashboard', 'artists', '[artistId]', 'ArtistPageClient.tsx'],
      ['components', 'settings', 'ReleasesSection.tsx'],
      ['lib', 'home', 'releases.ts'],
    ]) {
      expect(read(...file), file.join('/')).toContain('displayReleaseTitle(');
    }
  });
});

describe('copy fixes', () => {
  it('the title tip has no stray space inside its quotes', () => {
    expect(TITLE_SKIP_TIP).toBe('Skip it and we’ll call it “Untitled rollout”. You can name it later.');
    const modal = read('components', 'releases', 'CreateReleaseModal.tsx');
    expect(modal).not.toMatch(/call it &ldquo;\s*\n/);
    expect(modal).toContain('TITLE_SKIP_TIP');
  });
  it('no view description names Audience, which is cut', () => {
    for (const view of ROLE_VIEWS) expect(describeRoleView(view)).not.toMatch(/Audience/);
  });
  it('the role view sentence sits behind an info icon, not under the control', () => {
    const section = read('components', 'settings', 'RoleViewSection.tsx');
    expect(section).toContain('text={describeRoleView(current)}');
    expect(section).not.toMatch(/<p[^>]*>\s*\{describeRoleView/);
  });
  it('the planner preview names the three rollout phases', () => {
    expect(read('lib', 'planner-template-preview.ts')).toContain('DATED_ROLLOUT_PHASES');
    expect(read('lib', 'planner-template-preview.ts')).not.toContain('derivePlanPhase(');
  });
  it('the pitch kit pill has no leading comma in its hidden text', () => {
    const kit = read('components', 'releases', 'PitchKitSection.tsx');
    expect(kit).not.toContain("', done'");
    expect(kit).not.toContain("', not done yet'");
  });
  it('the song link placeholder names untitled.stream so it does not read as a typo', () => {
    expect(SONG_LINK_PLACEHOLDER).toContain('untitled.stream');
    expect(SONG_LINK_PLACEHOLDER_SHORT).toContain('untitled.stream');
  });
  it('a missing welcome link gives a next step', () => {
    expect(read('app', 'welcome', '[token]', 'WelcomeClaimClient.tsx')).toContain("initial.state === 'missing'");
  });
  it('the directory intro is not a stacked sentence', () => {
    const section = read('components', 'settings', 'DirectoryProfileSection.tsx');
    expect(section).not.toContain('You are not listed until you say so, and you can close it again below.');
  });
});
