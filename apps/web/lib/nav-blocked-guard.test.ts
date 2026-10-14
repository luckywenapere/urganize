import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A capture-phase handler that refuses an in-app link must tell the stall
// watchdog, or the watchdog loads the refused page itself 7s later
// (2026-10-14: locked links for new users "refreshed" onto the locked page).
describe('links refused on purpose are marked for the stall watchdog', () => {
  it('FirstReleaseFocus marks the click before cancelling it', () => {
    const src = readFileSync(join(__dirname, '../components/releases/FirstReleaseFocus.tsx'), 'utf8');
    const mark = src.indexOf('markNavigationBlocked(event)');
    const cancel = src.indexOf('event.preventDefault()', mark);
    expect(mark).toBeGreaterThan(-1);
    expect(cancel).toBeGreaterThan(mark);
  });

  it('the watchdog waits for the click to finish dispatching before it watches', () => {
    const src = readFileSync(join(__dirname, 'nav-stall-watch.ts'), 'utf8');
    expect(src).toMatch(/if \(blockedClicks\.has\(event\)\) return;/);
  });
});
