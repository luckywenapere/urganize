import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The desktop shell after URG-254/255 (founder call, 2026-10-14): the areas
 * centred across the top, the open area's pages down a side menu with an open
 * rollout's menu nested under Rollouts, a page bar above the page, and a calm
 * top bar. Read from the source since there are no component tests in this
 * repo. The pure rules (which pages, which is lit) are in shell-sidebar.test.ts.
 */

const WEB = join(__dirname, '..');
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const read = (...parts: string[]) => strip(readFileSync(join(WEB, ...parts), 'utf8'));

describe('the top bar', () => {
  const nav = read('components', 'shell', 'TopNav.tsx');

  it('keeps the areas as centred pills with every behaviour they had', () => {
    expect(nav).toContain('lg:grid-cols-[1fr_auto_1fr]');
    expect(nav).toContain('useShellAreas()');
    expect(nav).toContain('areas.map(');
    expect(nav).toContain("onClick={area.key === 'catalogue' ? leaveReleaseForCatalog : undefined}");
    expect(nav).not.toContain('useHomeChatStore');
    expect(nav).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(nav).toContain("data-tour={area.key === 'catalogue' ? 'nav-catalog' : `shell-${area.key}`}");
  });

  it('carries search and the bell, and no credits chip, help button or account menu', () => {
    expect(nav).not.toContain('CreditsChip');
    expect(nav).not.toContain('<HelpMenu');
    expect(nav).toContain('data-tour="shell-search"');
    expect(nav).toContain('<NotificationsBell />');
    // The profile icon moved to the foot of the side menu (2026-10-17).
    expect(nav).not.toContain('<WorkspaceMenu');
  });

  it('draws a plain bell with a dot for unread', () => {
    const bell = read('components', 'app', 'NotificationsBell.tsx');
    expect(bell).toContain('<Bell ');
    expect(bell).not.toContain('SignalIcon');
    expect(bell).toContain('data-unread-dot');
  });
});

describe('the side menu', () => {
  const sidebar = read('components', 'shell', 'Sidebar.tsx');

  it('is desktop only and reads the pages from shell-nav', () => {
    expect(sidebar).toMatch(/className="sticky [^"]*\bhidden\b[^"]*\blg:flex\b/);
    expect(sidebar).toContain('shellSideMenu(areas, pathname)');
  });

  it('is always the thin rail: no fold button, no open state, no photo at its foot', () => {
    expect(sidebar).toContain("const mode: 'collapsed' | 'rail' = menu ? 'collapsed' : 'rail';");
    // Since Nov 2, 2026 your photo is only in the top bar (founder).
    expect(sidebar).not.toContain('SETTINGS_PAGE_HREF');
    expect(sidebar).toContain('if (!menu) return null;');
    expect(sidebar).not.toContain('<WorkspaceMenu');
    expect(sidebar).not.toContain('SidebarToggle');
    expect(sidebar).not.toContain('useSidebarStore');
    expect(sidebar).not.toContain('PanelLeftOpen');
    // The account menu opens past the rail; a clip on the aside cut it off.
    expect(sidebar).not.toContain('overflow-x-hidden');
  });

  it('marks Artists with the mic', () => {
    expect(sidebar).toContain('artists: Mic,');
  });

  it('keeps the tab behaviours: Rollouts clears the open rollout, aria-current on the page', () => {
    expect(sidebar).toContain("onClick={page.key === 'releases' ? leaveReleaseForCatalog : undefined}");
    expect(sidebar).toContain("aria-current={page.active ? 'page' : undefined}");
  });

  it('shows an open rollout’s menu as tabs under its header', () => {
    const focused = read('components', 'workspace', 'WorkspaceDesktopFocused.tsx');
    expect(focused).not.toContain('useSidebarSlot');
    expect(focused).toContain('<RolloutTabs');
  });

  it('hides the tab row from lg up', () => {
    expect(read('components', 'shell', 'SubNav.tsx')).toContain('className="shell-band-sub lg:hidden"');
  });
});

describe('the page bar', () => {
  const bar = read('components', 'shell', 'PageBar.tsx');

  it('is desktop only and hosts the page slots', () => {
    for (const slot of ['SUBNAV_SLOT_START', 'SUBNAV_SLOT_TOOLS', 'SUBNAV_SLOT_END']) {
      expect(bar).toContain(`id={${slot}}`);
    }
  });
});

describe('the account menu', () => {
  const menu = read('components', 'app', 'WorkspaceMenu.tsx');

  it('shows credits as one row to the history, warm when low, nothing when unknown', () => {
    expect(menu).toContain('href="/dashboard/credits"');
    expect(menu).toContain("credits.low ? 'text-status-warning'");
    expect(menu).toContain('{credits ? (');
    expect(menu).toContain('{credits?.low ? (');
  });

  it('holds the help rows behind the showHelp gate', () => {
    expect(menu).toContain('useHelpMenuGroups()');
    expect(menu).toContain('showHelp ? helpGroups.flat() : []');
  });
});

describe('the app shell', () => {
  const shell = read('components', 'app', 'AppShell.tsx');
  // The chrome itself is the workspace frame's (URG-314 batch 7).
  const frame = read('components', 'app', 'WorkspaceFrame.tsx');

  it('puts the skip link before the shell, so it is still the first Tab', () => {
    const skip = frame.indexOf('href="#main-content"');
    expect(skip).toBeGreaterThan(-1);
    expect(frame.indexOf('<TopNav ')).toBeGreaterThan(skip);
    expect(frame.indexOf('<Sidebar ')).toBeGreaterThan(skip);
    expect(frame).toContain('<TopNav />');
    expect(frame).toContain('<Sidebar userName={workspaceUserName} showHelp={showHelpMenu} />');
  });

  it('keeps the report dialog on the showHelpMenu gate', () => {
    expect(shell).toContain('REPORT_ISSUE_ENABLED && showHelpMenu ? <ReportIssueDialog /> : null');
  });
});
