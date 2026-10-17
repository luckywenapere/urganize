import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two phone-only pieces (2026-10-14, founder call):
 *  - the More sheet carries the desktop account menu's help rows, read from the
 *    one list in HelpMenu.tsx behind the same showHelpMenu gate;
 *  - the notifications panel has a visible Close button below lg, and closing
 *    on purpose hands focus back to the bell (or More, where the bell is hidden).
 * Read from the source, since there are no component tests in this repo.
 */

const WEB = join(__dirname, '..');
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const read = (...parts: string[]) => strip(readFileSync(join(WEB, ...parts), 'utf8'));

describe('the More sheet has the account menu’s help rows', () => {
  const bar = read('components', 'shell', 'BottomBar.tsx');
  const menu = read('components', 'app', 'WorkspaceMenu.tsx');
  // The chrome is mounted by the workspace frame (URG-314 batch 7), with the
  // same showHelpMenu rule AppShell used.
  const shell = read('components', 'app', 'WorkspaceFrame.tsx');

  it('reads the same help list as the desktop account menu', () => {
    expect(menu).toContain('useHelpMenuGroups()');
    expect(bar).toContain("import { useHelpMenuGroups } from '@/components/app/HelpMenu';");
    expect(bar).toContain('const helpItems = showHelp ? helpGroups.flat() : [];');
    expect(menu).toContain('const helpItems = showHelp ? helpGroups.flat() : [];');
  });

  it('defines no help labels or links of its own', () => {
    for (const word of ['Report an issue', 'Docs', 'Contact us', 'Community', 'mailto:', 'whatsapp', 'mintlify']) {
      expect(bar).not.toContain(word);
    }
  });

  it('sits behind the same showHelpMenu gate AppShell gives WorkspaceMenu', () => {
    expect(shell).toContain('<Sidebar userName={workspaceUserName} showHelp={showHelpMenu} />');
    expect(shell).toContain('<BottomBar showHelp={showHelpMenu} />');
  });

  it('uses the sheet’s own row style, tall enough to tap, and closes the sheet first', () => {
    const help = bar.slice(bar.indexOf('aria-label="Help"'));
    expect(help).toContain('SHEET_ROW');
    expect(bar).toContain("const SHEET_ROW = 'motion-focus flex min-h-14");
    expect(help.indexOf('onClose();')).toBeLessThan(help.indexOf('item.onClick();'));
  });

  it('opens the help rows in a Help view inside the sheet, behind one quiet Help footer (2026-10-17)', () => {
    expect(bar).toContain("useState<'more' | 'help'>('more')");
    expect(bar).toContain("onClick={() => setView('help')}");
    expect(bar).toContain("onClick={() => setView('more')}");
    // The Help footer only shows when the gate lets the help rows through.
    expect(bar).toMatch(/\{helpItems\.length > 0 \? \(\s*<div data-more-help-footer[^>]*>\s*<button\s+type="button"\s+onClick=\{\(\) => setView\('help'\)\}/);
  });
});

describe('the phone notifications panel has a Close button', () => {
  const bell = read('components', 'app', 'NotificationsBell.tsx');

  it('shows an X button labelled Close, below lg only, styled like the house sheets', () => {
    expect(bell).toMatch(
      /onClick=\{closeAndReturnFocus\}\s*aria-label="Close"\s*className="motion-focus grid h-11 w-11 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover lg:hidden"/
    );
    expect(bell).toContain('<X className="h-5 w-5" aria-hidden="true" />');
  });

  it('keeps outside-tap and Escape closing', () => {
    expect(bell).toContain("window.addEventListener('mousedown', handler);");
    expect(bell).toMatch(/event\.key === 'Escape'[\s\S]*?closeAndReturnFocus\(\);/);
  });

  it('returns focus to the bell, or to More when the bell is hidden', () => {
    expect(bell).toContain('trigger?.focus();');
    expect(bell).toContain("document.querySelector<HTMLElement>('[data-shell-more]')?.focus();");
    expect(read('components', 'shell', 'BottomBar.tsx')).toContain('data-shell-more');
  });
});
