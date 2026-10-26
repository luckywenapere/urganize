import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A capture-phase handler that refuses an in-app link must tell the stall
// watchdog, or the watchdog loads the refused page itself 7s later
// (2026-10-14: locked links for new users "refreshed" onto the locked page).
describe('links refused on purpose are marked for the stall watchdog', () => {
  // (The first-rollout lock's case lived here until 2026-10-24, when the
  // lock and its link catching were removed; see lib/rollout-offer.ts.)

  // 2026-10-26: the Home and UrgAns pills are plain links between two views
  // (Home, and the sessions layout at /dashboard/urgans), so no click of theirs
  // is refused and nothing needs marking.
  it('the top bar pills are plain links that refuse no click', () => {
    const src = readFileSync(join(__dirname, '../components/shell/TopNav.tsx'), 'utf8');
    expect(src).not.toContain('markNavigationBlocked');
    expect(src).not.toContain('preventDefault');
  });

  it('the watchdog waits for the click to finish dispatching before it watches', () => {
    const src = readFileSync(join(__dirname, 'nav-stall-watch.ts'), 'utf8');
    expect(src).toMatch(/if \(blockedClicks\.has\(event\)\) return;/);
  });
});
