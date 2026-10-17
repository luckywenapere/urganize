import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSettingsUrl, closeSettingsUrl } from '@/lib/settings-nav';

/**
 * Home's header on a phone (2026-10-17, founder call): no artist / "+1 rollout"
 * eyebrow above the title, Notifications as a bell at the top right left of the
 * team's faces, and "Manage team" from those faces opens Settings over Home so
 * closing it returns to Home (it used to land on Artists). Read from the
 * source, since there are no component tests in this repo.
 */

const WEB = join(__dirname, '..');
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const read = (...parts: string[]) => strip(readFileSync(join(WEB, ...parts), 'utf8'));

describe("Home's header", () => {
  const header = read('components', 'home', 'v2', 'ReleaseHeader.tsx');

  it('has no artist eyebrow or "+1 rollout" menu above the title', () => {
    expect(header).not.toContain('release.artistName');
    expect(header).not.toContain('moreRollouts');
    expect(header).not.toContain('others');
    expect(header).not.toContain('font-mono');
  });

  it('puts the bell immediately left of the team faces', () => {
    const bell = header.indexOf('<HomeBell />');
    const faces = header.indexOf('<TeamAvatars');
    expect(bell).toBeGreaterThan(header.indexOf('</h1>'));
    expect(bell).toBeLessThan(faces);
  });

  it('shows the bell in the other Home states too', () => {
    expect(read('components', 'home', 'v2', 'HomeFour.tsx')).toContain('<HomeBell />');
    expect(read('components', 'home', 'HomeHeaderRow.tsx')).toContain('<HomeBell />');
  });

  it('keeps the bell phone only and asks the real bell to open', () => {
    const bell = read('components', 'home', 'v2', 'HomeBell.tsx');
    expect(bell).toMatch(/className="[^"]*\blg:hidden\b/);
    expect(bell).toContain('requestOpen()');
    expect(bell).toContain('bellBadge(unread)');
  });
});

describe('Manage team from the faces on Home', () => {
  const faces = read('components', 'home', 'v2', 'TeamAvatars.tsx');

  it('opens Settings over the page you are on, not by navigating to /dashboard', () => {
    expect(faces).toContain("useSettingsLinkClick({ segment: 'team' }");
    expect(faces).toMatch(/href=\{HOME_TEAM_HREF\}\s*onClick=\{openTeam\}/);
  });

  it('closes back onto Home', () => {
    const opened = buildSettingsUrl('/dashboard/home', '', { segment: 'team', section: 'teammates' });
    expect(opened).toBe('/dashboard/home?settings=team&section=teammates');
    const [path, query] = opened.split('?');
    expect(closeSettingsUrl(path, `?${query}`)).toBe('/dashboard/home');
  });
});

describe('Home task card (Oyin, Oct 17, 2026)', () => {
  it('has no Open task button: the whole card opens the task', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../components/home/v2/OneThing.tsx'), 'utf8');
    const taskBranch = src.slice(src.indexOf("item.kind === 'task'"), src.indexOf('const { move } = item;'));
    expect(taskBranch).toContain('data-one-thing-card="task"');
    expect(taskBranch).not.toContain('{HOME_FOUR_COPY.openTask}\n');
    expect(taskBranch).not.toContain('className={PRIMARY}');
  });
});
