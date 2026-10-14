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
    expect(nav).toContain('leaveReleaseForCatalog()');
    expect(nav).toContain('useHomeChatStore.getState().setListCollapsed(');
    expect(nav).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(nav).toContain("data-tour={area.key === 'catalogue' ? 'nav-catalog' : `shell-${area.key}`}");
  });

  it('carries search, the bell and the account menu, and no credits chip or help button', () => {
    expect(nav).not.toContain('CreditsChip');
    expect(nav).not.toContain('<HelpMenu');
    expect(nav).toContain('data-tour="shell-search"');
    expect(nav).toContain('<NotificationsBell />');
    expect(nav).toContain('<WorkspaceMenu userName={userName} showHelp={showHelp}');
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

  it('is desktop only, reads the pages from shell-nav and draws nothing without them', () => {
    expect(sidebar).toMatch(/className="app-sidebar[^"]*\bhidden\b[^"]*\blg:block\b/);
    expect(sidebar).toContain('shellSideMenu(areas, pathname)');
    expect(sidebar).toContain('if (!menu || collapsed) return null;');
  });

  it('keeps the tab behaviours: Rollouts clears the open rollout, aria-current on the page', () => {
    expect(sidebar).toContain("onClick={page.key === 'releases' ? leaveReleaseForCatalog : undefined}");
    expect(sidebar).toContain("aria-current={page.active ? 'page' : undefined}");
  });

  it('offers a slot under Rollouts for an open rollout\u2019s menu', () => {
    expect(sidebar).toContain('id={SIDEBAR_SLOT_ROLLOUT}');
    const focused = read('components', 'workspace', 'WorkspaceDesktopFocused.tsx');
    expect(focused).toContain('useSidebarSlot(SIDEBAR_SLOT_ROLLOUT)');
    expect(focused).toContain('variant="side"');
  });

  it('folds away, remembered on this device', () => {
    expect(sidebar).toContain('useSidebarStore');
    expect(sidebar).toContain('readPersistedState(SIDEBAR_COLLAPSED_KEY');
  });

  it('hides the tab row from lg up', () => {
    expect(read('components', 'shell', 'SubNav.tsx')).toContain('className="shell-band-sub lg:hidden"');
  });
});

describe('the page bar', () => {
  const bar = read('components', 'shell', 'PageBar.tsx');

  it('is desktop only and hosts the page slots and the fold button', () => {
    expect(bar).toContain('<SidebarToggle />');
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

  it('puts the skip link before the shell, so it is still the first Tab', () => {
    const skip = shell.indexOf('href="#main-content"');
    expect(skip).toBeGreaterThan(-1);
    expect(shell.indexOf('<TopNav ')).toBeGreaterThan(skip);
    expect(shell.indexOf('<Sidebar />')).toBeGreaterThan(skip);
    expect(shell).toContain('<TopNav userName={workspaceUserName} showHelp={showHelpMenu} />');
  });

  it('keeps the report dialog on the showHelpMenu gate', () => {
    expect(shell).toContain('REPORT_ISSUE_ENABLED && showHelpMenu ? <ReportIssueDialog /> : null');
  });
});
