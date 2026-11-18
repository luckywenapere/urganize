import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The chat card on Home on a computer (#1295). vitest has no layout engine, so
// these read the source: the card hands its message to the Assistant through
// the same store hand-off as the phone's box, holds no conversation of its own,
// and on a phone (#1339) leads Home with one box, not two.

const WEB = join(__dirname, '..', '..');
const code = (...parts: string[]) =>
  readFileSync(join(WEB, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const card = code('components', 'home-desktop', 'HomeChatCard.tsx');
const desktop = code('components', 'home-desktop', 'HomeDesktop.tsx');
const phoneHome = code('app', 'dashboard', 'artists', 'ArtistsPageClient.tsx');
const frame = code('components', 'shell', 'swipe', 'SwipeFrame.tsx');

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

describe('Home chat card on a phone (#1339)', () => {
  it('leads the phone Home in its phone layout, and loads in its shape', () => {
    expect(phoneHome).toContain('<HomeChatCard rows={rows} spotlight={spotlight} today={today} layout="phone" />');
    expect(phoneHome).toContain('<HomeChatCardPhoneSkeleton />');
  });

  it('draws no Next drop and no Enter hint in the phone layout', () => {
    expect(card).toContain('{phone ? null : <NextDropPanel row={spotlight} />}');
    // The phone keeps the hold to talk mic the pinned box had.
    expect(card).toContain('{voiceDriver}');
    expect(card).toContain('useHoldToTalk(voice, phone && voice.supported && !sending)');
  });

  it('opens the steps the Try one cards name', () => {
    expect(card).toContain("if (card.kind === 'plan') openPlanChoice();");
    expect(card).toContain("else if (card.kind === 'artist') openAddArtist();");
  });

  it('takes the pinned box off the Home tab when Home has its own, so there is one box', () => {
    expect(frame).toContain("!(tab === 'artists' && homeAsksFirst)");
    expect(frame).toContain('useSwipeNavStore((state) => state.homeAsk)');
    // The box itself says it is up, so an artist's own Home (no box) keeps the pinned one.
    expect(card).toContain('swipe.setHomeAsk(true)');
    expect(card).toContain('setHomeAsk(false)');
  });
});
