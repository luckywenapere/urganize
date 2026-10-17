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

  // 2026-10-17: the desktop UrgAns pill opens Home's chat full width in place,
  // so on Home its link to /dashboard/urgans never lands. Unmarked, the
  // watchdog hard-loaded /dashboard/urgans 7s later and a computer bounced back
  // to Home with the column open.
  it('the top bar UrgAns pill marks its click when it stays on Home', () => {
    const src = readFileSync(join(__dirname, '../components/shell/TopNav.tsx'), 'utf8');
    const branch = src.indexOf("area.key === 'urgans' && !event.metaKey");
    expect(branch).toBeGreaterThan(-1);
    const mark = src.indexOf('if (onHome) markNavigationBlocked(event.nativeEvent)', branch);
    expect(mark).toBeGreaterThan(branch);
  });

  it('a computer landing on /dashboard/urgans opens Home with the chat full width', () => {
    const src = readFileSync(join(__dirname, '../app/dashboard/urgans/ChappiPageClient.tsx'), 'utf8');
    const fold = src.indexOf('useHomeChatStore.getState().setListCollapsed(true)');
    const go = src.indexOf('router.replace(HOME_PATH)', fold);
    expect(fold).toBeGreaterThan(-1);
    expect(go).toBeGreaterThan(fold);
  });

  it('the watchdog waits for the click to finish dispatching before it watches', () => {
    const src = readFileSync(join(__dirname, 'nav-stall-watch.ts'), 'utf8');
    expect(src).toMatch(/if \(blockedClicks\.has\(event\)\) return;/);
  });
});
