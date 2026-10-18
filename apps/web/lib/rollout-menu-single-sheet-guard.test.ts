import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Two Rollout menus stacked on a phone after v1.157.10 (founder report, Oct 18,
// 2026). TasksPanel is mounted twice on a phone: the phone branch's copy and
// WorkspaceDesktopFocused's copy inside a `hidden lg:block` wrapper. Both read
// the shared menuOpen store, and the sheet is portalled to <body>, so the
// hidden copy's sheet escaped its wrapper. vitest here is node-only, so these
// hold the rule at the source: exactly one mount may own the sheet.
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');
const view = read('components/workspace/WorkspaceView.tsx');
const focused = read('components/workspace/WorkspaceDesktopFocused.tsx');
const panel = read('components/workspace/TasksPanel.tsx');
const tabs = read('components/workspace/RolloutTabs.tsx');

const tasksPanelMounts = (source: string) => source.match(/<TasksPanel\b[\s\S]*?\/>/g) ?? [];

describe('one Rollout menu sheet on a phone', () => {
  it('draws the sheet only from a mount that owns the phone menu, off by default', () => {
    expect(panel).toContain('phoneMenu = false,');
    expect(panel).toContain('usePresence(phoneMenu && hasMobileMenu && phoneMenuOpen)');
    expect(panel).toContain('{phoneMenu && hasMobileMenu && menuPresence.mounted ? (');
    // The sheet is drawn in exactly one place.
    expect(panel.match(/<RolloutMenuSheet\b/g)).toHaveLength(1);
  });

  it('gives the phone menu to the phone branch mount only', () => {
    const viewMounts = tasksPanelMounts(view);
    const focusedMounts = tasksPanelMounts(focused);
    const owners = [...viewMounts, ...focusedMounts].filter((m) => /\bphoneMenu\b/.test(m));
    expect(owners).toHaveLength(1);
    expect(viewMounts.some((m) => /\bphoneMenu\b/.test(m))).toBe(true);
    for (const m of focusedMounts) expect(m).not.toMatch(/\bphoneMenu\b/);
  });
});

describe('Change artist is out of the rollout menu', () => {
  it('is not handed to either menu, phone or computer', () => {
    for (const m of tasksPanelMounts(view)) expect(m).not.toContain('changeArtist');
    const focusedMount = view.slice(
      view.indexOf('<WorkspaceDesktopFocused'),
      view.indexOf('panelBannerReplacesEmptyState=')
    );
    expect(focusedMount.length).toBeGreaterThan(0);
    expect(focusedMount).not.toContain('changeArtist');
    expect(focused).not.toContain('changeArtist={');
    expect(panel).not.toContain('changeArtist: changeArtistAction');
    expect(tabs).not.toContain('changeArtist');
  });

  it('is still offered where a wrong artist shows, in the distribution issues', () => {
    expect(view).toContain('onChangeArtist={changeArtistAction ? changeArtistAction.onClick : undefined}');
    expect(view).toContain('open={isChangeArtistOpen}');
  });
});
