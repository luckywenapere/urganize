import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home on a computer carries no UrgAns chat (2026-10-27, founder call). From
 * 2026-10-07 it was the chat (HomeDesktopSplit); now it is a single page and
 * the chat lives only on the UrgAns page. These hold that, read from the
 * source because there are no component tests in this repo.
 */

const WEB = join(__dirname, '..');
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const read = (...parts: string[]) => strip(readFileSync(join(WEB, ...parts), 'utf8'));
// The conversation's own tag, not ChappiConversationSkeleton.
const CONVERSATION_TAG = /<ChappiConversation[\s/>]/;

describe('Home on a computer has no chat', () => {
  it('mounts the conversation in no Home file', () => {
    const dir = join(WEB, 'components', 'home');
    const holders = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.tsx'))
      .filter((name) => CONVERSATION_TAG.test(read('components', 'home', name)));
    expect(holders).toEqual([]);
  });

  it('draws Home on a computer as one centred page, with no split and no conversation', () => {
    const page = read('app', 'dashboard', 'home', 'HomePageClient.tsx');
    expect(existsSync(join(WEB, 'components', 'home', 'HomeDesktopSplit.tsx'))).toBe(false);
    expect(page).not.toContain('HomeDesktopSplit');
    expect(page).not.toContain('ChappiConversation');
    expect(page).not.toContain('home-split-height');
    expect(page).toMatch(/isDesktop \? \(\s*<div className="home-scene-container mx-auto w-full max-w-\[920px\]/);
  });

  it('keeps New rollout on Home on a computer', () => {
    const page = read('app', 'dashboard', 'home', 'HomePageClient.tsx');
    expect(page).toMatch(/onClick=\{openCreate\}[\s\S]*New rollout/);
  });

  it('keeps the phone’s pinned box on the phone branch only', () => {
    const page = read('app', 'dashboard', 'home', 'HomePageClient.tsx');
    const desktop = page.slice(page.indexOf('isDesktop ? ('), page.indexOf(') : (', page.indexOf('isDesktop ? (')));
    expect(desktop).not.toContain('<HomeAskBar');
    expect(page).toContain('<HomeAskBar />');
  });

  it('shows a computer the sessions layout on the UrgAns page, never bouncing to Home', () => {
    const page = read('app', 'dashboard', 'urgans', 'ChappiPageClient.tsx');
    expect(page).toContain('<UrgansSessionsLayout');
    expect(page).not.toContain('router.replace(HOME_PATH)');
    expect(page).not.toMatch(/router\.replace\(['"]\/dashboard\/home['"]\)/);
    const layout = read('components', 'chappi', 'UrgansSessionsLayout.tsx');
    expect(layout).toContain('<ChappiHistoryList');
    expect(layout).toMatch(CONVERSATION_TAG);
    expect(layout).toContain('data-tour="nav-urgans"');
  });

  it('expands the drawer onto the UrgAns page, not onto Home', () => {
    const panel = read('components', 'chappi', 'ChappiSidePanel.tsx');
    expect(panel).toContain('router.push(URGANS_HREF)');
    expect(panel).not.toContain('router.push(HOME_PATH)');
  });

  it('routes "Ask UrgAns" in the search bar through askUrgansTarget', () => {
    const bar = read('components', 'shell', 'CommandBar.tsx');
    expect(bar).toContain('askUrgansTarget(');
  });

  it('keeps the old Home split store and its fold key gone', () => {
    expect(existsSync(join(WEB, 'stores', 'useHomeChatStore.ts'))).toBe(false);
  });

  it('keeps the old Today panel and its store gone', () => {
    const nav = read('components', 'shell', 'TopNav.tsx');
    expect(nav).not.toContain('useChatSideStore');
  });
});
