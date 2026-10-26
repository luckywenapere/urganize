import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home is the UrgAns chat on a computer (2026-10-07). These hold the pieces
 * that make that one chat rather than two, read from the source because there
 * are no component tests in this repo.
 */

const WEB = join(__dirname, '..');
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const read = (...parts: string[]) => strip(readFileSync(join(WEB, ...parts), 'utf8'));
// The conversation's own tag, not ChappiConversationSkeleton.
const CONVERSATION_TAG = /<ChappiConversation[\s/>]/;

describe('Home as the chat on a computer', () => {
  it('mounts the conversation in exactly one Home file', () => {
    const dir = join(WEB, 'components', 'home');
    const holders = readdirSync(dir)
      .filter((name) => name.endsWith('.tsx'))
      .filter((name) => CONVERSATION_TAG.test(read('components', 'home', name)));
    expect(holders).toEqual(['HomeDesktopSplit.tsx']);
  });

  it('mounts the conversation once on Home, with no sessions switch around it', () => {
    const split = read('components', 'home', 'HomeDesktopSplit.tsx');
    expect(split.match(new RegExp(CONVERSATION_TAG.source, 'g'))).toHaveLength(1);
    expect(split).not.toContain('ChappiHistoryList');
  });

  it('shows a computer the sessions layout on the full chat page, not Home', () => {
    const page = read('app', 'dashboard', 'urgans', 'ChappiPageClient.tsx');
    expect(page).toContain('<UrgansSessionsLayout');
    expect(page).not.toContain('router.replace(HOME_PATH)');
    const layout = read('components', 'chappi', 'UrgansSessionsLayout.tsx');
    expect(layout).toContain('<ChappiHistoryList');
    expect(layout).toMatch(/<ChappiConversation[\s/>]/);
  });

  it('folds Home’s left column with a handle on the divider, remembered on this device', () => {
    const split = read('components', 'home', 'HomeDesktopSplit.tsx');
    expect(split).toContain('aria-controls="home-list-column"');
    expect(split).toContain('writePersistedState(HOME_LIST_COLLAPSED_KEY');
    expect(split).toContain('readPersistedState(HOME_LIST_COLLAPSED_KEY');
  });

  it('expands the drawer onto Home, not onto the full chat page', () => {
    const panel = read('components', 'chappi', 'ChappiSidePanel.tsx');
    expect(panel).not.toContain("router.push('/dashboard/urgans')");
    expect(panel).toContain('router.push(HOME_PATH)');
  });

  it('routes "Ask UrgAns" in the search bar through askUrgansTarget', () => {
    const bar = read('components', 'shell', 'CommandBar.tsx');
    expect(bar).toContain('askUrgansTarget(');
  });

  it('keeps the old Today panel and its store gone', () => {
    const nav = read('components', 'shell', 'TopNav.tsx');
    expect(nav).not.toContain('useChatSideStore');
  });
});
