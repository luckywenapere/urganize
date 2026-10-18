import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_MORE_SECTIONS,
  ADMIN_PRIMARY_NAV,
  ADMIN_REDIRECTS,
  ADMIN_SECTIONS,
  ADMIN_SECTION_GROUPS,
  activeNavKey,
  sectionsInGroup,
} from './admin-sections';

// The slimmed admin menu (2026-10-18, URG-369; founder approved the mock).
// Guards the six rows, what sits behind More, and that the moves kept every
// page: Growth merged into Metrics (redirect), Chappi off the menu (route
// kept), nothing else deleted.

const root = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const pageExists = (href: string) => existsSync(path.join(root, 'app', ...href.split('/').filter(Boolean), 'page.tsx'));

describe('admin side menu', () => {
  it('is exactly Overview, Scoreboard, Metrics, Teams, Emails, More, in that order', () => {
    expect(ADMIN_PRIMARY_NAV.map((item) => item.label)).toEqual([
      'Overview',
      'Scoreboard',
      'Metrics',
      'Teams',
      'Emails',
      'More',
    ]);
    expect(ADMIN_PRIMARY_NAV[0]).toMatchObject({ href: '/admin', exact: true });
    for (const item of ADMIN_PRIMARY_NAV) expect(pageExists(item.href), item.href).toBe(true);
  });

  it('AdminNav renders the shared list and nothing of its own', () => {
    const nav = read('components/admin/AdminNav.tsx');
    expect(nav).toContain('ADMIN_PRIMARY_NAV.map(');
    expect(nav).not.toMatch(/href: '\/admin\/(growth|chappi|nps|waitlist)'/);
  });

  it('keeps Growth and Chappi off the menu', () => {
    const keys = ADMIN_PRIMARY_NAV.map((item) => item.key);
    expect(keys).not.toContain('growth');
    expect(keys).not.toContain('chappi');
  });
});

describe('dashboards behind More', () => {
  it('lists every dashboard once, Growth merged away', () => {
    expect(new Set(ADMIN_SECTIONS.map((section) => section.key)).size).toBe(ADMIN_SECTIONS.length);
    expect(ADMIN_SECTIONS.map((section) => section.key)).not.toContain('growth');
    expect(ADMIN_SECTIONS).toHaveLength(21);
    for (const section of ADMIN_SECTIONS) expect(pageExists(section.href), section.href).toBe(true);
  });

  it('More holds everything not in the menu, Chappi included (route kept)', () => {
    expect(ADMIN_MORE_SECTIONS).toHaveLength(17);
    const more = ADMIN_MORE_SECTIONS.map((section) => section.key);
    expect(more).toContain('chappi');
    for (const key of ['scoreboard', 'metrics', 'teams', 'emails']) expect(more).not.toContain(key);
    for (const key of ['onboarding', 'nps', 'issue-reports', 'pitch-payments', 'waitlist', 'interviews', 'urgans']) {
      expect(more).toContain(key);
    }
  });

  it('Growth redirects into Metrics', () => {
    expect(ADMIN_REDIRECTS['/admin/growth']).toBe('/admin/metrics#growth');
    expect(read('app/admin/growth/page.tsx')).toContain("redirect('/admin/metrics#growth')");
    expect(read('app/admin/metrics/MetricsAdminPageClient.tsx')).toContain('<GrowthPanels />');
  });

  it('groups every section into Numbers, Operations or Content, none empty', () => {
    expect(ADMIN_SECTION_GROUPS.map((group) => group.label)).toEqual(['Numbers', 'Operations', 'Content']);
    const total = ADMIN_SECTION_GROUPS.reduce((sum, group) => sum + sectionsInGroup(group.key).length, 0);
    expect(total).toBe(ADMIN_SECTIONS.length);
    for (const group of ADMIN_SECTION_GROUPS) expect(sectionsInGroup(group.key).length).toBeGreaterThan(0);
  });

  it('keeps every row line short', () => {
    for (const section of ADMIN_SECTIONS) {
      expect(section.description.length).toBeLessThanOrEqual(60);
      expect(section.description).not.toMatch(/—/);
    }
  });
});

describe('the lit menu row', () => {
  it('lights a page own row, and More for anything behind it', () => {
    expect(activeNavKey('/admin')).toBe('overview');
    expect(activeNavKey('/admin/')).toBe('overview');
    expect(activeNavKey('/admin/scoreboard')).toBe('scoreboard');
    expect(activeNavKey('/admin/emails/new')).toBe('emails');
    expect(activeNavKey('/admin/more')).toBe('more');
    expect(activeNavKey('/admin/nps')).toBe('more');
    expect(activeNavKey('/admin/chappi')).toBe('more');
    expect(activeNavKey('/admin/teams')).toBe('teams');
  });
});

describe('panels moved off the Overview, not deleted', () => {
  it('each one renders on its new page', () => {
    const moves: Array<[string, string]> = [
      ['app/admin/scoreboard/ScoreboardAdminPageClient.tsx', '<CockpitTrends'],
      ['app/admin/metrics/MetricsAdminPageClient.tsx', '<FunnelStrip'],
      ['app/admin/urgans/UrgansAdminPageClient.tsx', '<UrgansPanel'],
      ['app/admin/directory/DirectoryAdminPageClient.tsx', '<DirectoryTilePanel'],
      ['app/admin/onboarding/OnboardingAdminPageClient.tsx', '<PersonaSplitPanel'],
      ['app/admin/more/MoreAdminPageClient.tsx', '<RunwayPanel'],
    ];
    for (const [file, tag] of moves) expect(read(file), file).toContain(tag);
    const trends = read('components/admin/CockpitTrends.tsx');
    for (const tag of ['<AdminBarChart', '<ChurnPanel', 'Activation', 'Time to first rollout', 'Week 4 retention', 'activeTeamsWeeklyGrowth']) {
      expect(trends).toContain(tag);
    }
  });

  it('the Overview keeps one accent action and taps Online now through to Metrics', () => {
    const view = read('components/admin/AdminOverviewView.tsx');
    expect(view).toContain("href=\"/admin/metrics#metrics-now\"");
    expect(view).toContain('Draft email');
    expect(view.match(/buttonVariants\(/g)?.length).toBe(2); // the compose link and its mailto fallback
    expect(view).not.toMatch(/<(FunnelStrip|UrgansPanel|ChurnPanel|RunwayPanel|PersonaSplitPanel|DirectoryTilePanel|AdminBarChart)/);
    expect(read('components/admin/MetricsView.tsx')).toContain('id="metrics-now"');
  });
});
