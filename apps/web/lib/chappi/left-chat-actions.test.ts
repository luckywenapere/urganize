import { describe, expect, it } from 'vitest';
import { actionsForLeftChat, firstShareOffersIn } from './left-chat-actions';
import type { ChappiClientAction } from './types';

// What a reply may still do once the chat it was asked from has left the
// screen ("New chat", sign-out, another saved chat opened mid-reply). The
// reply's tools already ran on the server; the question is only which of its
// client actions still make sense on a screen nobody asked them for.

const navigate = (releaseId: string, firstShare = false): ChappiClientAction => ({
  type: 'navigate',
  href: `/dashboard?release=${releaseId}`,
  ...(firstShare ? { offerFirstShareFor: releaseId } : {}),
});

describe('actionsForLeftChat', () => {
  it('keeps a catalog refresh, because the tool behind it did run', () => {
    expect(actionsForLeftChat([{ type: 'refresh' }])).toEqual([{ type: 'refresh' }]);
  });

  it('turns a navigation into a refresh rather than following it', () => {
    // create_release answers with a navigation to the new rollout and no
    // refresh, so dropping the navigation outright would leave that rollout
    // out of the catalog until something else reloaded it.
    expect(actionsForLeftChat([navigate('r1')])).toEqual([{ type: 'refresh' }]);
  });

  it('never follows the navigation itself', () => {
    const kept = actionsForLeftChat([navigate('r1', true), { type: 'refresh' }]);
    expect(kept.some((action) => action.type === 'navigate')).toBe(false);
  });

  it('asks for one refresh however many actions implied one', () => {
    expect(
      actionsForLeftChat([{ type: 'refresh' }, navigate('r1'), { type: 'refresh' }, navigate('r2')])
    ).toEqual([{ type: 'refresh' }]);
  });

  it('drops every card and sheet, which belong to the screen the user left', () => {
    const screenOnly: ChappiClientAction[] = [
      { type: 'open_create_release' },
      { type: 'open_quick_create', releaseId: 'r1' },
      { type: 'open_song_upload', releaseId: 'r1' },
      { type: 'open_cover_art_upload', releaseId: 'r1' },
      { type: 'open_recap', releaseId: 'r1' },
      { type: 'open_share', releaseId: 'r1' },
    ];
    expect(actionsForLeftChat(screenOnly)).toEqual([]);
  });

  it('asks for nothing when the reply carried nothing', () => {
    expect(actionsForLeftChat([])).toEqual([]);
  });

  it('does not change the list it was given', () => {
    const actions: ChappiClientAction[] = [navigate('r1', true), { type: 'open_recap', releaseId: 'r1' }];
    const before = JSON.stringify(actions);
    actionsForLeftChat(actions);
    expect(JSON.stringify(actions)).toBe(before);
  });
});

describe('firstShareOffersIn', () => {
  it('finds the first-rollout share offer a navigation carried', () => {
    expect(firstShareOffersIn([navigate('r1', true)])).toEqual(['r1']);
  });

  it('ignores a navigation that carried no offer', () => {
    expect(firstShareOffersIn([navigate('r1')])).toEqual([]);
  });

  it('ignores an explicit share request, which is not the once-only offer', () => {
    // open_share is the user asking to share a rollout. Whether a reply that
    // lands late should still open it is a screen question (it should not);
    // the once-only first-rollout offer is the one thing worth keeping.
    expect(firstShareOffersIn([{ type: 'open_share', releaseId: 'r1' }])).toEqual([]);
  });

  it('ignores an empty offer id', () => {
    expect(
      firstShareOffersIn([{ type: 'navigate', href: '/dashboard', offerFirstShareFor: '' }])
    ).toEqual([]);
  });

  it('returns nothing for an empty reply', () => {
    expect(firstShareOffersIn([])).toEqual([]);
  });
});
