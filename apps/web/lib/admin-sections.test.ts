import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_MORE_SECTIONS,
  ADMIN_PRIMARY_NAV,
  ADMIN_REDIRECTS,
  ADMIN_SECTIONS,
  ADMIN_SECTION_GROUPS,
  activeNavKey,
  adminBackTarget,
  matchesSearch,
  moreSectionsInGroup,
  sectionsInGroup,
} from './admin-sections';
import { runwayRowValue } from './admin-runway-format';
import type { Runway } from './admin-runway';

// The admin menu (2026-10-18, URG-369, then the phone bottom bar the same day;
// founder approved both mocks). Guards the four tabs, what sits behind More,
// what left the menu, and that the moves kept every page: Growth merged into
// Metrics (redirect), Chappi off the menu (route kept), Scoreboard and Metrics
// reached from the Overview and More, nothing deleted.

const root = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const pageExists = (href: string) => existsSync(path.join(root, 'app', ...href.split('/').filter(Boolean), 'page.tsx'));

describe('admin menu', () => {
  it('is exactly Overview, Teams, Emails, More, in that order', () => {
    expect(ADMIN_PRIMARY_NAV.map((item) => item.label)).toEqual(['Overview', 'Teams', 'Emails', 'More']);
    expect(ADMIN_PRIMARY_NAV[0]).toMatchObject({ href: '/admin', exact: true });
    for (const item of ADMIN_PRIMARY_NAV) expect(pageExists(item.href), item.href).toBe(true);
  });

  it('the phone bar and the desktop sidebar both draw the one shared list', () => {
    const nav = read('components/admin/AdminNav.tsx');
    expect(nav).toContain('ADMIN_PRIMARY_NAV.map(');
    expect(nav).toContain('export function AdminBottomBar');
    expect(nav.match(/ADMIN_NAV_ITEMS\.map\(/g)?.length).toBe(2);
    expect(nav).not.toMatch(/href: '\/admin\/(growth|chappi|nps|waitlist|scoreboard|metrics)'/);
    const layout = read('app/admin/layout.tsx');
    for (const tag of ['<AdminNav />', '<AdminBottomBar />', '<AdminBackButton />']) expect(layout).toContain(tag);
  });

  it('keeps Scoreboard, Metrics, Growth and Chappi off the tabs', () => {
    const keys = ADMIN_PRIMARY_NAV.map((item) => item.key);
    for (const key of ['scoreboard', 'metrics', 'growth', 'chappi']) expect(keys).not.toContain(key);
  });

  it('the phone top strip is gone: no scroll-into-view, no edge fade, no top "Catalog" link', () => {
    const nav = read('components/admin/AdminNav.tsx');
    expect(nav).not.toMatch(/stripFade|stripRef|scrollLeft|maskImage|overflow-x-auto/);
    expect(nav).not.toMatch(/>\s*Catalog\s*</);
    // The desktop sidebar keeps the way out; on phone it is the foot of More.
    expect(nav).toContain('Back to catalog');
    expect(nav).toMatch(/aria-label="Admin menu" className="hidden [^"]*lg:flex/);
    expect(read('app/admin/more/MoreAdminPageClient.tsx')).toMatch(/href="\/dashboard"[\s\S]*Back to catalog/);
  });
});

describe('dashboards behind More', () => {
  it('lists every dashboard once, Growth merged away', () => {
    expect(new Set(ADMIN_SECTIONS.map((section) => section.key)).size).toBe(ADMIN_SECTIONS.length);
    expect(ADMIN_SECTIONS.map((section) => section.key)).not.toContain('growth');
    expect(ADMIN_SECTIONS).toHaveLength(23);
    for (const section of ADMIN_SECTIONS) expect(pageExists(section.href), section.href).toBe(true);
  });

  it('More holds everything not in the tabs: Scoreboard and Metrics in Numbers, Chappi kept, no Teams or Emails', () => {
    expect(ADMIN_MORE_SECTIONS).toHaveLength(21);
    const more = ADMIN_MORE_SECTIONS.map((section) => section.key);
    expect(more).toContain('chappi');
    for (const key of ['teams', 'emails']) expect(more).not.toContain(key);
    expect(moreSectionsInGroup('numbers').map((section) => section.key).slice(0, 2)).toEqual(['scoreboard', 'metrics']);
    for (const key of ['onboarding', 'nps', 'issue-reports', 'pitch-payments', 'waitlist', 'interviews', 'urgans']) {
      expect(more).toContain(key);
    }
    const page = read('app/admin/more/MoreAdminPageClient.tsx');
    expect(page).toContain('moreSectionsInGroup(');
    expect(page).not.toMatch(/\bsectionsInGroup\(/);
  });

  it('More searches labels and descriptions', () => {
    const nps = ADMIN_SECTIONS.find((section) => section.key === 'nps')!;
    expect(matchesSearch(nps, '')).toBe(true);
    expect(matchesSearch(nps, 'np')).toBe(true);
    expect(matchesSearch(nps, 'RECOMMEND')).toBe(true);
    expect(matchesSearch(nps, 'payout')).toBe(false);
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

describe('the lit tab and the back button', () => {
  it('lights a page own tab, its parent tab, or More for anything behind it', () => {
    expect(activeNavKey('/admin')).toBe('overview');
    expect(activeNavKey('/admin/')).toBe('overview');
    expect(activeNavKey('/admin/scoreboard')).toBe('overview');
    expect(activeNavKey('/admin/metrics')).toBe('overview');
    expect(activeNavKey('/admin/metrics#metrics-active')).toBe('overview');
    expect(activeNavKey('/admin/emails/new')).toBe('emails');
    expect(activeNavKey('/admin/more')).toBe('more');
    expect(activeNavKey('/admin/nps')).toBe('more');
    expect(activeNavKey('/admin/chappi')).toBe('more');
    expect(activeNavKey('/admin/teams')).toBe('teams');
    expect(activeNavKey('/dashboard')).toBe(null);
  });

  it('names the parent tab on every page below a tab, and nothing on a tab', () => {
    for (const item of ADMIN_PRIMARY_NAV) expect(adminBackTarget(item.href), item.href).toBe(null);
    expect(adminBackTarget('/admin/scoreboard')).toEqual({ label: 'Overview', href: '/admin' });
    expect(adminBackTarget('/admin/metrics')).toEqual({ label: 'Overview', href: '/admin' });
    expect(adminBackTarget('/admin/emails/sequence')).toEqual({ label: 'Emails', href: '/admin/emails' });
    expect(adminBackTarget('/admin/nps')).toEqual({ label: 'More', href: '/admin/more' });
    for (const section of ADMIN_MORE_SECTIONS) expect(adminBackTarget(section.href), section.href).not.toBe(null);
  });

  it('no page draws its own back link or an "Admin" eyebrow', () => {
    const pages = ADMIN_SECTIONS.map((section) => section.href).concat(['/admin/emails/new', '/admin/emails/sequence']);
    for (const href of pages) {
      const dir = path.join(root, 'app', ...href.split('/').filter(Boolean));
      const clients = readdirSync(dir).filter((file) => file.endsWith('PageClient.tsx'));
      for (const file of clients) {
        const source = readFileSync(path.join(dir, file), 'utf8');
        expect(source, file).not.toMatch(/>\s*Admin\s*<\/p>/);
        expect(source, file).not.toMatch(/<Link\s+href="\/admin\/emails"/);
      }
    }
  });
});

describe('the Runway row and sheet', () => {
  const base = {
    settings: { currency: 'NGN', cash: 25_000_000, monthlyBurn: 2_000_000, asOf: '2026-10-18', ngnPerUsd: null, updatedAt: null },
    mrr: 0,
    netBurn: 2_000_000,
    months: 12.5,
    runsOutOn: null,
    growth: { weeklyRate: null, usedRate: 0, mrrThenMinor: 0, mrrNowMinor: 0 },
    defaultAlive: { status: 'alive', weeksToProfit: 10, weeksToCashOut: 50, profitOn: null, cashOutOn: null },
    ageDays: 0,
    stale: false,
  } as unknown as Runway;

  it('shows the result once saved, "Not set" before', () => {
    expect(runwayRowValue(null, true)).toBe('Not set');
    expect(runwayRowValue({ ...base, settings: null }, true)).toBe('Not set');
    expect(runwayRowValue(base, true)).toBe('12.5 months · alive');
    expect(runwayRowValue({ ...base, defaultAlive: { ...base.defaultAlive!, status: 'dead' } }, true)).toBe('12.5 months · not yet');
    expect(runwayRowValue(base, false)).toBe('Not read');
  });

  it('the form lives in a bottom sheet with a currency toggle, saving through the same API', () => {
    const sheet = read('components/admin/RunwayPanel.tsx');
    expect(sheet).toContain('<Sheet');
    expect(sheet).toContain('<ToggleGroup');
    expect(sheet).not.toContain('<select');
    expect(sheet).toContain('field-native'); // URG-370: the date drawn like the inputs
    expect(sheet).toContain('min-w-0');
    const page = read('app/admin/more/MoreAdminPageClient.tsx');
    expect(page).toContain('<RunwaySheet');
    expect(page).toContain("fetch('/api/admin/runway'");
    expect(page).toContain('waiting</Badge>');
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
      ['app/admin/more/MoreAdminPageClient.tsx', '<RunwaySheet'],
    ];
    for (const [file, tag] of moves) expect(read(file), file).toContain(tag);
    const trends = read('components/admin/CockpitTrends.tsx');
    for (const tag of ['<AdminBarChart', '<ChurnPanel', 'Activation', 'Time to first rollout', 'Week 4 retention', 'activeTeamsWeeklyGrowth']) {
      expect(trends).toContain(tag);
    }
  });

  it('the Overview keeps one accent action and opens Metrics and Scoreboard from its headers and tiles', () => {
    const view = read('components/admin/AdminOverviewView.tsx');
    for (const id of ['metrics-now', 'metrics-active', 'metrics-accounts']) {
      expect(view).toContain(`href="/admin/metrics#${id}"`);
      expect(read('components/admin/MetricsView.tsx')).toContain(`id="${id}"`);
    }
    expect(view).toContain('<HeaderLink href="/admin/metrics" label="Metrics" />');
    expect(view).toContain('<HeaderLink href="/admin/scoreboard" label="Scoreboard" />');
    expect(view).not.toMatch(/label="All dashboards"|href="\/admin\/more"/);
    expect(view).toContain('order-first'); // Needs a message above Today on phone
    expect(view).toContain('Draft email');
    expect(view.match(/buttonVariants\(/g)?.length).toBe(2); // the compose link and its mailto fallback
    expect(view).not.toMatch(/<(FunnelStrip|UrgansPanel|ChurnPanel|RunwayPanel|PersonaSplitPanel|DirectoryTilePanel|AdminBarChart)/);
    expect(read('components/admin/MetricsView.tsx')).toContain('id="metrics-now"');
  });
});
