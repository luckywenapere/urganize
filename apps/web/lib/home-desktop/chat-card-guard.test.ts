import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The chat card on Home on a computer (#1295). vitest has no layout engine, so
// these read the source: the card hands its message to the Assistant through
// the same store hand-off as the phone's box, holds no conversation of its own,
// and stays on computers only.

const WEB = join(__dirname, '..', '..');
const code = (...parts: string[]) =>
  readFileSync(join(WEB, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const card = code('components', 'home-desktop', 'HomeChatCard.tsx');
const desktop = code('components', 'home-desktop', 'HomeDesktop.tsx');

describe('Home chat card', () => {
  it('sends through the Assistant hand-off, into the picked chat', () => {
    expect(card).toContain('setSendInputOnOpen(true)');
    expect(card).toContain('setPendingAttachments(files)');
    expect(card).toContain('markArrivingFromHome()');
    expect(card).toContain('router.push(assistantHref(releaseId))');
    // The chat is put on screen before the message goes in.
    expect(card.indexOf('showRolloutSession(releaseId)')).toBeLessThan(card.indexOf('setSendInputOnOpen(true)'));
    expect(card.indexOf('showMain()')).toBeLessThan(card.indexOf('setSendInputOnOpen(true)'));
  });

  it('holds no conversation and never opens the drawer', () => {
    expect(card).not.toMatch(/<ChappiConversation[\s/>]/);
    expect(card).not.toContain('setRailOpen');
  });

  it('keeps its text in its own state, so Home shows an empty box on return', () => {
    expect(card).toMatch(/const \[text, setText\] = useState\(''\)/);
    expect(card).not.toMatch(/useChappiStore\(\(state\) => state\.input\)/);
  });

  it('sends on Enter and keeps Shift and Enter for a new line', () => {
    expect(card).toMatch(/event\.key !== 'Enter' \|\| event\.shiftKey \|\| event\.nativeEvent\.isComposing/);
  });

  it('uses a disclosure for "About", not a menu role it does not build', () => {
    expect(card).toContain('aria-expanded={open}');
    expect(card).toContain('role="group"');
    expect(card).not.toContain('role="menu"');
    expect(card).toContain("aria-current={on ? 'true' : undefined}");
  });

  it('leads Home on a computer in place of the Next drop banner, and loads in its shape', () => {
    expect(desktop).toContain('<HomeChatCard rows={rows} spotlight={list.spotlight} today={today} />');
    expect(desktop).toContain('<HomeChatCardSkeleton />');
    expect(desktop).not.toContain('function AskBlock');
  });
});
