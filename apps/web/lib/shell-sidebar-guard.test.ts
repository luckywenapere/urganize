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
    expect(sidebar).toMatch(/className=\{`sticky [^`]*\bhidden\b[^`]*\blg:flex\b/);
    expect(sidebar).toContain('shellSideMenu(areas, pathname)');
  });

  it('keeps the profile icon at its foot: a row when open, above the fold button when folded, a slim rail with no menu', () => {
    expect(sidebar).toContain("const mode: 'expanded' | 'collapsed' | 'rail' = !menu ? 'rail' : collapsed ? 'collapsed' : 'expanded';");
    expect(sidebar).toContain("placement={mode === 'expanded' ? 'row' : 'rail'}");
    expect(sidebar).toContain("mode === 'expanded' ? 'items-center gap-1' : 'flex-col items-center gap-2'");
    // The icon comes before the fold button, so folded it sits above it.
    const foot = sidebar.slice(sidebar.indexOf('data-sidebar-foot'));
    expect(foot.indexOf('<WorkspaceMenu')).toBeLessThan(foot.indexOf('<SidebarToggle />'));
    expect(sidebar).toContain("mode === 'expanded'\n      ? 'app-sidebar w-60");
    expect(sidebar).toContain(": 'w-16 items-center'");
    // The account menu opens upward past the menu's content box; a clip on
    // the aside cut off its right border (2026-10-17).
    expect(sidebar).not.toContain('overflow-x-hidden');
  });

  it('glides the icon and the fold button on the user\u2019s own fold only', () => {
    expect(sidebar).toContain('useGlide(toggleRef, toggles)');
    expect(sidebar).toContain('glideKey={toggles}');
    expect(read('components', 'app', 'WorkspaceMenu.tsx')).toContain('useGlide(faceRef, glideKey)');
    const store = read('stores', 'useSidebarStore.ts');
    expect(store).toContain('toggles: state.toggles + 1');
    expect(store).toContain('hydrateCollapsed: (collapsed) => set({ collapsed })');
    expect(read('lib', 'use-glide.ts')).toContain("'(prefers-reduced-motion: reduce)'");
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
