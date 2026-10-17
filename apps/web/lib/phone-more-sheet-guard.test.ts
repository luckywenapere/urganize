import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The phone More sheet (2026-10-17, founder call, approved mock): the Urganize
 * mark and Beta chip head it, Search is an icon button beside Close, and the
 * rows are Relationships, Opportunities, Notifications, Settings and Help.
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
    const order = ['items.map(', '<Bell className={SHEET_ICON}', '<Settings className={SHEET_ICON}', '<CircleHelp className={SHEET_ICON}'].map((s) => sheet.indexOf(s));
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('uses the new marks for its rows', () => {
    expect(bar).toContain('relationships: HandshakeLine,');
    expect(bar).toContain('opportunities: DoorOpen,');
    expect(sheet).toContain('<Settings className={SHEET_ICON}');
    expect(sheet).toContain('<CircleHelp className={SHEET_ICON}');
  });

  it('no longer carries Credits or Admin', () => {
    expect(sheet).not.toContain('/dashboard/credits');
    expect(sheet).not.toContain('/admin');
  });
});
