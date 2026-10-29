import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The phone More sheet (2026-10-17, founder call, approved mock): the Urganize
 * mark and Beta chip head it, Search is an icon button beside Close, and the
 * rows are Relationships, Opportunities and Settings, with Help as a quiet
 * footer line under them (Notifications moved to a bell at the top right of
 * Home the same day).
 * Credits and Admin left the sheet (Settings reaches both). Read from the
 * source, since there are no component tests in this repo.
 */

const WEB = join(__dirname, '..');
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const bar = strip(readFileSync(join(WEB, 'components', 'shell', 'BottomBar.tsx'), 'utf8'));
const sheet = bar.slice(bar.indexOf('function MoreSheet('));

describe('the phone More sheet', () => {
  it('heads with the Urganize mark and the Beta chip, not a "More" title', () => {
    expect(bar).toContain("import { Logo } from '@urganize/ui';");
    expect(sheet).toContain('<Logo size="sm"');
    expect(sheet.indexOf('<Logo size="sm"')).toBeLessThan(sheet.indexOf('Beta'));
  });

  it('lists the rows in the approved order', () => {
    const order = ['items.map(', '<Settings className={SHEET_ICON}', 'data-more-help-footer'].map((s) => sheet.indexOf(s));
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('uses the new marks for its rows', () => {
    expect(bar).toContain('relationships: HandshakeLine,');
    expect(bar).toContain('opportunities: DoorOpen,');
    expect(sheet).toContain('<Settings className={SHEET_ICON}');
    expect(sheet).toContain('<CircleHelp className="h-4 w-4 shrink-0"');
  });

  it('shows Help as a quiet footer, not a row, still behind the showHelp gate', () => {
    expect(sheet).not.toContain('<CircleHelp className={SHEET_ICON}');
    const rows = sheet.slice(sheet.indexOf('<ul className="divide-y divide-stroke-subtle">\n              {items.map('));
    const rowList = rows.slice(0, rows.indexOf('</ul>'));
    expect(rowList).not.toContain('Help');
    const footer = sheet.slice(sheet.indexOf('{helpItems.length > 0 ? ('), sheet.indexOf('{tip.panel}'));
    expect(footer).toContain('data-more-help-footer');
    expect(footer).toContain("onClick={() => setView('help')}");
    expect(footer).toContain('text-[15px] text-content-primary/55');
    expect(footer).not.toContain('ChevronRight');
    expect(footer).not.toContain('SHEET_ROW');
    expect(sheet).toContain('const helpItems = showHelp ? helpGroups.flat() : [];');
  });

  it('no longer carries a Notifications row (the bell is on Home)', () => {
    expect(sheet).not.toContain('<Bell');
    expect(sheet).not.toContain('requestOpen');
    expect(bar).not.toMatch(/\bBell,/);
  });

  it('keeps the unread dot on the Artists tab, where the bell is (#876)', () => {
    const tabs = bar.slice(0, bar.indexOf('data-shell-more'));
    expect(tabs).toContain("tab.key === 'catalogue' && !isActive && unread > 0");
    const more = bar.slice(bar.indexOf('data-shell-more'), bar.indexOf('function useBarCollapsedOnScroll'));
    expect(more).not.toContain('unread');
  });

  it('no longer carries Credits or Admin', () => {
    expect(sheet).not.toContain('/dashboard/credits');
    expect(sheet).not.toContain('/admin');
  });
});
